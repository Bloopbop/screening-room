import { describe, expect, it } from 'vitest';
import { toIsbn13 } from './isbn';
import { commitMessage, localIso, noteText, notePath, parseNote } from './notes';
import type { AppNote } from './types';

const finish: AppNote = {
  action: 'finish',
  title: 'Bleak House',
  author: 'Charles Dickens',
  slug: 'bleak-house-charles-dickens',
  rating: 8.5,
  sent: '2026-11-24T19:30:05-05:00',
  body: '  Esther, in the end.\n\n"Quoted" words, kept exactly.  ',
};

describe('notes for the curator', () => {
  it('writes the format the vault skill describes, leaving out fields that do not apply', () => {
    expect(noteText(finish)).toBe(
      [
        '---',
        'type: app-note',
        'action: finish',
        'title: "Bleak House"',
        'author: "Charles Dickens"',
        'slug: bleak-house-charles-dickens',
        'rating: 8.5',
        'sent: 2026-11-24T19:30:05-05:00',
        '---',
        'Esther, in the end.',
        '',
        '"Quoted" words, kept exactly.',
        '',
      ].join('\n'),
    );
  });

  it('reads its own notes back, quotes and all', () => {
    const tricky: AppNote = {
      action: 'pass',
      title: 'Title: with "quotes" and # hash',
      author: "O'Brien",
      slug: '',
      reason: 'tone',
      isbn: '9780141439518',
      sent: '2026-11-24T08:00:00+01:00',
      body: '',
    };
    expect(parseNote(noteText(tricky))).toEqual(tricky);
    expect(parseNote(noteText(finish))).toEqual({ ...finish, body: finish.body.trim() });
    const abandon: AppNote = { ...finish, action: 'abandon', rating: undefined, outcome: 'dnf', progress: 'chapter 40', body: '' };
    delete abandon.rating;
    expect(parseNote(noteText(abandon))).toEqual(abandon);
  });

  it('ignores files that are not app notes', () => {
    expect(parseNote('---\ntype: something-else\naction: watch\n---\n')).toBeNull();
    expect(parseNote('---\ntype: app-note\naction: shout\n---\n')).toBeNull();
    expect(parseNote('plain text')).toBeNull();
  });

  it('names notes so they sort by time', () => {
    expect(notePath(finish)).toBe('inbox/2026-11-24T193005-finish-bleak-house-charles-dickens.md');
    expect(notePath(finish, 1)).toBe('inbox/2026-11-24T193005-finish-bleak-house-charles-dickens-2.md');
    expect(notePath({ ...finish, action: 'add', slug: '', title: "Hell's Angels", author: 'Hunter S. Thompson' })).toBe(
      'inbox/2026-11-24T193005-add-hells-angels-hunter-s-thompson.md',
    );
    expect(commitMessage(finish)).toBe('app: finish Bleak House');
  });

  it('dates notes in local time with the offset', () => {
    const iso = localIso(new Date(2026, 10, 24, 9, 5, 7));
    expect(iso).toMatch(/^2026-11-24T09:05:07[+-]\d{2}:\d{2}$/);
  });
});

describe('ISBNs', () => {
  it('accepts EAN-13 book codes and converts ISBN-10', () => {
    expect(toIsbn13('9780141439518')).toBe('9780141439518');
    expect(toIsbn13('978-0-14-143951-8')).toBe('9780141439518');
    expect(toIsbn13('0141439513')).toBe('9780141439518');
    expect(toIsbn13('080442957X')).toBe('9780804429573');
  });

  it('rejects bad check digits and codes that are not books', () => {
    expect(toIsbn13('9780141439519')).toBeNull();
    expect(toIsbn13('5012345678900')).toBeNull();
    expect(toIsbn13('51000')).toBeNull();
    expect(toIsbn13('0141439514')).toBeNull();
  });
});
