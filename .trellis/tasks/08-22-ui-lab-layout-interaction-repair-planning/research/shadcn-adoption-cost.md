# shadcn Adoption Cost (repository-grounded)

Question: should the Layout & Interaction Repair adopt shadcn/ui, or reuse the existing primitives?

## What is already present (shadcn prerequisites)
- `clsx` + `tailwind-merge` devDeps (`package.json`), and the shadcn-identical `cn()` in `src/lib/utils.ts:4`.
- Tailwind v4 (`tailwindcss@^4.1.18`, `@tailwindcss/postcss@^4.1.18`) installed.
- `src/index.css` declares `@tailwind base; @tailwind components; @tailwind utilities;` (v3-style directives) plus a `:root` CSS-variable block and global reset.

## What is NOT present (adoption cost drivers)
1. **No `components.json`** — the shadcn CLI config does not exist; `npx shadcn@latest init` would scaffold it, add `components.json`, and rewrite conventions.
2. **No `@radix-ui/*` packages** — `package.json` has zero Radix dependencies (no `@radix-ui/react-dropdown-menu`, `-popover`, `-tabs`, `-radio-group`, `-separator`, etc.). Every shadcn component that needs behavior would pull new runtime deps into the renderer bundle.
3. **No `lucide-react`** (shadcn's icon dependency) and no icon package at all; the app draws inline SVG icons (e.g. `SearchIcon`, `CloseIcon` in SettingsPage).
4. **Tailwind is not wired into the Lab entry.** `index.css` is imported only by production `src/main.tsx` (`main.tsx:22`). The Lab entry (`src/lab/lab-main.tsx`) imports only `./lab.css`. Tailwind utility classes are therefore NOT available in the Lab today; using Tailwind in Lab components would require importing `index.css` (or a Tailwind build) in the Lab entry — a real boundary change (the Lab is currently a self-contained browser page, and `rendererReuse.test.ts` pins its import surface).
5. **Design language fork.** All production UI (SettingsPage, main window, neon family) uses inline theme-token styles, not Tailwind utilities. Adopting shadcn for the Lab would create a second, visually divergent design language inside the same page, or require porting the whole neon family (out of scope).

## Cost assessment
- Full shadcn adoption: `components.json` + Radix deps + `lucide-react` + Tailwind-in-Lab entry wiring + a Tailwind-theme (CSS-variable) mapping for the existing `ThemeColors` + re-authoring buttons/tabs/popover/segmented from shadcn sources + reconciling with `rendererReuse.test.ts` import pinning + new dependency/lockfile diff (the v1 task explicitly validated "no dependency or lockfile change"). This is high cost and violates the v1 boundary discipline.
- Reuse route: the existing `NeonButton` / `NeonFieldButton` / `NeonDropdownField` + `getFieldSurfaceStyle` / `getSelectableOptionStyle` / `getPanelShellStyle` / `COMPACT_POPOVER_PRESENCE` already deliver shadcn-like clarity (distinct normal / hover / selected / focus). Only two small pieces are missing for this task and are cheap to build Lab-locally or as small additions to `src/components/ui`:
  - a **segmented control** (grouped `aria-pressed` buttons sharing a field-surface, built from `getFieldSurfaceStyle(active/highlighted)` — the same pattern SettingsPage uses for selectable rows);
  - a **Preview-local background popover** (reuse the `NeonDropdownField` popover pattern: trigger button + `AnimatePresence` + `COMPACT_POPOVER_PRESENCE` + `getPanelShellStyle` menu, or a small generic `NeonPopover` if it is genuinely reusable).

## Recommendation
- **Do not adopt shadcn/ui.** Recommend reusing the existing neon/shared-styles interaction language. Only if the segmented control or background popover turn out to be needed by another surface should they be promoted into `src/components/ui`; otherwise keep them Lab-local. Do not rebuild a component system, and do not add Radix/Tailwind-in-Lab wiring.
- Add the smallest Lab-local keyboard focus-visible treatment in `lab.css` (or equivalent modality-aware state). Suppress the native outline only while a visible custom ring is present, and keep that ring distinct from selected. Do not add a shared production helper until a second consumer exists.
