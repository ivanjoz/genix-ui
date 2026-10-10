<script lang="ts">
  import Gantt from '../gantt/Gantt.svelte';
  import type { GanttRow } from '../gantt/gantt';
  import OptionsStrip from '../navigation/OptionsStrip.svelte';
  import { getFechaUnix } from '../utilities/date';
  import ShowroomBlock from './ShowroomBlock.svelte';

  let zoom = $state<'week' | 'month'>('week');
  let clickedBar = $state('');

  const zoomOptions: [number, string][] = [[1, 'Week|Semana'], [2, 'Month|Mes']];

  // A small project around today: sprints on top, then epics with their stories nested.
  const today = getFechaUnix();
  const rows: GanttRow[] = [
    { id: 'sprints', label: 'Sprints', bars: [] },
    { id: 's1', parentId: 'sprints', label: 'Sprint 1', bars: [{ start: today - 28, end: today - 15, color: 'gray', label: 'Sprint 1', progress: 1 }] },
    { id: 's2', parentId: 'sprints', label: 'Sprint 2', bars: [{ start: today - 14, end: today - 1, color: 'gray', label: 'Sprint 2', progress: 0.8 }] },
    { id: 's3', parentId: 'sprints', label: 'Sprint 3', bars: [{ start: today, end: today + 13, color: 'green', label: 'Sprint 3', progress: 0.2 }] },
    { id: 'e1', label: 'Harvest app', bars: [{ start: today - 28, end: today + 13, color: 'purple', label: 'Harvest app' }] },
    { id: 'st1', parentId: 'e1', label: 'HAR-1 Login', bars: [{ start: today - 28, end: today - 15, color: 'green' }] },
    { id: 'st2', parentId: 'e1', label: 'HAR-2 Crews report', bars: [
      { start: today - 28, end: today - 15, color: 'red', label: 'Not completed' },
      { start: today - 14, end: today - 1, color: 'green' },
    ] },
    { id: 'st3', parentId: 'e1', label: 'HAR-3 Offline mode', bars: [{ start: today, end: today + 13, color: 'amber', label: 'In review' }] },
    { id: 'e2', label: 'Exports', bars: [] },
    { id: 'st4', parentId: 'e2', label: 'HAR-4 Excel export (not planned)', bars: [] },
  ];
  const markers = [{ day: today - 30, label: 'Project start', color: 'blue' as const }, { day: today + 40, label: 'Go-live', color: 'teal' as const }];
</script>

<ShowroomBlock name="Gantt" note="rows tree (parentId) · bars on Unix days with color, label and progress · markers · today line · zoom week / month">
  <div class="flex items-center gap-12 mb-12">
    <OptionsStrip selected={zoom === 'week' ? 1 : 2} options={zoomOptions} onSelect={(option) => { zoom = option[0] === 1 ? 'week' : 'month'; }} />
    {#if clickedBar}<span class="text-sm text-gray-600">Clicked: {clickedBar}</span>{/if}
  </div>
  <Gantt {rows} {zoom} {markers} onBarClick={(row, bar) => { clickedBar = `${row.label}${bar.label ? ` · ${bar.label}` : ''}`; }} />
</ShowroomBlock>
