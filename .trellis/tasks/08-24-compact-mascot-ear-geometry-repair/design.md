# Compact Mascot ear geometry repair design

## Decision summary

This is a definition-level calibration of the existing Compact mascot, not a
new mascot implementation. The repair retains the pinned Kirby definition,
the two fixed source-specific SVG ear slots, full current-pose `avatar-core`
projection, the existing Compact-local runtime, and the existing circular
shell. The reviewed task-local research establishes the current geometry as
evidence only; it does not choose final numeric values for the calibration.

## Architecture and ownership

```text
CompactMascot definition (two static body nodes)
  -> avatar-core validates and projects each current avatar frame
  -> CompactMascot paints fixed back/head/front paths
  -> existing Compact runtime applies its unchanged playback and attention
  -> existing Surface remains the sole pointer, lifecycle, shell, and native owner
```

The geometry participates in the same full pose as the head. It must therefore
rotate, perspective-project, and depth-split with the head in every retained
expression. A side or action frame may hide some of an ear behind the sphere;
that is natural 3D occlusion and is not a reason to add a billboard correction.

## Calibration model

The first search is confined to the two existing legal body nodes in
`compactMascotDefinition.ts`. It evaluates a bounded set of several reasonable
controlled candidates, one geometry family at a time, across:

- X/Y/Z dimensions, with the current Y-length/fatness relationship treated as
  a primary visual variable;
- supported roundness and the resulting tip/base silhouette;
- root embedding inside the sphere;
- symmetric X/Y/Z placement, negative/positive depth behavior, and mirrored
  local rotation; and
- the fixed 56px holder, with the existing centered scale treated as a
  compatibility constraint rather than an ear-hiding knob.

A candidate failure rejects only that candidate. It does not establish that
the two-node seam is impossible and does not authorize renderer/capability
work, action removal, or mascot shrink. The stop condition applies only after
the bounded comparison set fails the primary neutral/front and low-amplitude
gates.

The current evidence point is two `diamond` nodes, `108×190×102`,
`roundness: 1`, centered at `[-72,-50,-80]` and `[72,-50,-80]`, with zero
local rotation. It is the measurement starting point—not a target to retain.

OneWorks Cat supplies normalized checks only: a short/broad near-isotropic X/Z
ear mass with moderate Y elongation; centers roughly a head half-width apart;
deep root embedding; mirrored outward Y/Z rotation; a rounded cone profile
whose apex is still not blunt; and natural face masking/depth occlusion. No
OneWorks source code, renderer behavior, schema, profile semantics, mask, or
absolute coordinate is copied into `avatar-core`.

The first visual gate is neutral/front at 1x. Once it passes, the same
candidate is assessed under low-amplitude baseline movement, a representative
side/rotated pose, and a retained action with high head rotation. The ears
must remain physically attached to the posed head; frontality in an action is
not more important than that attachment.

## Action policy

`surprised`, `curious-short`, and `playful-short` remain unchanged. Geometry
selection cannot alter their steps, timings, cadence, or runtime behavior. If
a reasonably calibrated shape has concrete, captured, unacceptable clipping
in a retained action, the plan may record an action-curation candidate for a
later review. It may not silently remove an action, add a scheduling policy,
or modify the runtime in this task.

## Smallest anticipated source boundary

Expected product edits are limited to:

1. the two body-node geometry values in
   `src/presentation/main-window/compactMascotDefinition.ts`; and
2. the matching focused geometry assertions in
   `src/presentation/main-window/compactMascotDefinition.test.ts`.

Task-local evidence, calibration notes, and a final implementation report are
also expected. `CompactMascot.tsx`, the behavior runtime, recipe/render scale,
Surface, Pointer Field, hotspot, lifecycle/native wiring, Full/MR9, and
dependencies are not planned edits. Evidence outside that boundary is a stop
condition, not permission to expand the implementation.

## Validation design

The browser UI Lab production leaf is the visual authority. The evidence set
will comprise tightly cropped neutral/front 1x (primary), compact 2x/3x
supporting crops, a low-amplitude baseline, one representative side/rotated
crop, and each retained action's representative maximum-rotation, first hold,
transition, and second hold. It also covers pointer/approach, Reduced Motion,
hidden/visible, dispose/remount, and a compact unchanged Full/MR9 comparison.
A compact sheet may contain labels and small measurement summaries, but not raw
SVG/JSON or a tall full-page screenshot.

Automated checks confirm the definition remains valid, its two core paths keep
layer order, the existing runtime/seam behavior is intact, and authority guards
remain green. Browser evidence evaluates the visible priorities that tests
cannot determine: neutral cat read, normal scale, root embedding, natural
occlusion, and no unreasonable shell clipping.

## Stop and rollback

If reasonable two-node 3D calibration cannot satisfy neutral/front and
low-amplitude baseline poses, preserve the tested evidence in
`research/ear-geometry-calibration-report.md`, write the implementation/stop
report, and return for review. Do not add a primitive, custom path, renderer,
framework, or pose-specific correction. No Architecture PASS may be claimed.

If a calibrated candidate passes, rollback is one focused revert of the
definition values, focused assertion update, and task-owned evidence; the
existing Compact presentation seam remains untouched.
