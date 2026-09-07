## SearchDualCard's right side can be controlled by the caller

**Context** — `columns1`/`columns2` + `render1`/`render2` let a side render option cards instead of
option rows, and a card can hold several actions. The users page needed exactly that: one card per
access, its level buttons granting `accesoID * 10 + nivel`. That breaks the card's core assumption —
one chip per stored id, and one stored id per option — because one access card owns several stored
ids and must still show as one chip.

**Decision** — Three optional props turn the right side over to the caller: `rightChipIDs` (what to
show), `onRightChipRemove` (what a trash click means) and `onRightSelect` (what picking an option
means). While `rightChipIDs` is set, SearchDualCard neither reads nor writes `saveRight` — which is
now optional — and leaves `avoidIDs` empty, so a granted option stays in the list and can still be
edited. The left side is untouched and keeps working exactly as before.

**Rationale** — The alternative was to keep SearchDualCard in charge and invent a transient
`AccessIDs` field on the user record for it to store; that puts a client-only field on the wire type
and leaves three representations of the same grants. Controlled mode keeps the domain type clean at
the price of a mode: forget `onRightSelect` and keyboard selection plus the agent's `select` both go
silently dead, which is why that prop's doc comment says so.

## SearchDualCard forwards `placeholderAsLabel` instead of defaulting it on

**Context** — Both selects inside `SearchDualCard` are unlabelled: `leftLabel`/`rightLabel` are
passed as the child `SearchSelect`'s `placeholder`, so they render in placeholder grey even though
they are the only name each field has.

**Decision** — New optional prop `placeholderAsLabel` (default `false`), forwarded verbatim to both
`SearchSelect`s, which paint the placeholder in `--input-label-color` when it is set.

**Rationale** — Defaulting it to `true` would match the intent (`leftLabel` is literally a label) but
would restyle every existing call site without opt-in, and some dual cards read fine as grey filter
boxes. Forwarding one flag rather than a per-side pair because the two selects are a matched pair by
construction — no call site has wanted them styled differently.
