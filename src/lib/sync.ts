import { GitHub, GitHubError, type TreeEntry, type VaultRepo } from './github';
import { commitMessage, noteText, notePath } from './notes';
import { blobs, outbox, syncState, type OutboxItem, type SyncState } from './store';
import type { AppNote, Vault } from './types';
import { buildVault, isVaultFile } from './vault';

/** One thing at a time against the vault: sending, taking back and syncing never overlap. */
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

/** The vault as of the last sync, from the phone's cache. */
export async function loadCached(): Promise<Vault | null> {
  const state = await syncState.get();
  if (!state) return null;
  const texts = await blobs.getMany(state.files.map((f) => f.sha));
  const files = state.files.filter((f) => texts.has(f.sha)).map((f) => ({ ...f, text: texts.get(f.sha)! }));
  return buildVault(files, state);
}

/** Fetches what changed since the last sync: one request when nothing did. */
export function sync(repo: VaultRepo): Promise<Vault> {
  return exclusive(async () => {
    const github = new GitHub(repo);
    const previous = await syncState.get();
    const startedAt = new Date().toISOString();
    let branch = previous?.branch || (await github.branch());
    let tree: { sha: string; entries: TreeEntry[]; truncated: boolean };
    try {
      tree = await github.tree(branch);
    } catch (error) {
      // The default branch may have been renamed.
      if (!(error instanceof GitHubError && error.status === 404 && previous?.branch)) throw error;
      branch = await github.branch();
      tree = await github.tree(branch);
    }
    const wanted = tree.entries.filter((e) => e.type === 'blob' && isVaultFile(e.path));
    const texts = await blobs.getMany(wanted.map((e) => e.sha));
    await pool(
      wanted.filter((e) => !texts.has(e.sha)),
      6,
      async (entry) => {
        const text = await github.blob(entry.sha);
        await blobs.put(entry.sha, text);
        texts.set(entry.sha, text);
      },
    );
    const state: SyncState = { branch, treeSha: tree.sha, syncedAt: new Date().toISOString(), files: wanted.map(({ path, sha }) => ({ path, sha })) };
    await syncState.set(state);
    await blobs.keepOnly(new Set(wanted.map((e) => e.sha)));
    await settle(new Set(wanted.map((e) => e.path)), startedAt);
    const vault = buildVault(
      wanted.map(({ path, sha }) => ({ path, sha, text: texts.get(sha)! })),
      state,
    );
    if (tree.truncated) vault.problems.push('GitHub listed only part of the vault, so some books may be missing.');
    return vault;
  });
}

/**
 * Sent notes are tracked until a sync's file list accounts for them: either
 * the note is waiting in inbox/, or the curator has processed it. A note sent
 * in the last two minutes is kept a little longer, in case GitHub's listing lags.
 */
async function settle(paths: Set<string>, listedAt: string): Promise<void> {
  const grace = new Date(Date.parse(listedAt) - 120_000).toISOString();
  for (const item of await outbox.all()) {
    if (item.state !== 'sent' || !item.sentAt) continue;
    if (paths.has(item.path) ? item.sentAt <= listedAt : item.sentAt <= grace) await outbox.delete(item.id);
  }
}

async function pool<T>(items: T[], size: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

/** Creation times that never tie, so notes always go out in the order they were made. */
let lastCreated = 0;
function createdNow(): string {
  lastCreated = Math.max(Date.now(), lastCreated + 1);
  return new Date(lastCreated).toISOString();
}

/** Puts a note in the outbox. Sending is separate, so nothing is lost offline. */
export async function queue(note: AppNote): Promise<OutboxItem> {
  const item: OutboxItem = { id: crypto.randomUUID(), note, path: notePath(note), state: 'queued', createdAt: createdNow() };
  await outbox.put(item);
  return item;
}

export interface FlushResult {
  sent: number;
  /** Why sending stopped, if it did. */
  error?: string;
  /** True when trying again later, unchanged, may work (offline, rate limit). */
  retryable?: boolean;
}

/** Sends waiting notes in the order they were made. Stops at the first failure: the rest would fail the same way. */
export function flush(repo: VaultRepo, branch: string): Promise<FlushResult> {
  return exclusive(async () => {
    const github = new GitHub(repo);
    let sent = 0;
    for (const item of await outbox.all()) {
      if (item.state === 'sent') continue;
      for (let attempt = 0; ; attempt++) {
        const path = notePath(item.note, attempt);
        try {
          const { sha } = await github.create(path, noteText(item.note), commitMessage(item.note), branch);
          await outbox.put({ ...item, path, sha, state: 'sent', sentAt: new Date().toISOString(), error: undefined });
          sent++;
          break;
        } catch (error) {
          // 422: a note already has this name. Try the next one.
          if (error instanceof GitHubError && error.status === 422 && attempt < 4) continue;
          const message = error instanceof Error ? error.message : String(error);
          const retryable = error instanceof GitHubError && error.retryable;
          await outbox.put({ ...item, state: retryable ? 'queued' : 'failed', error: message });
          return { sent, error: message, retryable };
        }
      }
    }
    return { sent };
  });
}

export type TakeBack = 'removed' | 'already-processed';

/**
 * Withdraws a note. One still on the phone is simply dropped; one already in
 * the vault is deleted there, unless the curator got to it first.
 */
export function takeBack(repo: VaultRepo, branch: string, target: { id?: string; path: string; sha?: string; note: AppNote }): Promise<TakeBack> {
  return exclusive(async () => {
    const item = target.id ? (await outbox.all()).find((i) => i.id === target.id) : undefined;
    if (item && item.state !== 'sent') {
      await outbox.delete(item.id);
      return 'removed';
    }
    const path = item?.path ?? target.path;
    const sha = item?.sha ?? target.sha;
    if (!sha) throw new Error('This note has no version to take back.');
    try {
      await new GitHub(repo).remove(path, sha, `app: take back ${target.note.action} ${target.note.title}`.slice(0, 72), branch);
      if (item) await outbox.delete(item.id);
      return 'removed';
    } catch (error) {
      if (error instanceof GitHubError && [404, 409, 422].includes(error.status)) {
        if (item) await outbox.delete(item.id);
        return 'already-processed';
      }
      throw error;
    }
  });
}
