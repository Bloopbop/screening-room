import { unslug } from './slug';
import { app, type Waiting } from './state.svelte';
import type { FeedEntry } from './types';
import type { Standing } from './vault';

/** Where a feed candidate stands beyond the feed: reading, read, on the list or passed. */
export function settled(entry: FeedEntry): Standing | undefined {
  return app.index?.find(entry).find((s) => s.kind !== 'feed' && s.kind !== 'on-hand');
}

/** Candidates not yet screened: no verdict waiting, not held, not on a shelf. */
export function freshFeed(): FeedEntry[] {
  return (app.vault?.feed ?? []).filter((e) => e.status !== 'hold' && !settled(e) && app.waitingFor(e).length === 0);
}

export interface ReadyView {
  slug: string;
  title: string;
  author: string;
  note: string;
  standing?: Standing;
}

/** The library page's "Ready now" picks, with titles from their pages or catalog rows. */
export function readyNow(): ReadyView[] {
  return (app.vault?.library.ready ?? [])
    .map((item) => {
      const standing = app.index?.resolve(item.slug);
      const named = standing?.kind === 'on-hand' ? standing.row : standing && 'book' in standing ? standing.book : null;
      return {
        slug: item.slug,
        title: named?.title ?? capitalise(unslug(item.slug)),
        author: named?.author ?? '',
        note: item.note,
        standing,
      };
    })
    .filter((r) => r.standing?.kind !== 'read' && r.standing?.kind !== 'reading');
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const STANDING_LABELS: Record<Standing['kind'], string> = {
  reading: 'Reading now',
  read: 'Read',
  'to-read': 'On your list',
  dismissed: 'Passed',
  feed: 'In the feed',
  'on-hand': 'On hand',
};

/** A finish or stop is on its way: the book is leaving the desk. */
export function closing(notes: Waiting[]): boolean {
  return notes.some((w) => w.note.action === 'finish' || w.note.action === 'abandon');
}
