<script lang="ts">
  import type { Snippet } from 'svelte';
  import Cover from './Cover.svelte';

  let {
    title,
    author,
    coverUrl = '',
    color = '',
    link = '',
    size = 's',
    meta,
    children,
  }: {
    title: string;
    author: string;
    coverUrl?: string;
    color?: string;
    link?: string;
    size?: 's' | 'm';
    meta?: Snippet;
    children?: Snippet;
  } = $props();
</script>

<article class="row" data-testid="book-row">
  <div class="top">
    {#if link}
      <a href={link} class="cover-link" tabindex="-1"><Cover url={coverUrl} {title} {color} {size} /></a>
    {:else}
      <Cover url={coverUrl} {title} {color} {size} />
    {/if}
    <div class="text">
      <h3>{#if link}<a href={link}>{title}</a>{:else}{title}{/if}</h3>
      {#if author}<div class="author">{author}</div>{/if}
      {#if meta}<div class="meta small muted">{@render meta()}</div>{/if}
    </div>
  </div>
  {#if children}{@render children()}{/if}
</article>

<style>
  .row {
    padding: 0.8rem 0;
    border-bottom: 1px solid var(--line);
  }
  .top {
    display: flex;
    gap: 0.85rem;
    align-items: flex-start;
  }
  .text {
    min-width: 0;
    flex: 1;
  }
  h3 a {
    color: inherit;
    text-decoration: none;
  }
  .author {
    color: var(--muted);
    font-size: 0.92rem;
  }
  .meta {
    margin-top: 0.2rem;
  }
  .cover-link {
    display: block;
  }
</style>
