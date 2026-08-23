# Ameow Compact Architecture Boundary at `2f5f1a0`

## Baseline

- Worktree branch: `motion/compact-mascot-visual`
- Base branch/commit: `motion/mr9-fullscreen-activation-fx` / `2f5f1a01ade572fcf06e2d5df1e9fec8da941511`
- Baseline worktree was clean before this Planning task.

## Authority and mount seam

`MainWindowPresentationSurface` is the sole production composition boundary. It receives the existing lifecycle binding and Application-owned lock facts, projects lifecycle state into `compact`/`full`, resolves geometry and shell motion, owns pointer writers, and mounts the Compact visual only when the projection is compact (`src/presentation/main-window/MainWindowPresentationSurface.tsx:93-117,552-634,1190-1244`).

The narrow visual seam is the existing `CompactCatCharacter` leaf. It receives only:

- rendered size;
- theme-derived body and eye colors;
- explicit `environment.reducedMotion`;
- the existing Pointer Field MotionValues read-only;
- the geometry-derived visual center.

It receives no lifecycle dispatcher, Application state, Product state, IPC bridge, completion callback, or Full target (`src/presentation/main-window/CompactCatCharacter.tsx:49-78`; `MainWindowPresentationSurface.tsx:1232-1240`).

This prop boundary should be retained for the first integration candidate. A source-specific implementation may replace the leaf internals, but it must not grow a generic mascot registry, plugin contract, or business-state API.

## Lifecycle and projection boundary

- `lifecycle.ts` owns the only Compact/full phases, pointer-inside fact, transition epochs, locks, and reducer events (`src/presentation/main-window/lifecycle.ts:3-48`).
- `projections.ts` is the single pure phase-to-visual-mode mapping and derives native interaction/hotspot policy (`src/presentation/main-window/projections.ts:9-124`).
- The mascot must not dispatch lifecycle events, request full mode, hold locks, complete transitions, or create another compact/full state machine.
- Local animation playback is permitted only as disposable renderer-local implementation state. It cannot select Product semantics or notify Application code.

## Pointer boundary

- `pointerField.ts` is the sole production continuous pointer authority. Its MotionValues are stable-root viewport-local runtime data and never become React/lifecycle/Application state (`src/presentation/main-window/pointerField.ts:4-20,35-47`).
- `MainWindowPresentationSurface` is the sole writer. It writes regular pointer movement, the Windows passthrough pre-hotspot glance, and neutral resets on leave/blur/hidden (`MainWindowPresentationSurface.tsx:593-627,712-800`).
- Windows Compact uses a 38px hotspot inside the 80px reachable frame; enter radius is 19px and exit radius is 23px. The hotspot decides lifecycle entry independently of mascot geometry (`src/presentation/main-window/geometry.ts:36-38,68-82`).
- A mascot adapter may read the field and derive bounded visual eye/head displacement. It must not write the field or let visual displacement affect hotspot/lifecycle decisions.
- Upstream has no continuous pointer behavior, so the adapter is explicitly Ameow-specific and must remain visually subordinate.

## Geometry and shell motion

- Production Compact composition is fixed at 80x80 outer/reachable frame, 60x60 visible shell, and 56x56 character area. The visual center is geometry-derived, not hard-coded by the character (`src/presentation/main-window/geometry.ts:40-66`; `MainWindowPresentationSurface.tsx:1219-1240`; `src/presentation/main-window/characterRecipe.ts:10-18`).
- The existing shell owns Compact enter, settle pulse, and exit through `AnimatePresence` and `motionRecipes`. The mascot must not duplicate shell presence motion (`MainWindowPresentationSurface.tsx:1190-1244`).
- Upstream's 300x300 SVG must be adapted within the 56px leaf without changing outer size, shell size/radius, hotspot, native bounds, or geometry utilities.
- The visual must remain `pointerEvents: none` and avoid layout-affecting animation.

## Reduced Motion and visibility

- Ameow passes one explicit `environment.reducedMotion` value into the production leaf and the Lab preview.
- Current Compact behavior removes body deformation and spring tails, uses smaller direct pointer attention, disables periodic blink, and stops local animation while the document is hidden (`CompactCatCharacter.tsx:87-167,169-229`; `characterRecipe.ts:55-76,106-146`).
- An upstream adapter must follow the Ameow boundary even though upstream's core keeps blink active under Reduced Motion. Reduced Motion should jump semantic transitions, suppress ambient/body motion, use direct bounded pointer attention, stop decorative timers/rAF, and render a stable open-eye pose.
- Hidden/unmounted Compact must cancel its local frame/timer work. Visible remount resumes from a stable current/default condition, never by replaying shell lifecycle.

## Full and MR9 isolation

- Full/MR9 graphics mount separately through `ExpandedPresentationSurface` and are eligible only for settled full mode (`MainWindowPresentationSurface.tsx:629-634,1122-1148`).
- The Compact leaf is mounted only for `isCompact`; Full graphics receive no mascot props and the mascot receives no Expanded target/palette/heatmap/refraction input.
- The plan requires zero changes to `ExpandedPresentationSurface`, Full/MR9 targets, localized thermal/refraction code, intake/progress policy, or activation-origin capture.

## UI Lab and Agentation

- `CompactPreviewStage` mounts the exact production Compact leaf in the same 80/60/56 geometry and supplies a Lab-local pointer pair. It intentionally does not import or write the production Pointer Field (`src/lab/CompactPreviewStage.tsx:1-40,54-133`; `src/lab/compactPointerField.ts:1-86`).
- `PresentationLab` already provides Compact target selection, neutral/live pointer scenarios, one shared Reduced Motion value, Auto or manual 1x/2x/3x scale, and screen-only preview backgrounds (`src/lab/PresentationLab.tsx:506-579,826-850,925-1004,1131-1155`).
- Agentation 3.0.2 mounts once at the document-level Lab entry. It has no state bridge to the preview and must not be extended (`src/lab/lab-main.tsx:1-22`; `src/lab/lab.css:40-53`).
- No UI Lab redesign is required. If the leaf prop contract remains stable, the Lab automatically previews the implementation candidate.

## Architecture conclusion

There is no internal Ameow renderer/lifecycle/geometry blocker. The existing visual leaf is intentionally suitable for a third-party or derivative implementation dependency. The only blocking gate discovered is external licensing/governance for production direct or derivative use.
