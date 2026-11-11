<script lang="ts">
  import { useUI } from "../runtime/index.js"
  import type { EditorVariableOption } from "./EditorVariable"

  const ui = useUI()

  const { variables, hint, onPick }: {
    variables: EditorVariableOption[]
    /** Bilingual note under the list, e.g. which variables only work in some cases. */
    hint?: string
    onPick: (name: string) => void
  } = $props()

  // Variables listed under their group, in the order the consumer gave them.
  const variableGroups = $derived.by(() => {
    const groups: { group: string; variables: EditorVariableOption[] }[] = []
    for (const variable of variables) {
      const existingGroup = groups.find(group => group.group === variable.group)
      if (existingGroup) existingGroup.variables.push(variable)
      else groups.push({ group: variable.group, variables: [variable] })
    }
    return groups
  })
</script>

<div class="flex flex-col gap-8 p-10 w-360" aria-label="Variables">
  {#each variableGroups as variableGroup (variableGroup.group)}
    <div>
      <div class="text-[14px] text-fg-muted mb-4">{ui.translate(variableGroup.group)}</div>
      <div class="flex flex-wrap gap-4">
        {#each variableGroup.variables as variable (variable.name)}
          <button type="button"
            class="px-8 py-2 rounded-[4px] bg-black text-white text-[14px] cursor-pointer hover:bg-blue-solid"
            onclick={() => onPick(variable.name)}
          >{ui.translate(variable.field)}</button>
        {/each}
      </div>
    </div>
  {/each}
  {#if hint}
    <div class="text-[14px] text-fg-subtle">{ui.translate(hint)}</div>
  {/if}
</div>
