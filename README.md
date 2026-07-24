# @genix/ui

Reusable Svelte 5 UI components and utilities shared by Genix applications.

The package is consumed as a Git submodule and a Bun workspace package. Stateful
components require a `UiRuntime` to be created and provided once per Svelte component
tree. Business data, authentication, routing policy, and backend services remain in the
host application.

Package exports point directly to `lib/`, so consumers compile the source and editor
navigation opens the implementation rather than generated declarations in `dist/`.

## Structure

The source is intentionally flat and has no `src/` wrapper:

```text
lib/
  runtime/
  menu/
  editor/
  utilities/
```

## Runtime

Create and set one runtime at the root of each Svelte render tree:

```svelte
<script lang="ts">
  import { createUiRuntime, setUiRuntime } from '@genix/ui';

  const ui = createUiRuntime();
  setUiRuntime(ui);
</script>
```

Descendants read and update the same package-owned UI state:

```svelte
<script lang="ts">
  import { getUiRuntime } from '@genix/ui';

  const ui = getUiRuntime();
</script>

<button onclick={() => { ui.state.mobileMenuOpen = true }}>
  Open menu
</button>
```

Use a separate runtime for every fresh `mount()` tree. `UiProvider` is available when a
component wrapper is more convenient than calling `setUiRuntime` directly.

## Host-owned policies

`SideMenu` receives its model, active path, access policy, translator, navigation callback,
branding, and bindable open state as props. `MobileMenu` receives generic items and a
selection callback. Neither component imports host routing, security, services, or global
singletons.

Pure encoding and compact-response helpers are exported from `@genix/ui/utilities`.
They have no host configuration or Svelte runtime dependency.

## Development

```sh
# Validate source. Packaging remains available for a future registry distribution.
bun run check
bun run package
```

Tailwind CSS v4 hosts must scan the package source and use the Genix spacing contract:

```css
/* Package components use one Tailwind spacing unit as one pixel. */
@source "../packages/genix-ui/lib/**/*.svelte";

@theme {
  --spacing: 1px;
}
```
