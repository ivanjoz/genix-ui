<script lang="ts">
  import Button from '../buttons/Button.svelte';
  import { editorIconTableColumns, editorIconTableRows } from './icons';

  // Visible grid of cells; bigger tables are typed in the size inputs.
  const GRID_SIZE = 8
  const MAX_TABLE_SIZE = 20

  const { onInsert }: {
    onInsert: (rows: number, cols: number) => void
  } = $props()

  let selectedCols = $state(1)
  let selectedRows = $state(1)

  const clampTableSize = (size: number | null) => Math.min(MAX_TABLE_SIZE, Math.max(1, Math.round(size || 1)))

  const insertTypedSize = () => onInsert(clampTableSize(selectedRows), clampTableSize(selectedCols))

  const insertOnEnter = (ev: KeyboardEvent) => {
    if (ev.key !== 'Enter') return
    ev.preventDefault()
    insertTypedSize()
  }
</script>

<div class="p-10">
  <!-- Hovering a cell previews a cols x rows table from the top-left corner; clicking inserts it. -->
  <div class="grid grid-cols-8 gap-4 w-fit">
    {#each Array(GRID_SIZE * GRID_SIZE) as _, cellIndex}
      {@const row = Math.floor(cellIndex / GRID_SIZE) + 1}
      {@const col = (cellIndex % GRID_SIZE) + 1}
      <button type="button"
        class="h-18 w-18 rounded-[4px] border cursor-pointer {row <= selectedRows && col <= selectedCols
          ? 'border-accent-solid bg-accent-bg' : 'border-line bg-surface-soft'}"
        aria-label="{col} x {row}"
        onmouseenter={() => { selectedRows = row; selectedCols = col }}
        onclick={() => onInsert(row, col)}
      ></button>
    {/each}
  </div>
  <div class="flex items-center gap-6 mt-10">
    <label class="flex items-center gap-4 h-32 px-8 border border-line rounded-[8px] bg-surface" title="Columnas">
      <span class="flex text-[18px] text-fg-muted shrink-0">{@html editorIconTableColumns}</span>
      <input type="number" min="1" max={MAX_TABLE_SIZE} bind:value={selectedCols} onkeydown={insertOnEnter}
        class="w-32 text-right bg-transparent outline-none" aria-label="Columnas" />
    </label>
    <span class="text-fg-muted">x</span>
    <label class="flex items-center gap-4 h-32 px-8 border border-line rounded-[8px] bg-surface" title="Filas">
      <span class="flex text-[18px] text-fg-muted shrink-0">{@html editorIconTableRows}</span>
      <input type="number" min="1" max={MAX_TABLE_SIZE} bind:value={selectedRows} onkeydown={insertOnEnter}
        class="w-32 text-right bg-transparent outline-none" aria-label="Filas" />
    </label>
    <Button color="purple" name="Insert|Insertar" onClick={insertTypedSize} />
  </div>
</div>
