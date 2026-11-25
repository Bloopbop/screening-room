# Browser test

`companion.py` tests the built app in Chrome with Playwright for Python. It
stands in for GitHub with an in-memory copy of `tests/sample-vault`, a small
vault written by hand. It also stands in for Open Library with hand-written
answers, for the camera with Chrome's fake device, and for the barcode reader
with a scripted one. Nothing reaches a real vault or service.

```bash
pip install playwright        # once; add --break-system-packages where pip asks
python3 tests/e2e/companion.py /tmp/shots              # screenshots go in the folder named
python3 tests/e2e/companion.py /tmp/shots /tmp/dist    # optional: where to put the build
```

Run it from the repository root. It builds the app with the `/screening-room/`
base, serves it with `vite preview` on port 4201, and prints one PASS or FAIL
line per check (55 in all). It exits non-zero if any check fails. It uses
Google Chrome at `CHROME_PATH`, or `/usr/bin/google-chrome`, or else
Playwright's own Chromium (`python3 -m playwright install chromium`).

It covers:
- setup and a refused token
- reading the vault (never `raw/`)
- every kind of note, and taking notes back
- the curator filing notes
- scanning and lookups
- working with GitHub out of reach, and going offline
- the device check
- *Forget this vault* leaving other apps' storage on the same site alone

When a change alters something the test looks for, update the test in the same
pull request.
