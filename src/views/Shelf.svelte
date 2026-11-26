<script lang="ts">
  import BookRow from '../components/BookRow.svelte';
  import WaitingNotes from '../components/WaitingNotes.svelte';
  import { dismissalTitle, ratingText, refOf, shortDate } from '../lib/format';
  import { href, SHELF_TABS, type ShelfTab } from '../lib/router.svelte';
  import { authorKey, titleKey } from '../lib/slug';
  import { app } from '../lib/state.svelte';
  import type { CatalogRow } from '../lib/types';
  import { readyNow, STANDING_LABELS } from '../lib/views';

  let { tab }: { tab: ShelfTab } = $props();

  const LABELS: Record<ShelfTab, string> = { 'to-read': 'To read', read: 'Read', 'on-hand': 'On hand', passed: 'Passed' };

  let query = $state('');
  const q = $derived(query.trim().toLowerCase());
  const matches = (...fields: string[]) => !q || fields.some((f) => f.toLowerCase().includes(q));

  const books = $derived(app.vault?.books ?? []);
  const toRead = $derived(books.filter((b) => b.shelf === 'to-read').sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)));
  const read = $derived(
    books
      .filter((b) => b.shelf === 'read')
      .sort((a, b) => (b.dateRead || '0').localeCompare(a.dateRead || '0') || a.title.localeCompare(b.title)),
  );
  const catalog = $derived(app.vault?.library.catalog ?? []);
  const passed = $derived([...(app.vault?.dismissed ?? [])].reverse());
  const ready = $derived(readyNow());

  const counts = $derived<Record<ShelfTab, number>>({ 'to-read': toRead.length, read: read.length, 'on-hand': catalog.length, passed: passed.length });

  /** Where an on-hand book stands, other than on hand. */
  function standingOf(row: CatalogRow) {
    return app.index?.find(row).find((s) => s.kind !== 'on-hand' && s.kind !== 'feed');
  }

  const readyKeys = $derived(new Set(ready.map((r) => `${titleKey(r.title)}|${authorKey(r.author)}`)));
</script>

