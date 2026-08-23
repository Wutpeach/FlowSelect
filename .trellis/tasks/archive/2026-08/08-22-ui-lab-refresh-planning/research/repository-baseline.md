# UI Lab Refresh Repository Baseline

Date: 2026-08-22

Baseline: `motion/mr9-fullscreen-activation-fx` at `eaead6573302e16839aa87a7d70b15717a708f3f`

Worktree: `D:\Ameow\.cindy-worktrees\ui-lab-refresh-planning`

The source MR9 worktree contains later uncommitted Thermal / Paper spike changes. Those changes are intentionally excluded from this planning baseline.

## Current Entry and Build Boundary

- `package.json:13` exposes `npm run dev:lab` through the dedicated `vite.lab.config.ts`.
- `vite.lab.config.ts:4-23` serves a browser-only Lab at `127.0.0.1:1421` without Electron preload, desktop bridge, or downloader runtime.
- `lab.html:9-12` has its own root and imports only `src/lab/lab-main.tsx`.
- `src/lab/lab-main.tsx:7-18` initializes bridge-free i18n and theme context before mounting `PresentationLab`.
- `vite.config.ts:9-16` pins the production build entry to `index.html`; the Lab is not a production Rollup input.
- `src/lab/rendererReuse.test.ts:43-77` protects entry/build isolation and the bridge-free Lab entry.

## Current Three-Region Structure

The requested left / center / right shape already exists structurally, but not yet in presentation priority:

- `src/lab/PresentationLab.tsx:127-149` defines a page-level flex row and two generic scrollable panes, each with a `240px` minimum width.
- `src/lab/PresentationLab.tsx:229-236` centers the Preview in the remaining space.
- `src/lab/PresentationLab.tsx:599-877` puts category pills and all scenario controls in the left pane.
- `src/lab/PresentationLab.tsx:879-933` puts the fixed-size Preview and PNG export in the center.
- `src/lab/PresentationLab.tsx:935-1024` puts controls, human-readable facts, raw JSON, and shader readout together in the right pane.

This is therefore an information-hierarchy refresh, not a need for a new page shell or routing system.

## Scenario and State Drive

There are two bounded Lab-only paths:

1. Synthetic Expanded presentation state:
   - `src/lab/scenarios.ts:157-184` defines Lab-only activation, heatmap, progress, pointer-origin, and Reduced Motion state/actions.
   - `src/lab/scenarios.ts:203-217` seeds the local reducer state.
   - `src/lab/scenarios.ts:219-357` reduces only bounded synthetic presentation actions.
   - `src/lab/scenarios.ts:359-399` composes exactly one production `ExpandedPresentationTarget` plus the production Reduced Motion flag.
   - `src/lab/PresentationLab.tsx:364-390` owns the reducer, active category, optional fixture, UI affordance state, and the final composed input.

2. Static production-model fixtures:
   - `src/lab/stateFixtures.ts:1-11` states the boundary: static Lab facts enter existing production model types and no command bus, durable queue, controller, or lifecycle authority is created.
   - `src/lab/stateFixtures.ts:33-37` defines the four fixture kinds: runtime, download, transcode, and mixed.
   - `src/lab/stateFixtures.ts:198-212` registers seven legacy fixtures by id.
   - `src/lab/overlayProjection.ts:11-38` imports production selectors and pure projection helpers.
   - `src/lab/overlayProjection.ts:172-299` maps one fixture to the props consumed by production overlays and the Expanded target; command callbacks remain no-ops in the Lab host.

Scenario switching is already Lab-local. The Refresh must preserve that boundary instead of introducing a second Product or lifecycle store.

## Full Preview Renderer Reuse

- `src/lab/LabOverlayStage.tsx:1-8` defines the stage as a host for the existing production renderer and overlays, not a reimplementation.
- `src/lab/LabOverlayStage.tsx:125-135` fixes the logical preview frame to `LAB_PREVIEW_SIZE`.
- `src/lab/scenarios.ts:19-20` resolves that size from production `MAIN_WINDOW_PANEL_SIZE` (`200px`).
- `src/lab/LabOverlayStage.tsx:198-254` mounts exactly one `ExpandedPresentationSurface` plus shared center, queue, and runtime overlays.
- `src/presentation/main-window/ExpandedPresentationSurface.tsx:786-798` renders a single `aria-hidden` canvas with `pointer-events: none`.
- `src/lab/rendererReuse.test.ts:80-137` requires one production Full surface, forbids a Lab canvas/shader/runtime, and requires browser-safe imports.

