import { GitHubError } from './github';
import { localIso } from './notes';
import * as store from './store';
import type { OutboxItem, Settings } from './store';
import { flush, loadCached, queue, sync, takeBack as withdraw } from './sync';
import type { Action, AppNote, BookRef, Vault } from './types';
import { noteMatches, VaultIndex } from './vault';

/** A note on its way to the curator: still on the phone, or waiting in the vault's inbox/. */
export interface Waiting {
  key: string;
  id?: string;
  path: string;
  sha?: string;
  note: AppNote;
  state: 'queued' | 'failed' | 'sent' | 'waiting';
  error?: string;
}

/** A request for an action dialog (actions with nothing to ask, like watch, go straight out). */
export interface Ask {
  action: Action;
  ref: BookRef;
}

const RESYNC_MS = 2 * 60_000;

class AppState {
  ready = $state(false);
  settings = $state.raw<Settings | null>(null);
  vault = $state.raw<Vault | null>(null);
  index = $state.raw<VaultIndex | null>(null);
  outbox = $state.raw<OutboxItem[]>([]);
  syncing = $state(false);
  error = $state('');
  online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);
  toast = $state.raw<{ text: string; undo?: () => void } | null>(null);
  ask = $state.raw<Ask | null>(null);
  private toastTimer = 0;
  private lastSync = 0;

  /** Notes not yet processed by the curator, oldest first. */
  waiting = $derived.by((): Waiting[] => {
    const inbox = this.vault?.inbox ?? [];
    const inVault = new Set(inbox.map((f) => f.path));
    const list: Waiting[] = [];
    for (const item of this.outbox) {
      if (item.state === 'sent' && inVault.has(item.path)) continue;
      list.push({ key: item.id, id: item.id, path: item.path, sha: item.sha, note: item.note, state: item.state, error: item.error });
    }
    for (const file of inbox) {
      if (file.note) list.push({ key: file.path, path: file.path, sha: file.sha, note: file.note, state: 'waiting' });
    }
    return list.sort((a, b) => a.note.sent.localeCompare(b.note.sent));
  });

  async init(): Promise<void> {
    try {
      this.settings = (await store.settings.get()) ?? null;
      this.setVault(await loadCached());
      this.outbox = await store.outbox.all();
    } catch (error) {
      this.error = `This phone's storage couldn't be opened: ${message(error)}`;
    }
    this.ready = true;
    window.addEventListener('online', () => {
      this.online = true;
      void this.syncNow();
    });
    window.addEventListener('offline', () => (this.online = false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - this.lastSync > RESYNC_MS) void this.syncNow();
    });
    if (this.settings) void this.syncNow();
  }

  private setVault(vault: Vault | null) {
    this.vault = vault;
    this.index = vault ? new VaultIndex(vault) : null;
  }

  /** Sends anything waiting on the phone, then reads what changed in the vault. */
  async syncNow(): Promise<void> {
    if (!this.settings || this.syncing) return;
    this.syncing = true;
    this.error = '';
    try {
      if (this.vault?.branch) await this.send(this.vault.branch);
      this.setVault(await sync(this.settings));
      this.lastSync = Date.now();
      this.outbox = await store.outbox.all();
      // The first sync learns the branch; notes made before it go now.
      if (this.outbox.some((i) => i.state === 'queued') && this.vault) {
        await this.send(this.vault.branch);
        this.setVault(await sync(this.settings));
      }
    } catch (error) {
      if (!(error instanceof GitHubError && error.status === 0)) this.error = message(error);
    } finally {
      this.outbox = await store.outbox.all();
      this.syncing = false;
    }
  }

  private async send(branch: string): Promise<void> {
    if (!this.settings || !this.outbox.some((i) => i.state !== 'sent')) return;
    const result = await flush(this.settings, branch);
    this.outbox = await store.outbox.all();
    if (result.error && !result.retryable) this.error = result.error;
  }

  /** Records an action: into the outbox at once, to the vault as soon as it can be sent. */
  async act(action: Action, ref: BookRef, extra: Partial<AppNote> = {}): Promise<void> {
    const note: AppNote = {
      action,
      title: ref.title,
      author: ref.author,
      slug: ref.slug ?? '',
      ...(ref.isbn ? { isbn: ref.isbn } : {}),
      ...extra,
      sent: localIso(),
      body: (extra.body ?? '').trim(),
    };
    const item = await queue(note);
    this.outbox = await store.outbox.all();
    this.say(`${CONFIRM[action]}: ${note.title}`, () => {
      const current = this.waiting.find((w) => w.id === item.id || (w.note.sent === note.sent && w.note.title === note.title));
      if (current) void this.takeBack(current);
    });
    if (this.settings && this.vault?.branch && this.online) {
      try {
        await this.send(this.vault.branch);
      } catch (error) {
        this.error = message(error);
      }
    }
  }

  async takeBack(waiting: Waiting): Promise<void> {
    if (!this.settings) return;
    try {
      const result = await withdraw(this.settings, this.vault?.branch ?? '', waiting);
      this.outbox = await store.outbox.all();
      if (this.vault?.inbox.some((f) => f.path === waiting.path)) {
        this.setVault({ ...this.vault, inbox: this.vault.inbox.filter((f) => f.path !== waiting.path) });
      }
      this.say(result === 'removed' ? `Taken back: ${waiting.note.title}` : 'The curator had already processed that note. Mention it at the desk.');
    } catch (error) {
      this.say(`Couldn't take it back: ${message(error)}`);
    }
  }

  /** Notes waiting for this book. */
  waitingFor(ref: BookRef): Waiting[] {
    return this.waiting.filter((w) => noteMatches(w.note, ref));
  }

  async saveSettings(next: Settings): Promise<void> {
    const changed = !this.settings || this.settings.owner !== next.owner || this.settings.repo !== next.repo;
    await store.settings.set(next);
    if (changed) {
      await store.syncState.set({ branch: '', treeSha: '', syncedAt: '', files: [] });
      this.setVault(null);
    }
    this.settings = next;
    await this.syncNow();
  }

  /** Deletes this app's data on this phone: token, cached vault, unsent notes. */
  async forget(): Promise<void> {
    await store.forgetAll();
    this.settings = null;
    this.setVault(null);
    this.outbox = [];
    this.error = '';
  }

  say(text: string, undo?: () => void) {
    clearTimeout(this.toastTimer);
    this.toast = { text, undo };
    this.toastTimer = window.setTimeout(() => (this.toast = null), undo ? 7000 : 4500);
  }
}

const CONFIRM: Record<Action, string> = {
  watch: 'Added',
  pass: 'Passed on',
  hold: 'Holding',
  start: 'Started',
  note: 'Note sent',
  finish: 'Finished',
  abandon: 'Stopped',
  add: 'Added',
  read: 'Read before',
};

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const app = new AppState();
