<script lang="ts">
  import BookRow from '../components/BookRow.svelte';
  import WaitingNotes from '../components/WaitingNotes.svelte';
  import { daysSince, plural, refOf, shortDate } from '../lib/format';
  import { href } from '../lib/router.svelte';
  import { app } from '../lib/state.svelte';
  import { closing, freshFeed, readyNow } from '../lib/views';

  const reading = $derived(
    (app.vault?.books ?? []).filter((b) => b.shelf === 'reading').sort((a, b) => b.dateStarted.localeCompare(a.dateStarted)),
  );
  const fresh = $derived(freshFeed());
  const ready = $derived(readyNow().slice(0, 4));
  const queued = $derived(app.waiting.filter((w) => w.state === 'queued' || w.state === 'failed'));
</script>

<section>
  <div class="section"><h2>On the desk</h2></div>
  {#each reading as book (book.path)}
    {@const days = daysSince(book.dateStarted)}
    <BookRow title={book.title} author={book.author} coverUrl={book.coverUrl} color={book.spineColor} size="m" link={href({ name: 'book', slug: book.slug })}>
      {#snippet meta()}
        {#if book.dateStarted}Started {shortDate(book.dateStarted)}{#if days != null && days > 0}, {plural(days, 'day')} ago{/if}{/if}
        {#if book.lastLog}<br />Last talked about {shortDate(book.lastLog.date)}{#if book.lastLog.marker}: {book.lastLog.marker}{/if}{/if}
      {/snippet}
      {@const notes = app.waitingFor(refOf(book))}
      <WaitingNotes {notes} />
      {#if !closing(notes)}
        <div class="actions">
          <button class="btn primary" onclick={() => (app.ask = { action: 'note', ref: refOf(book) })}>Note</button>
          <button class="btn" onclick={() => (app.ask = { action: 'finish', ref: refOf(book) })}>Finished</button>
          <button class="btn quiet" onclick={() => (app.ask = { action: 'abandon', ref: refOf(book) })}>Stop</button>
        </div>
      {/if}
    </BookRow>
  {:else}
    <p class="empty">Nothing on the desk. Start something from your list or the shelf.</p>
  {/each}
</section>

{#if fresh.length}
  <a class="card feed-link" href={href({ name: 'feed' })}>
    <span class="eyebrow">From the last scout</span>
    <strong>{plural(fresh.length, 'candidate')} to screen</strong>
    <span class="small muted">{fresh.slice(0, 3).map((e) => e.title).join(' · ')}</span>
  </a>
{/if}

{#if queued.length}
  <section>
    <div class="section"><h2>Not sent yet</h2></div>
    <p class="small muted">These go to the vault as soon as GitHub can be reached.</p>
    <WaitingNotes notes={queued} showTitle />
  </section>
{/if}

{#if ready.length}
  <section>
    <div class="section">
      <h2>Ready now</h2>
      <a class="small" href={href({ name: 'shelf', tab: 'on-hand' })}>On hand</a>
    </div>
    <p class="small muted">The curator's picks from the books on hand.</p>
    {#each ready as item, i (item.slug + i)}
      <div class="ready">
        <strong>{item.title}</strong>{#if item.author}<span class="muted">{' '}· {item.author}</span>{/if}
        {#if item.note}<div class="small muted">{item.note}</div>{/if}
      </div>
    {/each}
  </section>
{/if}

<style>
  .feed-link {
    display: grid;
    gap: 0.15rem;
    margin-top: 1.4rem;
    text-decoration: none;
    color: inherit;
    border-left: 4px solid var(--accent);
  }
  .ready {
    padding: 0.55rem 0;
    border-bottom: 1px solid var(--line);
  }
</style>
