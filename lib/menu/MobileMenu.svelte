<script lang="ts">
  import type { MobileMenuItem } from './types.js';

  let {
    items,
    open = $bindable(false),
    onSelect = () => {},
    closeLabel = 'Close menu',
  }: {
    items: MobileMenuItem[];
    open?: boolean;
    onSelect?: (item: MobileMenuItem) => void;
    closeLabel?: string;
  } = $props();

  let menuElement: HTMLDivElement;
  const transitionDurationMs = 400;

  const setViewTransitionName = () => {
    if (!menuElement) { return; }
    menuElement.style.setProperty('view-transition-name', 'mobile-side-menu');
    setTimeout(() => {
      menuElement.style.setProperty('view-transition-name', '');
    }, transitionDurationMs);
  };

  const closeMenu = (event?: MouseEvent) => {
    event?.stopPropagation();
    setViewTransitionName();

    if (document.startViewTransition) {
      document.startViewTransition(() => {
        open = false;
      });
      return;
    }
    open = false;
  };

  $effect(() => {
    if (open) { setViewTransitionName(); }
  });
</script>

<button
  type="button"
  class="_4 top-0 left-0 fixed w-[100vw] h-[100vh]"
  class:_5={open}
  aria-label={closeLabel}
  onclick={closeMenu}
></button>

<div
  bind:this={menuElement}
  class="_1 w-[74vw] h-[100vh] fixed top-0 left-0"
  class:_2={open}
>
  <button class="_3 absolute top-4 right-4 w-40 h-40" aria-label={closeLabel} onclick={closeMenu}>
    <i class="icon-[fa--close]"></i>
  </button>

  <div class="grid gap-8 grid-cols-2 p-8 mt-54">
    {#each items as item (item.id)}
      <button
        class="_7"
        onclick={(event) => {
          event.stopPropagation();
          onSelect(item);
        }}
      >
        <div class="_8"></div>
        {#if item.icon}
          <div class="h-24 fs20 mt-[-4px]"><i class={item.icon}></i></div>
        {/if}
        <div class="flex items-center text-center grow-1">{item.name}</div>
      </button>
    {/each}
  </div>
</div>

<style>
  ._1 {
    background-color: white;
    opacity: 0;
    pointer-events: none;
    z-index: -1;
  }
  ._2 {
    opacity: 1;
    pointer-events: all;
    z-index: 210;
  }
  ._3 {
    border-radius: 50%;
    border: none;
    outline: none;
    background-color: rgb(255, 224, 224);
    color: rgb(187, 82, 82);
    font-size: 20px;
  }
  ._4 {
    background-color: rgba(15, 23, 42, 0);
    opacity: 0;
    transition: opacity 200ms ease-in-out;
    pointer-events: none;
    z-index: -2;
  }
  ._5 {
    opacity: 1;
    background-color: rgba(15, 23, 42, 0.5);
    pointer-events: all;
    z-index: 208;
  }
  ._7 {
    position: relative;
    background-color: rgb(243 242 249);
    min-height: 14vw;
    border-radius: 8px;
    padding: 0 6px 6px 6px;
    line-height: 1.1;
    text-align: center;
    color: #3b384b;
    margin-bottom: calc(1vw + 4px);
    box-shadow: rgb(189 190 210) 0 1px 2px;
    display: flex;
    align-items: center;
    flex-direction: column;
    border: none;
    cursor: pointer;
    font-size: inherit;
    width: 100%;
  }
  ._8 {
    background-color: rgb(243 242 249);
    position: absolute;
    height: 2.4rem;
    width: 3rem;
    border-radius: 50%;
    z-index: -1;
    top: -8px;
  }
</style>
