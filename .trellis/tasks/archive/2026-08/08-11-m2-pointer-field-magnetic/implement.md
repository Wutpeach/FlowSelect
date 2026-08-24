# M2 Pointer Field and Magnetic — Implementation Plan

## Review gate

Do not run `task.py start` or edit product code until Lead Architecture Review approves `prd.md`, `design.md`, and this plan. If approved, load the curated Trellis context first and keep the task in the reviewed full-only scope.

## Ordered implementation

### 1. Establish the Pointer Field boundary

- Replace the temporary Edge Glow runtime with a Main Window Pointer Field module containing only viewport-local `x/y` Motion values and pure writer/reset helpers.
- Add focused unit tests for stable-root coordinate conversion, center reset, finite input, clamping, and MotionValue-only writes.
- Do not add provider/context/global state or any lifecycle/native dependency.

Checkpoint: focused Pointer Field tests and type-check pass before wiring a visual consumer.

### 2. Add the Magnetic consumer

- Add a small renderer-only Magnetic module that derives bounded displacement from the Pointer Field.
- Encode full-only, drag-safe, and reduced-motion-zero policy without becoming a lifecycle authority.
- Keep strength and spring tuning local and minimal; add pure semantic tests for zero/response/bounds/symmetry rather than exact visual tuning.
- Add or extend an architecture boundary test preventing desktop/Electron/native position/bounds dependencies in the Pointer Field/Magnetic modules.

Checkpoint: Magnetic tests pass without touching Electron, preload, lifecycle, projections, effect contracts, or Download Feature files.

### 3. Compose the effect in MainWindowPresentationSurface

- Measure pointer moves relative to the stable viewport root, not the transforming shell.
- Reset the Pointer Field to center through the centralized semantic leave path so DOM and native-boundary leave facts converge.
- Add one outer Magnetic Motion wrapper around the existing shadow and shell nodes.
- Leave the existing inner shell/shadow morph transforms and the shell's epoch-matched `onAnimationComplete` callback intact.
- Resolve Magnetic to zero during compact/collapse, reduced motion, and manual drag preparation/dragging.
- Confirm no pointer-move callback calls native window position/bounds APIs except the pre-existing thresholded manual drag path.

Checkpoint: rapid full/compact reversal and drag/drop interaction remain correct in focused/manual checks before deleting old compatibility code.

### 4. Remove Edge Glow completely

- Delete Edge Glow overlay markup, opacity/background transforms, visibility state, reveal/suppression timers, screen-point ref/correction, and compatibility constants/types.
- Delete obsolete Edge Glow position/runtime helpers and their tests, or rename/rewrite the temporary runtime file so no compatibility API remains.
- Keep the separate drag/drop glow.
- Run a repository-wide legacy-name scan and add a narrow removal guard only if it protects the semantic no-dual-consumer requirement without locking incidental markup.

Checkpoint: no Edge Glow/Border Glow compatibility identifier or obsolete helper remains in active source/spec text, except historical archived task/release records.

### 5. Update executable architecture guidance

- Update `.trellis/spec/frontend/directory-structure.md`, `motion-guidelines.md`, `state-management.md`, and the obsolete Main Window pointer-following section of `component-guidelines.md` to describe Pointer Field + full-mode Magnetic ownership.
- Preserve the lifecycle, native surface, and reduced-motion contracts established by M0/M1.
- Do not rewrite historical release notes. No docs-site guide change is expected unless implementation discovers an existing user-facing page that actually documents this interaction.

### 6. Run focused regression coverage

Run the new tests plus the existing presentation/native contract suites:

```powershell
npm test -- src/presentation/main-window/pointerField.test.ts src/presentation/main-window/magnetic.test.ts src/presentation/main-window/lifecycle.test.ts src/presentation/main-window/projections.test.ts src/presentation/main-window/effectExecutor.test.ts src/presentation/main-window/presentationCompletion.test.ts src/presentation/main-window/motionRecipes.test.ts src/presentation/main-window/geometry.test.ts src/presentation/main-window/panelHover.test.ts src/utils/compactPointerHotspot.test.ts electron/mainWindowPointerBoundary.test.mts electron/mainWindowSurfacePolicy.test.mts electron/preloadBridgeContract.test.mts
```

Adjust only the two new test filenames if implementation chooses equally focused repository-grounded names.

### 7. Run the full quality gate

```powershell
npm test
npm run type-check
npm run lint
npm run build
git diff --check
```

Inspect the final diff for:

- no product/lifecycle/native-surface scope expansion;
- no new dependency;
- no React pointer coordinate state or mirrored pointer ref;
- no native Magnetic call path;
- separate outer Magnetic and inner morph transform owners;
- complete Edge Glow removal;
- net-neutral or reduced presentation-surface logic after Edge Glow deletion.

## Manual validation matrix

### Windows required

- Full mode: pointer movement creates subtle bounded Magnetic response and returns to center on leave.
- Reduced motion: Magnetic stays at zero while hover, lifecycle, drag, drop, and shell interaction remain correct.
- Transition stress: compact -> full -> leave -> compact -> re-enter does not flash, enable stale passthrough, or mis-acknowledge completion.
- Manual drag: pointer down/threshold/capture/drag remains stable and Magnetic does not fight window movement.
- Drop/context/task locks: shell remains full and existing feedback/locks work.
- Compact: passthrough and hotspot wake behavior are unchanged; no Magnetic movement is required.
- Reachability: collapse after dragging near each screen edge keeps the compact icon reachable.

### macOS

- If a macOS runner is available, verify stable native viewport, shadow/overshoot, centered compact icon, focusability, drag, and full-mode Magnetic.
- If not run, report macOS as not verified. Do not infer success from Windows or automated tests.

## Expected product-code touch points

- `src/presentation/main-window/MainWindowPresentationSurface.tsx`
- temporary `src/presentation/main-window/motionRuntime.ts` replacement/removal
- new focused Pointer Field and Magnetic module(s) and tests
- obsolete `src/utils/mainWindowEdgeGlowPosition.ts` and test removal
- relevant frontend Trellis spec leaves

`src/presentation/main-window/lifecycle.ts`, `projections.ts`, `effectContracts.ts`, `effectExecutor.ts`, Electron Main, preload bridge, desktop runtime, and Download Feature files are review-protected boundaries. Any required change there is a stop condition and needs renewed architecture review.
