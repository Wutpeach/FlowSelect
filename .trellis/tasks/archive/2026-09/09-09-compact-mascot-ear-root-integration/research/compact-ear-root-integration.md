# Research: compact ear-root integration

- Query: Trace Compact ear rendering end to end and identify the smallest root-cause integration change that keeps both canonical ears behind the opaque head while preserving avatar-core geometry, shared poses, Production/Lab reuse, Reduced Motion, Pointer Field, lifecycle, and shell contracts.
- Scope: internal repository, pinned `.cindy-upstream` avatar-core source, installed package metadata, and related Trellis task history; no product/spec/task metadata was changed.
- Date: 2026-09-09 (Asia/Shanghai)

## Findings

### Architecture decision and boundary

The active decision in `09-09-compact-mascot-ear-root-integration/prd.md` is a composition-only policy: avatar-core remains authoritative for the two node surfaces, transforms, pose interpolation, and projected paths; Ameow assigns both canonical node paths to the behind-head paint layer after projection. The opaque `headPath` must naturally overpaint embedded roots. The change must not add a core API, masks, inverse clipping, path booleans, fragment/depth output, a static SVG ear, an independent ear runtime, or a second Lab/Production renderer. This supersedes the abandoned depth-fragment experiment kept under `09-07-compact-mascot-bible-strong-cat-refinement/historical-experiments/depth-occlusion-2026-09-08/`.

### End-to-end render path

1. **Canonical definition.** `src/presentation/main-window/compactMascotDefinition.ts:49-86` defines one 240-unit sphere and exactly two `body.nodes` (`76 x 135 x 78` diamonds at `[-70,-76,-82]` / `[70,-76,-82]`, mirrored rotations `[0,-5,-10]` / `[0,5,10]`). It keeps the pinned Kirby expressions and `surprised`, `curious-short`, and `playful-short` actions; module-load `validateAvatarDefinition` is the only definition gate. `compactMascotDefinition.test.ts:6-63` pins the node count, dimensions, positions, rotations, source timings, and neutral two-back-path result.
2. **Core body/projection.** Pinned avatar-core `scene.ts:37-46` converts definition nodes to `runtime-node-0/1` `BodyNode`s while preserving surface/position/rotation. `scene.ts:53-79` and `runtime.ts:337-348` route every expression/frame through `renderAvatar`. `geometry.ts:1155-1191` samples each whole node on a 17 x 49 grid, applies node-local rotation/position plus the shared avatar orientation, convex-hulls/smooths the projected samples, and emits one complete closed path per node.
3. **Root cause.** `geometry.ts:1217-1234` computes one node-center camera depth, compares it with `accessoryCameraDepthRadius(...) * 0.1`, sorts complete paths by depth, and partitions them into `backPaths`/`frontPaths` with matching node IDs. This is whole-node classification, not per-surface or per-fragment occlusion. A pose can therefore move an entire ear to `frontPaths`; the current Compact path then paints that entire silhouette above the head. The core public contract (`geometry.ts:49-66`) has no partial occlusion field or layer override.
4. **Ameow behavior seam.** `src/presentation/main-window/compactMascotBehaviorRuntime.ts:32-54` owns one `BODY = bodyFromDefinition(...)`, samples the current playback frame, renders the head/eyes once with `bodyNodes: []` and the same pose/body a second time with `bodyNodes: BODY.nodes`, then copies the second call's `backPaths`, `backNodeIds`, `frontPaths`, and `frontNodeIds` into the scene. The body call is the sole place where core whole-node layer classification becomes Compact's final paint-layer data. It does not pass `eyeOffset`, so pointer attention cannot alter ear/head geometry.
5. **SVG composition.** `src/presentation/main-window/CompactMascot.tsx:57-89` updates fixed source-specific slots from `AvatarScene`; `:166-208` emits back ear 0, back ear 1, opaque head, eye group, front ear 0, front ear 1. The eye group alone uses the `headPath` clip (`:180-205`). The SVG is `overflow: visible`; the shell's inner panel, not the mascot, clips the 60px shell. Consequently a path in `backPaths` is naturally overpainted by the head wherever the silhouettes overlap, while a path in `frontPaths` is wholly visible over the head.

