# Frame cache: raw DataFrame files in the browser

A DataFrame is a group-by report the backend keeps as small columnar files, one per Keys value
(genix-orm `dataframe/DATAFRAMES.md`). The frame cache keeps those files in IndexedDB as the
bytes the server sent, and asks a frame route only for the ones that changed. The page computes its
report from the decoded rows.

```text
cache/
  frame.wire.ts           decode a file (format v4: zero sums mask, constant columns) and a route's answer; format the held files. Pure
  frame-cache.idb.ts      Dexie: one row per file, database <companyID>_frames_<env>
  frame-cache.fetch.ts    createFrameFilesGetter (ui.http.GETFrameFiles), mergeFrameAnswer
```

## Using it

```ts
const { snapshot, files } = await GETFrameFiles('voluntariado-indicadores-frames', 'enrollment-month',
  { fromKey: 2601, toKey: 2612 })            // first Key range, optional pinnedKeys for the next Keys
for (const file of files) {                  // sorted by keys; files without rows are left out
  // file.keys: the file's Keys values; file.rows[c][i]: Rows column c of row i;
  // file.sums[s][i]: summed column s (Sums in declaration order, then the count)
}
```

`snapshot` is the frame's last run (SUnixTime): every file is at least that current, and the files
records touched since are moved to the moment of the read.

## The request

```text
GET <route>?f=<frame>&from=<Keys[0]>&to=<Keys[0]>[&k=<later Keys, '_'-joined>]
           &g=<generation of the held files>&h=<keys '_'-joined>.<snapshot>.<slot>,…
```

The route (backend `QueryFrame(f)…ExecChanged(g, h)`) answers `application/octet-stream` with the
files to replace (the layout is at the top of `frame.wire.ts`):

- a file the client doesn't hold, or every file when the generation changed (a rebuild);
- a held copy whose versions slot was raised past its snapshot: a run rewrote the file, or another
  file sharing its slot (one of 255, `dtf/versions`);
- a held copy that a record written since the last run touches: sent moved to now.

A non-200 answer rejects and notifies, as any `GET` (a frame not built yet answers its message).

## What the cache keeps

| Field | |
|---|---|
| `route`, `frame`, `fileKey` | the key; `fileKey` is the keys `_`-joined |
| `generation` | the build the file belongs to. An answer of another generation deletes every file of the frame before storing |
| `snapshot`, `slot` | sent back in `h=` |
| `content` | the file's bytes, decoded on each read (1.6 ms for 20,000 rows × 9 columns) |

A file answered without rows is kept (empty content) so it is sent back as held, and left out of the
result. `clearFrameCache()` deletes the database.

## Tests

`frame.wire.test.ts` decodes the shared vectors of `genix-orm/dataframe/testdata/frame_wire_vectors.json`
(inlined; the Go `TestFrameWireVectors` pins the same bytes) and refuses every truncated prefix.
`frame-cache.fetch.test.ts` covers the selection, the request and the merge.
