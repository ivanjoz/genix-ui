<script lang="ts" generics="T">
  import { useUI } from '../runtime/index.js';
  const ui = useUI();
import ColorPicker from 'svelte-awesome-color-picker';
import FieldShell from './FieldShell.svelte';

    import { untrack } from 'svelte';
    import { Agent } from '../agent/registry';

	let {
		saveOn = $bindable(),
		save,
		css,
		onChange,
    label
	}: {
    saveOn: T
		save?: keyof T
		css?: string
    label?: string
		onChange?: (newValue: string | number) => void
  } = $props();

  // Initialize with white color
  let currentColor = $state('#FFFFFF')
  let hasInit = false

  const setColor = (hexColor?: string) => {
    if(saveOn && save){
      saveOn[save] = hexColor as NonNullable<T>[keyof T]
    }
    if(hexColor) {
      currentColor = hexColor;
    }
  }

  $effect(() => {
    if(saveOn || save){
      console.log("change save on:",$state.snapshot(saveOn))
      untrack(() => {
        currentColor = (saveOn[save as keyof T] as string) || '#FFFFFF'
      })
      hasInit = true
    }
  })

  const componentID = ui.nextComponentId()

  $effect(() => {
    return Agent.register({
      id: componentID,
      type: "ColorPicker",
      label: label || "",
      setValue: (value: string | number) => {
        const hex = String(value || "")
        if (!hex) { return }
        setColor(hex)
        if (onChange) { onChange(hex) }
      },
    })
  })
</script>

<!-- Standard centred row, not autoHeight: the swatch is 28px and fits the 38px row, which
     keeps the picker on the same 51px footprint as every other field. -->
<FieldShell
  {label} {css}
  data-id="ColorPicker:{componentID}"
  data-value={currentColor}
>
  {#snippet children({ controlClass })}
    <!-- _1 must sit on an element authored here: Svelte scopes styles by the component
         that wrote the markup, not by where it lands in the DOM. -->
    <div class="_1 {controlClass} flex items-center justify-center">
      <ColorPicker isAlpha={false} textInputModes={[]}
        position="responsive"
        hex={currentColor}
        onInput={color => {
          if(!hasInit){ return }
          setColor(color.hex as string)
        }}
      />
    </div>
  {/snippet}
</FieldShell>

<style>
  ._1 {
    --slider-width: 24px;
  }
  ._1 :global(.color-picker .color) {
    border-radius: 0;
    height: calc(var(--input-height, 38px) - 16px);
    width: 54px;
    border: 2px solid rgba(0, 0, 0, 0.8);
    /* No margin-bottom: it used to compensate for the old chrome's off-centre row, and
       the shell's flex centring now does that job. */
  }

  ._1 :global(.color-picker label) {
    font-size: 0;
    line-height: 0;
  }

  ._1 :global(.color-picker label .container) {
    font-size: initial;
    line-height: initial;
  }

</style>
