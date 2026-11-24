<script lang="ts">
  let { value = $bindable(null) }: { value?: number | null } = $props();

  const whole = $derived(value == null ? null : Math.floor(value));
  const half = $derived(value != null && value % 1 !== 0);

  function pick(n: number) {
    value = whole === n ? null : n + (half && n < 10 ? 0.5 : 0);
  }

  function toggleHalf() {
    if (whole == null || whole >= 10) return;
    value = half ? whole : whole + 0.5;
  }
</script>

<div class="rating" role="group" aria-label="Rating out of 10">
  <div class="numbers">
    {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as n (n)}
      <button type="button" class="n" aria-pressed={whole === n} aria-label={`${n}`} onclick={() => pick(n)}>{n}</button>
    {/each}
  </div>
  <div class="line">
    <button type="button" class="chip" aria-pressed={half} disabled={whole == null || whole >= 10} onclick={toggleHalf}>+ ½</button>
    <span class="muted small" data-testid="rating-value">{value == null ? 'No rating' : `${value} out of 10`}</span>
  </div>
</div>

<style>
  .numbers {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 4px;
  }
  .n {
    min-height: 40px;
    padding: 0;
    border-radius: 6px;
    border: 1px solid var(--line);
    background: var(--card);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .n[aria-pressed='true'] {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }
  .line {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }
</style>
