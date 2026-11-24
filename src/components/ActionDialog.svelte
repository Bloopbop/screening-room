<script lang="ts">
  import { untrack } from 'svelte';
  import { app, type Ask } from '../lib/state.svelte';
  import Rating from './Rating.svelte';

  let { ask }: { ask: Ask } = $props();
  // The request this dialog opened for. App.svelte keys the dialog on it, and
  // clears it as the dialog closes, so read it once.
  const request = untrack(() => ask);

  const COPY = {
    pass: { heading: 'Pass on this one', submit: 'Pass', words: '' },
    start: { heading: 'Start reading', submit: 'Start reading', words: 'First thoughts (optional)' },
    note: { heading: 'A note while reading', submit: 'Send note', words: 'What struck you' },
    finish: { heading: 'Finished', submit: 'Shelve it', words: 'What stayed with you? (optional)' },
    abandon: { heading: 'Stop reading', submit: 'Stop reading', words: 'Why you stopped (optional)' },
    add: { heading: 'Want to read', submit: 'Add to the list', words: 'Why it caught your eye (optional)' },
    read: { heading: 'Read it before', submit: 'Shelve it', words: 'When you read it, and what stayed (optional)' },
  } as const;
  type Asked = keyof typeof COPY;

  const action = request.action as Asked;
  const copy = COPY[action];

  let dialog = $state<HTMLDialogElement>();
  let words = $state('');
  let progress = $state('');
  let reason = $state('');
  let rating = $state<number | null>(null);
  let outcome = $state<'dnf' | 'delete'>('dnf');
  let sending = $state(false);

  /** The reasons used most in dismissed.csv, as one-tap choices. */
  const reasons = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const d of app.vault?.dismissed ?? []) {
      const r = d.reason.trim().toLowerCase();
      if (r && r !== '—' && r !== '-' && !r.includes(' ')) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([r]) => r);
  });

  let heading = $state<HTMLElement>();
  let textarea = $state<HTMLTextAreaElement>();

  // Open as a sheet. Focus the heading, so the keyboard stays down until a
  // field is tapped; a note goes straight to its text.
  $effect(() => {
    if (dialog && !dialog.open) dialog.showModal();
    if (action === 'note') textarea?.focus();
    else heading?.focus();
  });

  const canSend = $derived(!sending && (action !== 'note' || words.trim().length > 0));

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!canSend) return;
    sending = true;
    const extra: Record<string, unknown> = { body: words };
    if (action === 'pass' && reason.trim()) extra.reason = reason.trim().split(/\s+/)[0].toLowerCase();
    if ((action === 'finish' || action === 'read') && rating != null) extra.rating = rating;
    if (action === 'abandon') extra.outcome = outcome;
    if (action === 'note' && progress.trim()) extra.progress = progress.trim();
    app.ask = null;
    await app.act(request.action, request.ref, extra);
  }
</script>

<dialog bind:this={dialog} onclose={() => (app.ask = null)} aria-labelledby="ask-heading">
  <form onsubmit={submit}>
    <p class="eyebrow">{request.ref.author}</p>
    <h2 id="ask-heading" tabindex="-1" bind:this={heading}>{copy.heading}</h2>
    <p class="title">{request.ref.title}</p>

    {#if action === 'pass'}
      <label class="field">
        <span>One word on why (optional)</span>
        <input type="text" bind:value={reason} maxlength="24" autocomplete="off" autocapitalize="none" />
      </label>
      {#if reasons.length}
        <div class="chips" style="margin-top: 0.5rem">
          {#each reasons as r (r)}
            <button type="button" class="chip" aria-pressed={reason === r} onclick={() => (reason = reason === r ? '' : r)}>{r}</button>
          {/each}
        </div>
      {/if}
    {/if}

    {#if action === 'finish' || action === 'read'}
      <div class="field"><span class="muted small">Your rating</span><Rating bind:value={rating} /></div>
    {/if}

    {#if action === 'abandon'}
      <fieldset>
        <legend class="muted small">What should the curator do?</legend>
        <label class="radio"><input type="radio" bind:group={outcome} value="dnf" /> Shelve it as unfinished (DNF)</label>
        <label class="radio"><input type="radio" bind:group={outcome} value="delete" /> Remove it, as if never started</label>
      </fieldset>
    {/if}

    {#if action === 'note'}
      <label class="field">
        <span>Where you are (optional)</span>
        <input type="text" bind:value={progress} placeholder="through Part II" maxlength="80" />
      </label>
    {/if}

    {#if copy.words}
      <label class="field">
        <span>{copy.words}</span>
        <textarea bind:value={words} bind:this={textarea} rows="4"></textarea>
      </label>
    {/if}

    <div class="actions end">
      <button type="button" class="btn quiet" onclick={() => dialog?.close()}>Cancel</button>
      <button type="submit" class="btn primary" disabled={!canSend}>{copy.submit}</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    width: min(560px, 100vw);
    max-width: 100vw;
    max-height: 92dvh;
    margin: auto auto 0;
    padding: 1.2rem 1.1rem calc(1rem + env(safe-area-inset-bottom));
    border: none;
    border-radius: 16px 16px 0 0;
    background: var(--paper);
    color: var(--ink);
  }
  h2:focus {
    outline: none;
  }
  dialog::backdrop {
    background: rgb(20 16 12 / 0.45);
  }
  .title {
    font-family: var(--serif);
    font-style: italic;
    color: var(--muted);
    margin-top: 0.2rem;
  }
  .end {
    justify-content: flex-end;
    margin-top: 1.1rem;
  }
  fieldset {
    border: none;
    margin: 0.9rem 0 0;
    padding: 0;
  }
  .radio {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 40px;
  }
  .radio input {
    width: 20px;
    height: 20px;
    accent-color: var(--accent);
  }
  .field {
    margin-top: 0.9rem;
  }
</style>