### Smallest root-cause integration change

Change only the final array assignment in `renderCompactMascotScene` (`compactMascotBehaviorRuntime.ts:44-51`) so the two paths returned by the body-node render are all emitted as Compact `backPaths`, with their matching IDs, and `frontPaths`/`frontNodeIds` empty. In pseudocode (not applied here):

```ts
const compactEarPaths = [...earGeometry.backPaths, ...earGeometry.frontPaths];
const compactEarNodeIds = [...earGeometry.backNodeIds, ...earGeometry.frontNodeIds];
return {
  geometry: {
    ...scene,
    backPaths: compactEarPaths,
    backNodeIds: compactEarNodeIds,
    frontPaths: [],
    frontNodeIds: [],
  },
  colors,
};
```

This still consumes every projected path from avatar-core and preserves its depth-sorted order (back and front partitions are each depth-sorted, and every back item is below the crossing threshold). It ignores only the whole-node classification when choosing the final Compact layer, exactly as the PRD requires. The body is currently a sphere, so the body-node render contributes only the two canonical ear paths; no generic body-node renderer or new authority is needed. A host-side re-layering in `CompactMascot.tsx` would duplicate this policy and make the Lab/Production contract less explicit; the runtime merge is the single shared seam used by both.

No definition, recipe, core package, shell, lifecycle, or pointer-writer change is required. `CompactMascot.tsx` can retain its four fixed slots: after the runtime change the two front slots simply receive empty paths. The current comments/spec wording that says “core back/head/front order” should be reconciled in the implementation/check phase with the new permanent Compact behind-head policy, but no behavior authority should move into the SVG host.

### Production, Lab, pointer, Reduced Motion, and lifecycle consumers

- **Production mount:** `src/presentation/main-window/MainWindowPresentationSurface.tsx:1191-1243` mounts `CompactMascot` only when the lifecycle projection is compact, at `56 * COMPACT_MASCOT_RENDER_SCALE` inside the unchanged 60px shell. It passes the production `pointerField`, theme colors, and `environment.reducedMotion`; it never supplies `previewPose` (guarded by `compactMascotArchitecture.test.ts:34-42`). The same file writes pointer coordinates at `:376-383` and Windows compact forwarded coordinates before hotspot evaluation at `:712-727`.
- **Lab mount:** `src/lab/CompactPreviewStage.tsx:42-52,65-155` mounts this exact `CompactMascot` leaf in the production 80/60/56 geometry, with a Lab-local MotionValue pair and optional frozen `previewPose`. `src/lab/PresentationLab.tsx:990-994` passes the selected Compact scenario's pose; `src/lab/scenarios.ts:464-508` defines neutral, live pointer, Reduced Motion, and the three retained action samples. There is no alternate ear renderer or definition.
- **Pointer attention:** `compactMascotRecipe.ts:44-79` computes a bounded eye-only offset. `renderCompactMascotScene` passes it only to the head/eye core call; the body-node call remains unchanged. Existing behavior coverage (`compactMascotBehaviorRuntime.test.ts:135-143`) proves a bounded pointer changes eye paths while head and ear paths stay identical. The architecture guard keeps Pointer Field writes unique to `MainWindowPresentationSurface` (`src/architecture/import-guard.test.ts:919-942`).
- **Reduced Motion and visibility:** `compactMascotBehaviorRuntime.ts:34-43,112-153` removes ambient motion/blink, uses the same core scene, pauses/resumes the single rAF/deadline clock, and renders a static neutral scene under Reduced Motion. `CompactMascot.tsx:91-164` owns visibility listeners and disposal; the Lab preview path is disposable and settles action previews to neutral (`compactMascotBehaviorRuntime.ts:63-84`). Existing tests at `compactMascotBehaviorRuntime.test.ts:146-172` cover Reduced Motion, pause/resume, one-frame ownership, and stale disposal. The layer flatten does not touch any of these paths.
- **Lifecycle/shell:** `lifecycle.ts:19-46` and `projections.ts:37-135` remain the sole compact/full authority; the Surface owns shell Motion and mounting. Import-guard coverage keeps lifecycle writers in `lifecycle.ts`/`reactAdapter.ts` and keeps `CompactMascot` free of lifecycle/Product/native/IPC authority. The ear change must not add a lifecycle event, lock, callback, timer, or native geometry request.

