<script lang="ts">
  import { useUI } from '../runtime/index.js';
  import Button from '../buttons/Button.svelte';
  import Input from '../form/Input.svelte';
  import Layer from '../layers/Layer.svelte';
  import LayerStatic from '../layers/LayerStatic.svelte';
  import MobileLayerVertical from '../layers/MobileLayerVertical.svelte';
  import Modal from '../layers/Modal.svelte';
  import Popover from '../misc/Popover.svelte';
  import TableGrid from '../vTable/TableGrid.svelte';
  // Popover renders unstyled by design; this opt-in stylesheet supplies the bubble look.
  import '../misc/popover.css';
  import ShowroomBlock from './ShowroomBlock.svelte';
  import { buildShowroomUsers, buildUserColumns, type IShowroomUser } from './showroom-data';

  const ui = useUI();
  const userColumns = buildUserColumns(ui.translate);

  const SIDE_LAYER_ID = 1;
  const MODAL_ID = 11;

  const rows = buildShowroomUsers(400);

  let form = $state({} as IShowroomUser);
  let layerView = $state(1);
  let modalNote = $state({ Text: '' });
  let isPopoverOpen = $state(false);
  let isBottomSheetOpen = $state(false);
  let popoverAnchor = $state<HTMLElement | null>(null);
  let lastLayerAction = $state('—');

  // Excluded from this tab: TopLayerSelector and TopLayerDatePicker — both are
  // mount-once singletons living in the root layout, driven implicitly by mobile
  // SearchSelect / DateInput rather than by props.
</script>

<ShowroomBlock name="Layer type=&quot;side&quot; + type=&quot;content&quot;"
  note="the table is wrapped in a content layer, so it shrinks when the side panel opens">
  <Button name="Open side layer|Abrir panel" color="green" icon="icon-[fa--plus]" css="mb-8"
    onClick={() => { form = { ...rows[0] }; ui.openSideLayer(SIDE_LAYER_ID); }} />

  <Layer type="content">
    <TableGrid columns={userColumns} data={rows} height="300px" rowHeight={34}
      getRowId={(user) => user.ID}
      selectedRowId={form?.ID}
      onRowClick={(user) => { form = { ...user }; ui.openSideLayer(SIDE_LAYER_ID); }} />
  </Layer>

  <div class="text-xs text-gray-500 mt-8">last layer action: {lastLayerAction}</div>
</ShowroomBlock>

<ShowroomBlock name="LayerStatic" note="permanent companion column on desktop · bottom drawer on mobile">
  <div class="flex gap-20 h-320">
    <div class="flex-1 min-w-0 border border-gray-200 rounded-md p-12">
      <div class="text-sm text-gray-600">
        Main working surface. The panel on the right is always present — it is not an
        overlay and has no open/close animation.
      </div>
    </div>

    <!-- Sized by the host: useMobileLayerVertical turns it into a bottom drawer with a
         124px peek under 740px (deviceType 3). Height is bounded here so it stays
         inside the block. -->
    <LayerStatic css="w-[38%] min-w-260 h-full bg-white border border-gray-200 rounded-md p-12"
      mobileLayerTitle="Detail|Detalle" useMobileLayerVertical={124}>
      <div class="text-sm font-semibold text-gray-700 mb-8">Detail|Detalle</div>
      <div class="text-xs text-gray-500">Cart, totals, or any live working surface.</div>
    </LayerStatic>
  </div>
</ShowroomBlock>

<ShowroomBlock name="Modal" note="centered dialog · size 1 (~600px) to 9 (~1000px)">
  <Button name="Open modal|Abrir modal" color="blue" icon="icon-[fa--upload]"
    onClick={() => ui.openModal(MODAL_ID)} />
</ShowroomBlock>

<ShowroomBlock name="Popover" note="portals to body, so it escapes clipped / overflow-hidden ancestors">
  <div class="overflow-hidden h-60 border border-gray-200 rounded-md p-12">
    <!-- The anchor sits inside an overflow-hidden box on purpose: the popover still
         renders fully because it is portalled out of this subtree. -->
    <div bind:this={popoverAnchor} class="inline-block">
      <Button name="Toggle popover" color="purple" icon="icon-[fa--info-circle]"
        onClick={() => { isPopoverOpen = !isPopoverOpen; }} />
    </div>
  </div>

  <Popover referenceElement={popoverAnchor} open={isPopoverOpen} placement="bottom"
    class="popover-container">
    <div class="popover-content">
      Positioned against the button and rendered into document.body.
    </div>
  </Popover>
</ShowroomBlock>

<ShowroomBlock name="MobileLayerVertical" note="collapsible bottom sheet — mainly a mobile surface">
  <Button name={isBottomSheetOpen ? 'Collapse sheet|Colapsar' : 'Expand sheet|Expandir'}
    color="orange" icon="icon-[fa--angle-up]"
    onClick={() => { isBottomSheetOpen = !isBottomSheetOpen; }} />

  <MobileLayerVertical title="Bottom sheet|Panel inferior" show={isBottomSheetOpen}
    closedHeightPx={64} onToggle={(nextState) => { isBottomSheetOpen = nextState; }}>
    <div class="p-12 text-sm text-gray-600">
      Sheet body. Collapsed it keeps a 64px peek visible.
    </div>
  </MobileLayerVertical>
</ShowroomBlock>

<!-- Side layer: Save / Delete / Close buttons are rendered by the component itself, so
     the body never declares its own save button. -->
<Layer type="side" id={SIDE_LAYER_ID} sideLayerSize={640}
  title={form?.Name || 'New record|Nuevo registro'}
  titleCss="h2 mb-6"
  bind:selected={layerView}
  options={[[1, 'Information|Información'], [2, 'Detail|Detalle']]}
  onSave={() => { lastLayerAction = `saved ${form.Code}`; ui.openSideLayer(0); }}
  onDelete={() => { lastLayerAction = `deleted ${form.Code}`; ui.openSideLayer(0); }}
  onClose={() => { form = {} as IShowroomUser; }}
>
  {#if layerView === 1}
    <div class="grid grid-cols-24 gap-10 mt-12">
      <Input saveOn={form} save="Name" label="Name|Nombre" required css="col-span-24 md:col-span-12" />
      <Input saveOn={form} save="Code" label="Code|Código" css="col-span-24 md:col-span-12" />
      <Input saveOn={form} save="Version" label="Version|Versión" type="number" baseDecimals={2}
        css="col-span-12 md:col-span-6" />
    </div>
  {/if}
  {#if layerView === 2}
    <div class="mt-12 text-sm text-gray-600">{form?.Bio || '—'}</div>
  {/if}
</Layer>

<Modal id={MODAL_ID} title="Import records|Importar registros" size={9}
  saveButtonLabel="Import|Importar" saveIcon="icon-[fa--upload]"
  onSave={() => { lastLayerAction = `imported: ${modalNote.Text}`; ui.closeModal(MODAL_ID); }}
>
  <div class="grid grid-cols-24 gap-10">
    <Input saveOn={modalNote} save="Text" label="Note|Nota" css="col-span-24 md:col-span-12" />
  </div>
</Modal>
