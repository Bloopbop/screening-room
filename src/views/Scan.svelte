<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import Cover from '../components/Cover.svelte';
  import WaitingNotes from '../components/WaitingNotes.svelte';
  import { ratingText, refOf, shortDate } from '../lib/format';
  import { toIsbn13 } from '../lib/isbn';
  import { byIsbn, search, type Found } from '../lib/openlibrary';
  import { canScan, startScanner } from '../lib/scanner';
  import { app, message } from '../lib/state.svelte';
  import type { BookRef } from '../lib/types';
  import type { Standing } from '../lib/vault';

  let supported = $state<boolean | null>(null);
  let scanning = $state(false);
  let video = $state<HTMLVideoElement>();
  let stopCamera: (() => void) | null = null;

  let typed = $state('');
  let busy = $state(false);
  let problem = $state('');
  let results = $state.raw<Found[]>([]);
  let picked = $state.raw<Found | null>(null);

  onMount(async () => {
    supported = await canScan();
  });
  onDestroy(() => stopCamera?.());

  async function scan() {
    reset();
    scanning = true;
    await tick();
    try {
      stopCamera = await startScanner(video!, (isbn) => {
        scanning = false;
        stopCamera = null;
        void lookUp(isbn);
      });
    } catch (error) {
      scanning = false;
      problem =
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'The camera is blocked for this app. Allow it in the site settings, or type the ISBN.'
          : `The camera couldn't start: ${message(error)}`;
    }
  }

  function stop() {
    stopCamera?.();
    stopCamera = null;
    scanning = false;
  }

  function reset() {
    problem = '';
    results = [];
    picked = null;
  }

  async function lookUp(isbn: string) {
    reset();
    busy = true;
    try {
      const found = await byIsbn(isbn);
      if (found) picked = found;
      else problem = `Open Library doesn't know ISBN ${isbn}. Try the title instead.`;
    } catch (error) {
      problem = message(error);
    } finally {
      busy = false;
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const value = typed.trim();
    if (!value) return;
    const isbn = toIsbn13(value);
    if (isbn) return lookUp(isbn);
    if (/^[\d\s-]+x?$/i.test(value)) {
      problem = "That isn't a valid ISBN. Check the digits, or search by title.";
      return;
    }
    reset();
    busy = true;
    try {
      results = await search(value);
      if (!results.length) problem = 'Nothing found. Try fewer words, or add the author.';
    } catch (error) {
      problem = message(error);
    } finally {
      busy = false;
    }
  }

  const ref = $derived<BookRef | null>(picked ? { title: picked.title, author: picked.author, isbn: picked.isbn || undefined } : null);
  const standings = $derived<Standing[]>(ref ? (app.index?.find(ref) ?? []) : []);

  /** The page or row the actions should name, so the curator finds the same book. */
  function target(s: Standing | undefined): BookRef {
    const isbn = picked?.isbn || undefined;
    if (s && 'book' in s) return { ...refOf(s.book), isbn };
    if (s?.kind === 'feed') return { title: s.entry.title, author: s.entry.author, slug: s.entry.slug, isbn };
    if (s?.kind === 'on-hand') return { title: s.row.title, author: s.row.author, slug: s.row.slug, isbn };
    return { ...ref!, slug: '' };
  }

  function describe(s: Standing): string {
    switch (s.kind) {
      case 'reading':
        return `Reading now${s.book.dateStarted ? `, since ${shortDate(s.book.dateStarted)}` : ''}`;
      case 'read':
        return `Read${s.book.dateRead ? ` ${shortDate(s.book.dateRead)}` : ''}${ratingText(s.book) ? ` · ${ratingText(s.book)}` : ''}`;
      case 'to-read':
        return `On your list${s.book.dateAdded ? ` since ${shortDate(s.book.dateAdded)}` : ''}`;
      case 'dismissed':
        return `You passed on it${s.dismissal.date ? ` on ${shortDate(s.dismissal.date)}` : ''}${s.dismissal.reason && s.dismissal.reason !== '—' ? ` (${s.dismissal.reason})` : ''}`;
      case 'feed':
        return 'In the feed, waiting to be screened';
      case 'on-hand':
        return 'On hand: the file is in your library';
    }
  }

  const find = (kind: Standing['kind']) => standings.find((s) => s.kind === kind);
</script>

<div class="section"><h2>Find a book</h2></div>

{#if supported !== false}
  <div class="camera" class:on={scanning}>
    <video bind:this={video} muted playsinline aria-label="Camera view"></video>
    {#if scanning}
      <div class="frame" aria-hidden="true"></div>
      <p class="hint">Hold the barcode on the back cover inside the frame</p>
    {/if}
  </div>
  <div class="actions">
    {#if scanning}
      <button class="btn" onclick={stop}>Stop camera</button>
    {:else}
      <button class="btn primary" onclick={scan} disabled={supported == null || busy}>Scan a barcode</button>
    {/if}
  </div>
{:else}
  <p class="small muted">This browser can't read barcodes, so type the ISBN from the back cover or copyright page.</p>
{/if}

<form class="lookup" onsubmit={submit}>
  <label class="field">
    <span>ISBN, or title and author</span>
    <input type="search" bind:value={typed} autocomplete="off" enterkeyhint="search" placeholder="9780141439518 or middlemarch eliot" />
  </label>
  <button class="btn" type="submit" disabled={busy || !typed.trim()}>Look up</button>
</form>

{#if busy}<p class="muted small">Looking it up…</p>{/if}
{#if problem}<p class="notice" role="status">{problem}</p>{/if}

{#if results.length && !picked}
  <ul class="results">
    {#each results as r, i (r.key + i)}
      <li>
        <button class="result" onclick={() => (picked = r)}>
          <Cover url={r.coverUrl} title={r.title} size="s" />
          <span><strong>{r.title}</strong><br /><span class="muted small">{r.author}{#if r.year}{' '}· {r.year}{/if}</span></span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

{#if picked && ref}
  {@const reading = find('reading')}
  {@const read = find('read')}
  {@const toRead = find('to-read')}
  {@const dismissed = find('dismissed')}
  {@const feed = find('feed')}
  {@const onHand = find('on-hand')}
  {@const notes = app.waitingFor(target(reading ?? toRead ?? feed ?? onHand))}
  <article class="card found" data-testid="found">
    <div class="head">
      <Cover url={picked.coverUrl} title={picked.title} size="l" />
      <div>
        <h3>{picked.title}</h3>
        <p class="muted">{picked.author}{#if picked.year}{' '}· {picked.year}{/if}</p>
        {#if picked.isbn}<p class="small muted">ISBN {picked.isbn}</p>{/if}
      </div>
    </div>
    <ul class="standings" data-testid="standings">
      {#each standings as s, i (i)}<li>{describe(s)}</li>{:else}<li>New to the vault</li>{/each}
    </ul>
    <WaitingNotes {notes} />
    {#if !notes.length}
      <div class="actions">
        {#if reading}
          <button class="btn primary" onclick={() => (app.ask = { action: 'note', ref: target(reading) })}>Note</button>
          <button class="btn" onclick={() => (app.ask = { action: 'finish', ref: target(reading) })}>Finished</button>
        {:else if read}
          <span class="small muted">Already on the shelf.</span>
        {:else if toRead}
          <button class="btn primary" onclick={() => (app.ask = { action: 'start', ref: target(toRead) })}>Start reading</button>
        {:else if dismissed}
          <button class="btn" onclick={() => (app.ask = { action: 'add', ref: target(undefined) })}>Want it after all</button>
          <span class="small muted">The curator will check with you.</span>
        {:else if feed}
          <button class="btn primary" onclick={() => app.act('watch', target(feed))}>Watch</button>
          <button class="btn quiet" onclick={() => (app.ask = { action: 'pass', ref: target(feed) })}>Pass</button>
        {:else}
          <button class="btn primary" onclick={() => (app.ask = { action: 'add', ref: target(onHand) })}>Want to read</button>
          <button class="btn" onclick={() => (app.ask = { action: 'start', ref: target(onHand) })}>Start reading</button>
          <button class="btn" onclick={() => (app.ask = { action: 'read', ref: target(onHand) })}>Read it before</button>
        {/if}
      </div>
    {/if}
  </article>
  <p class="small muted credit">Book details from Open Library.</p>
{/if}

<style>
  .camera {
    position: relative;
    display: none;
    border-radius: var(--radius);
    overflow: hidden;
    background: #000;
    aspect-ratio: 4 / 3;
  }
  .camera.on {
    display: block;
  }
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .frame {
    position: absolute;
    inset: 30% 12%;
    border: 2px solid rgb(255 255 255 / 0.85);
    border-radius: 8px;
    box-shadow: 0 0 0 999px rgb(0 0 0 / 0.25);
  }
  .hint {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0.6rem;
    margin: 0;
    text-align: center;
    color: #fff;
    font-size: 0.85rem;
  }
  .lookup {
    display: flex;
    gap: 0.5rem;
    align-items: flex-end;
    margin: 0.4rem 0 1rem;
  }
  .lookup .field {
    flex: 1;
  }
  .results {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .result {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    width: 100%;
    padding: 0.55rem 0;
    border: none;
    border-bottom: 1px solid var(--line);
    background: none;
    text-align: left;
  }
  .found .head {
    display: flex;
    gap: 1rem;
  }
  .standings {
    margin: 0.9rem 0 0;
    padding-left: 1.1rem;
    font-weight: 600;
  }
  .credit {
    margin-top: 0.6rem;
  }
</style>