### Exact affected files and callers

| File | Role in this task |
| --- | --- |
| `src/presentation/main-window/compactMascotBehaviorRuntime.ts` | **Root fix:** flatten the two core-projected node partitions into final Compact `backPaths`; leave frame sampling, one-rAF runtime, Reduced Motion, and disposal unchanged. |
| `src/presentation/main-window/compactMascotBehaviorRuntime.test.ts` | **Regression coverage:** assert final `frontPaths`/`frontNodeIds` are empty and both ear paths remain projected across neutral, retained action boundary samples, and bounded-pointer samples; retain same-pose core-path equality and Reduced Motion assertions. |
| `src/presentation/main-window/CompactMascot.tsx` | Existing shared SVG consumer/caller; no functional change expected. Only update stale wording if the implementation wants the behind-head contract documented at this boundary. |
| `src/presentation/main-window/compactMascotDefinition.ts` / `.test.ts` | Canonical geometry authority and pins; no change expected. Neutral definition already projects two back paths. |
| `src/presentation/main-window/MainWindowPresentationSurface.tsx` | Production caller; no change expected. Re-run composition/pointer ordering tests. |
| `src/lab/CompactPreviewStage.tsx`, `src/lab/PresentationLab.tsx`, `src/lab/scenarios.ts` | Lab callers; no change expected. They already share the production leaf/runtime and provide all representative poses. |
| `.trellis/spec/frontend/character-motion.md` | Current contract says the leaf paints core back/head/front order (`:31-34`). If the Trellis implementation updates specs, revise that wording to permanent two-ear behind-head composition while preserving all existing authority/clock/Reduced Motion clauses. |

No `avatar-core` source, package manifest, definition schema, lifecycle module, pointer field, shell geometry, OneWorks files, or active task metadata should be edited for this root integration.

### Required tests and visual evidence

**Automated.** Extend the existing behavior-runtime assertions rather than introducing a new renderer test suite:

1. For `neutral` and each retained action (`surprised`, `curious-short`, `playful-short`) at the existing hold/transition boundary times in `compactMascotBehaviorRuntime.test.ts:37-63,84-107`, assert two non-empty `backPaths`, empty `frontPaths`, two matching back IDs, and same-pose path equality with the direct core geometry flattened as `core.backPaths + core.frontPaths`.
2. Keep the frozen Lab preview test (`:108-132`) and bounded pointer additivity test (`:135-143`), adding explicit empty-front assertions. Keep the Reduced Motion settlement (`:146-151`), one-rAF/deadline, pause/resume, and disposal tests (`:154-172`) unchanged except for any layer invariant they naturally exercise.
3. Re-run the existing definition, architecture, surface, import-guard, Lab stage, scenario, and renderer-reuse suites. The current unmodified baseline command passed **19 files / 297 tests** in this dirty worktree.
4. Run `npm run type-check`, `npm run lint`, task validation, and a task-scoped `git diff --check`; global whitespace output is known to include unrelated CRLF noise (see risks below).

**Visual evidence.** Reuse the existing Lab capture shape from `09-07.../artifacts/capture-restored-lab-evidence.mjs:7-50`, but write new task-local artifacts after the fix:

