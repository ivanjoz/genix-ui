<script lang="ts">
  import Button from '../buttons/Button.svelte';
  import { useUI } from '../runtime/index.js';
  import { avatarColorCss, avatarInitials } from '../misc/avatar.js';
  const ui = useUI();

  // A people filter drawn as avatars: clicking one toggles it, several can be chosen. Each option's
  // `id` is also its avatar's color seed; id 0 (e.g. "Unassigned") is a gray circle with `icon`.
  // What "none chosen" means (usually: everyone) is the consumer's rule.
  let {
    options,
    selected = $bindable([]),
    label = 'Filter by person|Filtrar por persona',
    // The aria-label of each avatar's button, from the person's name.
    optionLabel = (name: string) => `Show only ${name}|Mostrar solo a ${name}`,
    icon = 'icon-[fa--user]',
    css = '',
  }: {
    options: { id: number; name: string }[];
    selected?: number[];
    label?: string;
    optionLabel?: (name: string) => string;
    icon?: string;
    css?: string;
  } = $props();

  const toggleOption = (optionID: number) => {
    selected = selected.includes(optionID) ? selected.filter((selectedID) => selectedID !== optionID) : [...selected, optionID];
  };
</script>

<div class="flex items-center gap-4 {css}" role="group" aria-label={ui.translate(label)}>
  {#each options as option (option.id)}
    {@const isSelected = selected.includes(option.id)}
    <!-- The name shows under the avatar on hover, CSS only: a black box with a triangle pointing up at it. -->
    <span class="group relative flex">
      <Button name={option.id ? avatarInitials(option.name) : undefined} icon={option.id ? undefined : icon}
        label={optionLabel(option.name)} onClick={() => toggleOption(option.id)}
        css="w-30 h-30 rounded-full flex items-center justify-center text-[14px] ff-bold cursor-pointer outline-2 outline-offset-1 outline-transparent hover:outline-black/35 transition-[outline-color]
          {avatarColorCss(option.id)} {isSelected ? 'ring-2 ring-accent-solid ring-offset-2 ring-offset-surface' : ''}" />
      <span class="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity pointer-events-none
        absolute top-full left-1/2 -translate-x-1/2 mt-8 z-20 whitespace-nowrap rounded px-8 py-4 bg-black text-white text-[14px] font-normal
        before:content-[''] before:absolute before:bottom-full before:left-1/2 before:-translate-x-1/2
        before:border-6 before:border-transparent before:border-b-black">{option.name}</span>
    </span>
  {/each}
</div>
