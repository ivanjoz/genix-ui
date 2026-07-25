// Static datasets shared by the showroom sections. Everything is synchronous and
// backend-free, so a tab can mount and unmount without touching services or caches.
import type { ITableColumn } from '../vTable/types';
import { usersDemo } from './dummy-data';

/** Same "EN|ES" contract as `useUI().translate`, which is what callers pass in. */
export type TranslateText = (text: string) => string;

export interface IShowroomUser {
  ID: number;
  Name: string;
  Language: string;
  Code: string;
  Bio: string;
  Version: number;
  StatusID: number;
}

export const statusOptions = [
  { ID: 1, Name: 'Active|Activo' },
  { ID: 2, Name: 'Blocked|Bloqueado' },
  { ID: 3, Name: 'Pending|Pendiente' },
];

// Distinct languages of the fixture, shaped as { ID, Name } records so they can feed
// SearchSelect / CheckboxOptions directly through keyId + keyName.
export const languageOptions = [...new Set(usersDemo.map((user) => user.language))]
  .map((language, idx) => ({ ID: idx + 1, Name: language }));

// The fixture holds 197 records; repeat it until `total` is reached so the virtualized
// components get enough rows to actually scroll. The repeat index is appended to the
// name to keep every row visually distinguishable while scrolling.
export const buildShowroomUsers = (total: number): IShowroomUser[] => {
  const users: IShowroomUser[] = [];

  for (let idx = 0; idx < total; idx += 1) {
    const baseUser = usersDemo[idx % usersDemo.length];
    const repeatIndex = Math.floor(idx / usersDemo.length);

    users.push({
      ID: idx + 1,
      Name: repeatIndex === 0 ? baseUser.name : `${baseUser.name} (${repeatIndex + 1})`,
      Language: baseUser.language,
      Code: baseUser.id,
      Bio: baseUser.bio,
      Version: baseUser.version,
      StatusID: (idx % 3) + 1,
    });
  }

  return users;
};

// Read-only column set reused by every table demo. Editable columns are declared inside
// the tables section instead, because their callbacks mutate section-local state.
//
// A factory rather than a const: one column translates its own output, and translate lives
// on the UI runtime context, which a module-scope const cannot reach. Callers pass
// `useUI().translate` from inside a component.
export const buildUserColumns = (translate: TranslateText): ITableColumn<IShowroomUser>[] => [
  { id: 'code', header: 'Code|Código', width: '160px', getValue: (user) => user.Code, cardColumn: [1] },
  { id: 'name', header: 'Name|Nombre', width: 'minmax(120px, 1fr)', getValue: (user) => user.Name, cardColumn: [2] },
  { id: 'language', header: 'Language|Idioma', width: '110px', getValue: (user) => user.Language, cardColumn: [3] },
  {
    id: 'version', header: 'Version|Versión', width: '90px', align: 'right',
    getValue: (user) => user.Version.toFixed(2),
  },
  {
    id: 'status', header: 'Status|Estado', width: '120px',
    // `render` output is not translated by the table, so resolve the bilingual label here.
    render: (user) => translate(statusOptions.find((status) => status.ID === user.StatusID)?.Name || ''),
  },
];
