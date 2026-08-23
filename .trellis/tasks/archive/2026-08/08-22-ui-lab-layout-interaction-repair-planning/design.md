# Design — UI Lab Layout & Interaction Repair

Status: `planning`. Baseline: validated UI Lab Refresh v1 checkpoint. All references are to files in `src/lab/` unless noted.

## 1. Information architecture (two macro regions)

```
┌───────────────────────────────────────────────────────────┬────────────────────┐
│ Main Workspace (flex column, dominant)                    │ Dev Tools (fixed   │
│                                                           │  width, persistent)│
│ [flat scenario strip ......... Reset]   (top)             │ scenario           │
│                                                           │ target             │
│         ┌──────────────────────────┐                       │ scale              │
│         │      Preview (center)    │  bg: env layer        │ reduced motion     │
│         │   Full | Compact host    │  ▲ bottom-right env   │ facts              │
│         └──────────────────────────┘    picker (tiny btn)  │ [Advanced]         │
│ [Target seg] [Scale seg] [meta] [Replay/Export] (below)    │                    │
│                                                           │                    │
│        (page bottom-right kept clear of Lab overlays)     │                    │
└───────────────────────────────────────────────────────────┴────────────────────┘
```

- `PresentationLab.tsx` root changes from a 3-column flex row to a 2-region flex row: `MAIN_STYLE` (flex 1, column) + `DEVTOOLS_STYLE` (persistent, same surface). The separate left `<nav>` is removed. `appTitle`/`appSubtitle`, including the visible `Ameow UI Lab` title, are not rendered.
- Flat Scenario Navigation is the first content inside Main Workspace, followed by the stage and controls. It does not receive a replacement page-title block.

## 2. Scenario model → flat strip

- Keep `LAB_CATEGORY_TARGET_AVAILABILITY` (`scenarios.ts`) as the compatibility authority; keep `LAB_COMPACT_SCENARIOS` and `resolveLabCompactScenario`.
- The strip renders the useful scenario set as **flat chips/buttons** (one row, wrap): Activation presets (intake-local / intake-center / folder / reduced variants), Progress (0/25/50/75/100 + indeterminate), Download / Runtime / Transcode / Mixed fixtures, Heatmap spike, Compact scenarios. Categories as UI grouping are gone; each item is a flat button with:
  - selected: `getSelectableOptionStyle(colors, active: true)` accent treatment;
  - hover: `getFieldSurfaceStyle(highlighted)` ring;
  - focus-visible: a custom `fieldBorderStrong`/`accentBorder` ring that is visually distinct from selected; suppress the native outline only while this visible replacement is active;
  - disabled (target-incompatible): `opacity` + `cursor: default` + Full-only/Compact-only tag (v1 `TAG_STYLE`).
- No underline-as-selected; no click-residual outline; `aria-pressed` for toggle items.

## 3. Segmented controls (new, minimal)

- New Lab-local `SegmentedControl` component (or a small addition to `src/components/ui` only if reusable) built from `getFieldSurfaceStyle(colors, { active, highlighted })` + `getSelectableOptionStyle` accent for the active segment:
  - `role="group"`, `aria-label`, one `aria-pressed` button per segment, arrow-key roving within the group (Tab into group, arrows move), and a visible custom `:focus-visible` ring distinct from selected.
- Two instances in the below-preview controls row: Target (`full | compact`) and Scale (`fit | 1x | 2x | 3x`). State stays Lab-local (`target`, `displayScale`) — never written to scenario/reducer/production state.

## 4. Auto model (Lead Override 2026-08-22 — replaces the Fit model)

- `LAB_DISPLAY_SCALES` becomes `["auto", 1, 2, 3]`; `LAB_DISPLAY_SCALE_DEFAULT = "auto"` (in `previewTargets.ts`). `LabDisplayScale = "auto" | 1 | 2 | 3`. `LAB_AUTO_SCALE_OPTIONS = [1, 2, 3]`.
- Auto resolution is pure and Lab-local. Given the measured stage viewport, subtract the proportional breathing margin and the absolute safety floor, then pick the LARGEST discrete member of {1, 2, 3} whose `logicalSize × scale` fits. Auto never resolves below 1 or above 3 (unlike the superseded continuous Fit). Metadata is integer, e.g. “自动 · 2×” / “Auto · 2×”, never a decimal.
- Rendered wrapper size remains `logicalSize × resolvedScale`. `resolveLabPreviewScaledSize` unchanged. Logical geometry and export backing scale are untouched (Full export stays 4x → 912×912).

