<script lang="ts">
  import Button from '../buttons/Button.svelte';
  import ButtonLayer from '../buttons/ButtonLayer.svelte';
  import ButtonList from '../buttons/ButtonList.svelte';
  import InlineButton from '../buttons/InlineButton.svelte';
  import Card from '../cards/Card.svelte';
  import SearchCard from '../cards/SearchCard.svelte';
  import SearchDualCard from '../cards/SearchDualCard.svelte';
  import Input from '../form/Input.svelte';
  import ShowroomBlock from './ShowroomBlock.svelte';
  import { languageOptions, statusOptions } from './showroom-data';

  let lastAction = $state('—');
  let isFilterPanelOpen = $state(false);

  // SearchCard / SearchDualCard write id arrays into these fields.
  let selection = $state({
    LanguageIDs: [] as number[],
    LeftIDs: [] as number[],
    RightIDs: [] as number[],
    FilterText: '',
  });

  const buttonColors = ['blue', 'green', 'red', 'orange', 'yellow', 'purple'] as const;

  const listActions = [
    { id: 1, name: 'Export|Exportar', icon: 'icon-[fa--file-excel-o]', handler: () => { lastAction = 'Export'; } },
    { id: 2, name: 'Duplicate|Duplicar', icon: 'icon-[fa--copy]', handler: () => { lastAction = 'Duplicate'; } },
    { id: 3, name: 'Archive|Archivar', icon: 'icon-[fa--archive]', handler: () => { lastAction = 'Archive'; } },
  ];
</script>

<ShowroomBlock name="Button" note="6 color variants — all render on white and gray">
  <div class="flex flex-wrap items-center gap-8">
    {#each buttonColors as color}
      <Button name={color} color={color} icon="icon-[fa--check]"
        onClick={() => { lastAction = `Button ${color}`; }} />
    {/each}
  </div>
</ShowroomBlock>

<ShowroomBlock name="Button variants" note="icon-only · useCircle · disabled · hideNameOnMobile">
  <div class="flex flex-wrap items-center gap-8">
    <Button icon="icon-[fa--floppy-o]" color="blue" onClick={() => { lastAction = 'Icon only'; }} />
    <Button icon="icon-[fa--plus]" color="green" useCircle
      onClick={() => { lastAction = 'Circle'; }} />
    <Button icon="icon-[fa--trash]" color="red" useCircle
      onClick={() => { lastAction = 'Circle delete'; }} />
    <Button name="Disabled" color="blue" icon="icon-[fa--ban]" disabled onClick={() => {}} />
    <Button name="Hidden on mobile|Oculto en móvil" color="purple" icon="icon-[fa--mobile]"
      hideNameOnMobile onClick={() => { lastAction = 'hideNameOnMobile'; }} />
  </div>
</ShowroomBlock>

<ShowroomBlock name="Button — iconRight" note="icon after the label · leading + trailing together · icon-only pair">
  <div class="flex flex-wrap items-center gap-8">
    <Button name="Next|Siguiente" color="blue" iconRight="icon-[fa--arrow-right]"
      onClick={() => { lastAction = 'iconRight next'; }} />
    <Button name="Open in tab|Abrir en pestaña" color="green" iconRight="icon-[fa--external-link]"
      onClick={() => { lastAction = 'iconRight external'; }} />
    <!-- Both slots at once: a leading meaning icon plus a trailing affordance. -->
    <Button name="Sort|Ordenar" color="purple" icon="icon-[fa--sort]"
      iconRight="icon-[fa--angle-down]" onClick={() => { lastAction = 'both icons'; }} />
    <Button name="Records|Registros" color="orange" icon="icon-[fa--database]"
      iconRight="icon-[fa--angle-right]" onClick={() => { lastAction = 'both icons 2'; }} />
    <!-- Without a label neither margin applies, so icon-only geometry is untouched. -->
    <Button icon="icon-[fa--arrow-left]" color="blue" onClick={() => { lastAction = 'icon only'; }} />
  </div>
</ShowroomBlock>

<ShowroomBlock name="InlineButton" note="chip-like: default / checked, blue / green">
  <div class="flex flex-wrap items-center gap-8">
    <InlineButton label="Default green" />
    <InlineButton label="Checked green" mode="checked" />
    <InlineButton label="Default blue" color="blue" />
    <InlineButton label="Checked blue" mode="checked" color="blue" />
  </div>
</ShowroomBlock>

<ShowroomBlock name="ButtonLayer · ButtonList" note="anchored panel (bindable isOpen) · action menu">
  <div class="flex flex-wrap items-start gap-20">
    <ButtonLayer buttonText="Filters|Filtros" icon="icon-[fa--filter]"
      iconOnShow="icon-[fa--times]" bind:isOpen={isFilterPanelOpen}>
      <div class="p-12 w-260">
        <Input saveOn={selection} save="FilterText" label="Contains|Contiene" css="w-full" />
        <div class="text-xs text-gray-500 mt-8">Panel is open: {isFilterPanelOpen}</div>
      </div>
    </ButtonLayer>

    <ButtonList name="Actions|Acciones" icon="icon-[fa--bars]" items={listActions} />
  </div>
</ShowroomBlock>

<ShowroomBlock name="Card" note="clickable surface — use instead of a div with onclick">
  <div class="flex flex-wrap gap-10">
    {#each statusOptions as status}
      <Card id={status.ID} label={status.Name} css="w-200 p-12"
        onClick={() => { lastAction = `Card ${status.ID}`; }}>
        <div class="text-sm font-semibold text-gray-700">{status.Name}</div>
        <div class="text-xs text-gray-500">Clickable card surface</div>
      </Card>
    {/each}
  </div>
</ShowroomBlock>

<ShowroomBlock name="SearchCard" note="multi-select search rendering each pick as a card">
  <SearchCard saveOn={selection} save="LanguageIDs" label="Languages|Idiomas"
    options={languageOptions} keyId="ID" keyName="Name" css="max-w-520" />
</ShowroomBlock>

<ShowroomBlock name="SearchDualCard" note="two linked searches producing paired selections">
  <SearchDualCard saveOn={selection} saveLeft="LeftIDs" saveRight="RightIDs" css="max-w-720"
    leftOptions={languageOptions} leftKeyId="ID" leftKeyName="Name" leftLabel="Language|Idioma"
    rightOptions={statusOptions} rightKeyId="ID" rightKeyName="Name" rightLabel="Status|Estado" />
</ShowroomBlock>

<ShowroomBlock name="Live state" note="last click + current selections">
  <pre class="text-xs text-gray-600 overflow-x-auto">{JSON.stringify({ lastAction, ...selection }, null, 2)}</pre>
</ShowroomBlock>
