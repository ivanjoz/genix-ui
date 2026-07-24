<script lang="ts">
  import { highlString } from '../utilities/ui.js'

  interface HighlightTextProps {
    text: string
    words: string[]
  }

  let {
    text = '',
    words = [],
  }: HighlightTextProps = $props()
</script>

{#each highlString(text, words) as textPart}
  <span class:ff-bold={textPart.highl} class:c-red={textPart.highl}>{textPart.text}</span>
{/each}
