# The Screening Room — phone companion

A small web app for the phone that goes with *The Screening Room*, an Obsidian
reading archive kept by an AI curator. It shows what's in the vault (the book
in progress, the to-read list, the shelf, the books on hand, the latest feed
from the scout) and lets the reader act on it away from the desk.

The app has no recommender of its own and never edits the wiki. Every action
(watch, pass or hold a candidate; start, note, finish or stop a book; want a
book, or log one read before) is written to the vault's `inbox/` as a short
note. The curator files the notes at the start of the next session, using the
vault's `screening-room-inbox` skill, and deletes them. Until then the app
shows each note as waiting, with a way to take it back.

Barcode scanning uses the phone's own barcode reader (Chrome on Android);
book details and covers come from [Open Library](https://openlibrary.org).

## Setting it up

1. **Hosting.** In this repository's Settings → Pages, set Source to *GitHub
   Actions*. Each push to `main` builds and deploys the app to
   `https://<owner>.github.io/<repository>/`.
2. **A token for the vault.** On GitHub: Settings → Developer settings →
   Fine-grained tokens → Generate new token. Repository access: *only* the
   vault repository. Permissions: Contents → *Read and write* (Metadata:
   read-only comes with it). Pick an expiry date and note it.
3. **On the phone.** Open the app's address in Chrome, then *Add to home
   screen* (install). Enter the vault as `owner/name` and paste the token.
   Then Settings → *Run the check*: it reads the vault, writes and removes a
   small check file, and tests the barcode reader and book lookups.
4. **In the vault.** The curator needs the `screening-room-inbox` skill and
   the matching lines in the vault's `CLAUDE.md`, so it looks in `inbox/` at
   the start of each session.

## Privacy

- The token is kept in this app's own storage on the phone and is only ever
  sent to `api.github.com`. Nothing from the vault is in this repository or on
  the public site: the app reads the vault at run time, with the token.
- Lookups send an ISBN or the typed title to Open Library. Covers load from
  Open Library's cover service.
- The app reads only the files it shows (`wiki/currently-reading/`,
  `wiki/to-be-read/`, `wiki/shelved/`, `wiki/library/library.md`,
  `feed/latest.md`, `dismissed.csv`, `inbox/`). It never fetches `raw/`.
- Several GitHub Pages projects under one account share one web address
  (`<owner>.github.io`), and the browser treats them as one site. *Forget this
  vault* in Settings deletes only this app's data, but clearing the site's data
  in Chrome's settings would clear every app at that address.

## The notes

One file per action, named so they sort by time, for example
`inbox/2026-11-24T193000-finish-bleak-house-charles-dickens.md`:

```markdown
---
type: app-note
action: finish
title: "Bleak House"
author: "Charles Dickens"
slug: bleak-house-charles-dickens
rating: 8.5
sent: 2026-11-24T19:30:00-05:00
---
Esther's chapters carried it.
```

Fields that don't apply are left out. The vault's skill describes every
action and field.

## Development

```sh
npm ci
npm run dev      # local server
npm test         # unit tests
npm run check    # type check
npm run build    # production build in dist/
```

Tests run against `tests/sample-vault`, a small vault written by hand for
testing. Its pages are invented.
