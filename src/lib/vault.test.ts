import { describe, expect, it } from 'vitest';
import { gitSha, sampleVault } from './testing/fake-github';
import { buildVault, isVaultFile, isbnInCover, noteMatches, VaultIndex } from './vault';

const files = Object.entries(sampleVault()).map(([path, text]) => ({ path, text, sha: gitSha(text) }));
const vault = buildVault(
  files.filter((f) => isVaultFile(f.path)),
  { branch: 'main', treeSha: 't', syncedAt: '2026-11-24T00:00:00Z' },
);
const index = new VaultIndex(vault);
const kinds = (title: string, author: string, extra: { slug?: string; isbn?: string } = {}) => index.find({ title, author, ...extra }).map((s) => s.kind);

describe('reading the vault', () => {
  it('reads only the files the app needs, never raw/', () => {
    expect(isVaultFile('raw/do-not-fetch.epub')).toBe(false);
    expect(isVaultFile('wiki/shelved/a.md')).toBe(true);
    expect(isVaultFile('wiki/shelved/nested/a.md')).toBe(false);
    expect(isVaultFile('wiki/ideas/a.md')).toBe(false);
    expect(isVaultFile('inbox/a.md')).toBe(true);
    expect(vault.books.map((b) => `${b.shelf}:${b.slug}`).sort()).toEqual([
      'read:middlemarch-george-eliot',
      'read:the-handmaid-s-tale-margaret-atwood',
      'read:tristram-shandy-laurence-sterne',
      'reading:bleak-house-charles-dickens',
      'to-read:north-and-south-elizabeth-gaskell',
      'to-read:the-waves-virginia-woolf',
    ]);
    expect(vault.feed).toHaveLength(4);
    expect(vault.dismissed).toHaveLength(3);
    expect(vault.library.catalog).toHaveLength(4);
    expect(vault.inbox).toHaveLength(1);
    expect(vault.inbox[0].note).toMatchObject({ action: 'note', progress: 'through chapter 35', body: "Krook's end is absurd and perfect." });
    expect(vault.problems).toEqual([]);
  });

  it('shows wikilinks as the linked book titles', () => {
    expect(vault.feed[0].extra).toEqual(['Companion to Middlemarch: marriage as an institution.']);
  });
});

describe('finding a book', () => {
  it('by its slug, its title and author, or an older slug style', () => {
    expect(kinds('Bleak House', 'Charles Dickens')).toEqual(['reading']);
    expect(kinds("The Handmaid's Tale", 'Margaret Atwood')).toEqual(['read']);
    expect(kinds('The Handmaid’s Tale: A Novel', 'Margaret Atwood')).toEqual(['read']);
    expect(kinds('Middlemarch', 'Eliot, George')).toEqual(['read']);
  });

  it('in more than one place: on the list and on hand', () => {
    expect(kinds('North and South', 'Elizabeth Gaskell')).toEqual(['to-read', 'on-hand']);
    expect(kinds('Cranford', 'Elizabeth Gaskell')).toEqual(['on-hand']);
  });

  it('passed books, even when the feed offers them again', () => {
    expect(kinds('Moby-Dick', 'Herman Melville')).toEqual(['dismissed', 'feed']);
    expect(kinds('The Great Gatsby', 'F. Scott Fitzgerald')).toEqual(['dismissed']);
  });

  it('by the ISBN in a cover link, whatever the title says', () => {
    expect(isbnInCover('https://covers.openlibrary.org/b/isbn/9780141439549-M.jpg')).toBe('9780141439549');
    expect(isbnInCover('https://covers.openlibrary.org/b/isbn/0141439513-M.jpg')).toBe('9780141439518');
    expect(isbnInCover('https://covers.openlibrary.org/b/id/123-M.jpg')).toBe('');
    expect(kinds('Middlemarch: A Study of Provincial Life (Penguin Classics)', 'G. Eliot', { isbn: '9780141439549' })).toEqual(['read']);
  });

  it('not a different book with the same title', () => {
    expect(kinds('Hunger', 'Roxane Gay')).toEqual([]);
    expect(kinds('Hunger', 'Knut Hamsun')).toEqual(['feed']);
    expect(kinds('Something New', 'Nobody')).toEqual([]);
  });

  it('resolves Ready now picks to pages or catalog rows', () => {
    expect(index.resolve('the-waves-virginia-woolf')?.kind).toBe('to-read');
    expect(index.resolve('pale-fire-vladimir-nabokov')?.kind).toBe('on-hand');
    expect(index.resolve('no-such-book')).toBeUndefined();
  });
});

describe('matching notes to books', () => {
  it('by slug, or by title and author', () => {
    const note = { title: 'Bleak House', author: 'Charles Dickens', slug: 'bleak-house-charles-dickens' };
    expect(noteMatches(note, { title: 'Bleak House', author: 'Charles Dickens' })).toBe(true);
    expect(noteMatches({ ...note, slug: '' }, { title: 'Bleak House', author: 'C. Dickens', slug: 'x' })).toBe(true);
    expect(noteMatches(note, { title: 'Hard Times', author: 'Charles Dickens' })).toBe(false);
  });
});
