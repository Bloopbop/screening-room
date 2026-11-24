<script lang="ts">
  import { deviceCheck, type CheckResult } from '../lib/check';
  import { ago, plural } from '../lib/format';
  import { parseRepo } from '../lib/github';
  import { app, message } from '../lib/state.svelte';

  const settings = $derived(app.settings);
  let editing = $state(false);
  let repoInput = $state('');
  let tokenInput = $state('');
  let formError = $state('');
  let saving = $state(false);

  let checking = $state(false);
  let checks = $state.raw<CheckResult[]>([]);
  let confirmForget = $state(false);

  const unsent = $derived(app.outbox.filter((i) => i.state !== 'sent'));
  const books = $derived(app.vault?.books ?? []);

  function edit() {
    repoInput = settings ? `${settings.owner}/${settings.repo}` : '';
    tokenInput = '';
    formError = '';
    editing = true;
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const repo = parseRepo(repoInput);
    if (!repo) {
      formError = 'Enter the vault repository as owner/name, as in its GitHub address.';
      return;
    }
    const token = tokenInput.trim() || settings?.token || '';
    if (!token) {
      formError = 'Paste the token from GitHub.';
      return;
    }
    if (/\s/.test(token)) {
      formError = 'The token has a space in it. Copy it again from GitHub.';
      return;
    }
    saving = true;
    formError = '';
    try {
      await app.saveSettings({ ...repo, token });
      editing = false;
      tokenInput = '';
    } catch (error) {
      formError = message(error);
    } finally {
      saving = false;
    }
  }

  async function runCheck() {
    if (!settings) return;
    checking = true;
    checks = [];
    try {
      checks = await deviceCheck(settings);
    } finally {
      checking = false;
    }
  }

  async function forget() {
    await app.forget();
    confirmForget = false;
    checks = [];
    edit();
  }
</script>

{#if !settings || editing}
  <section class="setup">
    {#if !settings}
      <p class="eyebrow">Welcome</p>
      <h2>Connect the vault</h2>
      <p class="muted">
        This app reads your Screening Room vault from GitHub and leaves the curator a short note for each thing you do here. The curator
        files them next time you talk.
      </p>
    {:else}
      <h2>Vault connection</h2>
    {/if}
    <form onsubmit={save}>
      <label class="field">
        <span>Vault repository (owner/name)</span>
        <input type="text" bind:value={repoInput} autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="owner/vault" />
      </label>
      <label class="field">
        <span>{settings ? 'New token (leave empty to keep the current one)' : 'GitHub token'}</span>
        <input type="password" bind:value={tokenInput} autocomplete="off" spellcheck="false" placeholder="github_pat_…" />
      </label>
      <p class="small muted">
        Use a fine-grained token limited to the vault repository, with Contents: Read and write. It stays on this phone, and is only
        ever sent to GitHub.
      </p>
      {#if formError}<p class="notice">{formError}</p>{/if}
      <div class="actions">
        <button class="btn primary" type="submit" disabled={saving}>{saving ? 'Connecting…' : settings ? 'Save' : 'Connect'}</button>
        {#if settings}<button class="btn quiet" type="button" onclick={() => (editing = false)}>Cancel</button>{/if}
      </div>
    </form>
  </section>
{/if}

{#if settings && !editing}
  <div class="section"><h2>Settings</h2></div>
  <section class="card stack">
    <div>
      <p class="eyebrow">Vault</p>
      <p><strong>{settings.owner}/{settings.repo}</strong>{#if app.vault?.branch}{' '}· {app.vault.branch}{/if}</p>
      <p class="small muted">
        {#if app.vault?.syncedAt}Synced {ago(app.vault.syncedAt)}: {plural(books.filter((b) => b.shelf === 'read').length, 'book')} read,
          {books.filter((b) => b.shelf === 'to-read').length} to read, {books.filter((b) => b.shelf === 'reading').length} reading, {plural(
            app.vault.feed.length,
            'candidate',
          )} in the feed.{:else}Not synced yet.{/if}
      </p>
      {#each app.vault?.problems ?? [] as problem, i (i)}<p class="small notice">{problem}</p>{/each}
    </div>
    <div class="actions">
      <button class="btn primary" onclick={() => app.syncNow()} disabled={app.syncing}>{app.syncing ? 'Syncing…' : 'Sync now'}</button>
      <button class="btn" onclick={edit}>Change vault or token</button>
    </div>
  </section>

  <section class="card stack">
    <div>
      <p class="eyebrow">Notes for the curator</p>
      {#if unsent.length}
        <p>{plural(unsent.length, 'note')} on this phone, not sent yet.</p>
      {:else}
        <p class="muted">Everything has been sent.</p>
      {/if}
      <p class="small muted">
        {plural(app.waiting.length, 'note')} waiting for the curator in all. Each disappears once the curator has filed it.
      </p>
    </div>
  </section>

  <section class="card stack">
    <div>
      <p class="eyebrow">Device check</p>
      <p class="small muted">Reads the vault, writes and removes a small check file, and tests the barcode reader and book lookups.</p>
    </div>
    <div class="actions"><button class="btn" onclick={runCheck} disabled={checking}>{checking ? 'Checking…' : 'Run the check'}</button></div>
    {#if checks.length}
      <ul class="checks" data-testid="checks">
        {#each checks as c (c.name)}
          <li class={c.status}><strong>{c.status === 'pass' ? '✓' : c.status === 'warn' ? '!' : '✗'} {c.name}</strong><br /><span class="small">{c.detail}</span></li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="card stack">
    <div>
      <p class="eyebrow">About</p>
      <p class="small">The Screening Room companion, version {__APP_VERSION__}.</p>
      <p class="small muted">
        The app talks only to GitHub, for the vault, and Open Library, for book lookups and covers. Book data from Open Library is
        free to reuse (CC0).
      </p>
    </div>
    {#if confirmForget}
      <p class="notice">This deletes the token, the cached vault and any unsent notes from this phone. The vault itself isn't touched.</p>
      <div class="actions">
        <button class="btn primary" onclick={forget}>Forget it</button>
        <button class="btn quiet" onclick={() => (confirmForget = false)}>Keep</button>
      </div>
    {:else}
      <div class="actions"><button class="btn quiet" onclick={() => (confirmForget = true)}>Forget this vault on this phone</button></div>
    {/if}
  </section>
{/if}

<style>
  .setup {
    padding-top: 1rem;
  }
  .setup h2 {
    font-size: 1.6rem;
    margin: 0.2rem 0 0.4rem;
  }
  .card {
    margin-top: 0.9rem;
  }
  .checks {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .checks li {
    padding: 0.5rem 0;
    border-top: 1px solid var(--line);
  }
  .checks .pass strong {
    color: var(--ok);
  }
  .checks .warn strong {
    color: var(--warn);
  }
  .checks .fail strong {
    color: var(--warn);
  }
</style>
