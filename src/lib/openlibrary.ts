// Book lookups from Open Library: no key, CC0 data. Without an identifying
// User-Agent (which browsers can't set) the limit is one request a second,
// so every call waits its turn.

import { covers } from './store';
import { authorKey, titleKey } from './slug';

const OL = 'https://openlibrary.org';
const FIELDS = 'key,title,author_name,first_publish_year,cover_i,isbn,number_of_pages_median';
const GAP_MS = 1100;

export interface Found {
  title: string;
  author: string;
  year: string;
  isbn: string;
  coverUrl: string;
  pages: number | null;
  key: string;
}

interface SearchDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
  number_of_pages_median?: number;
}

let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

function polite<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

export class LookupError extends Error {}

async function getJson<T>(url: string): Promise<T> {
  return polite(async () => {
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new LookupError('Open Library is out of reach. The phone may be offline.');
    }
    if (response.status === 404) return null as T;
    if (!response.ok) throw new LookupError(`Open Library answered ${response.status}. Try again in a minute.`);
    return (await response.json()) as T;
  });
}

export function coverById(id: number | undefined): string {
  return id ? `https://covers.openlibrary.org/b/id/${id}-M.jpg` : '';
}

function found(doc: SearchDoc, isbn = ''): Found {
  return {
    title: doc.title ?? '',
    author: (doc.author_name ?? []).join(' & '),
    year: doc.first_publish_year ? String(doc.first_publish_year) : '',
    isbn: isbn || (doc.isbn ?? []).find((i) => i.length === 13) || '',
    coverUrl: coverById(doc.cover_i),
    pages: doc.number_of_pages_median ?? null,
    key: doc.key ?? '',
  };
}

/** The book with this ISBN, or null if Open Library doesn't know it. */
export async function byIsbn(isbn: string): Promise<Found | null> {
  const data = await getJson<{ docs?: SearchDoc[] } | null>(`${OL}/search.json?q=isbn:${isbn}&fields=${FIELDS}&limit=1`);
  const doc = data?.docs?.[0];
  if (doc?.title) return found(doc, isbn);
  return byEdition(isbn);
}

/** Editions too new for the search index: /isbn/ gives the edition, then its author. */
async function byEdition(isbn: string): Promise<Found | null> {
  const edition = await getJson<{ title?: string; authors?: { key: string }[]; covers?: number[]; publish_date?: string; number_of_pages?: number; key?: string } | null>(
    `${OL}/isbn/${isbn}.json`,
  );
  if (!edition?.title) return null;
  let author = '';
  const authorKeyPath = edition.authors?.[0]?.key;
  if (authorKeyPath && /^\/authors\/OL\w+$/.test(authorKeyPath)) {
    author = (await getJson<{ name?: string } | null>(`${OL}${authorKeyPath}.json`))?.name ?? '';
  }
  return {
    title: edition.title,
    author,
    year: /\d{4}/.exec(edition.publish_date ?? '')?.[0] ?? '',
    isbn,
    coverUrl: coverById(edition.covers?.find((c) => c > 0)),
    pages: edition.number_of_pages ?? null,
    key: edition.key ?? '',
  };
}

/** Books matching what was typed: a title, perhaps with the author. */
export async function search(query: string): Promise<Found[]> {
  const data = await getJson<{ docs?: SearchDoc[] } | null>(`${OL}/search.json?q=${encodeURIComponent(query)}&fields=${FIELDS}&limit=8`);
  return (data?.docs ?? []).filter((d) => d.title).map((d) => found(d));
}

const COVER_DAYS = 30;

/**
 * A cover for a book with no cover_url, such as a feed candidate. Cached on
 * the phone, misses included, so each book is looked up once a month at most.
 */
export async function findCover(title: string, author: string): Promise<string> {
  const key = `${titleKey(title)}|${authorKey(author)}`;
  const cached = await covers.get(key);
  if (cached && Date.now() - Date.parse(cached.at) < COVER_DAYS * 86_400_000) return cached.url;
  const params = new URLSearchParams({ title, fields: 'cover_i,title,author_name', limit: '3' });
  if (author) params.set('author', author);
  const data = await getJson<{ docs?: SearchDoc[] } | null>(`${OL}/search.json?${params}`);
  const doc = data?.docs?.find((d) => d.cover_i && titleKey(d.title ?? '') === titleKey(title));
  const url = coverById(doc?.cover_i);
  await covers.put({ key, url, at: new Date().toISOString() });
  return url;
}
