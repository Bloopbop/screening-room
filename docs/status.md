# Status

As of 2026-11-26, version 0.1.0 is live. It passed its device check on the
phone: it reads and writes the vault, the browser supports barcode reading,
Open Library answers, and storage is protected. The vault's INBOX change
(pull request #2 in the vault repository) is merged, so the curator picks up
the app's notes from `inbox/`. The vault token has been renewed, and the device
check passed again with the new one.

## Waiting

- **A first real barcode scan** on the phone. The device check only confirms
  that the browser supports barcode reading.
- **The vault token** is a fine-grained GitHub token with an expiry date. Renew
  it before then: regenerate it on GitHub (Settings → Developer settings →
  Fine-grained tokens), paste the new one into the app at Settings → Change
  vault or token, and run the check.

## Next

Nothing is planned yet.
