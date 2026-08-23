# UI Lab Refresh Implementation Report

Date: 2026-08-22

Review status: **Implementation and scoped validation complete. Ready for GPT Architecture Lead Implementation Architecture Review. This report is not Architecture PASS.**

Baseline: `motion/mr9-fullscreen-activation-fx` at `eaead6573302e16839aa87a7d70b15717a708f3f`

## Implemented

- Rebalanced the development-only Browser Lab into Scenario Navigation, a dominant Preview Workspace, and Dev Tools.
- Added one Lab-local `full | compact` Preview Target choice, independent from scenario state.
- Kept Full on the single production `ExpandedPresentationSurface` and existing fixture/projection paths.
- Added a Lab-local Compact host around the existing `CompactCatCharacter` with production `80 / 60 / 56` geometry and browser-local MotionValues.
- Added `1x / 2x / 3x` display magnification without changing logical geometry or Full export backing scale.
- Kept one derived Lab-local Reduced Motion preview value for scenario presets, the Dev Tools control, and both target hosts.
- Moved composed input, WebGL readout, and scale facts under Advanced Diagnostics; Compact never reads Full shader diagnostics.
- Added one bounded narrow-window rule that hides Dev Tools before shrinking the Preview Workspace below a useful size.
- Kept Agentation out because the PolyForm Shield retention gate was not explicitly accepted. No dependency, source import, or production bundle reference was added.

## Simplification and Review Fixes

Lead review corrected four issues before validation:

- normalized Compact pointer coordinates from the displayed rect back into the `80x80` logical field at every display scale;
- used the production Compact shell radius constant (`100`) instead of deriving `60` from shell size;
- removed a decorative Compact outer plaque and kept only the production-token shell;
- made the narrow-window rule override the inline Dev Tools display and removed React style warnings from shorthand conflicts / Electron-only Lab chrome.

No generic target registry, parameter framework, responsive state machine, second pointer authority, or new renderer abstraction was added.

## Validation

Passed:

- Focused Vitest: 9 files, 131 tests.
- `npm run type-check`.
- `npm run lint`.
- `npm run build` (renderer and Electron build).
- `task.py validate` (4 implement + 4 check entries).
- `git diff --check` (line-ending warnings only, no diff errors).
- Production bundle scan: no `PresentationLab`, `CompactPreviewStage`, Lab workspace marker, or Agentation symbol.
- Package diff: no dependency or lockfile change.
- Real Edge/Playwright validation via `artifacts/validate-ui-lab.cjs`.

Real-browser assertions:

- center workspace `932px`, versus `268px` Scenario Navigation and `320px` Dev Tools at `1600x1000`;
- Full has exactly one canvas; Compact has zero canvases;
- Full logical CSS geometry stays `200x200` at `1x` and `3x`, while the displayed rect becomes `600x600` at `3x`;
- normalized Full origin remains approximately `(0.75, 0.25)` when clicked at `3x`;
- Full PNG export remains `912x912` at `3x` display magnification;
- Compact logical geometry stays `80 / 60 / 56`, while its displayed frame becomes `240x240` at `3x`;
- Compact hides Full export and marks composed/shader diagnostics as Full-only;
- Compact Reduced Motion preset resolves the single preview value without rewriting the explicit Dev Tools toggle;
- at `1000px` viewport width Dev Tools is hidden and the Preview remains wider than Scenario Navigation;
- no browser console or page errors after Lab-local warning cleanup.

Full-suite result: 202 of 203 test files passed, 1796 of 1797 tests passed. The single failure is the unchanged `browser-extension/architecture-guard.test.js` assertion for unknown-message `return false`; `browser-extension/` has no diff in this task. The Electron suite initially lacked its binary after `npm ci --ignore-scripts`, then passed 10/10 after `npm rebuild electron`.

## Evidence

- `artifacts/validate-ui-lab.cjs` — reproducible real-browser assertions.
- `artifacts/ui-lab-full-1x.png` — dominant Full workspace.
- `artifacts/ui-lab-full-3x.png` — Full display magnification.
- `artifacts/ui-lab-full-export-3x.png` — invariant `912x912` export.
- `artifacts/ui-lab-compact-3x.png` — current Compact renderer at `3x`.
- `artifacts/ui-lab-narrow-compact.png` — bounded narrow-window layout.

## Boundary Confirmation

- No Product, lifecycle, native-window, production pointer, renderer, shader, MR9 visual, or mascot module was modified.
- No `MainWindowPresentationSurface` mount or desktop/Electron import exists in `src/lab/`.
- No second canvas, Expanded host, shader, runtime, or business truth was added.
- Task remains `in_progress`; it is not archived and no Architecture PASS is claimed.

## Stop Condition

Stop here and wait for GPT Architecture Lead Implementation Architecture Review.
