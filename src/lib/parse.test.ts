import { describe, expect, it } from 'vitest';
import { readPage } from './frontmatter';
import { parseBook, parseDismissed, parseFeed, parseLibrary, plain, resolveLinks } from './parse';
import { bookSlug, compact, slugify, titleKey } from './slug';
import { sampleVault } from './testing/fake-github';

const vault = sampleVault();

describe('slugs follow the vault convention (tools/feed.sh)', () => {
  it('drops apostrophes and accents, turns & into and, and cuts subtitles', () => {
    expect(slugify("Hell's Angels")).toBe('hells-angels');
    expect(slugify('Cien años de soledad')).toBe('cien-anos-de-soledad');
    expect(slugify('Straße & Œuvre')).toBe('strasse-and-oeuvre');
    expect(slugify('  --Pale   Fire!--  ')).toBe('pale-fire');
    expect(bookSlug('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari')).toBe('sapiens-yuval-noah-harari');
    expect(bookSlug('Good Omens', 'Terry Pratchett & Neil Gaiman')).toBe('good-omens-terry-pratchett-neil-gaiman');
    expect(bookSlug('', 'Anyone')).toBe('');
    expect(bookSlug('Beloved', '')).toBe('beloved');
  });

  it('matches older slugs that kept a possessive apart', () => {
    expect(compact('the-handmaid-s-tale-margaret-atwood')).toBe(compact(bookSlug("The Handmaid's Tale", 'Margaret Atwood')));
    expect(titleKey('The Waves')).toBe(titleKey('Waves'));
    expect(titleKey('Middlemarch: A Study of Provincial Life')).toBe('middlemarch');
  });
});

describe('frontmatter', () => {
  it('keeps dates as written and reads numbers, lists and dashes', () => {
    const page = readPage(vault['wiki/shelved/middlemarch-george-eliot.md']);
    expect(page.data.date_read).toBe('2026-03-02');
    expect(page.data.rating).toBe(9);
    expect(page.data.tags).toEqual(['victorian', 'provincial-life']);
    expect(page.body).toContain('**Logline.**');
  });

  it('survives Windows line endings, a byte order mark and broken YAML', () => {
    const page = readPage('﻿---\r\ntitle: "A: B" [broken\r\nauthor: Someone\r\ntags: [a, b]\r\n---\r\nBody');
    expect(page.data.author).toBe('Someone');
    expect(page.data.tags).toEqual(['a', 'b']);
    expect(page.body).toBe('Body');
    expect(readPage('No frontmatter here').data).toEqual({});
  });
});

describe('book pages', () => {
  it('reads a shelved page', () => {
    const book = parseBook('wiki/shelved/middlemarch-george-eliot.md', 'read', vault['wiki/shelved/middlemarch-george-eliot.md']);
    expect(book).toMatchObject({
      slug: 'middlemarch-george-eliot',
      title: 'Middlemarch',
      author: 'George Eliot',
      year: '1871',
      pages: 880,
      rating: 9,
      dnf: false,
      dateRead: '2026-03-02',
      spineColor: '#D85A30',
      logline: "A provincial town's marriages and ambitions, seen whole.",
    });
  });

  it('reads a DNF with no rating', () => {
    const book = parseBook('wiki/shelved/tristram-shandy-laurence-sterne.md', 'read', vault['wiki/shelved/tristram-shandy-laurence-sterne.md']);
    expect(book.rating).toBeNull();
    expect(book.dnf).toBe(true);
    expect(book.coverUrl).toBe('');
  });

  it('reads the latest Discussion Log entry of a book in progress', () => {
    const book = parseBook('wiki/currently-reading/bleak-house-charles-dickens.md', 'reading', vault['wiki/currently-reading/bleak-house-charles-dickens.md']);
    expect(book.dateStarted).toBe('2026-11-02');
    expect(book.lastLog).toEqual({ date: '2026-11-19', marker: 'through chapter 30' });
    expect(book.logCount).toBe(2);
  });

  it('finds a logline written as a bullet', () => {
    const book = parseBook('wiki/to-be-read/north-and-south-elizabeth-gaskell.md', 'to-read', vault['wiki/to-be-read/north-and-south-elizabeth-gaskell.md']);
    expect(book.logline).toBe("A southern parson's daughter meets a northern mill owner.");
    expect(book.recommendedBy).toBe('human');
  });

  it('ignores cover links that are not https and colours that are not colours', () => {
    const book = parseBook('wiki/shelved/x.md', 'read', '---\ntitle: X\ncover_url: "javascript:alert(1)"\nspine_color: red\n---\n');
    expect(book.coverUrl).toBe('');
    expect(book.spineColor).toBe('');
    expect(book.title).toBe('X');
  });
});

