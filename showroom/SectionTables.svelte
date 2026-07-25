<script lang="ts">
  import { onDestroy } from 'svelte';
  import Button from '../buttons/Button.svelte';
  import FilterInput from '../form/FilterInput.svelte';
  import CardsList from '../vTable/CardsList.svelte';
  import TableGrid from '../vTable/TableGrid.svelte';
  import TableStream from '../vTable/TableStream.svelte';
  import TableTree, { type TableTreeNode } from '../vTable/TableTree.svelte';
  import VTable from '../vTable/VTable.svelte';
  import type { ICardCell, ITableColumn } from '../vTable/types';
  import { useUI } from '../runtime/index.js';
  import ShowroomBlock from './ShowroomBlock.svelte';
  import { buildShowroomUsers, buildUserColumns, statusOptions, type IShowroomUser } from './showroom-data';

  const ui = useUI();
  const userColumns = buildUserColumns(ui.translate);

  const gridRows = $state(buildShowroomUsers(5000));
  const tableRows = buildShowroomUsers(600);
  const cardRows = $state(buildShowroomUsers(40));

  let filterText = $state('');
  let selectedGridRowId = $state<string | number | undefined>(undefined);
  let selectedTableRow = $state<IShowroomUser | undefined>(undefined);
  let lastCellEdit = $state('—');

  // Editable columns appended to the shared read-only set. CellInput and CellSelect are
  // not standalone components in practice — they are what these column configs render.
  const editableGridColumns: ITableColumn<IShowroomUser>[] = [
    ...userColumns,
    {
      id: 'versionEdit', header: 'Version (edit)|Versión (edit)', width: '120px', align: 'right',
      cellInputType: 'number', showEditIcon: true,
      getValue: (user) => user.Version,
      // Reject negatives before the write reaches the record.
      onBeforeCellChange: (_user, value) => Number(value) >= 0,
      onCellEdit: (user, value) => {
        user.Version = Number(value || 0);
        lastCellEdit = `CellInput → ${user.Code} = ${user.Version}`;
      },
    },
    {
      id: 'statusEdit', header: 'Status (select)|Estado (select)', width: '150px',
      cellOptions: statusOptions, cellOptionsKeyId: 'ID', cellOptionsKeyName: 'Name',
      showEditIcon: true,
      render: (user) => ui.translate(statusOptions.find((status) => status.ID === user.StatusID)?.Name || ''),
      onCellSelect: (user, value) => {
        user.StatusID = Number(value || 0);
        lastCellEdit = `CellSelect → ${user.Code} = ${user.StatusID}`;
      },
    },
  ];

  // TableTree groups the fixture by language: parents are the languages, children the users.
  const treeNodes: TableTreeNode<IShowroomUser>[] = [...new Set(cardRows.map((user) => user.Language))]
    .slice(0, 4)
    .map((language, idx) => {
      const languageUsers = cardRows.filter((user) => user.Language === language);
      return {
        id: idx + 1,
        record: { ...languageUsers[0], Name: `${language} (${languageUsers.length})` },
        children: languageUsers,
        isOpen: idx === 0,
      };
    });

  const cardCells: ICardCell<IShowroomUser>[] = [
    { label: 'Name|Nombre', field: 'Name', itemCss: 'col-span-24 md:col-span-10',
      getValue: (user) => user.Name },
    { label: 'Language|Idioma', field: 'Language', itemCss: 'col-span-12 md:col-span-6',
      getValue: (user) => user.Language },
    { label: 'Version|Versión', field: 'Version', type: 'number', itemCss: 'col-span-12 md:col-span-4',
      contentCss: 'w-full justify-end text-right pr-6', inputCss: 'text-right pr-6',
      getValue: (user) => user.Version,
      onCellEdit: (user, value) => { user.Version = Number(value || 0); } },
  ];

  // --- TableStream: rows arrive on an interval to mimic a live feed ---
  let streamRows = $state<IShowroomUser[]>([]);
  // $state because the template reads it to label the start/stop button.
  let streamTimer = $state<ReturnType<typeof setInterval> | undefined>(undefined);
  let nextStreamIndex = 0;

  const stopStream = () => {
    if (streamTimer) { clearInterval(streamTimer); }
    streamTimer = undefined;
  };

  const toggleStream = () => {
    if (streamTimer) { stopStream(); return; }
    streamTimer = setInterval(() => {
      streamRows = [...streamRows, cardRows[nextStreamIndex % cardRows.length]];
      nextStreamIndex += 1;
    }, 700);
  };

  // Without this the timer keeps appending rows to a component that no longer exists
  // once the user switches tabs.
  onDestroy(stopStream);

  // Excluded from this tab: MobileCardsVirtualList — it is the internal mobile renderer
  // used by the tables above, exercised by narrowing the viewport instead.
</script>

<ShowroomBlock name="TableGrid" note="5 000 rows · CSS grid · editable number + select columns · row selection">
  <TableGrid columns={editableGridColumns} data={gridRows} height="420px" rowHeight={34}
    getRowId={(user) => user.ID}
    selectedRowId={selectedGridRowId}
    onRowClick={(user) => { selectedGridRowId = user.ID; }} />
  <div class="text-xs text-gray-500 mt-8">
    selectedRowId = {selectedGridRowId ?? '—'} · last cell edit: {lastCellEdit}
  </div>
</ShowroomBlock>

<ShowroomBlock name="VTable + FilterInput" note="600 rows · filterText + getFilterContent, not a hand-rolled filter">
  <FilterInput bind:value={filterText} css="w-260 mb-8" placeholder="Filter by name or code…" />
  <VTable columns={userColumns} data={tableRows} maxHeight="380px"
    filterText={filterText} getFilterContent={(user) => `${user.Name} ${user.Code}`}
    selected={selectedTableRow?.ID}
    isSelected={(user, selected) => user.ID === selected}
    onRowClick={(user) => { selectedTableRow = user; }} />
  <div class="text-xs text-gray-500 mt-8">selected = {selectedTableRow?.Name || '—'}</div>
</ShowroomBlock>

<ShowroomBlock name="TableStream" note="fixed window of 30 rows — oldest rows drop as new ones arrive">
  <Button name={streamTimer ? 'Stop stream|Detener' : 'Start stream|Iniciar'}
    color={streamTimer ? 'red' : 'green'} icon="icon-[fa--play]" css="mb-8"
    onClick={toggleStream} />
  <TableStream columns={userColumns} data={streamRows} maxRecords={30} maxHeight="300px"
    emptyMessage="Press start to stream rows.|Presiona iniciar para recibir filas." />
</ShowroomBlock>

<ShowroomBlock name="TableTree" note="two levels: languages as parents, users as children">
  <TableTree columns={userColumns} data={treeNodes}
    getChildId={(user) => user.ID}
    onNodeClick={(node) => { lastCellEdit = `node ${node.id}`; }}
    onChildClick={(user) => { selectedGridRowId = user.ID; }} />
</ShowroomBlock>

<ShowroomBlock name="CardsList" note="virtualized cards with an editable cell and row delete">
  <CardsList cells={cardCells} data={cardRows} height="360px" cardCss="p-12"
    buttonDeleteHandler={(_user, rowIndex) => { cardRows.splice(rowIndex, 1); }} />
</ShowroomBlock>
