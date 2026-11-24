// Everything the app keeps on the phone, in one IndexedDB database of its own.
// Other apps on the same site keep theirs; "Forget this vault" deletes only this one.

import type { AppNote } from './types';

export const DB_NAME = 'screening-room';
const VERSION = 1;

export interface Settings {
  owner: string;
  repo: string;
  token: string;
}

/** The files of the last sync: enough to rebuild the vault offline from cached blobs. */
export interface SyncState {
  branch: string;
  treeSha: string;
  syncedAt: string;
  files: { path: string; sha: string }[];
}

export interface OutboxItem {
  id: string;
  note: AppNote;
  /** Where the note will be (or was) written in the vault. */
  path: string;
  state: 'queued' | 'sent' | 'failed';
  /** Once sent: the note's blob sha, needed to take it back. */
  sha?: string;
  sentAt?: string;
  error?: string;
  createdAt: string;
}

export interface CoverLookup {
  key: string;
  url: string;
  at: string;
}

let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const d = request.result;
      d.createObjectStore('kv');
      d.createObjectStore('blobs');
      d.createObjectStore('outbox', { keyPath: 'id' });
      d.createObjectStore('covers', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      opening = null;
      reject(request.error);
    };
  });
  return opening;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'));
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function read<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const tx = (await db()).transaction(store, 'readonly');
  return (await result(tx.objectStore(store).get(key))) as T | undefined;
}

async function readAll<T>(store: string): Promise<T[]> {
  const tx = (await db()).transaction(store, 'readonly');
  return (await result(tx.objectStore(store).getAll())) as T[];
}

async function write(store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  const tx = (await db()).transaction(store, 'readwrite');
  tx.objectStore(store).put(value, key);
  await done(tx);
}

async function remove(store: string, key: IDBValidKey): Promise<void> {
  const tx = (await db()).transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await done(tx);
}

export const settings = {
  get: () => read<Settings>('kv', 'settings'),
  set: (value: Settings) => write('kv', value, 'settings'),
};

export const syncState = {
  get: () => read<SyncState>('kv', 'sync'),
  set: (value: SyncState) => write('kv', value, 'sync'),
};

export const blobs = {
  get: (sha: string) => read<string>('blobs', sha),
  async getMany(shas: string[]): Promise<Map<string, string>> {
    const tx = (await db()).transaction('blobs', 'readonly');
    const store = tx.objectStore('blobs');
    const found = new Map<string, string>();
    await Promise.all(
      shas.map(async (sha) => {
        const text = (await result(store.get(sha))) as string | undefined;
        if (text != null) found.set(sha, text);
      }),
    );
    return found;
  },
  async keys(): Promise<string[]> {
    const tx = (await db()).transaction('blobs', 'readonly');
    return (await result(tx.objectStore('blobs').getAllKeys())) as string[];
  },
  put: (sha: string, text: string) => write('blobs', text, sha),
  /** Drops cached files that are no longer in the vault. */
  async keepOnly(shas: Set<string>): Promise<void> {
    const stale = (await blobs.keys()).filter((sha) => !shas.has(sha));
    if (!stale.length) return;
    const tx = (await db()).transaction('blobs', 'readwrite');
    for (const sha of stale) tx.objectStore('blobs').delete(sha);
    await done(tx);
  },
};

export const outbox = {
  async all(): Promise<OutboxItem[]> {
    return (await readAll<OutboxItem>('outbox')).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  },
  put: (item: OutboxItem) => write('outbox', item),
  delete: (id: string) => remove('outbox', id),
};

export const covers = {
  get: (key: string) => read<CoverLookup>('covers', key),
  put: (value: CoverLookup) => write('covers', value),
};

/** Deletes this app's database: settings, token, cached vault and unsent notes. */
export async function forgetAll(): Promise<void> {
  if (opening) (await opening).close();
  opening = null;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
