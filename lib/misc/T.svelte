<script lang="ts">
  import { getUiRuntime } from '../runtime/index.js';
  const ui = getUiRuntime();

  interface TProps {
    text: string
    css?: string
  }

  let { text = '', css }: TProps = $props()

  // text can contain a "|" pipe separator: [0] = English, [1] = Spanish.
  // The injected translator owns language selection and its reactivity.
  const content = $derived(ui.translate(text))
</script>

<span class={css}>{content}</span>
