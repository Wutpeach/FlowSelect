# UI Primitives Inventory (repository-grounded)

Source: `src/components/ui/`, `src/lib/utils.ts`, `src/contexts/ThemeContext.tsx`, `src/pages/SettingsPage.tsx`.

## Primitive family `src/components/ui/`
- `neon-button.tsx` — `NeonButton` with `variant: default | outline | ghost`, `size: sm | md | lg`, JS state for hover / pressed / focused, `outline: none` + box-shadow focus ring built from theme tokens (`accentBorder`/`fieldBorderStrong`), `getContinuousCornerStyle(10)`, `COMPACT_EASE` transitions.
- `neon-icon-button.tsx` — icon button built on `getChromeButtonStyle` (visible / highlighted / tone).
- `neon-field-button.tsx` — field trigger button (`getFieldSurfaceStyle` with `active`/`highlighted`, `w-full text-left`).
- `neon-input.tsx` — text input (`cn("w-full placeholder:opacity-100")`).
- `neon-toggle.tsx` — switch (`role="switch"`, checked/hover/focus states, `outline: none`).
- `neon-dropdown-field.tsx` — full listbox Select: trigger `NeonFieldButton` + `AnimatePresence` popover menu (`getPanelShellStyle` surface, `COMPACT_POPOVER_PRESENCE`), `role="listbox"`/`role="option"`, `aria-selected`, hovered/selected styles, Escape + outside-pointerdown close.
- `neon-card.tsx` — surface card (gradient panel, optional accent glow).
- `neon-section.tsx` — titled section wrapper (`flex flex-col`).
- `neon-hint.tsx` — helper text.

## Style factories `src/components/ui/shared-styles.ts` (the interaction model)
- `getContinuousCornerStyle(radius)` — superellipse corners.
- `getPanelShellStyle(colors, {radius, boxShadow})` — panel surface.
- `getFieldSurfaceStyle(colors, {active, highlighted, padding, height, radius})` — THE normal/hover(highlighted)/selected(active)/focus surface model: `borderColor` fieldBorder → borderStart → fieldBorderStrong, box-shadow inset rings, 0.18s COMPACT_EASE transitions.
- `getSelectableOptionStyle(colors, active, highlighted)` — prebuilt selectable-option style (normal / hover / selected with accent gradient + `fontWeight`).
- `getFieldSurfaceBackground`, `getInsetCardStyle`, `getNoticeStyle`, `getChromeButtonStyle`, `getCompactLabelStyle`, `getWindowShellStyle` / `getWindowHeaderStyle` / `getWindowBodyStyle` / `getWindowFooterStyle`.
- `COMPACT_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"`.

## Motion recipes `src/components/ui/motion.ts`
- `MOTION_EASE` / `MOTION_DURATION` (`micro 0.08` … `slow 0.24`), `compactCssTransition(properties, opts)`.
- `COMPACT_POPOVER_PRESENCE` — popover enter/exit (opacity + y + scale) used by the dropdown.

## Theme tokens `src/contexts/ThemeContext.tsx`
- `ThemeColors` (interface at `ThemeContext.tsx:17`+): bg (`bgPrimary/bgSecondary/bgGradientStart/bgGradientEnd/fieldBg/fieldHoverBg/fieldInset`), borders (`borderStart/borderEnd/fieldBorder/fieldBorderStrong`), text (`textPrimary/textSecondary/accentText/dangerText`), shadows (`shadowColor/shadowSpread/panelShadow/panelShadowCompact/panelShadowStrong/accentGlow/dangerGlow`), interaction (`accentSolid/accentSurface/accentSurfaceStrong/accentBorder`, warning/danger sets, `controlMuted/controlMutedHover/controlStroke/controlStrokeHover/knobBg`), progress/queue/transcode sets.
- Two themes: `black` (default) and `white` (`ThemeContext.tsx:113`/`:184` panels, `:162-163`/`:233-234` character body/eye). Lab mounts `ThemeProvider initialTheme="black"` (`lab-main.tsx`).

## `cn()` utility
- `src/lib/utils.ts:4` — `cn(...inputs)` = `twMerge(clsx(inputs))`. Shadcn-identical. Used by neon components for sparse layout utilities only (`w-full`, `text-left`, `flex flex-col`, `placeholder:opacity-100`).

## Segmented / tabs / popover inventory
- **No segmented control exists.** Closest building blocks: `getSelectableOptionStyle` / `getFieldSurfaceStyle(active)` (SettingsPage uses these for selectable rows and tone badges, e.g. `SettingsPage.tsx:1023`, `:1051-1056`).
- **No generic tabs primitive exists** (production has `MainWindowQueuePopover` and `MainWindowRuntimeIndicator` popovers, but they are domain components).
- **No generic popover primitive exists**; `NeonDropdownField` is the closest reusable pattern (popover menu + presence + dismiss).

## Focus-visible conventions
- No `:focus-visible` CSS pseudo-class anywhere in `src/` (verified by grep). The established convention is JS `isFocused` state + `outline: none` + box-shadow ring (`NeonButton`, `NeonToggle`, `NeonFieldButton`). The Lab's own v1 buttons rely on native focus outlines (inconsistent with the neon family).

## Bottom line
- The repo already ships a shadcn-like interaction language (normal/hover/selected/focus via `getFieldSurfaceStyle`/`getSelectableOptionStyle` + JS focus rings), a popover recipe, motion recipes, and theme tokens. The Layout Repair should reuse this language rather than introduce a second one.
