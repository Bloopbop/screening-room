import { today } from './notes';
import type { Book, BookRef, Dismissal } from './types';
import { unslug } from './slug';

export function refOf(book: { title: string; author: string; slug?: string }): BookRef {
  return { title: book.title, author: book.author, slug: book.slug };
}

/** Whole days from an ISO date to today, or null. */
export function daysSince(date: string, now = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [ty, tm, td] = today(now).split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86_400_000);
}

/** "2026-11-24" as "24 Nov 2026" (or "24 Nov" this year). */
export function shortDate(date: string, now = new Date()): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) return date;
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const value = new Date(y, m - 1, d);
  return value.toLocaleDateString([], { day: 'numeric', month: 'short', ...(y === now.getFullYear() ? {} : { year: 'numeric' }) });
}

/** "3 min ago", "2 h ago", or a date. */
export function ago(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!t) return 'never';
  const minutes = Math.round((now - t) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return shortDate(new Date(t).toISOString().slice(0, 10));
}

export function ratingText(book: Book): string {
  if (book.dnf) return 'Unfinished';
  return book.rating == null ? '' : `${book.rating}/10`;
}

export function dismissalTitle(d: Dismissal): string {
  const text = unslug(d.slug);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
