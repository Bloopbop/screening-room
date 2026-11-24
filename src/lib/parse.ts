import { flag, list, number, readPage, text } from './frontmatter';
import { bookSlug } from './slug';
import type { Book, CatalogRow, Dismissal, FeedEntry, Library, LogEntry, ReadyItem, Shelf } from './types';

/** A book page from one of the three shelves. */
export function parseBook(path: string, shelf: Shelf, source: string): Book {
  const { data, body } = readPage(source);
  const slug = path.split('/').pop()!.replace(/\.md$/, '');
  const logs = discussionLog(body);
  return {
    slug,
    path,
    shelf,
    title: text(data.title) || slug,
    author: text(data.author),
    year: text(data.year),
    pages: number(data.pages),
    rating: number(data.rating),
    dnf: flag(data.dnf),
    dateAdded: text(data.date_added),
    dateStarted: text(data.date_started),
    dateRead: text(data.date_read),
    coverUrl: /^https:\/\//.test(text(data.cover_url)) ? text(data.cover_url) : '',
    spineColor: /^#[0-9a-f]{3,8}$/i.test(text(data.spine_color)) ? text(data.spine_color) : '',
    tags: list(data.tags),
    logline: labelled(body, 'Logline'),
    recommendedBy: text(data.recommended_by),
    matchReason: text(data.match_reason),
    lastLog: logs[logs.length - 1] ?? null,
    logCount: logs.length,
  };
}

/** The text after a bold label such as "**Logline.**", as a bullet or a paragraph. */
function labelled(body: string, label: string): string {
  const m = new RegExp(`^(?:- )?\\*\\*${label}\\.?\\*\\*:?[ \\t]*(.*)$`, 'm').exec(body);
  if (!m) return '';
  if (m[1].trim()) return plain(m[1]);
  // The label on its own line: take the next paragraph.
  const rest = body.slice(m.index + m[0].length).replace(/^\s*\n/, '');
  return plain(rest.split(/\n\s*\n/)[0] ?? '');
}

/** Discussion Log headings: "### 2026-11-20 — through Part II". */
function discussionLog(body: string): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const m of body.matchAll(/^###\s+(\d{4}-\d{2}-\d{2})\s*(?:[—–-]\s*(.*))?$/gm)) {
    entries.push({ date: m[1], marker: plain(m[2] ?? '') });
  }
  return entries;
}

/** Markdown inline text made plain: links and emphasis. Wikilinks stay, for resolveLinks. */
export function plain(markdown: string): string {
  return markdown
    .replace(/(?<!\[)\[([^\][]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[\s(])[*_](\S(?:.*?\S)?)[*_](?=$|[\s).,;:!?])/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** feed/latest.md: "### Title — Author (Year)" headings, each with "- **Field:** value" lines. */
export function parseFeed(source: string): FeedEntry[] {
  const entries: FeedEntry[] = [];
  const sections = source.replace(/\r\n?/g, '\n').split(/^### /m).slice(1);
  for (const section of sections) {
    const [heading, ...lines] = section.split('\n');
    const { title, author, year } = feedHeading(heading.trim());
    if (!title) continue;
    const fields: Record<string, string> = {};
    const extra: string[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || /^#{1,2}\s/.test(line) || /^---+$/.test(line)) continue;
      const m = /^- \*\*([^*:]+):\*\*\s*(.*)$/.exec(line);
      if (m) fields[m[1].trim().toLowerCase()] = m[2].trim();
      else extra.push(plain(line.replace(/^[-*]\s+/, '')));
    }
    entries.push({
      title,
      author,
      year,
      slug: bookSlug(title, author),
      source: plain(fields.source ?? ''),
      pitch: plain(fields.pitch ?? ''),
      tags: (fields.tags ?? '').split(/[,;]/).map((t) => plain(t)).filter(Boolean),
      status: (fields.status ?? 'pending').toLowerCase().split(/\s/)[0],
      extra: extra.filter(Boolean),
    });
  }
  return entries;
}

function feedHeading(heading: string): { title: string; author: string; year: string } {
  const split = heading.lastIndexOf(' — ');
  if (split < 0) return { title: heading, author: '', year: '' };
  const title = heading.slice(0, split).trim();
  const rest = heading.slice(split + 3).trim();
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(rest);
  return m ? { title, author: m[1].trim(), year: m[2].trim() } : { title, author: rest, year: '' };
}

/** dismissed.csv: slug,date,reason (the header row is optional). */
export function parseDismissed(source: string): Dismissal[] {
  const rows: Dismissal[] = [];
  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) continue;
    const [slug, date = '', ...reason] = line.split(',');
    if (!slug.trim() || slug.trim() === 'slug') continue;
    rows.push({ slug: slug.trim(), date: date.trim(), reason: unquoteCsv(reason.join(',').trim()) });
  }
  return rows;
}

function unquoteCsv(value: string): string {
  return value.startsWith('"') && value.endsWith('"') && value.length >= 2 ? value.slice(1, -1).replace(/""/g, '"') : value;
}

/** wiki/library/library.md: the "Ready now" picks and the catalog table. */
export function parseLibrary(source: string): Library {
  const sections = new Map<string, string>();
  const normalized = source.replace(/\r\n?/g, '\n');
  for (const part of normalized.split(/^## /m).slice(1)) {
    const nl = part.indexOf('\n');
    sections.set(part.slice(0, nl < 0 ? undefined : nl).trim().toLowerCase(), nl < 0 ? '' : part.slice(nl + 1));
  }
  return { ready: readyNow(sections.get('ready now') ?? ''), catalog: catalog(sections.get('catalog') ?? '') };
}

function readyNow(section: string): ReadyItem[] {
  const items: ReadyItem[] = [];
  for (const line of section.split('\n')) {
    if (!/^\s*[-*]\s/.test(line)) continue;
    const slugs = [...line.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim());
    if (!slugs.length) continue;
    const dash = line.search(/ [—–] /);
    const note = dash >= 0 ? plain(line.slice(dash + 3)) : '';
    for (const slug of slugs) items.push({ slug, note });
  }
  return items;
}

function catalog(section: string): CatalogRow[] {
  const lines = section.split('\n').filter((l) => l.trim().startsWith('|'));
  if (lines.length < 2) return [];
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split(/(?<!\\)\|/)
      .map((c) => c.replace(/\\\|/g, '|').trim());
  const header = cells(lines[0]).map((h) => h.toLowerCase());
  const at = (row: string[], name: string) => {
    const i = header.indexOf(name);
    return i >= 0 ? plain(row[i] ?? '') : '';
  };
  const rows: CatalogRow[] = [];
  for (const line of lines.slice(1)) {
    if (/^\|?[\s:|-]+$/.test(line.trim())) continue;
    const row = cells(line);
    const title = at(row, 'title');
    if (!title) continue;
    const author = at(row, 'author');
    rows.push({ title, author, genre: at(row, 'genre'), description: at(row, 'description'), note: at(row, 'note'), slug: bookSlug(title, author) });
  }
  return rows;
}

const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;

/** Wikilinks as readable text: the alias, else the linked book's title, else the slug in words. */
export function resolveLinks(text: string, titleOf: (slug: string) => string | undefined): string {
  return text.replace(WIKILINK, (_, slug: string, alias?: string) => alias?.trim() || titleOf(slug.trim()) || slug.trim().replace(/-/g, ' '));
}
