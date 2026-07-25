<script lang="ts">
  import KeyValueStrip from '../misc/KeyValueStrip.svelte';
  import ArrowSteps from '../navigation/ArrowSteps.svelte';
  import OptionsStrip from '../navigation/OptionsStrip.svelte';
  import ShowroomBlock from './ShowroomBlock.svelte';
  import { statusOptions } from './showroom-data';

  let tupleSelected = $state(1);
  let recordSelected = $state(2);
  let twoLineSelected = $state(1);
  let stepSelected = $state(2);

  // [id, label] tuples — the format used by most pages.
  const tupleOptions: [number, string][] = [
    [1, 'Products|Productos'],
    [2, 'Categories|Categorías'],
    [3, 'Brands|Marcas'],
  ];

  // [id, label, [mobileLine1, mobileLine2]] — the third entry only renders on mobile
  // (deviceType === 3), where long labels would otherwise overflow the tab.
  const twoLineOptions: [number, string, string[]?][] = [
    [1, 'Warehouse movements', ['Warehouse', 'movements']],
    [2, 'Purchase orders', ['Purchase', 'orders']],
    [3, 'Shipping costs', ['Shipping', 'costs']],
  ];

  const steps = [
    { id: 1, name: 'Draft|Borrador', icon: 'icon-[fa--pencil]' },
    { id: 2, name: 'Confirmed|Confirmado', icon: 'icon-[fa--check]' },
    { id: 3, name: 'Shipped|Enviado', icon: 'icon-[fa--truck]' },
    { id: 4, name: 'Closed|Cerrado', icon: 'icon-[fa--lock]' },
  ];

  // Excluded from this tab: SideMenu and MobileMenu — the app shell already renders
  // both around this page, so a second instance would fight it for state.
</script>

<ShowroomBlock name="OptionsStrip" note="[id, label] tuples — the standard sub-view switcher">
  <OptionsStrip selected={tupleSelected} options={tupleOptions}
    onSelect={(option) => { tupleSelected = option[0] as number; }} />
  <div class="text-xs text-gray-500 mt-8">selected = {tupleSelected}</div>
</ShowroomBlock>

<ShowroomBlock name="OptionsStrip — record options" note="keyId + keyName over ID / Name records">
  <OptionsStrip selected={recordSelected} options={statusOptions} keyId="ID" keyName="Name"
    onSelect={(option) => { recordSelected = option.ID; }} />
  <div class="text-xs text-gray-500 mt-8">selected = {recordSelected}</div>
</ShowroomBlock>

<ShowroomBlock name="OptionsStrip — useMobileGrid + two-line labels"
  note="narrow the window under 740px (deviceType 3) to see the grid and the split labels">
  <OptionsStrip selected={twoLineSelected} options={twoLineOptions} useMobileGrid={true}
    onSelect={(option) => { twoLineSelected = option[0] as number; }} />
</ShowroomBlock>

<ShowroomBlock name="ArrowSteps" note="chevron stage picker with an explicit columnsTemplate">
  <ArrowSteps options={steps} selected={stepSelected} columnsTemplate="1fr 1fr 1fr 1fr"
    onSelect={(step) => { stepSelected = step.id; }} />
  <div class="text-xs text-gray-500 mt-8">
    selected = {stepSelected} ({steps.find((step) => step.id === stepSelected)?.name})
  </div>
</ShowroomBlock>

<ShowroomBlock name="KeyValueStrip" note="up to 10 label/value pairs · getContent formats a value">
  <KeyValueStrip
    label1="Orders|Pedidos" value1={128}
    label2="Total|Total" value2={45231.4} getContent2={(value) => `S/ ${Number(value).toFixed(2)}`}
    label3="Pending|Pendiente" value3={12}
    label4="Customer|Cliente" value4="Adeel Solangi"
    label5="Status|Estado" value5="Confirmed" />
</ShowroomBlock>
