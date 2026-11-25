"""Browser test of the Screening Room companion against a fake vault.

GitHub and Open Library are stood in for with Playwright routes over the
hand-written sample vault in tests/sample-vault (no real vault data). The
camera is Chrome's fake device and the barcode reader a scripted stand-in.
Checks setup, reading the vault, every kind of note, taking notes back, the
curator processing them, scanning, offline use, the device check, and that
forgetting the vault leaves other apps' storage on the same site alone.
"""
import base64, hashlib, json, os, re, subprocess, sys, tempfile, time
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
from playwright.sync_api import sync_playwright

SHOTS = Path(sys.argv[1]); SHOTS.mkdir(exist_ok=True)
DIST = sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp(prefix="e2e-dist-")
APP = Path(__file__).resolve().parents[2]
# The test was written against Google Chrome: CHROME_PATH, else the usual Linux install,
# else Playwright's own Chromium (`python3 -m playwright install chromium`).
CHROME = os.environ.get("CHROME_PATH") or ("/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None)
PORT = 4201; URL = f"http://localhost:{PORT}/screening-room/"
OWNER, REPO, TOKEN = "reader", "vault", "test-token"

results = []
def check(name, ok, detail=""):
    results.append((name, bool(ok))); print(f"{'PASS' if ok else 'FAIL'}  {name}{('  — ' + detail) if detail else ''}", flush=True)

def isbn13(first12):
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(first12))
    return first12 + str((10 - total % 10) % 10)

# Hand-written Open Library answers.
MIDDLEMARCH = "9780141439549"            # matches the cover link on the shelved Middlemarch page
NEW_BOOK = isbn13("978000000001")       # a book new to the vault
UNKNOWN = isbn13("978000000002")        # Open Library doesn't know it
SAMPLE = "9780141439518"                # the device check's sample
OL_BOOKS = {
    MIDDLEMARCH: {"key": "/works/OL1W", "title": "Middlemarch", "author_name": ["George Eliot"], "first_publish_year": 1871, "cover_i": 11},
    NEW_BOOK: {"key": "/works/OL2W", "title": "The Rings of Saturn", "author_name": ["W. G. Sebald"], "first_publish_year": 1995, "cover_i": 12},
    SAMPLE: {"key": "/works/OL3W", "title": "Pride and Prejudice", "author_name": ["Jane Austen"], "first_publish_year": 1813},
}

def git_sha(data: bytes):
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()

root = APP / "tests/sample-vault"
repo = {str(p.relative_to(root)): p.read_bytes() for p in root.rglob("*") if p.is_file()}
calls = []
ol_calls = []
state = {"offline_github": False}

CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
        "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS"}

def reply(route, status, data):
    route.fulfill(status=status, headers={**CORS, "Content-Type": "application/json"}, body=json.dumps(data))

def github(route):
    req = route.request
    if req.method == "OPTIONS":
        return route.fulfill(status=204, headers=CORS)
    if state["offline_github"]:
        return route.abort("internetdisconnected")
    url = urlparse(req.url)
    prefix = f"/repos/{OWNER}/{REPO}"
    if req.headers.get("authorization") != f"Bearer {TOKEN}":
        return reply(route, 401, {"message": "Bad credentials"})
    if not url.path.startswith(prefix):
        return reply(route, 404, {"message": "Not Found"})
    path = url.path[len(prefix):]
    body = json.loads(req.post_data) if req.post_data else None
    calls.append((req.method, path, body))
    if req.method == "GET" and path == "":
        return reply(route, 200, {"default_branch": "main"})
    if req.method == "GET" and path == "/git/trees/main":
        tree = [{"path": p, "type": "blob", "sha": git_sha(d)} for p, d in sorted(repo.items())]
        return reply(route, 200, {"sha": git_sha("".join(t["path"] + t["sha"] for t in tree).encode()), "tree": tree, "truncated": False})
    if req.method == "GET" and path.startswith("/git/blobs/"):
        sha = path.rsplit("/", 1)[1]
        for d in repo.values():
            if git_sha(d) == sha:
                return reply(route, 200, {"sha": sha, "encoding": "base64", "content": base64.b64encode(d).decode()})
        return reply(route, 404, {"message": "Not Found"})
    if path.startswith("/contents/"):
        fp = unquote(path[len("/contents/"):])
        if req.method == "PUT":
            if fp in repo:
                return reply(route, 422, {"message": "sha wasn't supplied"})
            repo[fp] = base64.b64decode(body["content"])
            return reply(route, 201, {"content": {"path": fp, "sha": git_sha(repo[fp])}})
        if req.method == "DELETE":
            if fp not in repo:
                return reply(route, 404, {"message": "Not Found"})
            if git_sha(repo[fp]) != body["sha"]:
                return reply(route, 409, {"message": "does not match"})
            del repo[fp]
            return reply(route, 200, {"commit": {"sha": "c0ffee"}})
    return reply(route, 404, {"message": "Not Found"})

