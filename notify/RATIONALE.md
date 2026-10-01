# RATIONALE — notify

Design decisions for toasts, the loading overlay and the destructive confirm, newest first.

## `confirmWarn` returns a Promise, and Enter answers the focused button

**Context** — The confirm API (await a boolean vs keep Notiflix's `onConfirm` callback) was left
open when the replacement started. Separately, "Enter = OK" was in the plan, but Enter on a focused
`<button>` already clicks it, so a global Enter handler would fight the browser.

**Decision** — `await confirmWarn({ title, message })` resolves `true` on OK and `false` on
Cancel / Escape; a newer request resolves the pending one with `false`. Initial focus goes to
Cancel, Escape cancels, and Enter is left to the browser: it activates whichever button is focused.
Only the red (destructive) variant exists.

**Rationale** — The call site reads top to bottom (`if (await confirmWarn(...))`) and is easy to
test. Focusing Cancel means a stray Enter never deletes anything; the cost is that confirming by
keyboard takes Tab + Enter. A neutral variant would be one more prop nobody uses yet.

## Module-level state, auto-dismiss as a CSS animation

**Context** — Notiflix is a global: any `.ts` service can call it. genix-ui's `useUI()` only works
during component initialization, so a context-based store would not reach those services.

**Decision** — `notify.svelte.ts` holds one module-level `$state` and exports plain functions;
`NotifyHost` renders it. The genix-ui internals (http, GetHandler, security, image converter,
service worker, uploaders) call the same functions, and the host `notify` option is gone. A toast's
countdown is a CSS animation on its progress bar: `:hover` pauses it, `animationend` dismisses the
toast. Failures last 5 s, warnings 4 s, the rest 3 s, with at most 5 toasts on screen (oldest
leave first). `notifyFailure` accepts `unknown` and reads `Error.message`, `{ error }` or
`{ message }`, falling back to JSON or "Unknown error".

**Rationale** — No timers to clear or pause in JS, and hover stays pure CSS. One global store means
two app trees in one page share the same toasts, which is what Notiflix did too. Security warnings
now always show; before, they showed only if the host passed `notify` (both hosts did).
