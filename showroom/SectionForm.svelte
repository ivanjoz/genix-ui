<script lang="ts">
  import Checkbox from '../form/Checkbox.svelte';
  import CheckboxOptions from '../form/CheckboxOptions.svelte';
  import ColorPicker from '../form/ColorPicker.svelte';
  import DateInput from '../form/DateInput.svelte';
  import FilterInput from '../form/FilterInput.svelte';
  import Input from '../form/Input.svelte';
  import LabelText from '../form/LabelText.svelte';
  import LoginForm from '../form/LoginForm.svelte';
  import SearchSelect from '../form/SearchSelect.svelte';
  import ShowroomBlock from './ShowroomBlock.svelte';
  import { languageOptions, statusOptions } from './showroom-data';

  // One shared form object: every control writes into it through saveOn + save, and the
  // JSON readout at the bottom is the proof that the writes land where expected.
  let form = $state({
    Name: 'Genix',
    Email: '',
    Password: '',
    Quantity: 12,
    Price: 1234.5,
    Notes: 'Multi-line notes go here.',
    LanguageID: 1,
    StatusID: 2,
    IsActive: true,
    IsVisible: 1,
    LanguageIDs: [] as number[],
    DateUnix: 0,
    DateSunix: 0,
    Color: '#4874f5',
  });

  let filterText = $state('');

  // Excluded from this tab: nothing. All form/ controls are backend-free.
</script>

<!-- Every control in this tab draws its chrome with FieldShell: one masked layer for the
     border and the focus ring, notch sized from the label's measured width. -->
<ShowroomBlock name="Input"
  note="text · number with baseDecimals · password · textarea · validator · disabled — error appears on the border only after you leave the field, ✔ as soon as it is valid">
  <div class="grid grid-cols-24 gap-10">
    <Input saveOn={form} save="Name" label="Name|Nombre" css="col-span-24 md:col-span-8" required />
    <Input saveOn={form} save="Quantity" label="Quantity|Cantidad" type="number"
      css="col-span-12 md:col-span-4" />
    <Input saveOn={form} save="Price" label="Price|Precio" type="number" baseDecimals={2}
      postValue="USD" css="col-span-12 md:col-span-4" />
    <Input saveOn={form} save="Password" label="Password|Contraseña" type="password"
      css="col-span-24 md:col-span-8" />
    <!-- validator gets the raw value and drives the invalid state on blur. -->
    <Input saveOn={form} save="Email" label="Email (validated)|Email (validado)" required
      validator={(value) => String(value).includes('@')}
      css="col-span-24 md:col-span-8" />
    <Input saveOn={form} save="Name" label="Disabled|Deshabilitado" disabled
      css="col-span-24 md:col-span-8" />
    <!-- transform runs on every keystroke: uppercase here. -->
    <Input saveOn={form} save="Name" label="Uppercase transform" css="col-span-24 md:col-span-8"
      transform={(value) => String(value).toUpperCase()} />
    <Input saveOn={form} save="Notes" label="Notes|Notas" useTextArea rows={3}
      css="col-span-24" />
  </div>
</ShowroomBlock>

<ShowroomBlock name="SearchSelect" note="plain · with icon · clearOnSelect · disabled">
  <div class="grid grid-cols-24 gap-10">
    <SearchSelect saveOn={form} save="LanguageID" label="Language|Idioma"
      options={languageOptions} keyId="ID" keyName="Name" css="col-span-24 md:col-span-8" />
    <SearchSelect saveOn={form} save="StatusID" label="Status|Estado" icon="icon-[fa--filter]"
      options={statusOptions} keyId="ID" keyName="Name" css="col-span-24 md:col-span-8" />
    <SearchSelect saveOn={form} save="LanguageID" label="Disabled|Deshabilitado" disabled
      options={languageOptions} keyId="ID" keyName="Name" css="col-span-24 md:col-span-8" />
  </div>
  <div class="text-xs text-gray-500 mt-8">
    On mobile widths this delegates to the TopLayerSelector singleton mounted in the root layout.
  </div>
</ShowroomBlock>

<ShowroomBlock name="Checkbox / CheckboxOptions" note="boolean · useNumber · single · multiple · useButtons · useButtonsSlim">
  <div class="flex flex-wrap items-start gap-20">
    <Checkbox saveOn={form} save="IsActive" label="Active (boolean)|Activo (boolean)" />
    <Checkbox saveOn={form} save="IsVisible" label="Visible (0 | 1)" useNumber />
  </div>
  <div class="mt-12">
    <div class="text-xs text-gray-500 mb-4">type="single" — writes one id into StatusID</div>
    <CheckboxOptions saveOn={form} save="StatusID" type="single"
      options={statusOptions} keyId="ID" keyName="Name" />
  </div>
  <div class="mt-12">
    <div class="text-xs text-gray-500 mb-4">type="multiple" + useButtons — writes an id array</div>
    <CheckboxOptions saveOn={form} save="LanguageIDs" type="multiple" useButtons
      options={languageOptions} keyId="ID" keyName="Name" />
  </div>
  <div class="mt-12">
    <div class="text-xs text-gray-500 mb-4">type="single" + useButtonsSlim — compact blue segmented control</div>
    <CheckboxOptions saveOn={form} save="StatusID" type="single" useButtonsSlim
      options={statusOptions} keyId="ID" keyName="Name" />
  </div>
</ShowroomBlock>

<ShowroomBlock name="DateInput" note="type=unix with usePopover · type=sunix inline">
  <div class="grid grid-cols-24 gap-10">
    <!-- usePopover portals the calendar to body so it escapes clipped ancestors. -->
    <DateInput saveOn={form} save="DateUnix" label="Unix day + popover" type="unix" usePopover
      css="col-span-24 md:col-span-8" />
    <DateInput saveOn={form} save="DateSunix" label="SUnix time|Fecha SUnix" type="sunix"
      css="col-span-24 md:col-span-8" />
  </div>
</ShowroomBlock>

<ShowroomBlock name="FilterInput · ColorPicker · LabelText" note="throttled search · color value · read-only pair">
  <div class="grid grid-cols-24 gap-10 items-end">
    <FilterInput bind:value={filterText} css="col-span-24 md:col-span-8"
      placeholder="Filter…|Filtrar…" throttle={200} />
    <ColorPicker saveOn={form} save="Color" label="Color" css="col-span-24 md:col-span-6" />
    <LabelText label="Filter value|Valor del filtro" text={filterText || '—'}
      css="col-span-24 md:col-span-6" />
  </div>
</ShowroomBlock>

<ShowroomBlock name="LoginForm" note="layout skeleton only — it owns no submit logic">
  <div class="max-w-420">
    <LoginForm />
  </div>
</ShowroomBlock>

<ShowroomBlock name="Live form state" note="every control above writes into this object">
  <pre class="text-xs text-gray-600 overflow-x-auto">{JSON.stringify(form, null, 2)}</pre>
</ShowroomBlock>
