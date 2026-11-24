import { number, quoted, readPage, text } from './frontmatter';
import { bookSlug, slugify } from './slug';
import { ACTIONS, type Action, type AppNote } from './types';

/** What each action means, for buttons and waiting lists. */
export const ACTION_LABELS: Record<Action, string> = {
  watch: 'Watch',
  pass: 'Pass',
  hold: 'Hold',
  start: 'Started',
  note: 'Note',
  finish: 'Finished',
  abandon: 'Stopped',
  add: 'Want to read',
  read: 'Read before',
};

/** The note's text: YAML frontmatter, then the human's own words. Fields that don't apply are left out. */
export function noteText(note: AppNote): string {
  const lines = ['---', 'type: app-note', `action: ${note.action}`, `title: ${quoted(note.title)}`, `author: ${quoted(note.author)}`];
  if (note.slug) lines.push(`slug: ${note.slug}`);
  if (note.isbn) lines.push(`isbn: ${quoted(note.isbn)}`);
  if (note.rating != null) lines.push(`rating: ${note.rating}`);
  if (note.reason) lines.push(`reason: ${quoted(note.reason)}`);
  if (note.outcome) lines.push(`outcome: ${note.outcome}`);
  if (note.progress) lines.push(`progress: ${quoted(note.progress)}`);
  lines.push(`sent: ${note.sent}`, '---');
  const body = note.body.trim();
  return `${lines.join('\n')}\n${body ? `${body}\n` : ''}`;
}

/** Reads a note back from inbox/. Anything that isn't an app note gives null. */
export function parseNote(source: string): AppNote | null {
  const { data, body } = readPage(source);
  const action = text(data.action) as Action;
  if (text(data.type) !== 'app-note' || !ACTIONS.includes(action)) return null;
  const outcome = text(data.outcome);
  const note: AppNote = {
    action,
    title: text(data.title),
    author: text(data.author),
    slug: text(data.slug),
    sent: text(data.sent),
    body: body.trim(),
  };
  if (text(data.isbn)) note.isbn = text(data.isbn);
  const rating = number(data.rating);
  if (rating != null) note.rating = rating;
  if (text(data.reason)) note.reason = text(data.reason);
  if (outcome === 'dnf' || outcome === 'delete') note.outcome = outcome;
  if (text(data.progress)) note.progress = text(data.progress);
  return note;
}

/** inbox/2026-11-24T193000-watch-the-waves-virginia-woolf.md: sorts by time, readable in a file list. */
export function notePath(note: AppNote, attempt = 0): string {
  const stamp = note.sent.slice(0, 19).replace(/:/g, '');
  const name = (note.slug || bookSlug(note.title, note.author) || slugify(note.title) || 'book').slice(0, 60).replace(/-+$/, '');
  return `inbox/${stamp}-${note.action}-${name}${attempt ? `-${attempt + 1}` : ''}.md`;
}

/** Local time with its offset, as the vault's notes are dated: 2026-11-24T19:30:00-05:00. */
export function localIso(date = new Date()): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
  );
}

/** Today's local date: 2026-11-24. */
export function today(date = new Date()): string {
  return localIso(date).slice(0, 10);
}

/** The commit message for a note. */
export function commitMessage(note: AppNote): string {
  return `app: ${note.action} ${note.title}`.slice(0, 72);
}
