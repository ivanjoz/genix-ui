<script lang="ts">
  import angleSvg from '../assets/angle.svg?raw';
  import Button from './Button.svelte';
  import T from '../misc/T.svelte';

  interface ActionItem {
    id: number;
    name: string;
    label?: string;
    icon: string;
    handler: () => void;
  }

  let {
    name = '',
    icon = '',
    css = '',
    items = [],
  }: {
    name?: string;
    icon?: string;
    css?: string;
    items: ActionItem[];
  } = $props();
</script>

<div class="bl-wrapper">
  <button class="bx-purple {css}" type="button">
    {#if icon}<i class="{icon}{name ? ' bl-icon-lead' : ''}"></i>{/if}
    {#if name}<span><T text={name} /></span>{/if}
  </button>

  <!-- Dropdown: hidden by default, shown on parent hover via CSS -->
  <div class="bl-dropdown">
    <div class="bl-angle">
      <!-- Inline, not an <img>: the arrow fills with var(--surface) and follows dark mode. -->
      <span class="bl-angle-img">{@html angleSvg}</span>
    </div>
    <div class="bl-content">
      {#each items as item (item.id)}
        <Button name={item.name} icon={item.icon} label={item.label} css="bl-item" onClick={item.handler} />
      {/each}
    </div>
  </div>
</div>

<style>
  .bl-wrapper {
    position: relative;
    display: inline-block;
  }

  /* Match Button's icon/label spacing on this component's own trigger markup. */
  .bl-icon-lead { margin-right: 7px; }

  .bl-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 360;
    min-width: 160px;
    background-color: var(--layer-bg);
    border-radius: 8px;
    outline: 4px solid color-mix(in srgb, var(--line-strong) 60%, transparent);
    border: 1px solid var(--line-strong);
    box-shadow: var(--layer-shadow);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translateY(-4px);
    transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
  }

  /* Invisible bridge filling the gap so hover doesn't break when moving to the dropdown */
  .bl-wrapper::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    height: 6px;
  }

  /* Show dropdown when hovering over the wrapper (button, gap bridge, or dropdown itself) */
  .bl-wrapper:hover .bl-dropdown {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transform: translateY(0);
  }

  /* Triangle pointer aligned to the right of the dropdown (above the button) */
  .bl-angle {
    position: absolute;
    top: -18px;
    right: 10px;
    overflow: hidden;
    height: 18px;
    width: 24px;
    display: flex;
    justify-content: center;
    z-index: 361;
  }

  .bl-angle-img {
    display: block;
    width: 24px;
    height: 24px;
    margin-top: 2px;
    filter: drop-shadow(0 -1px 1px rgba(0, 0, 0, 0.05));
  }

  .bl-content {
    padding: 4px 0;
  }

  /* The items are child <Button> components, so their class must escape Svelte's scoping. */
  .bl-content :global(.bl-item) {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 14px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    color: inherit;
    white-space: nowrap;
  }

  .bl-content :global(.bl-item:hover) {
    background-color: var(--accent-bg);
  }
</style>
