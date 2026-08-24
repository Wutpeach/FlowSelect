# Repair Compact Mascot ear geometry

## Goal

Restore a legible cat-ear silhouette for the normal-sized Compact mascot,
starting with the neutral/front 1x UI Lab view, while retaining real attached
3D `avatar-core` ears that rotate, perspective-project, and naturally occlude
with the current avatar pose.

## Confirmed baseline and evidence

- The authoritative product checkpoint is `b735075` on `main`. The pinned
  Kirby-derived definition is owned by
  `src/presentation/main-window/compactMascotDefinition.ts:58-60` and consumed
  by `@bible-strong/avatar-core@0.1.0`.
- The **current evidence baseline, not a prescribed final calibration**, is two
  static full-pose `diamond` body nodes: `108×190×102`, `roundness: 1`, at
  `[-72,-50,-80]` and `[72,-50,-80]`, with zero local rotation. The 240-unit
  Kirby sphere, expressions, colors, timings, and fixed `surprised`,
  `curious-short`, and `playful-short` allowlist remain authoritative.
- `compactMascotBehaviorRuntime.ts:31-52` samples one current avatar frame and
  projects head/eyes and the two nodes through the same full pose; there is no
  frozen path, ear-only pose remap, or alternate renderer. `CompactMascot.tsx`
  paints only its fixed two-back/two-front core-path slots.
- `MainWindowPresentationSurface.tsx:1191-1247` retains the 80px frame, 60px
  shell, 56px holder, and existing centered `.95` mascot scale. Those are
  compatibility boundaries, not variables to hide an oversized-ear result.
- The previous repair report is a rejected visual checkpoint: the neutral 1x
  mask found no two distinct ear components. The existing `.95` scale clears
  the known retained-action envelope; `playful-short` reaches unscaled
  `y=-166.88`. This evidence defines the problem but does not approve the
  current geometry.
- OneWorks Cat supplies only normalized visual principles: short, broad,
  near-isotropic X/Z ear mass with only moderate Y elongation; centers around
  a head half-width apart; deeply embedded roots; mirrored outward Y/Z
  rotations; a rounded cone profile with a still non-blunt apex; and natural
  head masking/depth occlusion. Its absolute values, schema, cone semantics,
  masks, and renderer are non-transferable.
- Task-local research is complete at
  `research/ear-geometry-calibration-report.md`. It establishes a bounded
  two-node calibration investigation and a fail-stop, not a new capability.

## Requirements

1. Calibrate geometry before considering any capability change through a
   bounded iterative loop of several controlled 3D candidates. Evaluate X/Y/Z
   proportion—especially current Y-length/fatness—supported primitive/shape
   parameters, roundness, root embedding, symmetric XYZ position/depth, and
   mirrored local rotation. Rejecting one candidate does not establish that the
   two-node seam is impossible or authorize broader capability work.
2. Keep exactly two real `avatar-core` body nodes under the full current head
   pose. Side-view overlap, head masking, and pose-driven depth/order changes
   are required 3D behavior, not defects to flatten.
3. Prioritize, in order: neutral/front 1x cat read; normal mascot size;
   natural 3D rotation/occlusion; then retained-action quality. Do not shrink
   the mascot to conceal unreasonable ears.
4. Keep the fixed action allowlist unchanged. A later action-curation candidate
   may be recorded only after reasonable calibration yields concrete,
   captured, unacceptable clipping; that record is not permission to remove or
   modify an action.
5. Use the real UI Lab production Compact leaf as visual truth. Neutral/front
   1x is primary; low-amplitude baseline, side/rotated, and retained-action
   maximum-rotation plus hold/transition states are mandatory secondary views.
6. Verify the unchanged Compact circle, pointer-follow/approach behavior,
   random-action behavior, Reduced Motion, hidden/visible, and dispose/remount
   lifecycle while checking the geometry.
7. Produce tightly cropped, reviewable element captures or compact contact
   sheets. Do not use tall full-page screenshots or raw JSON as visual proof.
8. Stop and return evidence only if the bounded loop of reasonable attached 3D
   candidates still fails neutral/front or low-amplitude baseline poses. A
   single failed candidate requires another controlled comparison, not a new
   primitive, renderer, path system, action removal, mascot shrink, or other
   capability expansion.

## Out of scope

- 2D/frozen ears, SVG overlays, custom paths, a third node, or a generic
  `avatar-core` geometry framework.
- A new renderer, scheduler, mascot framework, registry, plugin system, or
  behavior framework.
- Changes to the Compact circle, Pointer Field, approach-follow, hotspot,
  shell size, lifecycle, native authority, or window interaction.
- Full/MR9 behavior or visuals, interaction/reaction mapping, and any other
  mascot expansion.
- Migrating OneWorks Cat's renderer or copying its absolute coordinates.

## Acceptance criteria

- [ ] A tightly cropped neutral/front UI Lab 1x view visibly reads as a round
  cat mascot with two distinct, naturally embedded ears at normal size.
- [ ] The selected geometry remains two full-pose `avatar-core` body nodes,
  with no 2D correction, frozen geometry, or pose-specific ear transform.
- [ ] Low-amplitude, side/rotated, and each retained action's representative
  maximum-rotation, hold, and transition evidence show natural attachment and
  allowed occlusion, without detachment, face crossing, pathological wedges,
  or unreasonable Compact-shell hard crop.
- [ ] The Compact circle, pointer-follow/approach, random actions, Reduced
  Motion, hidden/visible, and dispose/remount behavior show no regression in
  focused checks and browser-Lab evidence.
- [ ] A compact review package covers neutral/front 1x primary truth;
  supporting 2x/3x; side/rotated; retained-action samples; Reduced Motion;
  pointer/lifecycle regressions; and an unchanged Full/MR9 comparison. It has
  no tall page capture or raw-data substitute.
- [ ] If the geometry-only search fails the baseline gate, the task closes with
  an evidence-backed stop report and no capability expansion.

## Risks and deferred items

The bounded two-node core may be unable to deliver both a product-legible
neutral silhouette and full-action clearance at the fixed host size, but a
single candidate failure is not evidence of that limitation. Only a documented
multi-candidate loop may reach the stop condition. The research does not
justify a new primitive or renderer if the loop fails; it requires a returned
product-constraint decision. Native forwarding/hotspot verification remains a
separate unchanged risk. No Architecture PASS is requested or implied.

## Planning readiness

There are no blocking planning questions. Research has resolved the
repository-answerable geometry/capability facts while intentionally deferring
the final numeric candidate to the execution evidence loop. The task remains
in `planning`; it requires a later approval and `task.py start` before any
product edit.
