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
  import { buildShowroomUsers, buildUserColumns, languageOptions, statusOptions, type IShowroomUser } from './showroom-data';

  const ui = useUI();
  const userColumns = buildUserColumns(ui.translate);

  const gridRows = $state(buildShowroomUsers(5000));
  const tableRows = $state(buildShowroomUsers(600));
  const cardRows = $state(buildShowroomUsers(40));

  let filterText = $state('');
  let selectedGridRowId = $state<string | number | undefined>(undefined);
  let lastCellEdit = $state('—');
  let lastTableEdit = $state('—');

  // CellSelect shows the option's Name as-is, so the bilingual labels are resolved up front.
  const translatedStatusOptions = statusOptions.map((status) => ({ ...status, Name: ui.translate(status.Name) }));

  // Shared by both editable tables: the cell shows the picks as chips and saves an id array.
  const buildLanguagesMultiSelectColumn = (onEdit: (message: string) => void): ITableColumn<IShowroomUser> => ({
    id: 'languagesEdit', header: 'Languages (multiselect)|Idiomas (multiselect)', width: '260px',
    field: 'LanguageIDs', cellOptions: languageOptions,
    onCellMultiSelect: (user, selectedIDs) => { onEdit(`CellMultiSelect → ${user.Code} = [${selectedIDs.join(', ')}]`); },
  });

  // Editable columns appended to the shared read-only set. CellInput, CellSelect and
  // CellMultiSelect are not standalone components in practice — they are what these column
  // configs render.
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
      field: 'StatusID', cellOptions: translatedStatusOptions,
      onCellSelect: (user) => { lastCellEdit = `CellSelect → ${user.Code} = ${user.StatusID}`; },
    },
    buildLanguagesMultiSelectColumn((message) => { lastCellEdit = message; }),
  ];

  // VTable editing demo: every in-cell edit capability on one table. An editable table
  // declares no row selection — clicks belong to the cells, not to the row.
  const blockedStatusID = 2;
  const isBlockedUser = (user: IShowroomUser) => user.StatusID === blockedStatusID;

  const editableTableColumns: ITableColumn<IShowroomUser>[] = [
    userColumns[0],
    {
      id: 'nameEdit', header: 'Name (text)|Nombre (texto)', showEditIcon: true,
      getValue: (user) => user.Name,
      // Blocked users are read-only: no input, no edit icon.
      disableCellInteractions: isBlockedUser,
      onBeforeCellChange: (_user, value) => String(value).trim().length > 0,
      onCellEdit: (user, value) => {
        user.Name = String(value).trim();
        lastTableEdit = `CellInput (text) → ${user.Code} = ${user.Name}`;
      },
    },
    {
      // The select writes the option's keyId into record[field]; keying languages by Name
      // stores the plain string the fixture already holds.
      id: 'languageEdit', header: 'Language (select)|Idioma (select)', field: 'Language',
      cellOptions: languageOptions, cellOptionsKeyId: 'Name', cellOptionsKeyName: 'Name',
      onCellSelect: (user, value) => { lastTableEdit = `CellSelect → ${user.Code} = ${value}`; },
    },
    buildLanguagesMultiSelectColumn((message) => { lastTableEdit = message; }),
    {
      id: 'versionEdit', header: 'Version (number)|Versión (número)', align: 'right', showEditIcon: true,
      cellInputType: 'number',
      getValue: (user) => user.Version.toFixed(2),
      disableCellInteractions: isBlockedUser,
      // Reject negatives before the write reaches the record.
      onBeforeCellChange: (_user, value) => Number(value) >= 0,
      // Runtime class per record: versions below 2 are flagged.
      setCellCss: (user) => (user.Version < 2 ? 'text-red-600' : undefined),
      onCellEdit: (user, value, rerender) => {
        user.Version = Number(value || 0);
        lastTableEdit = `CellInput (number) → ${user.Code} = ${user.Version}`;
        rerender();
      },
    },
    {
      id: 'statusEdit', header: 'Status (select)|Estado (select)', field: 'StatusID',
      cellOptions: translatedStatusOptions,
      onCellSelect: (user, value, rerender) => {
        lastTableEdit = `CellSelect → ${user.Code} = ${value}`;
        // Blocking a user locks its name and version cells, so the row must repaint.
        rerender();
      },
    },
    {
      id: 'actions', header: '',
      buttonDeleteHandler: (user) => {
        tableRows.splice(tableRows.indexOf(user), 1);
        lastTableEdit = `delete → ${user.Code}`;
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

<ShowroomBlock name="TableGrid" note="5 000 rows · CSS grid · editable number, select and multiselect columns · row selection">
  <TableGrid columns={editableGridColumns} data={gridRows} height="420px" rowHeight={34}
    getRowId={(user) => user.ID}
    selectedRowId={selectedGridRowId}
    onRowClick={(user) => { selectedGridRowId = user.ID; }} />
  <div class="text-xs text-fg-muted mt-8">
    selectedRowId = {selectedGridRowId ?? '—'} · last cell edit: {lastCellEdit}
  </div>
</ShowroomBlock>

<ShowroomBlock name="VTable + FilterInput" note="600 rows · in-cell editing: text, number, select, multiselect, validation, locked cells (Blocked), row delete · no row selection">
  <FilterInput bind:value={filterText} css="w-260 mb-8" placeholder="Filter by name or code…" />
  <VTable columns={editableTableColumns} data={tableRows} maxHeight="380px"
    filterText={filterText} getFilterContent={(user) => `${user.Name} ${user.Code}`} />
  <div class="text-xs text-fg-muted mt-8">last cell edit: {lastTableEdit}</div>
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
