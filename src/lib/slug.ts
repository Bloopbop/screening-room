// The vault's slug convention, kept in step with slugify() and book_slug() in
// the vault's tools/feed.sh: lower case, accents dropped, apostrophes dropped
// ("Hell's" -> "hells"), "&" -> "and", other punctuation a separator.

const LETTERS: Record<string, string> = { 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'þ': 'th', 'ł': 'l', 'ø': 'o', 'đ': 'd', 'ħ': 'h', 'ı': 'i' };

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[ßæœþłøđħı]/g, (c) => LETTERS[c])
    .replace(/&/g, ' and ')
    .replace(/['‘’`´]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A book's slug: title (without subtitle) then author, as in "beloved-toni-morrison". */
export function bookSlug(title: string, author: string): string {
  const t = slugify(title.split(': ')[0]);
  const a = slugify(author.replace(/&/g, ' '));
  if (!t) return '';
  return a ? `${t}-${a}` : t;
}

/**
 * Letters and digits only. Older vault slugs kept a possessive's "s" apart
 * ("handmaid-s-tale"), newer ones don't ("handmaids-tale"); both compact to
 * the same key.
 */
export function compact(slug: string): string {
  return slug.replace(/-/g, '');
}

/** A loose title key for matching: no subtitle, no series note, no leading article. */
export function titleKey(title: string): string {
  return compact(slugify(title.split(/: | \(/)[0]).replace(/^(the|a|an)-/, ''));
}

/** The first author's last name, for matching. */
export function authorKey(author: string): string {
  const first = author.split(/ & | and |;|,/)[0];
  const parts = slugify(first).split('-').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

/** "the-waves-virginia-woolf" -> "the waves virginia woolf", for slugs with no page. */
export function unslug(slug: string): string {
  return slug.replace(/-/g, ' ');
}
