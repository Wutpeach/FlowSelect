# Compact Mascot ear-geometry calibration research

Date: 2026-08-24

Scope: repository-grounded research only. No product-code, test, planning-artifact,
or archived-task changes are part of this report.

## Baseline and current authority

Repository baseline inspected: `824b13f0c7bc97a082e4e2e0720e49039d4b9a46`.

- [`src/presentation/main-window/compactMascotDefinition.ts:6,31-60`](../../../../src/presentation/main-window/compactMascotDefinition.ts)
  pins Kirby revision `175691ab32cefe5faec7828af62f3d50210a8eb2`, retains the
  240x240x240 sphere source body, and changes only the two production body nodes.
  Each current ear is a `diamond`, `108x190x102`, `roundness: 1`, with positions
  `[-72,-50,-80]` and `[72,-50,-80]`, and zero local rotation. The same file's
  lines 64-80 retain the pinned expressions and the visual-only action allowlist:
  `surprised`, `curious-short`, and `playful-short`.
- [`src/presentation/main-window/compactMascotBehaviorRuntime.ts:31-52`](../../../../src/presentation/main-window/compactMascotBehaviorRuntime.ts)
  is the rendering seam. One current sampled avatar frame receives normal
  ambient processing, then the same full pose is rendered once for head/eyes and
  once with the two body nodes. The returned back/front node paths are merged
  into the head scene; there is no frozen path, ear-only pose remap, or alternate
  renderer.
- [`src/presentation/main-window/CompactMascot.tsx:50-82,84-137,139-181`](../../../../src/presentation/main-window/CompactMascot.tsx)
  owns the fixed two-back/two-front SVG path slots, local runtime lifecycle,
  Reduced Motion static rendering, document visibility pause/resume, and
  disposal. It has no Product, lifecycle, native, IPC, or completion authority.
- [`src/presentation/main-window/MainWindowPresentationSurface.tsx:1191-1247`](../../../../src/presentation/main-window/MainWindowPresentationSurface.tsx)
  owns shell presence/settle choreography and the unchanged 80px outer frame,
  60px shell, and 56px holder. The current mascot render size is `56 * .95`.
- [`src/presentation/main-window/compactMascotRecipe.ts:5-22,44-79`](../../../../src/presentation/main-window/compactMascotRecipe.ts)
  owns only view size and pointer-attention geometry. It should not be changed
  for an ear calibration.

The authoritative production definition therefore has exactly two avatar-core
body nodes, one current-pose projection path, and core-owned depth/layer output.
The current neutral and sampled action frames report two back paths and zero
front paths.

## OneWorks Cat reference

The visual reference was fetched from `https://github.com/oneworks-ai/avatar` at
commit `ef13e742bcab606a2f8925da416e97c9fef41526`.

