import { toIsbn13 } from './isbn';
import { parseNote } from './notes';
import { parseBook, parseDismissed, parseFeed, parseLibrary, resolveLinks } from './parse';
import { authorKey, bookSlug, compact, slugify, titleKey } from './slug';
import type { AppNote, Book, BookRef, CatalogRow, Dismissal, FeedEntry, Shelf, Vault } from './types';

export const FEED_PATH = 'feed/latest.md';
export const DISMISSED_PATH = 'dismissed.csv';
export const LIBRARY_PATH = 'wiki/library/library.md';

const SHELF_PATH = /^wiki\/(currently-reading|to-be-read|shelved)\/[^/]+\.md$/;
const INBOX_PATH = /^inbox\/[^/]+\.md$/;
const SHELVES: Record<string, Shelf> = { 'currently-reading': 'reading', 'to-be-read': 'to-read', shelved: 'read' };

/** The vault files the app reads. Nothing in raw/ is ever fetched. */
export function isVaultFile(path: string): boolean {
  return SHELF_PATH.test(path) || INBOX_PATH.test(path) || path === FEED_PATH || path === DISMISSED_PATH || path === LIBRARY_PATH;
}

export interface VaultFile {
  path: string;
  sha: string;
  text: string;
}

export function buildVault(files: VaultFile[], meta: { branch: string; treeSha: string; syncedAt: string }): Vault {
  const vault: Vault = { ...meta, books: [], feed: [], dismissed: [], library: { ready: [], catalog: [] }, inbox: [], problems: [] };
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    try {
      const shelf = SHELF_PATH.exec(file.path);
      if (shelf) vault.books.push(parseBook(file.path, SHELVES[file.path.split('/')[1]], file.text));
      else if (INBOX_PATH.test(file.path)) vault.inbox.push({ path: file.path, sha: file.sha, note: parseNote(file.text) });
      else if (file.path === FEED_PATH) vault.feed = parseFeed(file.text);
      else if (file.path === DISMISSED_PATH) vault.dismissed = parseDismissed(file.text);
      else if (file.path === LIBRARY_PATH) vault.library = parseLibrary(file.text);
    } catch (error) {
      vault.problems.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  linkTitles(vault);
  return vault;
}

/** Turns [[slug]] links in displayed text into the linked book's title. */
function linkTitles(vault: Vault) {
  const titles = new Map<string, string>();
  const name = (slug: string, title: string) => {
    const key = compact(slugify(slug));
    if (key && !titles.has(key)) titles.set(key, title);
  };
  for (const b of vault.books) name(b.slug, b.title);
  for (const r of vault.library.catalog) name(r.slug, r.title);
  for (const e of vault.feed) name(e.slug, e.title);
  const link = (text: string) => (text.includes('[[') ? resolveLinks(text, (slug) => titles.get(compact(slugify(slug)))) : text);
  for (const b of vault.books) {
    b.logline = link(b.logline);
    b.matchReason = link(b.matchReason);
    if (b.lastLog) b.lastLog.marker = link(b.lastLog.marker);
  }
  for (const e of vault.feed) {
    e.pitch = link(e.pitch);
    e.source = link(e.source);
    e.extra = e.extra.map(link);
  }
  for (const r of vault.library.ready) r.note = link(r.note);
  for (const r of vault.library.catalog) {
    r.description = link(r.description);
    r.note = link(r.note);
  }
}

/** Where a book stands in the vault. A book can stand in more than one place (on hand and on the list). */
export type Standing =
  | { kind: 'reading' | 'to-read' | 'read'; book: Book }
  | { kind: 'dismissed'; dismissal: Dismissal }
  | { kind: 'feed'; entry: FeedEntry }
  | { kind: 'on-hand'; row: CatalogRow };

interface Keyed<T> {
  slug: string;
  title: string;
  author: string;
  value: T;
}

/** Finds books across the shelves, the feed, the dismissed list and the on-hand catalog. */
export class VaultIndex {
  private readonly bySlug = new Map<string, Standing[]>();
  private readonly byTitle = new Map<string, Keyed<Standing>[]>();
  private readonly byIsbn = new Map<string, Standing[]>();

  constructor(readonly vault: Vault) {
    const order: Record<Standing['kind'], number> = { reading: 0, read: 1, 'to-read': 2, dismissed: 3, feed: 4, 'on-hand': 5 };
    const all: Keyed<Standing>[] = [
      ...vault.books.map((book) => ({ slug: book.slug, title: book.title, author: book.author, value: { kind: book.shelf, book } as Standing })),
      ...vault.dismissed.map((d) => ({ slug: d.slug, title: '', author: '', value: { kind: 'dismissed', dismissal: d } as Standing })),
      ...vault.feed.map((entry) => ({ slug: entry.slug, title: entry.title, author: entry.author, value: { kind: 'feed', entry } as Standing })),
      ...vault.library.catalog.map((row) => ({ slug: row.slug, title: row.title, author: row.author, value: { kind: 'on-hand', row } as Standing })),
    ].sort((a, b) => order[a.value.kind] - order[b.value.kind]);
    for (const item of all) {
      push(this.bySlug, compact(item.slug), item.value);
      if (item.title) push(this.byTitle, titleKey(item.title), item);
      if ('book' in item.value) {
        const isbn = isbnInCover(item.value.book.coverUrl);
        if (isbn) push(this.byIsbn, isbn, item.value);
      }
    }
  }

  /** Every place this book stands, most settled first: reading, read, to read, passed, feed, on hand. */
  find(ref: BookRef): Standing[] {
    const found: Standing[] = [];
    const add = (s: Standing) => {
      if (!found.includes(s)) found.push(s);
    };
    if (ref.isbn) for (const s of this.byIsbn.get(ref.isbn) ?? []) add(s);
    for (const slug of new Set([ref.slug, bookSlug(ref.title, ref.author)].filter(Boolean) as string[])) {
      for (const s of this.bySlug.get(compact(slug)) ?? []) add(s);
    }
    const author = authorKey(ref.author);
    for (const item of this.byTitle.get(titleKey(ref.title)) ?? []) {
      const other = authorKey(item.author);
      if (!author || !other || author === other) add(item.value);
    }
    const order = ['reading', 'read', 'to-read', 'dismissed', 'feed', 'on-hand'];
    return found.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  }

  book(slug: string): Book | undefined {
    return this.vault.books.find((b) => b.slug === slug);
  }

  /** A "Ready now" slug resolved to a page or a catalog row. */
  resolve(slug: string): Standing | undefined {
    return this.bySlug.get(compact(slug))?.find((s) => s.kind !== 'dismissed' && s.kind !== 'feed');
  }
}

/** Covers fetched by ISBN carry it in the URL: covers.openlibrary.org/b/isbn/9780140449136-M.jpg. */
export function isbnInCover(url: string): string {
  const m = /\/b\/isbn\/(\d{13}|\d{9}[\dX])-/i.exec(url);
  if (!m) return '';
  return m[1].length === 13 ? m[1] : (toIsbn13(m[1]) ?? '');
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Whether an app note concerns this book. */
export function noteMatches(note: Pick<AppNote, 'title' | 'author' | 'slug'>, ref: BookRef): boolean {
  const slugs = [ref.slug, bookSlug(ref.title, ref.author)].filter(Boolean).map((s) => compact(s!));
  const noteSlugs = [note.slug, bookSlug(note.title, note.author)].filter(Boolean).map((s) => compact(s));
  if (noteSlugs.some((s) => slugs.includes(s))) return true;
  const a = authorKey(note.author);
  const b = authorKey(ref.author);
  return titleKey(note.title) === titleKey(ref.title) && (!a || !b || a === b);
}