describe('the feed', () => {
  const feed = parseFeed(vault['feed/latest.md']);

  it('reads every candidate with its fields', () => {
    expect(feed.map((e) => e.title)).toEqual(['The Age of Innocence', 'Hunger', "Hell's Angels", 'Moby-Dick']);
    expect(feed[0]).toMatchObject({
      author: 'Edith Wharton',
      year: '1920',
      slug: 'the-age-of-innocence-edith-wharton',
      source: 'Open Library trending',
      pitch: "Old New York's manners as a cage. A companion to the Victorians on the shelf.",
      tags: ['gilded-age', 'manners (companion)'],
      status: 'pending',
      extra: ['Companion to [[middlemarch-george-eliot]]: marriage as an institution.'],
    });
    expect(feed[1].status).toBe('hold');
    expect(feed[2].slug).toBe('hells-angels-hunter-s-thompson');
    expect(feed[2].extra).toEqual(['A stretch toward reportage.']);
  });

  it('copes with a title containing a dash and a heading with no year', () => {
    const [entry, other] = parseFeed('### Night — A Memoir — Elie Wiesel (1956)\n- **Status:** hold\n\n### Untitled\n');
    expect(entry).toMatchObject({ title: 'Night — A Memoir', author: 'Elie Wiesel', year: '1956', status: 'hold' });
    expect(other).toMatchObject({ title: 'Untitled', author: '', status: 'pending' });
  });
});

describe('dismissed.csv', () => {
  it('reads rows, with or without a header', () => {
    expect(parseDismissed(vault['dismissed.csv'])).toEqual([
      { slug: 'the-great-gatsby-f-scott-fitzgerald', date: '2026-05-01', reason: 'tone' },
      { slug: 'moby-dick-herman-melville', date: '2026-06-11', reason: 'length' },
      { slug: 'ulysses-james-joyce', date: '2026-07-20', reason: 'length' },
    ]);
    expect(parseDismissed('a-b,2026-01-01,—\r\n\r\nc-d,2026-01-02,"x, y"\n')).toEqual([
      { slug: 'a-b', date: '2026-01-01', reason: '—' },
      { slug: 'c-d', date: '2026-01-02', reason: 'x, y' },
    ]);
  });
});

describe('the library page', () => {
  const library = parseLibrary(vault['wiki/library/library.md']);

  it('reads the Ready now picks, aliases included', () => {
    expect(library.ready).toEqual([
      { slug: 'the-waves-virginia-woolf', note: 'after Bleak House, something interior' },
      { slug: 'cranford-elizabeth-gaskell', note: 'short and strange' },
      { slug: 'pale-fire-vladimir-nabokov', note: 'short and strange' },
    ]);
  });

  it('reads the catalog table and skips other sections', () => {
    expect(library.catalog).toHaveLength(4);
    expect(library.catalog[0]).toEqual({
      title: 'North and South',
      author: 'Elizabeth Gaskell',
      genre: 'Victorian',
      description: 'Mills and manners',
      note: 'epub',
      slug: 'north-and-south-elizabeth-gaskell',
    });
    expect(library.catalog[1].note).toBe('');
  });
});

describe('plain text from Markdown', () => {
  it('strips links and emphasis, and keeps wikilinks for the vault to resolve', () => {
    expect(plain('See [[pale-fire-vladimir-nabokov|Pale Fire]] in *italics* or **bold**, [a link](https://x.y).')).toBe(
      'See [[pale-fire-vladimir-nabokov|Pale Fire]] in italics or bold, a link.',
    );
    expect(plain('snake_case_words stay')).toBe('snake_case_words stay');
  });

  it('resolves wikilinks to an alias, a known title, or the slug in words', () => {
    const titles: Record<string, string> = { 'middlemarch-george-eliot': 'Middlemarch' };
    expect(resolveLinks('[[middlemarch-george-eliot]], [[x|An Alias]] and [[unknown-book#Section]]', (s) => titles[s])).toBe(
      'Middlemarch, An Alias and unknown book',
    );
  });
});
