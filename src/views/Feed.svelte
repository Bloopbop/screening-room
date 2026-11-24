<script lang="ts">
  import Cover from '../components/Cover.svelte';
  import WaitingNotes from '../components/WaitingNotes.svelte';
  import { shortDate } from '../lib/format';
  import { findCover } from '../lib/openlibrary';
  import { app } from '../lib/state.svelte';
  import type { FeedEntry } from '../lib/types';
  import { settled, STANDING_LABELS } from '../lib/views';

  const entries = $derived(app.vault?.feed ?? []);
  const pending = $derived(entries.filter((e) => e.status !== 'hold'));
  const held = $derived(entries.filter((e) => e.status === 'hold'));

  // Covers for candidates, looked up one at a time and cached on the phone.
  let covers = $state<Record<string, string>>({});
  const tried = new Set<string>();
  $effect(() => {
    const list = entries;
    let cancelled = false;
    void (async () => {
      for (const entry of list) {
        if (cancelled) return;
        if (tried.has(entry.slug)) continue;
        tried.add(entry.slug);
        try {
          covers[entry.slug] = await findCover(entry.title, entry.author);
        } catch {
          tried.delete(entry.slug);
          return; // Offline or refused: leave the spines.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  function ref(entry: FeedEntry) {
    return { title: entry.title, author: entry.author, slug: entry.slug };
  }

  function coverFor(entry: FeedEntry): string {
    const standing = settled(entry);
    if (standing && 'book' in standing && standing.book.coverUrl) return standing.book.coverUrl;
    return covers[entry.slug] ?? '';
  }
</script>

{#snippet candidate(entry: FeedEntry)}
  {@const notes = app.waitingFor(ref(entry))}
  {@const standing = settled(entry)}
  <article class="candidate" data-testid="candidate">
    <div class="top">
      <Cover url={coverFor(entry)} title={entry.title} size="m" />
      <div class="text">
        <h3>{entry.title}</h3>
        <div class="muted">{entry.author}{#if entry.year}{' '}· {entry.year}{/if}</div>
        {#if entry.source}<div class="small muted source">{entry.source}</div>{/if}
      </div>
    </div>
    {#if entry.pitch}<p class="pitch">{entry.pitch}</p>{/if}
    {#each entry.extra as line, i (i)}<p class="small muted">{line}</p>{/each}
    {#if entry.tags.length}
      <div class="tags">{#each entry.tags as tag, i (tag + i)}<span class="tag">{tag}</span>{/each}</div>
    {/if}
    {#if notes.length}
      <WaitingNotes {notes} />
    {:else if standing}
      <p class="small standing">
        {STANDING_LABELS[standing.kind]}{#if standing.kind === 'dismissed' && standing.dismissal.date}{' '}on {shortDate(standing.dismissal.date)}{/if}
      </p>
    {:else}
      <div class="actions">
        <button class="btn primary" onclick={() => app.act('watch', ref(entry))}>Watch</button>
        {#if entry.status !== 'hold'}<button class="btn" onclick={() => app.act('hold', ref(entry))}>Hold</button>{/if}
        <button class="btn quiet" onclick={() => (app.ask = { action: 'pass', ref: ref(entry) })}>Pass</button>
      </div>
    {/if}
  </article>
{/snippet}

<div class="section"><h2>The feed</h2></div>
{#if !entries.length}
  <p class="empty">The feed is empty. Ask the curator to scout.</p>
{:else}
  <p class="small muted">Watch adds a book to your list, Hold keeps it for the next screening, Pass drops it for good.</p>
  {#each pending as entry, i (entry.slug + i)}{@render candidate(entry)}{/each}
  {#if held.length}
    <div class="section"><h2>Held</h2></div>
    {#each held as entry, i (entry.slug + i)}{@render candidate(entry)}{/each}
  {/if}
{/if}

<style>
  .candidate {
    padding: 1rem 0;
    border-bottom: 1px solid var(--line);
  }
  .top {
    display: flex;
    gap: 0.85rem;
  }
  .text {
    min-width: 0;
  }
  .source {
    margin-top: 0.25rem;
  }
  .pitch {
    font-family: var(--serif);
    font-size: 1.02rem;
    margin-top: 0.7rem;
  }
  .standing {
    margin-top: 0.6rem;
    color: var(--ok);
    font-weight: 600;
  }
</style>
