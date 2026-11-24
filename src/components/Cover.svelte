<script lang="ts">
  let {
    url = '',
    title,
    color = '',
    size = 'm',
  }: { url?: string; title: string; color?: string; size?: 's' | 'm' | 'l' } = $props();

  let failed = $state(false);
  $effect(() => {
    void url;
    failed = false;
  });
</script>

<div class="cover {size}" style:--spine={color || '#888780'} aria-hidden="true">
  {#if url && !failed}
    <img src={url} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={() => (failed = true)} />
  {:else}
    <span>{title}</span>
  {/if}
</div>

<style>
  .cover {
    flex: none;
    position: relative;
    border-radius: 3px 5px 5px 3px;
    overflow: hidden;
    background: var(--spine);
    box-shadow:
      inset 3px 0 0 rgb(0 0 0 / 0.18),
      0 1px 3px rgb(0 0 0 / 0.18);
  }
  .s {
    width: 44px;
    height: 66px;
  }
  .m {
    width: 64px;
    height: 96px;
  }
  .l {
    width: 112px;
    height: 168px;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  span {
    position: absolute;
    inset: 0;
    padding: 6px 5px 6px 8px;
    color: #fff;
    font-family: var(--serif);
    font-size: 0.62rem;
    line-height: 1.15;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 6;
    line-clamp: 6;
    -webkit-box-orient: vertical;
    text-shadow: 0 1px 1px rgb(0 0 0 / 0.25);
  }
  .s span {
    font-size: 0.5rem;
    -webkit-line-clamp: 5;
    line-clamp: 5;
  }
  .l span {
    font-size: 0.85rem;
    padding: 10px 9px 10px 13px;
  }
</style>
