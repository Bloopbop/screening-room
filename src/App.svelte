<script lang="ts">
  import { onMount } from 'svelte';
  import ActionDialog from './components/ActionDialog.svelte';
  import { ago } from './lib/format';
  import { href, router } from './lib/router.svelte';
  import { app } from './lib/state.svelte';
  import { freshFeed } from './lib/views';
  import BookView from './views/BookView.svelte';
  import Desk from './views/Desk.svelte';
  import Feed from './views/Feed.svelte';
  import Scan from './views/Scan.svelte';
  import Settings from './views/Settings.svelte';
  import Shelf from './views/Shelf.svelte';

  onMount(() => {
    void app.init();
  });

  const route = $derived(router.route);
  const fresh = $derived(freshFeed().length);
  const section = $derived(route.name === 'book' ? 'shelf' : route.name);

  // Re-render "synced 3 min ago" now and then.
  let now = $state(Date.now());
  onMount(() => {
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });
  const status = $derived.by(() => {
    void now;
    if (app.syncing) return 'Syncing…';
    if (!app.online) return 'Offline';
    return app.vault?.syncedAt ? `Synced ${ago(app.vault.syncedAt)}` : 'Not synced';
  });
</script>

<header>
  <a class="brand" href={href({ name: 'desk' })}>The Screening Room</a>
  {#if app.settings}
    <button class="sync" class:busy={app.syncing} class:offline={!app.online} onclick={() => app.syncNow()} disabled={app.syncing} data-testid="sync">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9M18.5 3v4.2h-4.2M5.5 21v-4.2h4.2" /></svg>
      <span>{status}</span>
    </button>
  {/if}
</header>

<main>
  {#if !app.ready}
    <p class="empty">Opening…</p>
  {:else}
    {#if app.error}
      <p class="notice error" role="alert">{app.error}</p>
    {/if}
    {#if !app.settings || route.name === 'settings'}
      <Settings />
    {:else if !app.vault}
      <p class="empty">{app.syncing ? 'Reading the vault for the first time…' : 'The vault hasn\'t been read yet.'}</p>
    {:else if route.name === 'feed'}
      <Feed />
    {:else if route.name === 'shelf'}
      {#key route.tab}<Shelf tab={route.tab} />{/key}
    {:else if route.name === 'scan'}
      <Scan />
    {:else if route.name === 'book'}
      <BookView slug={route.slug} />
    {:else}
      <Desk />
    {/if}
  {/if}
</main>

{#if app.settings}
  <nav class="bar" aria-label="Sections">
    <a href={href({ name: 'desk' })} aria-current={section === 'desk' ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5V5a1 1 0 0 1 1-1h5.5a2.5 2.5 0 0 1 1.5.5 2.5 2.5 0 0 1 1.5-.5H19a1 1 0 0 1 1 1v14.5M4 19.5h7a1 1 0 0 1 1 1 1 1 0 0 1 1-1h7M12 4.5v15" /></svg>
      Desk
    </a>
    <a href={href({ name: 'feed' })} aria-current={section === 'feed' ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v13H3zM3 10h18M7 6v13M17 6v13" /></svg>
      Feed{#if fresh}<span class="badge" data-testid="feed-badge">{fresh}</span>{/if}
    </a>
    <a href={href({ name: 'shelf', tab: 'to-read' })} aria-current={section === 'shelf' ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18M5 20V6h3v14M8 20V4h3v16M12.5 20l-1-12 3-.3 1 12.3M17 20V8h3v12" /></svg>
      Shelf
    </a>
    <a href={href({ name: 'scan' })} aria-current={section === 'scan' ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 8v8M11 8v8M14 8v8M17 8v8" /></svg>
      Find
    </a>
    <a href={href({ name: 'settings' })} aria-current={section === 'settings' ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
      Settings
    </a>
  </nav>
{/if}

{#if app.toast}
  <div class="toast" role="status" data-testid="toast">
    <span>{app.toast.text}</span>
    {#if app.toast.undo}
      <button
        class="btn small quiet"
        onclick={() => {
          app.toast?.undo?.();
          app.toast = null;
        }}>Undo</button
      >
    {/if}
  </div>
{/if}

{#if app.ask}
  {#key app.ask}<ActionDialog ask={app.ask} />{/key}
{/if}

<style>
  header {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: calc(0.6rem + env(safe-area-inset-top)) 1rem 0.6rem;
    background: color-mix(in srgb, var(--paper) 92%, transparent);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--line);
  }
  .brand {
    font-family: var(--serif);
    font-variant: small-caps;
    letter-spacing: 0.04em;
    font-size: 1.12rem;
    font-weight: 600;
    color: var(--ink);
    text-decoration: none;
  }
  .sync {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border: none;
    background: none;
    color: var(--muted);
    font-size: 0.8rem;
    padding: 0.3rem 0;
  }
  .sync svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .sync.busy svg {
    animation: spin 1s linear infinite;
  }
  .sync.offline {
    color: var(--warn);
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: 0 1rem calc(var(--nav) + 2rem + env(safe-area-inset-bottom));
  }
  .error {
    margin-top: 1rem;
  }
  .bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 5;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    height: calc(var(--nav) + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--card);
    border-top: 1px solid var(--line);
  }
  .bar a {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    color: var(--muted);
    text-decoration: none;
    font-size: 0.72rem;
    font-weight: 600;
  }
  .bar a[aria-current='page'] {
    color: var(--accent);
  }
  .bar svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .badge {
    position: absolute;
    top: 6px;
    left: calc(50% + 8px);
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 0.68rem;
    line-height: 18px;
    text-align: center;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: calc(var(--nav) + 0.8rem + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: max-content;
    max-width: calc(100vw - 2rem);
    padding: 0.45rem 0.5rem 0.45rem 1rem;
    border-radius: 999px;
    background: var(--ink);
    color: var(--paper);
    font-size: 0.9rem;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.2);
  }
  .toast .btn {
    color: var(--paper);
    font-weight: 700;
  }
</style>