- Both `black` and `white` themes, actual 1x and magnified 3x Compact stage captures, at the real 80px outer / 60px shell / 56px mascot geometry.
- `compact-neutral`, `compact-surprised`, `compact-curious`, and `compact-playful` for core-projected pose changes; the earlier restored `curious` capture is a useful before image because it exposes the whole-node lobe.
- `compact-pointer` with the existing bounded in-stage point (`75%/25%` in the capture script) and a separate `compact-reduced` capture. Pointer evidence should show eye attention only; the current recipe intentionally does not produce head yaw/pitch.
- For every capture, assert through the DOM that `data-compact-mascot-ear="back-0/1"` have non-empty projected paths and `front-0/1` are empty. Visually confirm that the opaque head hides the root portions while exterior ear pixels remain visible, especially at the `curious-short`/`playful-short` samples where whole-node front classification previously leaked.

The Lab is the feasible visual evidence surface because it uses the exact production leaf and canonical definition. The previous task's Electron attempt exposed no visible native window; do not fabricate a native screenshot. Native lifecycle/pointer semantics remain covered by the production surface/runtime tests and unchanged code path.

### Related prior research/history

- `09-07.../research/compact-ear-root-occlusion-model.md` traced the same seam and established that the complete `headPath` painted after a complete ear already provides the desired natural root overpaint **when the ear stays in `backPaths`**. It also documented the missing core per-node layer override and warned against masks/fragments.
- `09-07.../artifacts/implementation-report.md`, `artifacts/final-stop-check.md`, and `artifacts/check-report.md` record that the canonical diamonds were restored, the Lab frozen-pose seam was retained, OneWorks inspector/dependencies remained active, and the C6 rounded-cone candidate was rejected. The C6 `curious` 3x capture visibly shows the same whole-node side-lobe failure this task fixes at the composition seam; no cone or OneWorks geometry is to be reintroduced.
- `09-07.../design.md:36-43` and `implement.md:20-25,59-63` explicitly prefer definition-only/existing-core wiring and make new core APIs, masks, clipping, depth fragments, renderers, forks, vendoring, and `patch-package` non-goals. The historical depth-aware patch and reports are immutable evidence only; the preserved patch hash is `B8EDD2CF617558EC0C0A80FBA013DD3CA88DE6A22EF21C915D61403191A0A23D`.
- The installed dependency is `@bible-strong/avatar-core@0.1.0`, AGPL-3.0-only, pinned in `package-lock.json:314-324`; the checked-in upstream source and installed dist implement the same whole-node contract. No upstream/core modification is needed for this task.

## Dirty worktree risks

- The worktree contains the prior 09-07 uncommitted Compact/Lab seam (`CompactMascot.tsx`, `compactMascotBehaviorRuntime.ts`, their tests, `CompactPreviewStage.tsx`, `PresentationLab.tsx`, scenarios, locales, and the matching character-motion spec). Layer the two-array integration fix on these edits; do not reset, checkout, or restore them.
- Unrelated tracked edits in `browser-extension/locales/contract.json`, `electron-builder.config.mjs`, and `src/electron-runtime/runtimeDependencyGate.ts` are line-ending-heavy and are the known source of global `git diff --check` noise. They are outside this task.
- Untracked `.cindy-upstream/`, `.cindy-worktrees/`, prior/current task directories, evidence trees, and package-output trees are present. Do not delete or rewrite them. In particular, preserve all 09-07 archived/historical files byte-for-byte.
- The current definition files are clean/restored diamonds; a geometry edit would exceed this task's root-integration decision and risk reopening the rejected 09-07 evidence gate.

## Caveats / Not Found

- The active 09-09 task currently has only `prd.md`, `task.json`, and empty context manifests; no separate `design.md` or `implement.md` adds a different architecture decision. This report follows the PRD's explicit behind-head/no-new-geometry boundary.
- The proposed flattening is intentionally whole-node behind-head composition, not physically accurate partial depth. If a later product decision requires an ear tip in front while its root remains occluded, that is a different core capability and is explicitly out of scope here.
- No native-holder visual capture was available in prior work; use Lab screenshots plus DOM layer assertions and retain that limitation in the implementation report.
- No product, spec, or task metadata was modified by this investigation; only this research file was written.
