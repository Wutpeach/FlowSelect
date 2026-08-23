# UI Lab Refresh Implementation Plan

This plan is not activated. Implementation must wait for GPT Architecture Lead Planning Architecture Review and explicit user approval. Do not run `task.py start` during the current Planning stage.

## 1. Rebalance the Existing Lab Shell

- [ ] Keep the dedicated `lab.html` / `vite.lab.config.ts` entry and production build isolation unchanged.
- [ ] Restructure `PresentationLab` into three explicit local regions: Scenario Navigation, Preview Workspace, and Dev Tools.
- [ ] Make the center workspace visually dominant; use separators / tonal regions instead of nested dashboard cards.
- [ ] Move current category/scenario selection into Scenario Navigation without changing fixture or reducer semantics.
- [ ] Preserve black/white theme token compatibility and Lab locale parity.

Rollback point: the shell change should be revertible without touching scenario, projection, or production renderer modules.

## 2. Add the Minimal Preview Target Choice

- [ ] Add one Lab-local `full | compact` target choice; do not add a registry, plugin system, or route.
- [ ] Keep target selection separate from scenario state.
- [ ] Record small static scenario-target compatibility so unsupported combinations are visible and never silently faked.
- [ ] Keep Full scenarios and the current reducer / fixture projection behavior unchanged.

Rollback point: removing the target choice must leave the current Full Lab functional.

## 3. Build the Preview Workspace Geometry Adapter

- [ ] Represent logical size and display scale separately.
- [ ] Keep Full at `200×200` logical geometry and align the Lab wrapper radius to the production `16px` radius.
- [ ] Apply display magnification only in the Lab workspace wrapper.
- [ ] Keep normalized pointer-origin mapping correct at every display scale.
- [ ] Reserve scaled layout space so preview content never overlaps either side region.
- [ ] Keep PNG export dimensions/framing independent of display zoom.
- [ ] Show concise target / logical size / display scale metadata.

Rollback point: display scale can be removed independently, returning to a `1×` logical stage.

## 4. Add the Lab-Local Compact Stage

- [ ] Mount the existing `CompactCatCharacter` directly from a new Lab-local stage.
- [ ] Use the production `80px` outer, `60px` shell, and `56px` character constants.
- [ ] Create one browser-local pair of pointer MotionValues and update them from pointer movement in logical Compact coordinates.
- [ ] Pass current theme colors and Reduced Motion directly to the production renderer leaf.
- [ ] Add only existing Compact scenarios: neutral, pointer attention, and Reduced Motion.
- [ ] Do not import or modify `MainWindowPresentationSurface`, native window state, Product state, lifecycle state, Pointer Field authority, `CompactCatCharacter`, or mascot recipes.

Rollback point: Compact is a separate Lab host and can be removed without changing Full preview behavior.

## 5. Demote Diagnostics and Retain Existing Real Controls

- [ ] Keep scenario-specific human-readable facts in normal Dev Tools.
- [ ] Keep Reduced Motion, origin, determinate progress, and queue-open controls only where their existing inputs apply.
- [ ] Move composed/raw JSON and WebGL uniform readouts under `Diagnostics / Advanced`.
- [ ] Make shader readout explicitly Full-only; do not assume `document.querySelectorAll("canvas")[0]` exists for Compact.
- [ ] Keep export errors visible near the export action.
- [ ] Do not add a generic Inspector, parameter schema, URL state, control registry, or shader editor.

Rollback point: diagnostics disclosure can revert independently without changing Preview Target hosts.

## 6. Run the Optional Agentation Proof Before Adoption

- [ ] Confirm the PolyForm Shield dependency and notice obligations are acceptable for this repository.
- [ ] Perform a disposable Lab-only mount of `agentation@3.0.2`.
- [ ] Validate Full stage, one shared DOM overlay, and Compact stage selection at `1×` and maximum display scale.
- [ ] Validate area/draw annotations over Full WebGL and Compact SVG regions.
- [ ] Verify annotation clicks do not change pointer origin or scenario state; add only a Lab-local default-prevented click guard if required.
- [ ] Verify the toolbar is unscaled and production output contains no Agentation asset/reference.
- [ ] If any proof requires production pointer, layering, renderer, or authority changes, reject that granularity or omit Agentation.
- [ ] If accepted, keep the dependency in `devDependencies`, mount it only under `src/lab/`, and omit endpoint/webhook/sync features.

Rollback point: remove the Lab mount and devDependency. The core Refresh must remain complete without Agentation.

## 7. Validation and Review Gates

Focused automated checks:

```powershell
npx vitest run src/lab src/presentation/main-window/characterSurface.test.ts src/presentation/main-window/presentationCompositionContract.test.ts src/architecture/import-guard.test.ts
npm run type-check
npm run lint
npm run build
git diff --check
```

Required assertions:

- [ ] production build input remains only `index.html`;
- [ ] production `dist/` contains no Lab or Agentation entry/reference;
- [ ] exactly one Full production canvas exists when Full is active;
- [ ] Compact uses the production SVG renderer leaf and creates no canvas;
- [ ] Lab sources contain no desktop runtime, Electron, download client, Product command, or lifecycle authority import;
- [ ] target switching does not create a second reducer/business truth;
- [ ] logical Full/Compact dimensions remain `200` and `80 / 60 / 56` regardless of display scale;
- [ ] normalized pointer behavior is equivalent at `1×` and maximum scale;
- [ ] Full PNG export remains the expected logical `4×` result at every display scale;
- [ ] Reduced Motion behavior remains deterministic for both targets;
- [ ] all scenario rows, target tabs, disclosures, and controls are keyboard reachable with visible focus;
- [ ] Chinese and English Lab copy remain in parity.

Real-browser Lab checks:

```powershell
npm run dev:lab
```

- [ ] verify the three-region hierarchy at a normal desktop viewport;
- [ ] verify the Preview remains dominant and side regions do not overlap it;
- [ ] verify Full scenario/progress/overlay interactions and export;
- [ ] verify Compact neutral, pointer attention, and Reduced Motion;
- [ ] verify zoom and target switching do not leave stale geometry or readouts;
- [ ] run the Agentation proof only if dependency adoption remains requested.

## 8. Stop for Architecture Review

- [ ] Present implementation evidence to GPT Architecture Lead.
- [ ] Do not claim Architecture PASS.
- [ ] Do not merge, archive, or proceed to unrelated mascot / MR9 visual work without a separate instruction.
