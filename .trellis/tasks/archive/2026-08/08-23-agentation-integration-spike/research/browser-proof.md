# Agentation Real-Browser Proof

Evidence date: 2026-08-23  
Browser: Microsoft Edge / Chromium 151.0.4129.59  
Viewport: 1440 × 1000 at device scale 1  
Page: Ameow Vite UI Lab with React 19.1.0

## Placement

The final repair uses Agentation's documented `className` escape hatch and Lab CSS only. At 1440 × 1000 the official fixed toolbar wrapper measured 337 × 44; its right and bottom edges sat about 12 px inside the Full Preview. It had zero overlap with Dev Tools and the lower-left Preview controls. Full 1× / Auto / 3× switching did not change the placement.

Compact shortens the Workspace footer, so the fixed CSS toolbar sits about 56 px above the Compact Preview bottom instead of exactly 12 px. It remains visually in the Preview lower-right with zero Dev Tools/control collision. This bounded limitation is accepted: exact target-responsive anchoring would require extra state or geometry coupling prohibited by the repair.

The lower-left group measured 99 × 28 with 13 px left/bottom Preview insets. Background and Reset were both 28 px high with a 6 px gap. The 156 × 92 Background menu opened upward and left-aligned; measured overlap with Reset was 0.

## Full

| Display mode | Preview rect | Agentation outline rect | Delta |
| --- | --- | --- | --- |
| 1× | 200 × 200 | 200 × 200 | 0 px |
| Auto | 400 × 400 (resolved 2×) | 400 × 400 | 0 px |
| 3× | 600 × 600 | 600 × 600 | 0 px |

At all three scales, the native hit target was `data-lab-preview-frame`, and the tooltip reported `<PresentationLab> <LabOverlayStage> container`. No canvas or shader identity was claimed. A 48 × 48 drag inside the Full visual produced an official `Area selection` annotation and markdown output.

Before the allowed repair, a non-centre annotation click moved the origin marker from approximately `(523, 423)` to `(423, 343)`. After the Lab-local `event.defaultPrevented` guard, the same proof left the marker rectangle exactly unchanged.

The official 3.0.2 toolbar does not expose freehand Draw mode; the package source leaves that button commented out and has no `D` shortcut. Area annotation works and is the supported coarse-grained path for Full pixels in this spike.

## Shared DOM and controls

- A real queue row label measured 228 × 24 and received a zero-delta outline. Agentation captured its DOM path and React chain beginning with `MainWindowQueuePopover`.
- The final visible scenario strip has no runtime-fixture entry. For compatibility proof only, the browser harness switched the existing `activeFixtureId` React state to the existing `runtime-auto-config` fixture without changing source or layout. The real shared runtime indicator was then selectable and recovered after annotation mode. This does not make runtime selectable from the current visible scenario strip.
- Background was blocked while annotation mode was active (`aria-expanded` remained false), then opened normally after exit with all three options.
- Reset was blocked while annotating and left the off-centre origin unchanged; after exit, the same Reset control returned the origin to centre.
- Queue and runtime overlays remained usable after annotation mode.

## Compact

At 3×, the Compact stage measured 240 × 240 and the shell measured 180 × 180. The centre native target and Agentation outline were the shell, with zero alignment delta. The pointer-transparent SVG and its internal paths were not hit targets. A 45 × 45 area selection over the visual succeeded.

## Actual React and source output

| Target | React component output | `sourceFile` output | Assessment |
| --- | --- | --- | --- |
| Full frame | `<PresentationLab> <LabOverlayStage>` | `src/lab/LabOverlayStage.tsx:71:16` | Useful and correct component/file context |
| Queue row | `MainWindowQueuePopover` plus Motion wrappers | `src/contexts/ThemeContext.tsx:173:14` | Component useful; file is misattributed |
| Runtime indicator | Motion wrapper chain | `src/contexts/ThemeContext.tsx:173:14` | DOM target useful; file is misattributed |
| Compact shell | `<PresentationLab> <CompactPreviewStage>` | `src/contexts/ThemeContext.tsx:173:14` | Component useful; file is misattributed |

Agentation's React chain and DOM path are useful in this Vite + React 19 environment. `sourceFile` is best-effort and demonstrably unreliable for nested shared components; it must be treated as a hint, not authority. No Ameow source-context synthesis or adapter was added.

## Evidence files

- `evidence/before-origin-guard.json`
- `evidence/after-origin-guard.json`
- `evidence/after-origin-guard-toolbar.png`
- `evidence/after-origin-guard-full-3x-outline.png`
- `evidence/after-origin-guard-compact-3x-outline.png`
- `evidence/placement-repair-final.json`
- `evidence/placement-repair-final-left-controls.png`
- `evidence/placement-repair-final-agentation-toolbar.png`
- `evidence/placement-repair-final-agentation-expanded.png`
- `evidence/placement-repair-final-full-3x-outline.png`
- `evidence/placement-repair-final-compact-3x-outline.png`
- `spike-browser-proof.mjs`