def openlibrary(route):
    url = urlparse(route.request.url); q = parse_qs(url.query)
    ol_calls.append(route.request.url)
    if url.path == "/search.json":
        query = q.get("q", [""])[0]
        m = re.match(r"isbn:(\d+)", query)
        if m:
            doc = OL_BOOKS.get(m.group(1))
            return reply(route, 200, {"numFound": 1 if doc else 0, "docs": [doc] if doc else []})
        if "title" in q:
            return reply(route, 200, {"docs": [{"title": q["title"][0], "cover_i": 99}]})
        if "rings of saturn" in query.lower():
            return reply(route, 200, {"docs": [OL_BOOKS[NEW_BOOK], {"key": "/works/OL4W", "title": "Saturn's Rings", "author_name": ["Someone Else"]}]})
        return reply(route, 200, {"docs": []})
    return reply(route, 404, {})

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==")

FAKE_SCANNER = """
window.__barcode = null;
window.BarcodeDetector = class {
  constructor(options) { this.formats = options && options.formats; }
  static async getSupportedFormats() { return ['ean_13', 'qr_code']; }
  async detect() {
    const code = window.__barcode; window.__barcode = null;
    return code ? [{ rawValue: code, format: 'ean_13' }] : [];
  }
};
"""

def note_files():
    return sorted(p for p in repo if p.startswith("inbox/"))

def note(path):
    return repo[path].decode()

def wait_note(page, action, contains=""):
    """The newest note for this action whose path contains the text, once the app has written it."""
    for _ in range(100):
        found = [f for f in note_files() if f"-{action}-" in f and contains in f]
        if found:
            return found[-1]
        page.wait_for_timeout(100)
    return None

def newest(action):
    found = [p for p in note_files() if f"-{action}-" in p]
    return found[-1] if found else None

