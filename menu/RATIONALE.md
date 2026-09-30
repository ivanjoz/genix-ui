# RATIONALE

Design decisions for the menus. Newest first.

## SideMenu `header` snippet and the `side-menu-expanded-only` class
**Context** — Hosts need an interactive header (e.g. a module switcher) instead of the static logo + brand. The desktop menu collapses and expands on CSS `:hover`, which a snippet cannot observe.
**Decision** — An optional `header: Snippet<[isMobile]>` replaces the logo + brand block, on desktop and in the mobile drawer (the mobile close button stays). While the desktop menu is collapsed (and not `useTopMinimalMenu`), SideMenu hides the snippet's `.side-menu-expanded-only` descendants.
**Rationale** — A documented global class keeps the hover logic in SideMenu, so hosts never target its internal `.d-menu` class. The cost: one more global class name in the public API.
