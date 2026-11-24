import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notePath, parseNote } from './notes';
import { forgetAll, outbox } from './store';
import { flush, loadCached, queue, sync, takeBack } from './sync';
import { FakeGitHub, sampleVault } from './testing/fake-github';
import type { AppNote } from './types';

let github: FakeGitHub;
const repo = () => ({ owner: github.owner, repo: github.repo, token: github.token });

function note(action: AppNote['action'], extra: Partial<AppNote> = {}): AppNote {
  return { action, title: 'The Age of Innocence', author: 'Edith Wharton', slug: 'the-age-of-innocence-edith-wharton', sent: '2026-11-24T19:30:00-05:00', body: '', ...extra };
}

beforeEach(async () => {
  await forgetAll();
  github = new FakeGitHub(sampleVault());
  vi.stubGlobal('fetch', github.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('syncing the vault', () => {
  it('reads the vault files and nothing in raw/', async () => {
    const vault = await sync(repo());
    expect(vault.books).toHaveLength(6);
    expect(vault.feed).toHaveLength(4);
    expect(vault.branch).toBe('main');
    const fetched = github.calls.filter((c) => c.path.startsWith('/git/blobs/'));
    expect(fetched).toHaveLength(12 - 2); // every file but the README and the epub
    expect(github.calls.some((c) => c.path.includes('raw'))).toBe(false);
  });

  it('fetches only what changed, and works from the cache offline', async () => {
    await sync(repo());
    github.calls = [];
    github.files.set('wiki/to-be-read/cranford-elizabeth-gaskell.md', '---\ntitle: "Cranford"\nauthor: "Elizabeth Gaskell"\n---\n');
    const vault = await sync(repo());
    expect(github.calls.map((c) => c.path)).toEqual(['/git/trees/main?recursive=1', expect.stringMatching(/^\/git\/blobs\//)]);
    expect(vault.books).toHaveLength(7);

    github.offline = true;
    await expect(sync(repo())).rejects.toThrow(/out of reach/);
    const cached = await loadCached();
    expect(cached?.books).toHaveLength(7);
    expect(cached?.feed).toHaveLength(4);
  });

  it('explains a refused token and a missing repository', async () => {
    await expect(sync({ ...repo(), token: 'wrong' })).rejects.toThrow(/refused the token/);
    await expect(sync({ ...repo(), repo: 'other' })).rejects.toThrow(/can't find the vault/);
  });
});

describe('sending notes', () => {
  it('writes each note to inbox/ in order, then forgets it once a sync accounts for it', async () => {
    await sync(repo());
    await queue(note('watch', { sent: '2026-11-24T19:30:00-05:00' }));
    await queue(note('pass', { title: 'Moby-Dick', author: 'Herman Melville', slug: 'moby-dick-herman-melville', reason: 'length', sent: '2026-11-24T19:31:00-05:00' }));
    expect(await flush(repo(), 'main')).toEqual({ sent: 2 });

    const puts = github.calls.filter((c) => c.method === 'PUT');
    expect(puts.map((c) => c.path)).toEqual([
      '/contents/inbox/2026-11-24T193000-watch-the-age-of-innocence-edith-wharton.md',
      '/contents/inbox/2026-11-24T193100-pass-moby-dick-herman-melville.md',
    ]);
    expect(puts[0].body?.branch).toBe('main');
    expect(puts[0].body?.message).toBe('app: watch The Age of Innocence');
    const written = parseNote(github.files.get('inbox/2026-11-24T193100-pass-moby-dick-herman-melville.md')!);
    expect(written).toMatchObject({ action: 'pass', reason: 'length', slug: 'moby-dick-herman-melville' });

    expect((await outbox.all()).map((i) => i.state)).toEqual(['sent', 'sent']);
    const vault = await sync(repo());
    expect(vault.inbox.map((f) => f.note?.action)).toEqual(['note', 'watch', 'pass']);
    expect(await outbox.all()).toEqual([]);
  });

  it('keeps notes on the phone while offline and sends them later', async () => {
    await sync(repo());
    await queue(note('hold'));
    github.offline = true;
    const result = await flush(repo(), 'main');
    expect(result).toMatchObject({ sent: 0, retryable: true });
    expect((await outbox.all())[0]).toMatchObject({ state: 'queued', error: expect.stringMatching(/offline/) });
    github.offline = false;
    expect(await flush(repo(), 'main')).toEqual({ sent: 1 });
    expect(github.inbox()).toContain('inbox/2026-11-24T193000-hold-the-age-of-innocence-edith-wharton.md');
  });

  it('picks the next name when one is taken', async () => {
    const first = note('note', { body: 'one' });
    github.files.set(notePath(first), 'already here');
    await queue(first);
    expect(await flush(repo(), 'main')).toEqual({ sent: 1 });
    expect(github.files.get(notePath(first, 1))).toContain('one');
  });

  it('stops at a refused write and keeps the rest for later', async () => {
    await queue(note('watch'));
    await queue(note('hold', { title: 'Hunger', author: 'Knut Hamsun', slug: 'hunger-knut-hamsun', sent: '2026-11-24T19:35:00-05:00' }));
    github.failures.push({ method: 'PUT', pathIncludes: '/contents/', status: 403, times: 1 });
    const result = await flush(repo(), 'main');
    expect(result).toMatchObject({ sent: 0, retryable: false, error: expect.stringMatching(/Read and write/) });
    expect((await outbox.all()).map((i) => i.state)).toEqual(['failed', 'queued']);
    expect(await flush(repo(), 'main')).toEqual({ sent: 2 });
  });
});

describe('taking a note back', () => {
  it('drops one still on the phone without calling GitHub', async () => {
    const item = await queue(note('watch'));
    github.calls = [];
    expect(await takeBack(repo(), 'main', item)).toBe('removed');
    expect(await outbox.all()).toEqual([]);
    expect(github.calls).toEqual([]);
  });

  it('deletes one already in the vault', async () => {
    const item = await queue(note('watch'));
    await flush(repo(), 'main');
    expect(github.inbox()).toHaveLength(2);
    expect(await takeBack(repo(), 'main', item)).toBe('removed');
    expect(github.inbox()).toEqual(['inbox/2026-11-21T214000-note-bleak-house-charles-dickens.md']);
    expect(github.calls.find((c) => c.method === 'DELETE')?.body?.message).toBe('app: take back watch The Age of Innocence');
  });

  it('says so when the curator got there first', async () => {
    const vault = await sync(repo());
    const waiting = vault.inbox[0];
    github.process(waiting.path);
    expect(await takeBack(repo(), 'main', { path: waiting.path, sha: waiting.sha, note: waiting.note! })).toBe('already-processed');
  });
});