## 5. Final Workspace Shell pass (Lead Override 2026-08-22)

- Workspace Shell = one outer boundary (`data-lab-workspace`) with three internal region markers sharing one surface language: Header (`data-lab-workspace-header` on the scenario-strip element, first content), Body (`data-lab-workspace-body` on the stage viewport), Footer (`data-lab-workspace-footer` wrapping the grouped controls + caption). No separate large card per region.
- Footer groups (显示模式 / 缩放 / 操作) become hairline-divided labeled rows with spacing — the segmented chips themselves are the lightweight field surfaces; the per-group card surface is removed. Dev Tools sections adopt the same hairline-divided language.
- Reset: a low-weight circular button at the Preview top-left (`data-lab-reset`, `title`, `aria-label`); it re-applies the current scenario and resets origin to `NEUTRAL_PRESENTATION_ORIGIN`, Reduced Motion off, queue closed — all via the existing reducer actions; no new authority.
- Origin marker (`data-lab-chrome`): rendered only when `originMarkerVisible` (Intake scenario or origin fields focused); hidden for Heatmap / Download / Transcode / Mixed / Compact. Lab chrome only.
- Replay and Export are secondary quiet chips; the orange Export hierarchy is removed; success feedback stays temporary.

## 6. Preview-local background/environment

- New Lab-local state in `PresentationLab`: `previewBackground: "dark" | "light" | "checkerboard"`, default `"dark"`.
- New Lab-local `PreviewEnvironmentPicker` (trigger button + `AnimatePresence` popover; pattern copied from `NeonDropdownField` / `COMPACT_POPOVER_PRESENCE`): tiny icon button anchored bottom-right of the preview frame, three options with `getSelectableOptionStyle` selected treatment.
- Rendering: a screen-only chrome layer behind the preview host. Full: render the environment outside the export capture root; Compact: render it behind `[data-lab-compact-stage]`. Dark/light/checkerboard never reaches `ExpandedPresentationSurface`, `CompactCatCharacter`, theme, Product state, or export input.
- Export: preserve the v1 Full 4x PNG contract and `912x912` output independently of the selected on-screen environment. Changing export composition is out of scope without an explicit product request.

## 7. Dev Tools

- Keep `DEVTOOLS_STYLE` persistent and align its surface exactly with Main Workspace (same panel background, radius, typography, interaction tokens). Retire the v1 `≤1080px` hide rule. Use clamped region widths and, below the supported desktop minimum, horizontal page overflow rather than removing Dev Tools.
- Content: concise human-readable summary rows (scenario, target, scale, reduced motion) + scenario facts (existing `ScenarioFacts`/`CompactFacts`) + the single RM toggle; raw composed-input/WebGL/scale-facts JSON stay in the `data-lab-advanced` `<details>` disclosure (v1 boundary).
- No generic Inspector; no fake inspect button.

## 8. Agentation bottom-right clearance

- Add no placeholder element or Agentation-specific state. Keep page-level Lab controls away from the viewport bottom-right fixed-overlay area. The environment picker stays local to the Preview stage, so a future real Agentation integration can be evaluated against its actual component behavior.

## 9. Reused vs new code (boundary)

- Reuse: `getFieldSurfaceStyle`, `getSelectableOptionStyle`, `getPanelShellStyle`, `getContinuousCornerStyle`, `getNoticeStyle`, `COMPACT_EASE`/`compactCssTransition`, `COMPACT_POPOVER_PRESENCE`, `NeonButton` (Replay/Export/Reset), `NeonDropdownField` (pattern source), theme tokens, `cn()` (sparse layout utilities only).
- New (Lab-local unless genuinely reusable): `SegmentedControl`, `PreviewEnvironmentPicker` (+ `resolveLabPreviewDisplayScale`/Fit helper). No Radix, no lucide, no new runtime dep, no Tailwind-in-Lab wiring.

## 10. Compatibility & rollback

- `rendererReuse.test.ts` invariants (one `ExpandedPresentationSurface`, no `<canvas` in lab sources, browser-safe imports, lab-entry wiring) must keep passing; new Lab files join `labSources`.
- `scenarios.test.ts`/`previewTargets.test.ts` extend (Fit default, availability unchanged).
- Rollback: this is UI-only; revert `src/lab/**` to the checkpoint commit. No production diff possible by construction.

## 11. Non-goals reaffirmed

No production/renderer/shader/MR9/mascot changes; no generic Inspector/registry; no second RM authority; no Agentation implementation; no dependency/lockfile diff; no Tailwind-in-Lab; no shadcn adoption.
