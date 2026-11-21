# Frame cache: raw DataFrame files in the browser

A DataFrame is a group-by report the backend keeps as small columnar files, one per Keys value
(genix-orm `dataframe/DATAFRAMES.md`). The frame cache keeps those files in IndexedDB as the
bytes the server sent, and asks a frame route only for the ones that changed. The page computes its
report from the decoded rows.

```text
cache/
  frame.wire.ts           decode a file (format v5: zero sums mask, constant columns, optional slot) and a route's answer (colbin/decode); format the held files. Pure
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
           &g=<generation of the held files>&h=<keys '_'-joined>.<snapshot>[.<slot>],…
```

The route (backend `QueryFrame(f)…ExecChanged(g, h)`) answers `application/octet-stream`: a
self-describing colbin message with the files to replace (its fields are at the top of
`frame.wire.ts`), read with `colbin/decode`, which gives each file's bytes as a `Uint8Array`. Which
files depend on where the backend keeps the frame (genix-orm `db.FrameStorage`):

- a file the client doesn't hold, or every file when the generation changed (a rebuild of an S3
  frame, a new declaration of a table frame);
- on an S3 frame (dynamo, scylla, oceanbase): a held copy whose versions slot was raised past its
  snapshot (a run rewrote the file, or another file sharing its slot, one of 255), or that a record
  written since the last run touches, sent moved to now;
- on a table frame (mariadb, postgres): a held copy older than the moment its file last changed.
  These files have no slot (0), and `h=` sends none.

A non-200 answer rejects and notifies, as any `GET` (a frame not built yet answers its message).

## What the cache keeps

| Field | |
|---|---|
| `route`, `frame`, `fileKey` | the key; `fileKey` is the keys `_`-joined |
| `generation` | the build (S3 frames) or shape (table frames) the file belongs to. An answer of another generation deletes every file of the frame before storing |
| `snapshot`, `slot` | sent back in `h=`; `slot` is 0 on a table frame and not sent |
| `content` | the file's bytes, decoded on each read (1.6 ms for 20,000 rows × 9 columns) |

A file answered without rows is kept (empty content) so it is sent back as held, and left out of the
result. `clearFrameCache()` deletes the database.

## Tests

`frame.wire.test.ts` decodes the shared vectors of `genix-orm/dataframe/testdata/frame_wire_vectors.json`
(inlined; genix-orm db's `TestFrameWireVectors` pins the same bytes) and refuses every truncated file.
An answer cut between two colbin fields still decodes, so it refuses an answer without a generation,
Rows columns or a snapshot; one cut right before the files reads as "nothing changed".
`frame-cache.fetch.test.ts` covers the selection, the request and the merge.
