<script lang="ts">
  import Cover from '../components/Cover.svelte';
  import WaitingNotes from '../components/WaitingNotes.svelte';
  import { daysSince, plural, ratingText, refOf, shortDate } from '../lib/format';
  import { href } from '../lib/router.svelte';
  import { app } from '../lib/state.svelte';
  import { closing } from '../lib/views';

  let { slug }: { slug: string } = $props();

  const book = $derived(app.index?.book(slug));
  const SHELF = { reading: 'Reading now', 'to-read': 'On your list', read: 'Read' } as const;
</script>

{#if !book}
  <p class="empty">That book isn't in the vault any more. The curator may have moved or removed it.</p>
  <p style="text-align: center"><a href={href({ name: 'shelf', tab: 'to-read' })}>Go to the shelf</a></p>
{:else}
  {@const notes = app.waitingFor(refOf(book))}
  {@const days = daysSince(book.dateStarted)}
  <article class="book">
    <div class="head">
      <Cover url={book.coverUrl} title={book.title} color={book.spineColor} size="l" />
      <div>
        <p class="eyebrow">{SHELF[book.shelf]}{#if book.dnf}{' '}· unfinished{/if}</p>
        <h2>{book.title}</h2>
        <p class="muted">{book.author}{#if book.year}{' '}· {book.year}{/if}</p>
        {#if book.pages}<p class="small muted">{book.pages} pages</p>{/if}
        {#if book.shelf === 'read' && ratingText(book)}<p class="rating">{ratingText(book)}</p>{/if}
      </div>
    </div>

    {#if book.logline}<p class="logline">{book.logline}</p>{/if}

    <dl>
      {#if book.dateAdded}<dt>Added</dt><dd>{shortDate(book.dateAdded)}{#if book.recommendedBy}{' '}· from {book.recommendedBy === 'human' ? 'you' : `the ${book.recommendedBy}`}{/if}</dd>{/if}
      {#if book.matchReason}<dt>Why</dt><dd>{book.matchReason}</dd>{/if}
      {#if book.dateStarted}<dt>Started</dt><dd>{shortDate(book.dateStarted)}{#if book.shelf === 'reading' && days != null && days > 0}, {plural(days, 'day')} ago{/if}</dd>{/if}
      {#if book.dateRead}<dt>Read</dt><dd>{shortDate(book.dateRead)}</dd>{/if}
      {#if book.lastLog}<dt>Talked about</dt><dd>{plural(book.logCount, 'time')}, last {shortDate(book.lastLog.date)}{#if book.lastLog.marker}: {book.lastLog.marker}{/if}</dd>{/if}
    </dl>

    {#if book.tags.length}
      <div class="tags">{#each book.tags as tag, i (tag + i)}<span class="tag">{tag}</span>{/each}</div>
    {/if}

    <WaitingNotes {notes} />

    {#if book.shelf === 'reading' && !closing(notes)}
      <div class="actions">
        <button class="btn primary" onclick={() => (app.ask = { action: 'note', ref: refOf(book) })}>Note</button>
        <button class="btn" onclick={() => (app.ask = { action: 'finish', ref: refOf(book) })}>Finished</button>
        <button class="btn quiet" onclick={() => (app.ask = { action: 'abandon', ref: refOf(book) })}>Stop</button>
      </div>
    {:else if book.shelf === 'to-read' && !notes.length}
      <div class="actions">
        <button class="btn primary" onclick={() => (app.ask = { action: 'start', ref: refOf(book) })}>Start reading</button>
        <button class="btn quiet" onclick={() => (app.ask = { action: 'pass', ref: refOf(book) })}>Pass</button>
      </div>
    {/if}
    <p class="small muted path">{book.path}</p>
  </article>
{/if}

<style>
  .book {
    padding-top: 1rem;
  }
  .head {
    display: flex;
    gap: 1rem;
    align-items: flex-end;
  }
  h2 {
    font-size: 1.5rem;
    margin-top: 0.2rem;
  }
  .rating {
    font-family: var(--serif);
    font-size: 1.3rem;
    font-weight: 600;
  }
  .logline {
    font-family: var(--serif);
    font-size: 1.08rem;
    margin-top: 1.1rem;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.35rem 0.9rem;
    margin: 1rem 0 0;
    font-size: 0.92rem;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  .path {
    margin-top: 1.4rem;
    font-family: ui-monospace, monospace;
    font-size: 0.72rem;
    color: var(--faint);
  }
</style>
