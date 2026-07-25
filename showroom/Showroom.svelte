<script lang="ts">
  // Every visual component of @genix/ui, grouped into tabs, with a surface toggle so
  // contrast and borders can be audited on both white and light gray.
  //
  // This lives in the package, not in a route, so the catalogue ships with the components
  // it documents and cannot drift from them. The host supplies only the page shell — the
  // package itself depends on nothing from the app (no Page, no routing, no stores).
  import OptionsStrip from '../navigation/OptionsStrip.svelte';
  import SectionButtons from './SectionButtons.svelte';
  import SectionCharts from './SectionCharts.svelte';
  import SectionForm from './SectionForm.svelte';
  import SectionMisc from './SectionMisc.svelte';
  import SectionNavigation from './SectionNavigation.svelte';
  import SectionOverlays from './SectionOverlays.svelte';
  import SectionTables from './SectionTables.svelte';

  const {
    // Lets the host extend the surface flip to whatever container it owns — the app maps
    // it to Page.containerCss, so the whole page changes and not just this component's box.
    onSurfaceChange,
  }: { onSurfaceChange?: (surfaceCss: string) => void } = $props();

  // 1 = white surface, 2 = light gray surface.
  let surface = $state(1);
  let tab = $state(1);

  const surfaceCss = $derived(surface === 2 ? 'bg-gray-100' : 'bg-white');

  const surfaceOptions: [number, string][] = [[1, 'White|Blanco'], [2, 'Gray|Gris']];

  const tabOptions: [number, string][] = [
    [1, 'Form'],
    [2, 'Buttons & Cards'],
    [3, 'Navigation'],
    [4, 'Tables'],
    [5, 'Overlays'],
    [6, 'Charts'],
    [7, 'Misc'],
  ];
</script>

<!-- The class lands here as well as on the host's container, so the toggle still does
     something when this is dropped somewhere that has no page container to flip. -->
<div class={surfaceCss}>
  <div class="flex flex-wrap items-center gap-12 mb-12">
    <!-- 7 tabs exceed the 3-option guidance for Page header options, so the tab bar
         lives in the body. No useMobileGrid here: the strip only has grid-cols classes
         up to 5 options, and horizontal scroll handles the overflow on mobile. -->
    <OptionsStrip selected={tab} options={tabOptions}
      onSelect={(option) => { tab = option[0] as number; }} />
    <OptionsStrip css="ml-auto" selected={surface} options={surfaceOptions} useMobileGrid={true}
      onSelect={(option) => {
        surface = option[0] as number;
        onSurfaceChange?.(surface === 2 ? 'bg-gray-100' : 'bg-white');
      }} />
  </div>

  <!-- One {#if} per section so the heavy demos (5k-row tables, canvas charts, the
       RoosterJS editor) never mount until their tab is selected. -->
  {#if tab === 1}<SectionForm />{/if}
  {#if tab === 2}<SectionButtons />{/if}
  {#if tab === 3}<SectionNavigation />{/if}
  {#if tab === 4}<SectionTables />{/if}
  {#if tab === 5}<SectionOverlays />{/if}
  {#if tab === 6}<SectionCharts />{/if}
  {#if tab === 7}<SectionMisc />{/if}
</div>
