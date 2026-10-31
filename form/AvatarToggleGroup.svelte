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

<!-- Jira-style stack: the avatars overlap by 4px, each with a surface-colored border so the edges read.
  The hovered one grows and rises above its neighbors; a selected one keeps an accent border on top of the stack.
  The group sits at z-40 so the hover tooltip covers what is below it (e.g. the Gantt's z-30 sticky header). -->
<div class="relative z-40 flex items-center px-6 py-4 rounded-[18px] bg-surface {css}" role="group" aria-label={ui.translate(label)}>
  {#each options as option (option.id)}
    {@const isSelected = selected.includes(option.id)}
    <!-- The name shows under the avatar on hover, CSS only: a black box with a triangle pointing up at it. -->
    <span class="group relative flex not-first:-ml-4 hover:z-10 {isSelected ? 'z-[1]' : ''}">
      <Button name={option.id ? avatarInitials(option.name) : undefined} icon={option.id ? undefined : icon}
        label={optionLabel(option.name)} onClick={() => toggleOption(option.id)}
        css="w-32 h-32 rounded-full border-2 flex items-center justify-center text-[14px] ff-bold cursor-pointer transition-transform group-hover:scale-125
          {avatarColorCss(option.id)} {isSelected ? 'border-accent-solid' : 'border-surface'}" />
      <span class="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity pointer-events-none
        absolute top-full left-1/2 -translate-x-1/2 mt-2 z-20 whitespace-nowrap rounded px-8 py-4 bg-black text-white text-[14px] font-normal
        before:content-[''] before:absolute before:bottom-full before:left-1/2 before:-translate-x-1/2
        before:border-6 before:border-transparent before:border-b-black">{option.name}</span>
    </span>
  {/each}
</div>
