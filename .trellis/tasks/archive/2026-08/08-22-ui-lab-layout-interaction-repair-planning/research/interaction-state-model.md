# Interaction State Model (normal / hover / selected / focus-visible)

Goal: a shadcn-like, keyboard- and mouse-correct state model for the Lab's repaired controls, built on the repo's existing conventions.

## Existing convention (evidence)
- `getFieldSurfaceStyle(colors, { active, highlighted })` (`shared-styles.ts:298+`) is the canonical normal/hover/selected/focus surface:
  - normal: `fieldBorder` + `inset 0 1px 0 fieldInset`;
  - hover (`highlighted`): `borderStart` + inset ring;
  - active/selected: `fieldBorderStrong` + `inset 0 0 0 1px fieldBorderStrong` + panel shadow.
- `getSelectableOptionStyle(colors, active, highlighted)` (`shared-styles.ts:345+`) adds accent-tinted selected background + `fontWeight: 600` for selected.
- Focus ring: the neon family currently uses JS `onFocus`/`onBlur` → `isFocused` → box-shadow ring + `outline: none` (`neon-button.tsx`, `neon-toggle.tsx`, `neon-field-button.tsx`). No `:focus-visible` pseudo-class exists in `src/`; the Lab repair needs the smallest local keyboard-visible distinction without redefining the production component system.

## Proposed model for the repair (per control type)
1. **Segmented control** (Preview Target Full/Compact; Display scale Fit/1x/2x/3x): a single `role="group"` containing `aria-pressed` buttons. Each segment uses `getFieldSurfaceStyle(colors, { active: selected, highlighted: hovered })`; the selected segment additionally gets the accent treatment (`getSelectableOptionStyle`-style). Keyboard: one roving tab stop per group, arrow keys move selection/focus, and Home/End reach the bounds. This is small enough to keep Lab-local.
2. **Flat scenario strip** (top of Main Workspace): a horizontal row of `role="tablist"`-free flat buttons (`aria-pressed`) or a `listbox`-free list; selected scenario uses the accent selected treatment, hover uses the field hover ring, focus uses the shared focus ring. No underline-as-selected, no click-residual outline.
3. **Generic buttons** (Replay, Export, Reset, Dev Tools actions): reuse `NeonButton` (default/outline/ghost) or the existing Lab `BUTTON_STYLE` upgraded to the field-surface language; focus ring consistent with neon family.
4. **Preview background picker** (bottom-right, Preview-local): a trigger button + popover menu; the open trigger uses `getFieldSurfaceStyle(active: true)`, the menu reuses the `NeonDropdownField`/`COMPACT_POPOVER_PRESENCE` pattern; options use `getSelectableOptionStyle`.
5. **Focus-visible policy**: add a small Lab-local `:focus-visible` rule (or equivalent modality-aware state) that renders a visible outer/inset ring from `fieldBorderStrong`/`accentBorder`. It is additive to, and visually distinct from, the selected fill/border. Native outline may be suppressed only inside that rule while the custom ring is visible. Pointer click focus must not leave a selection-like ring. Disabled controls use `opacity` + `cursor: not-allowed` and are not focusable.

## Constraints
- Keep `aria-pressed` (toggle semantics) for target/scale/segment buttons; keep `aria-expanded` for the background popover trigger; keep `role="group"` for the segmented groups. No fake tab panels (no `role="tablist"`) for the flat scenario strip.
- Do not rebuild a component system: reuse `getFieldSurfaceStyle`/`getSelectableOptionStyle`/`NeonButton`/`NeonDropdownField`; only add a segmented control + (optional) popover as Lab-local or small shared additions.
