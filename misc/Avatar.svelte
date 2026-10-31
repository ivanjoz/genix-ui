<script lang="ts">
  import { ifcss } from '../utilities/css.js';
  import { avatarColorCss, avatarInitials } from './avatar.js';

  // A person's circle: the initials of `name` over a color fixed by `colorSeed` (usually the
  // user ID), so a person looks the same everywhere. Without a seed it is gray and shows `icon`.
  let {
    name,
    colorSeed = 0,
    size = 26,
    icon = 'icon-[fa--user]',
    colorCss = '',
    css = '',
  }: {
    name: string;
    colorSeed?: number;
    // Diameter in px.
    size?: number;
    icon?: string;
    // Replaces the seed's color, when the color means something else (a role).
    colorCss?: string;
    css?: string;
  } = $props();
</script>

<span class={ifcss(css, `inline-flex shrink-0 items-center justify-center rounded-full text-[14px] ff-bold leading-none select-none ${colorCss || avatarColorCss(colorSeed)}`)}
  style:width="{size}px" style:height="{size}px" title={name}>
  {#if colorSeed}{avatarInitials(name)}{:else}<i class={icon}></i>{/if}
</span>
