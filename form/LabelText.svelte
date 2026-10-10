<script lang="ts">
  import T from '../misc/T.svelte'

  interface LabelTextProps {
    label: string
    text: string | number
    css?: string
    contentCss?: string
  }

  let {
    label,
    text,
    css = '',
    contentCss = '',
  }: LabelTextProps = $props()
</script>

<div class={css}>
  <div class="text-fg-muted text-sm leading-[1.15]"><T text={label} /></div>
  <div class={contentCss}>{text}</div>
</div>
