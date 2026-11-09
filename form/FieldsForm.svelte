<script lang="ts">
  import Checkbox from './Checkbox.svelte'
  import CheckboxOptions from './CheckboxOptions.svelte'
  import DateInput from './DateInput.svelte'
  import Input from './Input.svelte'
  import SearchSelect from './SearchSelect.svelte'
  import SelectBox from './SelectBox.svelte'
  import { FIELD_TYPE, type IFormField } from './fields-form'

  // Renders a form from an array of field definitions. Generic: it knows nothing of what the
  // fields mean. Every input writes its value straight into `values[field.key]`.
  let { fields, values = $bindable(), onchange, css = '' }: {
    fields: IFormField[]
    values: Record<string, any>
    onchange?: () => void
    css?: string
  } = $props()

  // Short option lists get a button select; long ones (users, many options) get a searchable one.
  const SELECT_BOX_MAX_OPTIONS = 8
</script>

<div class="grid grid-cols-24 gap-10 {css}" aria-label="Dynamic fields form">
  {#each fields as field (field.key)}
    {#if field.type === FIELD_TYPE.text}
      <Input bind:saveOn={values} save={field.key} label={field.label} required={field.required} css="col-span-24 md:col-span-12" onChange={onchange} />
    {:else if field.type === FIELD_TYPE.longText}
      <Input bind:saveOn={values} save={field.key} label={field.label} required={field.required} rows={4} css="col-span-24" onChange={onchange} />
    {:else if field.type === FIELD_TYPE.integer}
      <Input bind:saveOn={values} save={field.key} type="number" label={field.label} required={field.required} css="col-span-24 md:col-span-12" onChange={onchange} />
    {:else if field.type === FIELD_TYPE.decimal || field.type === FIELD_TYPE.money}
      <Input bind:saveOn={values} save={field.key} type="number" baseDecimals={2} label={field.label} required={field.required} css="col-span-24 md:col-span-12" onChange={onchange} />
    {:else if field.type === FIELD_TYPE.date}
      <DateInput bind:saveOn={values} save={field.key} label={field.label} required={field.required} css="col-span-24 md:col-span-12" onChange={onchange} />
    {:else if field.type === FIELD_TYPE.select && (field.options?.length ?? 0) <= SELECT_BOX_MAX_OPTIONS}
      <SelectBox saveOn={values} save={field.key} label={field.label} options={field.options ?? []} keyId="id" keyName="name"
        clearable={!field.required} css="col-span-24 md:col-span-12" onChange={onchange} />
    {:else if field.type === FIELD_TYPE.select || field.type === FIELD_TYPE.search}
      <SearchSelect bind:saveOn={values} save={field.key} label={field.label} required={field.required} options={field.options ?? []}
        keyId="id" keyName="name" css="col-span-24 md:col-span-12" onChange={onchange} />
    {:else if field.type === FIELD_TYPE.multiSelect}
      <div class="col-span-24 flex flex-col gap-4">
        <div class="text-gray-600">{field.label}</div>
        <CheckboxOptions type="multiple" bind:saveOn={values} save={field.key} options={field.options ?? []} keyId="id" keyName="name"
          useButtonsSlim={true} onChange={onchange} />
      </div>
    {:else if field.type === FIELD_TYPE.checkbox}
      <Checkbox bind:saveOn={values} save={field.key} label={field.label} useNumber={true} css="col-span-24 md:col-span-12" />
    {/if}
  {/each}
</div>
