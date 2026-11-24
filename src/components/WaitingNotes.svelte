<script lang="ts">
  import { ACTION_LABELS } from '../lib/notes';
  import { app, type Waiting } from '../lib/state.svelte';

  let { notes, showTitle = false }: { notes: Waiting[]; showTitle?: boolean } = $props();

  const STATE: Record<Waiting['state'], string> = {
    queued: 'on the phone, not sent yet',
    failed: 'not sent',
    sent: 'sent to the vault',
    waiting: 'waiting for the curator',
  };

  let busy = $state('');
  async function takeBack(w: Waiting) {
    busy = w.key;
    await app.takeBack(w);
    busy = '';
  }
</script>

{#each notes as w (w.key)}
  <div class="waiting" class:failed={w.state === 'failed'} data-testid="waiting">
    <div class="what">
      <strong>{ACTION_LABELS[w.note.action]}</strong>{#if w.note.rating != null}&nbsp;· {w.note.rating}{/if}{#if showTitle}&nbsp;· {w.note.title}{/if}
      <span class="muted">— {STATE[w.state]}</span>
      {#if w.error}<div class="error small">{w.error}</div>{/if}
    </div>
    <button class="btn small quiet" disabled={busy === w.key} onclick={() => takeBack(w)}>Take back</button>
  </div>
{/each}

<style>
  .waiting {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.6rem;
    padding: 0.4rem 0.4rem 0.4rem 0.7rem;
    border-radius: 8px;
    background: var(--accent-soft);
    font-size: 0.88rem;
  }
  .failed {
    background: var(--warn-soft);
  }
  .error {
    color: var(--warn);
    margin-top: 0.15rem;
  }
  .what {
    min-width: 0;
  }
</style>
