# Status

As of 2026-11-26, version 0.1.0 is live. It passed its device check on the
phone: it reads and writes the vault, the browser supports barcode reading,
Open Library answers, and storage is protected. The vault's INBOX change
(pull request #2 in the vault repository) is merged, so the curator picks up
the app's notes from `inbox/`. The vault token has been renewed, and the device
check passed again with the new one. The first real barcode scan did not work
(see Next).

## Waiting

Nothing. When the vault token nears its expiry date, renew it: regenerate it on
GitHub (Settings → Developer settings → Fine-grained tokens), paste the new one
into the app at Settings → Change vault or token, and run the check.

## Next

Nothing is planned yet. One known problem, not urgent: **barcode scanning on
the S24**. On the first real scan the camera opened, with its frame and the hint
to hold the barcode inside it, but nothing was read: no book card and no message
appeared. The scanner gives no feedback when it finds nothing. It keeps looking
and ignores errors on individual frames, so a detector that fails on every frame
would look the same. (A successful scan looks the book up and shows its card; it
doesn't fill the ISBN field.) The device check only confirms that the browser
supports barcode reading, and the browser test uses a scripted reader, so
neither would catch this.