subprocess.run(["npx", "vite", "build", "--outDir", DIST, "--emptyOutDir"], cwd=APP, env={**os.environ, "BASE_PATH": "/screening-room/"},
               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
server = subprocess.Popen(["npx", "vite", "preview", "--outDir", DIST, "--port", str(PORT), "--strictPort"], cwd=APP,
                          env={**os.environ, "BASE_PATH": "/screening-room/"},
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
time.sleep(3)
try:
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            tempfile.mkdtemp(), executable_path=CHROME, headless=True,
            viewport={"width": 390, "height": 844}, device_scale_factor=2, service_workers="block", locale="en-GB", timezone_id="America/Toronto",
            args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"], permissions=["camera"])
        ctx.add_init_script(FAKE_SCANNER)
        ctx.route("https://api.github.com/**", github)
        ctx.route("https://openlibrary.org/**", openlibrary)
        # No cover images: the app falls back to coloured spines, as it does offline.
        ctx.route("https://covers.openlibrary.org/**", lambda r: r.fulfill(status=404, body=""))
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:300]))
        page.on("console", lambda m: m.type == "error" and errors.append("console: " + m.text[:300]))

        # Another app on the same site, to prove "Forget" leaves it alone.
        page.goto(URL)
        page.evaluate("""() => new Promise((ok) => { localStorage.setItem('other-app', 'kept');
            const r = indexedDB.open('household', 1); r.onupgradeneeded = () => r.result.createObjectStore('x'); r.onsuccess = () => { r.result.close(); ok(); }; })""")

        # --- Setup -------------------------------------------------------
        page.wait_for_selector("text=Connect the vault")
        check("first run asks for the vault, with no sections yet", page.locator("nav.bar").count() == 0)
        page.fill("input[type=text]", "not a repo")
        page.fill("input[type=password]", TOKEN)
        page.click("button:has-text('Connect')")
        check("a malformed repository name is explained", page.locator("text=owner/name").count() > 0)
        page.fill("input[type=text]", f"https://github.com/{OWNER}/{REPO}")
        page.fill("input[type=password]", "wrong-token")
        page.click("button:has-text('Connect')")
        page.wait_for_selector("text=refused the token")
        check("a refused token is explained", True)
        page.click("nav >> text=Settings")
        page.click("text=Change vault or token")
        page.fill("input[type=password]", TOKEN)
        page.click("button:has-text('Save')")
        page.wait_for_function("() => document.body.innerText.includes('3 books read')")
        check("the vault syncs with a good token", page.locator("text=3 books read").count() > 0, page.locator("main").inner_text()[:200].replace("\n", " "))
        blob_paths = [c for c in calls if c[1].startswith("/git/blobs/")]
        check("only vault files are fetched, never raw/", len(blob_paths) == len([p for p in repo if not p.startswith("raw/") and p != "README.md"]))

        # --- Desk --------------------------------------------------------
        page.click("nav >> text=Desk")
        page.wait_for_selector("text=Bleak House")
        desk = page.locator("main").inner_text()
        check("the desk shows the book in progress", "Charles Dickens" in desk and "Started 2 Nov" in desk and "through chapter 30" in desk, desk[:300].replace("\n", " "))
        check("a note already in the inbox shows as waiting", "waiting for the curator" in desk)
        check("the desk points to the feed", "2 candidates to screen" in desk)
        check("Ready now lists the curator's picks, without books already read", "Pale Fire" in desk and "Cranford" in desk)
        page.screenshot(path=str(SHOTS / "1-desk.png"), full_page=True)

        # --- Feed --------------------------------------------------------
        check("the feed badge counts unscreened candidates", page.locator("[data-testid=feed-badge]").inner_text() == "2")
        page.click("nav >> text=Feed")
        page.wait_for_selector("text=The Age of Innocence")
        cards = page.locator("[data-testid=candidate]")
        check("every candidate is listed", cards.count() == 4)
        moby = cards.filter(has_text="Moby-Dick")
        check("a candidate passed before shows as passed, with no buttons", "Passed on 11 Jun" in moby.inner_text() and moby.locator("button").count() == 0)
        check("held candidates are grouped", page.locator(".section:has(h2:has-text('Held')) ~ [data-testid=candidate]").filter(has_text="Hunger").count() == 1)
        time.sleep(1.5)
        page.screenshot(path=str(SHOTS / "2-feed.png"), full_page=True)

        age = cards.filter(has_text="The Age of Innocence")
        age.locator("button:has-text('Watch')").click()
        page.wait_for_selector("[data-testid=toast] >> text=Watching: The Age of Innocence")
        page.wait_for_function("() => document.body.innerText.includes('sent to the vault')")
        path = wait_note(page, "watch", "age-of-innocence")
        text = note(path) if path else ""
        check("Watch writes a note to inbox/", path is not None and re.match(r"inbox/\d{4}-\d{2}-\d{2}T\d{6}-watch-the-age-of-innocence-edith-wharton\.md$", path) is not None, str(path))
        check("the note carries action, title, author and slug", all(s in text for s in ["type: app-note", "action: watch", 'title: "The Age of Innocence"', 'author: "Edith Wharton"', "slug: the-age-of-innocence-edith-wharton"]), text)
        check("the commit message names the action", any(c[0] == "PUT" and c[2]["message"] == "app: watch The Age of Innocence" for c in calls))
        check("the candidate shows its note instead of buttons", age.locator("button:has-text('Watch')").count() == 0 and age.locator("text=Take back").count() == 1)
        page.click("[data-testid=toast] >> text=Undo")
        page.wait_for_selector("text=Taken back: The Age of Innocence")
        check("Undo deletes the note from the vault", newest("watch") is None and any(c[0] == "DELETE" for c in calls))
        check("the candidate's buttons come back", age.locator("button:has-text('Watch')").count() == 1)

        angels = cards.filter(has_text="Hell's Angels")
        angels.locator("button:has-text('Pass')").click()
        page.wait_for_selector("dialog[open]")
        chips = page.locator("dialog .chip").all_inner_texts()
        check("Pass offers the reasons used most in dismissed.csv", chips[:2] == ["length", "tone"], str(chips))
        page.screenshot(path=str(SHOTS / "3-pass.png"))
        page.click("dialog .chip:has-text('length')")
        page.click("dialog button[type=submit]")
        try:
            page.wait_for_function("() => document.body.innerText.includes('Passed on: Hell')", timeout=8000)
        except Exception:
            page.screenshot(path=str(SHOTS / "debug-pass.png"))
            print("DEBUG body:", page.locator("body").inner_text()[:800].replace("\n", " | "))
            print("DEBUG errors:", errors)
            raise
        path = wait_note(page, "pass", "hells-angels")
        text = note(path) if path else ""
        check("Pass writes the reason", "action: pass" in text and 'reason: "length"' in text and "slug: hells-angels-hunter-s-thompson" in text, text)

        age.locator("button:has-text('Watch')").click()
        page.wait_for_function("() => document.body.innerText.includes('Watching: The Age')")
        cards.filter(has_text="Hunger").locator("button:has-text('Watch')").click()
        page.wait_for_function("() => document.body.innerText.includes('Watching: Hunger')")
        check("held candidates can be watched", wait_note(page, "watch", "hunger-knut-hamsun") is not None)
        page.click("[data-testid=sync]")
        page.wait_for_function("() => document.body.innerText.includes('waiting for the curator')")
        check("after a sync, sent notes show as waiting for the curator", age.locator("text=waiting for the curator").count() == 1)
        check("the feed badge drops screened candidates", page.locator("[data-testid=feed-badge]").count() == 0)

        # --- Shelf: start a book from the list -----------------------------
        page.click("nav >> text=Shelf")
        page.wait_for_selector("text=The Waves")
        rows = page.locator("[data-testid=book-row]")
        check("To read lists the list, newest first", rows.nth(0).inner_text().startswith("North and South") and "The Waves" in rows.nth(1).inner_text())
        rows.filter(has_text="The Waves").locator("button:has-text('Start')").click()
        page.fill("dialog textarea", "Opening the first soliloquies.")
        page.screenshot(path=str(SHOTS / "4-start.png"))
        page.click("dialog button[type=submit]")
        page.wait_for_function("() => document.body.innerText.includes('Started: The Waves')")
        text = note(wait_note(page, "start", "the-waves")) if wait_note(page, "start", "the-waves") else ""
        check("Start writes the first thoughts as the body", "action: start" in text and text.rstrip().endswith("Opening the first soliloquies."), text)

        page.click(".tabs a[href$='/read']")
        page.wait_for_selector("text=Middlemarch")
        read_rows = page.locator("[data-testid=book-row]").all_inner_texts()
        check("Read lists books newest first, with ratings and DNF", read_rows[0].startswith("Middlemarch") and "9/10" in read_rows[0] and any("Unfinished" in r for r in read_rows), str(read_rows))
        page.fill("input[type=search]", "atwood")
        check("Read can be searched", page.locator("[data-testid=book-row]").count() == 1)
        page.click(".tabs a[href$='/on-hand']")
        page.wait_for_selector("text=Ready now")
        page.screenshot(path=str(SHOTS / "5-on-hand.png"), full_page=True)
        north = page.locator("[data-testid=on-hand]").filter(has_text="North and South")
        check("an on-hand book already on the list says so", "On your list" in north.inner_text())
        page.click(".tabs a[href$='/passed']")
        check("Passed lists dismissed.csv", page.locator(".passed").count() == 3)

        # --- Finish the book in progress -----------------------------------
        page.click("nav >> text=Desk")
        page.click("button:has-text('Finished')")
        page.click("dialog button[aria-label='8']")
        page.click("dialog button:has-text('+ ½')")
        check("the rating reads 8.5", page.locator("[data-testid=rating-value]").inner_text() == "8.5 out of 10")
        page.fill("dialog textarea", "Esther's chapters carried it.")
        page.screenshot(path=str(SHOTS / "6-finish.png"))
        page.click("dialog button[type=submit]")
        page.wait_for_function("() => document.body.innerText.includes('Finished: Bleak House')")
        text = note(wait_note(page, "finish", "bleak-house")) if wait_note(page, "finish", "bleak-house") else ""
        check("Finish writes the rating and the words", "action: finish" in text and "rating: 8.5" in text and "Esther's chapters carried it." in text, text)
        bleak = page.locator("[data-testid=book-row]").filter(has_text="Bleak House")
        check("a finished book keeps no buttons while the note waits", bleak.locator("button:has-text('Finished')").count() == 0)

        # --- The curator processes the notes -------------------------------
        page.click("[data-testid=sync]")
        try:
            page.wait_for_function("() => /Finished\\s· 8\\.5 — waiting for the curator/.test(document.body.innerText)", timeout=8000)
        except Exception:
            print("DEBUG:", page.locator("main").inner_text()[:600].replace("\n", " | "))
            raise
        check("once listed in the vault, sent notes wait for the curator", page.locator("text=sent to the vault").count() == 0)
        feed = repo["feed/latest.md"].decode()
        for path in note_files():
            text = note(path)
            if "action: watch" in text:
                slug = re.search(r"^slug: (.+)$", text, re.M).group(1)
                title = re.search(r'^title: "(.+)"$', text, re.M).group(1)
                author = re.search(r'^author: "(.+)"$', text, re.M).group(1)
                repo[f"wiki/to-be-read/{slug}.md"] = f'---\ntitle: "{title}"\nauthor: "{author}"\ntype: to-be-read\ndate_added: 2026-11-24\nrecommended_by: feed\n---\n\n**Logline.** Test text.\n'.encode()
                feed = re.sub(rf"### {re.escape(title)} — .*?(?=\n### |\Z)", "", feed, flags=re.S)
            if "action: pass" in text:
                slug = re.search(r"^slug: (.+)$", text, re.M).group(1)
                repo["dismissed.csv"] += f"{slug},2026-11-24,length\n".encode()
                title = re.search(r'^title: "(.+)"$', text, re.M).group(1)
                feed = re.sub(rf"### {re.escape(title)} — .*?(?=\n### |\Z)", "", feed, flags=re.S)
            if "action: finish" in text:
                repo["wiki/shelved/bleak-house-charles-dickens.md"] = repo.pop("wiki/currently-reading/bleak-house-charles-dickens.md").replace(b"type: currently-reading", b"type: shelved\ndate_read: 2026-11-24\nrating: 8.5")
            if "action: start" in text:
                repo["wiki/currently-reading/the-waves-virginia-woolf.md"] = repo.pop("wiki/to-be-read/the-waves-virginia-woolf.md").replace(b"type: to-be-read", b"type: currently-reading\ndate_started: 2026-11-24")
            del repo[path]
        repo["feed/latest.md"] = feed.encode()
        page.click("[data-testid=sync]")
        page.wait_for_selector("[data-testid=book-row]:has-text('The Waves')")
        desk = page.locator("main").inner_text()
        check("after processing, the desk shows the new book and no waiting notes", "The Waves" in desk and "Bleak House" not in desk and "waiting for the curator" not in desk and "sent to the vault" not in desk, desk[:200].replace("\n", " "))
        check("after processing, the feed has nothing left to screen", page.locator("[data-testid=feed-badge]").count() == 0 and "to screen" not in desk)
        page.click("nav >> text=Shelf"); page.click(".tabs a[href$='/read']")
        check("the finished book is on the read shelf with its rating", "8.5/10" in page.locator("[data-testid=book-row]").filter(has_text="Bleak House").inner_text())

        # --- Find: scan and look up ----------------------------------------
        page.click("nav >> text=Find")
        page.click("button:has-text('Scan a barcode')")
        page.wait_for_selector("video")
        page.wait_for_function("() => document.querySelector('video').readyState >= 2", timeout=10000)
        check("the camera opens", page.locator(".camera.on").count() == 1)
        page.evaluate(f"window.__barcode = '{MIDDLEMARCH}'")
        page.wait_for_selector("[data-testid=found]")
        found = page.locator("[data-testid=found]").inner_text()
        check("a scanned book on the shelf is recognised by its ISBN", "Middlemarch" in found and "Read 2 Mar" in found and "9/10" in found, found.replace("\n", " "))
        check("the camera stops after a read", page.locator(".camera.on").count() == 0 and page.evaluate("() => document.querySelector('video').srcObject === null"))

        page.fill(".lookup input", "12345")
        page.click("button:has-text('Look up')")
        check("a bad ISBN is explained", page.locator("text=isn't a valid ISBN").count() == 1)
        page.fill(".lookup input", UNKNOWN)
        page.click("button:has-text('Look up')")
        page.wait_for_selector("text=doesn't know ISBN")
        check("an unknown ISBN is explained", True)

        page.fill(".lookup input", "rings of saturn")
        page.click("button:has-text('Look up')")
        page.wait_for_selector(".result")
        check("a title search lists matches", page.locator(".result").count() == 2)
        page.click(".result >> text=The Rings of Saturn")
        found = page.locator("[data-testid=found]").inner_text()
        check("a new book says so", "New to the vault" in found)
        page.screenshot(path=str(SHOTS / "7-found.png"), full_page=True)
        page.click("button:has-text('Read it before')")
        page.click("dialog button[aria-label='7']")
        page.fill("dialog textarea", "Read it in 2019.")
        page.click("dialog button[type=submit]")
        page.wait_for_function("() => document.body.innerText.includes('Read before: The Rings of Saturn')")
        text = note(wait_note(page, "read", "rings-of-saturn")) if wait_note(page, "read", "rings-of-saturn") else ""
        check("Read before writes rating and words, with no slug for a new book", "action: read" in text and "rating: 7" in text and "slug:" not in text and "Read it in 2019." in text, text)

        page.evaluate(f"window.__barcode = '{NEW_BOOK}'")
        page.click("button:has-text('Scan a barcode')")
        page.wait_for_selector("[data-testid=found]")
        check("a book with a note waiting shows it after a scan", page.locator("[data-testid=found] >> text=Take back").count() == 1)

        # --- Offline ----------------------------------------------------------
        page.click("nav >> text=Shelf"); page.click(".tabs a[href$='/on-hand']")
        ctx.set_offline(True)
        page.wait_for_function("() => document.body.innerText.includes('Offline')")
        before = len(note_files())
        page.locator("[data-testid=on-hand]").filter(has_text="Cranford").locator("button:has-text('Want')").click()
        page.click("dialog button[type=submit]")
        page.wait_for_function("() => document.body.innerText.includes('not sent yet')")
        check("offline, a note waits on the phone", len(note_files()) == before)
        # The phone is back online but GitHub can't be reached: the app opens from its cache.
        # (Opening with no network at all is the service worker's job, blocked in this test.)
        state["offline_github"] = True
        ctx.set_offline(False)
        page.wait_for_timeout(1000)
        page.reload()
        page.wait_for_selector("text=On hand")
        check("with GitHub out of reach, the vault opens from the phone's cache", page.locator("text=Cranford").count() > 0 and page.locator("text=not sent yet").count() > 0)
        check("an unreachable GitHub isn't shown as an error", page.locator("[role=alert]").count() == 0)
        state["offline_github"] = False
        page.click("[data-testid=sync]")
        page.wait_for_function("() => !document.body.innerText.includes('not sent yet')", timeout=15000)
        check("once GitHub answers, the note goes out", wait_note(page, "add", "cranford-elizabeth-gaskell") is not None)

        ctx.set_offline(True)
        page.wait_for_function("() => document.body.innerText.includes('Offline')")
        page.locator("[data-testid=on-hand]").filter(has_text="Pale Fire").locator("button:has-text('Want')").click()
        page.fill("dialog textarea", "Saw it on the shelf.")
        page.click("dialog button[type=submit]")
        page.wait_for_function("() => document.body.innerText.includes('not sent yet')")
        ctx.set_offline(False)
        check("back online, waiting notes go out by themselves", wait_note(page, "add", "pale-fire") is not None)

        # --- Settings: device check and forgetting ----------------------------
        page.click("nav >> text=Settings")
        page.click("button:has-text('Run the check')")
        page.wait_for_selector("[data-testid=checks]", timeout=20000)
        checks = page.locator("[data-testid=checks] li").all_inner_texts()
        statuses = {c.split("\n")[0][2:]: c[0] for c in checks}
        check("device check: vault, writing, barcodes and lookups pass", all(statuses.get(n) == "✓" for n in ["Reading the vault", "Writing notes", "Barcode scanning", "Book lookups"]), str(checks))
        check("device check leaves nothing behind", ".screening-room-check" not in repo)
        page.screenshot(path=str(SHOTS / "8-settings.png"), full_page=True)

        page.click("text=Forget this vault on this phone")
        page.click("button:has-text('Forget it')")
        page.wait_for_selector("text=Connect the vault")
        kept = page.evaluate("""() => new Promise((ok) => indexedDB.databases().then((dbs) => ok({ dbs: dbs.map((d) => d.name), ls: localStorage.getItem('other-app') })))""")
        check("Forget deletes only this app's storage", "household" in kept["dbs"] and "screening-room" not in kept["dbs"] and kept["ls"] == "kept", str(kept))

        # Failed loads are expected here: the wrong token, the unknown ISBN, the offline steps.
        real_errors = [e for e in errors if not e.startswith("console: Failed to load resource")]
        check("no page errors", not real_errors, "; ".join(real_errors[:3]))
        ctx.close()
finally:
    import signal
    os.killpg(server.pid, signal.SIGTERM)

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