<div class="section"><h2>The shelf</h2></div>
<nav class="tabs" aria-label="Shelves">
  {#each SHELF_TABS as t (t)}
    <a href={href({ name: 'shelf', tab: t })} aria-current={t === tab ? 'page' : undefined}>{LABELS[t]} <span class="count">{counts[t]}</span></a>
  {/each}
</nav>

{#if tab !== 'to-read'}
  <input type="search" class="search" placeholder="Find by title or author" bind:value={query} aria-label="Find by title or author" />
{/if}

{#if tab === 'to-read'}
  {#each toRead as book (book.path)}
    <BookRow title={book.title} author={book.author} coverUrl={book.coverUrl} color={book.spineColor} link={href({ name: 'book', slug: book.slug })}>
      {#snippet meta()}
        {#if book.dateAdded}Added {shortDate(book.dateAdded)}{/if}{#if book.recommendedBy}{' '}· from {book.recommendedBy === 'human' ? 'you' : `the ${book.recommendedBy}`}{/if}
        {#if book.logline}<div class="logline">{book.logline}</div>{/if}
      {/snippet}
      {@const notes = app.waitingFor(refOf(book))}
      {#if notes.length}
        <WaitingNotes {notes} />
      {:else}
        <div class="actions">
          <button class="btn primary small" onclick={() => (app.ask = { action: 'start', ref: refOf(book) })}>Start</button>
          <button class="btn quiet small" onclick={() => (app.ask = { action: 'pass', ref: refOf(book) })}>Pass</button>
        </div>
      {/if}
    </BookRow>
  {:else}
    <p class="empty">Nothing on the list. Add something from the feed, or scan a book.</p>
  {/each}
{:else if tab === 'read'}
  {#each read.filter((b) => matches(b.title, b.author)) as book (book.path)}
    <BookRow title={book.title} author={book.author} coverUrl={book.coverUrl} color={book.spineColor} link={href({ name: 'book', slug: book.slug })}>
      {#snippet meta()}
        {#if book.dateRead}Read {shortDate(book.dateRead)}{/if}{#if ratingText(book)}{#if book.dateRead}{' · '}{/if}<strong class="rating">{ratingText(book)}</strong>{/if}
      {/snippet}
    </BookRow>
  {:else}
    <p class="empty">{q ? 'No read book matches.' : 'Nothing shelved yet.'}</p>
  {/each}
{:else if tab === 'on-hand'}
  {#if ready.length && !q}
    <h3 class="group">Ready now</h3>
    <p class="small muted">The curator's picks from what's on hand.</p>
    {#each ready as item, i (item.slug + i)}
      {@const r = { title: item.title, author: item.author, slug: item.slug }}
      {@const notes = app.waitingFor(r)}
      <div class="line" data-testid="on-hand">
        <div><strong>{item.title}</strong>{#if item.author}<span class="muted">{' '}· {item.author}</span>{/if}</div>
        {#if item.note}<div class="small muted">{item.note}</div>{/if}
        {#if notes.length}
          <WaitingNotes {notes} />
        {:else if item.standing?.kind === 'to-read'}
          <div class="small standing">{STANDING_LABELS['to-read']}</div>
          <div class="actions"><button class="btn small primary" onclick={() => (app.ask = { action: 'start', ref: r })}>Start</button></div>
        {:else}
          <div class="actions">
            <button class="btn small primary" onclick={() => (app.ask = { action: 'start', ref: r })}>Start</button>
            <button class="btn small" onclick={() => (app.ask = { action: 'add', ref: r })}>Want</button>
          </div>
        {/if}
      </div>
    {/each}
    <h3 class="group">Everything on hand</h3>
  {/if}
  {#each catalog.filter((c) => matches(c.title, c.author, c.genre) && (q || !readyKeys.has(`${titleKey(c.title)}|${authorKey(c.author)}`))) as row, i (row.slug + i)}
    {@const standing = standingOf(row)}
    {@const notes = app.waitingFor(row)}
    <div class="line" data-testid="on-hand">
      <div><strong>{row.title}</strong>{#if row.author}<span class="muted">{' '}· {row.author}</span>{/if}</div>
      {#if row.genre || row.description}<div class="small muted">{[row.genre, row.description].filter(Boolean).join(' — ')}</div>{/if}
      {#if notes.length}
        <WaitingNotes {notes} />
      {:else if standing}
        <div class="small standing">{STANDING_LABELS[standing.kind]}</div>
      {:else}
        <div class="actions">
          <button class="btn small primary" onclick={() => (app.ask = { action: 'start', ref: row })}>Start</button>
          <button class="btn small" onclick={() => (app.ask = { action: 'add', ref: row })}>Want</button>
        </div>
      {/if}
    </div>
  {:else}
    <p class="empty">{q ? 'Nothing on hand matches.' : 'The library page lists no books on hand.'}</p>
  {/each}
{:else}
  <p class="small muted">Passed books are never recommended again.</p>
  {#each passed.filter((d) => matches(d.slug.replace(/-/g, ' '), d.reason)) as d, i (d.slug + i)}
    <div class="line passed">
      <span>{dismissalTitle(d)}</span>
      <span class="small muted">{shortDate(d.date)}{#if d.reason && d.reason !== '—'}{' '}· {d.reason}{/if}</span>
    </div>
  {:else}
    <p class="empty">{q ? 'No passed book matches.' : 'Nothing passed yet.'}</p>
  {/each}
{/if}

<style>
  .tabs {
    display: flex;
    gap: 0.35rem;
    overflow-x: auto;
    margin: 0 -1rem 0.6rem;
    padding: 0 1rem 0.2rem;
    scrollbar-width: none;
  }
  .tabs a {
    flex: none;
    padding: 0.4rem 0.85rem;
    border-radius: 999px;
    border: 1px solid var(--line);
    color: var(--ink);
    text-decoration: none;
    font-size: 0.92rem;
  }
  .tabs a[aria-current='page'] {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }
  .count {
    opacity: 0.6;
    font-variant-numeric: tabular-nums;
  }
  .search {
    margin: 0.3rem 0 0.4rem;
  }
  .logline {
    margin-top: 0.3rem;
    color: var(--ink);
    font-family: var(--serif);
    font-size: 0.95rem;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .rating {
    color: var(--ink);
  }
  .line {
    padding: 0.7rem 0;
    border-bottom: 1px solid var(--line);
  }
  .passed {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }
  .group {
    margin-top: 1rem;
  }
  .standing {
    margin-top: 0.35rem;
    color: var(--ok);
    font-weight: 600;
  }
</style>
