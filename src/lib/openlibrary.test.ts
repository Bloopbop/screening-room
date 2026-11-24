import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byIsbn, findCover, search } from './openlibrary';
import { forgetAll } from './store';

// Hand-written stand-ins for Open Library's answers.
const SEARCH_HIT = {
  numFound: 1,
  docs: [{ key: '/works/OL1W', title: 'Middlemarch', author_name: ['George Eliot'], first_publish_year: 1871, cover_i: 42, isbn: ['0141439548', '9780141439549'], number_of_pages_median: 880 }],
};

let calls: { url: string; at: number }[] = [];
let answers: Record<string, unknown> = {};

function stubFetch() {
  vi.stubGlobal('fetch', async (input: string) => {
    calls.push({ url: String(input), at: Date.now() });
    const key = Object.keys(answers).find((k) => String(input).includes(k));
    if (!key) return new Response('{}', { status: 404 });
    const answer = answers[key];
    if (typeof answer === 'number') return new Response('{}', { status: answer });
    return new Response(JSON.stringify(answer), { status: 200 });
  });
}

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

beforeEach(async () => {
  vi.useFakeTimers();
  await settle(forgetAll());
  calls = [];
  answers = {};
  stubFetch();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('looking up a scanned book', () => {
  it('finds it by ISBN in the search index', async () => {
    answers['q=isbn:9780141439549'] = SEARCH_HIT;
    expect(await settle(byIsbn('9780141439549'))).toEqual({
      title: 'Middlemarch',
      author: 'George Eliot',
      year: '1871',
      isbn: '9780141439549',
      coverUrl: 'https://covers.openlibrary.org/b/id/42-M.jpg',
      pages: 880,
      key: '/works/OL1W',
    });
  });

  it('falls back to the edition record, then its author, for books the index lacks', async () => {
    answers['q=isbn:9780000000002'] = { numFound: 0, docs: [] };
    answers['/isbn/9780000000002.json'] = { title: 'A New Book', authors: [{ key: '/authors/OL9A' }], covers: [-1, 77], publish_date: 'March 2026', key: '/books/OL2M' };
    answers['/authors/OL9A.json'] = { name: 'A. Writer' };
    expect(await settle(byIsbn('9780000000002'))).toMatchObject({ title: 'A New Book', author: 'A. Writer', year: '2026', coverUrl: 'https://covers.openlibrary.org/b/id/77-M.jpg' });
  });

  it('answers null for an unknown ISBN and explains a failure', async () => {
    answers['q=isbn:9780000000019'] = { numFound: 0, docs: [] };
    expect(await settle(byIsbn('9780000000019'))).toBeNull();
    answers['search.json'] = 503;
    const failing = expect(search('anything')).rejects.toThrow(/answered 503/);
    await vi.runAllTimersAsync();
    await failing;
  });

  it('asks at most once a second', async () => {
    answers['search.json'] = { docs: [] };
    await settle(Promise.all([search('a'), search('b'), search('c')]));
    const gaps = calls.slice(1).map((c, i) => c.at - calls[i].at);
    expect(gaps.every((g) => g >= 1000)).toBe(true);
  });
});

describe('covers for feed candidates', () => {
  it('looks each book up once, misses included', async () => {
    answers['title=Hunger'] = { docs: [{ title: 'Hunger', cover_i: 5 }] };
    answers['title=Obscure'] = { docs: [] };
    expect(await settle(findCover('Hunger', 'Knut Hamsun'))).toBe('https://covers.openlibrary.org/b/id/5-M.jpg');
    expect(await settle(findCover('Obscure', 'Nobody'))).toBe('');
    expect(await settle(findCover('Hunger', 'Knut Hamsun'))).toBe('https://covers.openlibrary.org/b/id/5-M.jpg');
    expect(await settle(findCover('Obscure', 'Nobody'))).toBe('');
    expect(calls).toHaveLength(2);
  });

  it('ignores a cover from a different title', async () => {
    answers['title=Hunger'] = { docs: [{ title: 'Hunger Games', cover_i: 9 }] };
    expect(await settle(findCover('Hunger', 'Knut Hamsun'))).toBe('');
  });
});