One known visual mismatch should be removed in the Refresh: the Lab wrapper uses a `14px` radius (`LabOverlayStage.tsx:125-135`), while the production Full shell uses `16px` (`src/presentation/main-window/geometry.ts:45-75`). The prior MR9 visual report recorded the same mismatch in `.trellis/tasks/archive/2026-08/08-15-mr9-fullscreen-activation-fx-progress-visual-refinement/research/mr9-grammar-realignment-prototype.md:151-166`.

## Compact Preview Reuse Direction

- Production compact metrics are explicit: outer reachable frame `80px`, visible shell `60px` (`src/constants/windowMetrics.ts:1-3`), and visual character `56px` (`src/presentation/main-window/characterRecipe.ts:13-15`).
- `src/presentation/main-window/geometry.ts:51-65` centers the `60px` shell in the compact outer frame.
- `src/presentation/main-window/CompactCatCharacter.tsx:1-19` is a browser-safe renderer leaf: it owns no lifecycle, Product, native, or IPC authority.
- `src/presentation/main-window/CompactCatCharacter.tsx:49-63` consumes only size, theme colors, Reduced Motion, a read-only pair of MotionValues, and a stable-root attention center.
- `src/presentation/main-window/CompactCatCharacter.tsx:217-266` renders the existing SVG character. The SVG deliberately has `pointer-events: none`.
- `src/presentation/main-window/MainWindowPresentationSurface.tsx:1146-1199` shows the production composition, but the shell imports desktop runtime (`MainWindowPresentationSurface.tsx:23-25`) and must not become a Lab dependency.
- `src/lab/rendererReuse.test.ts:112-129` already forbids `desktop/runtime`, Electron, `App.tsx`, and download clients in Lab sources.

The smallest valid direction is a Lab-local Compact stage that mounts `CompactCatCharacter` directly inside the production `80 / 60 / 56` geometry and supplies browser-local pointer MotionValues. It previews the existing renderer without reproducing native window or lifecycle composition.

Current Full business fixtures must not be falsely mapped to Compact behavior the Compact renderer does not express. The scenario catalog should expose target compatibility and provide Compact scenarios only for existing capabilities such as neutral character, pointer attention, and Reduced Motion.

## Current Diagnostics and Existing Controls

- `src/lab/PresentationLab.tsx:35-124` polls the one production WebGL program and reads live uniforms. It creates no context or renderer.
- `src/lab/PresentationLab.tsx:341-361` summarizes raw fixture facts as JSON.
- `src/lab/PresentationLab.tsx:938-1004` exposes three low-cost controls that already map to real inputs: Reduced Motion, normalized pointer origin, and determinate progress.
- `src/lab/PresentationLab.tsx:1005-1012` replaces those controls with structured scenario facts for fixture-driven scenes.
- `src/lab/PresentationLab.tsx:1014-1023` gives raw JSON and shader uniforms the same visual priority as normal tools.
- `src/lab/PresentationLab.tsx:1029-1117` already has human-readable download, transcode, runtime, and queue facts that can remain normal Dev Tools content.

No URL-backed, schema-backed, or generic parameter system exists. The three real input controls are the only low-cost reusable Inspector capability and should stay scenario-specific rather than becoming a generalized live parameter editor.

## Scaling and Export Constraints

- Current logical Full geometry is fixed at `200x200`; no display zoom exists.
- Pointer-origin mapping already divides viewport coordinates by the frame's `getBoundingClientRect()` (`src/lab/PresentationLab.tsx:428-438`), so a uniform display transform can preserve normalized input semantics.
- PNG export raises only the production canvas backing scale while the `200x200` CSS layout remains fixed (`src/lab/PresentationLab.tsx:513-538`).
- Export locates `[data-lab-preview-frame]` and `[data-lab-chrome]` (`src/lab/PresentationLab.tsx:551-565`).

The Refresh must therefore keep three values separate:

- logical target geometry (`200` Full, `80` Compact outer);
- display magnification in the workspace;
- raster/backing scale used for crisp rendering or export.

The display scale belongs to a Lab workspace wrapper. It must not rewrite production geometry constants, and export must remain invariant across display zoom levels.

## Architecture Blocker Assessment

No production architecture blocker must be repaired before the UI Lab Refresh.

The following are implementation gates, not architecture blockers:

- preserve the one Full canvas / one production renderer guard;
- keep all Lab imports browser-safe and production build output Lab-free;
- add a Lab-local Compact host rather than importing the native Main Window shell;
- verify display scale does not change logical input or export geometry;
- retain locale parity and existing scenario/projection tests.
