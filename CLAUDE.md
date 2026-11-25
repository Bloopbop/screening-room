# CLAUDE.md — The Screening Room companion

A phone companion for *The Screening Room*, a private Obsidian reading vault
kept by an AI curator. The app reads the vault from GitHub with a fine-grained
token kept on the phone. It shows the reader's books, the books on hand and the
curator's feed. Each action becomes a short note in the vault's `inbox/`, for
the curator to file. The app has no recommender of its own and never edits the
wiki.

It is a Svelte 5 and TypeScript web app, built with Vite and installed from
GitHub Pages (`/screening-room/`). It's used in Chrome on an Android phone
(a Galaxy S24).

## How we work

- The owner tests on the phone and merges. Work on a branch and open one pull
  request per change; never push to `main`. Merging redeploys the site, and
  the installed app updates itself.
- Before opening a pull request, run `npm run check`, `npm test` and the
  browser test (`tests/e2e/README.md`). Say in the pull request what ran and
  how many checks passed.
- `docs/status.md` lists what is waiting on someone. Keep it current.

## The vault contract

- The vault is a separate, private repository that belongs to the reader. Its
  CLAUDE.md and skills are the curator's instructions, not this app's. Never
  run curator operations or process inbox notes from here.
- The note format and file names (`inbox/YYYY-MM-DDTHHMMSS-action-slug.md`)
  are defined twice: in `src/lib/notes.ts` and in the vault's
  `screening-room-inbox` skill. Change both together: the app here, and the
  vault as a pull request for the reader to review.
- Slugs follow the vault's `tools/feed.sh`; `src/lib/slug.ts` mirrors it.
- The app reads only `wiki/currently-reading/`, `wiki/to-be-read/`,
  `wiki/shelved/`, `wiki/library/library.md`, `feed/latest.md`,
  `dismissed.csv` and `inbox/`. It never fetches `raw/`.
- It writes only new files in `inbox/`. The device check also writes
  `.screening-room-check` and removes it straight away.

## Rules that don't bend

- The GitHub token stays on the phone (this app's IndexedDB) and goes only to
  `api.github.com`. Never commit, log or ask for it.
- No vault data in this repository or on the site. Tests use
  `tests/sample-vault`, written by hand; never copy pages from the real vault.
- Open Library: at most one request a second, because browsers can't identify
  themselves. Its data is CC0; credit it where details are shown.
- The app shares the `bloopbop.github.io` address with the household media
  tracker (`Bloopbop/household-media-tracker-recommender`), so the browser
  treats both as one site. Keep storage names unique to this app (the
  `screening-room` IndexedDB database), never clear site-wide storage, and keep
  the service worker scoped to this app's path.
- Keep personal names, email addresses and phone numbers out of code, tests and
  commits.

## Commands

```bash
npm install
npm run dev                                  # development server
npm run check                                # svelte-check and TypeScript
npm test                                     # unit tests (vitest), on the sample vault
BASE_PATH=/screening-room/ npm run build     # production build in dist/
python3 tests/e2e/companion.py /tmp/shots    # browser test: see tests/e2e/README.md
```

## Where things are

- `src/lib/github.ts`: the REST client (tree, blobs, create and delete files).
- `src/lib/sync.ts`: syncing, the outbox of unsent notes, and taking notes back.
- `src/lib/store.ts`: IndexedDB (settings, cached files, outbox, cover lookups).
- `src/lib/vault.ts`: builds the vault from its files and finds a book across
  shelves, the feed, the dismissed list and the books on hand.
- `src/lib/parse.ts`, `frontmatter.ts`: book pages, the feed, `dismissed.csv`,
  the library page. `src/lib/notes.ts`: the note format.
- `src/lib/openlibrary.ts`, `scanner.ts`, `isbn.ts`: lookups and barcodes.
- `src/lib/check.ts`: the device check. `src/lib/state.svelte.ts`: app state.
- `src/views/`: Desk, Feed, Shelf, Find (`Scan.svelte`), the book page and
  Settings.
- `tests/sample-vault/` and `src/lib/testing/fake-github.ts`: the made-up vault
  and a fake GitHub API over it, for the unit tests.