- [`src/avatarEntityPresets.ts:500-504`](https://github.com/oneworks-ai/avatar/blob/ef13e742bcab606a2f8925da416e97c9fef41526/src/avatarEntityPresets.ts#L500-L504)
  defines the Cat parts. The left ear is a cone with scale X/Y/Z
  `.24/.29/.24`, center `(-56,-78,-8)`, roundness `48`, rotation
  `(-7,-13,-9)`. The right ear is a cone with scale X/Y/Z `.23/.28/.23`,
  center `(56,-78,-10)`, roundness `52`, rotation `(-6,+13,+9)`. The head is
  an ellipse with scale X/Y/Z `.73/.68/.68`, center `(0,12,0)`.
- [`src/avatarEntityPresets.ts:553-555`](https://github.com/oneworks-ai/avatar/blob/ef13e742bcab606a2f8925da416e97c9fef41526/src/avatarEntityPresets.ts#L553-L555)
  defines omitted `scaleZ` as `min(scaleX, scaleY)`.
- [`src/avatarGeometry.ts:230-242`](https://github.com/oneworks-ai/avatar/blob/ef13e742bcab606a2f8925da416e97c9fef41526/src/avatarGeometry.ts#L230-L242)
  gives the canonical cone radii `[139,139,124]` and ellipse radii
  `[153,118,122]` used for the normalized calculation below.
- [`src/avatarGeometry.ts:354-374,830-835`](https://github.com/oneworks-ai/avatar/blob/ef13e742bcab606a2f8925da416e97c9fef41526/src/avatarGeometry.ts#L354-L374)
  and `:830-835` show that Cat's cone roundness changes the radial profile and
  softens the projected apex outline, but the cone endpoint remains zero-radius;
  it is not a truly blunt or flat tip.
- [`src/InteractiveAvatar.tsx:291-321,353-432,474-540`](https://github.com/oneworks-ai/avatar/blob/ef13e742bcab606a2f8925da416e97c9fef41526/src/InteractiveAvatar.tsx#L291-L321)
  computes rotated depth, applies face-derived occlusion masks, renders parts,
  and then renders the face. [`src/avatarGeometry.ts:736-863`](https://github.com/oneworks-ai/avatar/blob/ef13e742bcab606a2f8925da416e97c9fef41526/src/avatarGeometry.ts#L736-L863)
  builds projected outlines and optional occlusion caps.

### Normalized proportions (Y:X:Z order)

Using OneWorks' own canonical radii and scale defaults:

- OneWorks head radii are `[111.69, 80.24, 82.96]` in X/Y/Z.
- Left ear radii are `[33.36, 40.31, 29.76]` in X/Y/Z. Relative to the head,
  its Y:X:Z radii are approximately **`.502 : .299 : .359`**.
- Right ear radii are `[31.97, 38.92, 28.52]` in X/Y/Z. Relative to the head,
  its Y:X:Z radii are approximately **`.485 : .286 : .344`**.
- Relative ear centers from the head center, in Y:X:Z, are approximately:
  left **`-1.122 : -.501 : -.096`** and right **`-1.122 : +.501 : -.121`**.
  Ear center spacing is roughly half the head's full width.
- Rotations are intentionally near-mirrored: Y and Z signs mirror exactly
  (`-13/+13`, `-9/+9`); X tilt is nearly matched (`-7/-6`). Roundness has a
  slight asymmetry (`48/52`).
- Roots are embedded behind the face. Ear bases land around y=-38/-39 while
  the head top is around y=-68, creating roughly 29-30 local units of overlap.
  `occludedByFace: true` plus depth sorting and a face mask creates natural
  root occlusion; visibility changes naturally as yaw/pitch changes.

These are renderer-neutral ratios and visual principles, not coordinates to
copy into avatar-core. OneWorks uses a different scene schema, cone profile,
scale model, face mask, and renderer. Do not import its schema, masks, or
renderer, and do not migrate the Compact renderer.

## UI Lab and evidence matrix

- [`src/lab/lab-main.tsx:9-21`](../../../../src/lab/lab-main.tsx) is the dev-only
  browser entry and mounts Agentation.
- [`src/lab/PresentationLab.tsx:506-590,912-1109`](../../../../src/lab/PresentationLab.tsx)
  owns target/scenario/reduced-motion state, Compact scenario controls, target
  and scale controls, reset, and evidence/export chrome. Compact inspector facts
  are at `:1152-1155`.
- [`src/lab/CompactPreviewStage.tsx:1-13,58-61,62-154`](../../../../src/lab/CompactPreviewStage.tsx)
  mounts the production CompactMascot directly at 80/60/56 geometry with a
  Lab-local pointer field and a browser-only -16px approach capture room. It
  does not mount the native/MainWindow surface, canvas, shader, or second runtime.
- [`src/lab/scenarios.ts:463-506`](../../../../src/lab/scenarios.ts) defines the
  only three Compact scenarios: neutral, live pointer, and live Reduced Motion.

Evidence files are under:
`.trellis/tasks/archive/2026-08/08-24-compact-mascot-cat-behavior-planning/research/evidence/`.

| Pose/evidence | Required observation |
| --- | --- |
| Neutral front, real 1x, light/checkerboard | Two product-legible peaks; measure tip spacing, ear width, notch width/depth against the supplied reference. |
| Idle and each allowlisted action at 800ms, 3050ms, 3700ms | Record expression/head tuple, path hashes/bounds/centroids, core same-frame equality, back/front counts, and scaled circular-shell/frame bounds. |
| Cardinal/diagonal pointer approach | Use Compact Lab pointer samples; attention remains additive and geometry remains unchanged. |
| Reduced Motion | Static open eyes, no decorative frame work, smaller direct attention, and fresh baseline on normal re-entry. |
| Hidden/visible and dispose/remount | Exact playback/deadline pause/resume and stale callback invalidation. One rAF, no timer. |
| Full/MR9 regression | Existing Full/MR9 crop remains unchanged; native forwarding/hotspot remains a separate NOT VERIFIED risk. |

`compact-ear-clipping-matrix.json` audits viewBox ±150, shell ±160.714,
frame ±214.286, and `.95` scale across neutral, idle, and all retained actions.
`curious-evidence-frame-matrix.json` contains direct-core and browser-Lab
samples with matching hold hashes. `neutral-ear-spacing-metrics.json` reports
null production mask spacing/width/notch metrics, while the current direct tip
spacing is `.5314` versus the reference `.675`.

## Validation

Focused command:

```powershell
npx vitest run src/presentation/main-window/compactMascotDefinition.test.ts src/presentation/main-window/compactMascotBehaviorRuntime.test.ts src/presentation/main-window/compactMascotRecipe.test.ts src/presentation/main-window/compactMascotSurface.test.ts src/presentation/main-window/compactMascotArchitecture.test.ts src/lab/compactPreviewStage.test.ts src/lab/compactPointerField.test.ts src/lab/scenarios.test.ts
```

Result: **15 test files passed; 152 tests passed.**

## Calibration boundary and stop condition

One authorized calibration probe may edit only the two node surface/position/
rotation values in `compactMascotDefinition.ts:58-60`, with corresponding
focused test and task-local evidence updates. Preserve the primary sphere,
expressions, animation timings/allowlist, avatar-core seam, shell/56 holder,
pointer ownership, Reduced Motion, visibility, disposal, and native boundaries.

The current evidence shows the bounded two-diamond avatar-core capability cannot
yet guarantee both a product-legible neutral two-ear silhouette and full-action
shell clearance. In particular, the current neutral mask has no two distinct
ear components, while `playful-short` reaches unscaled y=-166.88 and requires
the evidenced `.95` scale to clear the shell. If a candidate still fails either
neutral legibility or the full-pose shell matrix under the fixed 56/60/80 host,
stop and request a product constraint decision. Do not add a renderer, custom
paths, extra nodes, generic framework, or continue tuning outside the bounded
geometry envelope.
