## `Layer` takes a `titleIcon`, not an icon smuggled into the title

**Context** — A layer that titles itself with the record being edited reads better with a glyph for
the record's kind ahead of the name. `title` is a plain string rendered through `ui.translate`, so an
icon class placed in it prints as characters, and `titleSide` renders *after* the title.

**Decision** — Optional `titleIcon`: a full icon class string (sizing and colour included) rendered
as an `<i>` before the title, inside the same flex row.

**Rationale** — A string prop rather than a snippet because every call site wants exactly one icon,
and a class string is what the rest of the library already passes around for icons. Sizing is the
caller's because the title's own size varies with `titleCss`.
