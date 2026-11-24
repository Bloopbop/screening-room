/** Where a book with a page in the vault sits. */
export type Shelf = 'reading' | 'to-read' | 'read';

export const SHELF_FOLDERS: Record<Shelf, string> = {
  reading: 'wiki/currently-reading/',
  'to-read': 'wiki/to-be-read/',
  read: 'wiki/shelved/',
};

export interface LogEntry {
  date: string;
  marker: string;
}

/** A page in wiki/currently-reading/, wiki/to-be-read/ or wiki/shelved/. */
export interface Book {
  slug: string;
  path: string;
  shelf: Shelf;
  title: string;
  author: string;
  year: string;
  pages: number | null;
  rating: number | null;
  dnf: boolean;
  dateAdded: string;
  dateStarted: string;
  dateRead: string;
  coverUrl: string;
  spineColor: string;
  tags: string[];
  logline: string;
  recommendedBy: string;
  matchReason: string;
  /** Reading pages: the latest Discussion Log heading. */
  lastLog: LogEntry | null;
  logCount: number;
}

/** A candidate in feed/latest.md. */
export interface FeedEntry {
  title: string;
  author: string;
  year: string;
  slug: string;
  source: string;
  pitch: string;
  tags: string[];
  status: string;
  /** Lines beyond the standard fields, such as a contrarian pick's reason. */
  extra: string[];
}

/** A row of dismissed.csv. */
export interface Dismissal {
  slug: string;
  date: string;
  reason: string;
}

/** A book file on hand, from the catalog in wiki/library/library.md. */
export interface CatalogRow {
  title: string;
  author: string;
  genre: string;
  description: string;
  note: string;
  slug: string;
}

/** A pick from the library page's "Ready now" section. */
export interface ReadyItem {
  slug: string;
  note: string;
}

export interface Library {
  ready: ReadyItem[];
  catalog: CatalogRow[];
}

export const ACTIONS = ['watch', 'pass', 'hold', 'start', 'note', 'finish', 'abandon', 'add', 'read'] as const;
export type Action = (typeof ACTIONS)[number];

/** One action taken in the app, written to the vault's inbox/ as a note for the curator. */
export interface AppNote {
  action: Action;
  title: string;
  author: string;
  slug: string;
  isbn?: string;
  rating?: number;
  reason?: string;
  outcome?: 'dnf' | 'delete';
  progress?: string;
  sent: string;
  body: string;
}

/** A note in the vault's inbox/, not yet processed by the curator. */
export interface InboxFile {
  path: string;
  sha: string;
  note: AppNote | null;
}

export interface Vault {
  branch: string;
  treeSha: string;
  syncedAt: string;
  books: Book[];
  feed: FeedEntry[];
  dismissed: Dismissal[];
  library: Library;
  inbox: InboxFile[];
  /** Files that couldn't be read, with the reason. */
  problems: string[];
}

/** Title and author, and the slug when known: enough to find a book in the vault. */
export interface BookRef {
  title: string;
  author: string;
  slug?: string;
  isbn?: string;
}
