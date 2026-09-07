<script lang="ts">
  import type { Snippet } from 'svelte'
  import T from '../misc/T.svelte'

  interface LabelCellProps {
    label: string
    value?: string | number
    css?: string
    /** Defaults to the emphasised figure the stat blocks use; pass plain sizing for a text field. */
    valueCss?: string
    /** Shown in place of `value` when it is empty, so a cell never collapses to its label. */
    emptyText?: string
    /** Composite values (a ratio, a badge) that `value` cannot express. */
    children?: Snippet
  }

  let {
    label,
    value,
    css = '',
    valueCss = 'h3 ff-bold',
    emptyText = '—',
    children,
  }: LabelCellProps = $props()

  const hasValue = $derived(value !== undefined && value !== null && String(value).length > 0)
</script>

<div class={css}>
  <div class="text-[15px] leading-[16px] _label"><T text={label} /></div>
  <div class={valueCss}>
    {#if children}
      {@render children()}
    {:else}
      {hasValue ? value : emptyText}
    {/if}
  </div>
</div>

<style>
  /* The same token the notched field label uses, so a read-only cell reads as one of the fields. */
  ._label {
    color: var(--input-label-color, #6d5dad);
  }
</style>
