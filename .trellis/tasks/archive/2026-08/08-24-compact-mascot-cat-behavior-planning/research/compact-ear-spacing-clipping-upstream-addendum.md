# Compact ear spacing, clipping, and upstream cat-reference addendum

Date: 2026-08-24  
Scope: bounded research only. No product/spec/test change and no Architecture
PASS. Baseline is main `8343d54`, installed
`@bible-strong/avatar-core@0.1.0`, and the pinned Kirby source
`175691ab32cefe5faec7828af62f3d50210a8eb2`.

## Executive verdict

The neutral failure is primarily spacing, not ear width: the current Lab mask
has approximately the reference ear width ratio but only about half the
reference tip spacing and almost no forehead. The next repair should reduce
width modestly and move the two nodes outward; it should not shrink the whole
mascot before that geometry is tried. A small downward y adjustment is also
needed if retained full-pose actions must stay inside the 60px shell.

The OneWorks cat preset is a stronger *visual cat-shape reference* than Kirby:
it uses two mirrored cone accessories, explicit local tilts, and face occlusion.
It is not a drop-in source: it uses `@oneworks/avatar` schema/version 1 and a
different SVG geometry implementation. Its transferable idea is the two
separated, tilted, face-occluded cone arrangement only. The exact rounded-tip
result cannot be imported into the fixed avatar-core seam.

## Measured neutral relationship

Measurements are from the existing user-reference mask and real Lab 1x
comparison (`research/evidence/neutral-reference-comparison.png`); edges are
anti-aliased, so values are approximate and normalized to visible head width.

| Metric | User reference | Current Lab 1x | Finding |
|---|---:|---:|---|
| Head/body width | 523px (`1.00`) | 138px (`1.00`) | Baseline scale |
| Ear-tip center spacing | 353px (`.675`) | 42px (`.30`) | Current ears are much too close |
| Ear-base center spacing | 293px (`.560`) | not separately reliable; bases merge | Forehead is erased at the bases |
| Individual ear width | 138px (`.264`) | 35–37px (`.25–.27`) | Width is already near target |
| Widest center notch | 24px (`.046`) | ~3px (`.02`) | Need a visible shallow valley |
| Valley depth | 79px (`.151`) | ~19px (`.14`) | Depth is broadly right |

The current `125`-wide ears therefore should not be aggressively narrowed.
The x-center separation must move from `84` units toward roughly `120–144`
units (candidate-dependent), while width should fall only about 8–20%.
Reference ear-height/base-width and shoulder-merge values remain visual gate
measurements rather than precise source facts; the supplied raster does not
expose true 3D attachment boundaries.

## Ranked legal candidates (research parameters, not implementation)

All preserve the sphere's existing `240` / Compact `80/60/56` geometry, exactly
two `diamond` nodes, `roundness: 1`, and full current-pose projection. They are
starting probes for the source adapter, not acceptance values.

| Rank | Two-node definition | Expected 1x tradeoff |
|---|---|---|
| 1 | `diamond 108×190×102`, centers `x=±68`, `y=-50..-60`, `z=-80` | Best spacing/width correction. At `y=-50`, direct-core neutral bounds are about `x ±108`, `y -128..40`; ears are smaller but still exposed. Risk: only modest neutral ear height and action pose can rotate the tips. |
| 2 | `diamond 100×175×95`, centers `x=±72`, `y=-45..-55`, `z=-80` | Safest shell clearance and strongest forehead. Risk: may read too small/short and less cat-like at 1x. |
| 3 | `diamond 115×195×105`, centers `x=±60`, `y=-50..-60`, `z=-80`, optional mirrored local z tilt `±6°` | Preserves more large-ear presence while fixing most overlap. Risk: action clipping and shoulder merge remain more likely. |

The earlier `y=-82` probes fix spacing but are not sufficient for the actual
full-pose clipping matrix below. Do not silently retain that y value merely
because it matches the current candidate. The local z tilt is optional and
must remain mirrored; it can improve the neutral organic read but cannot create
a rounded apex or remove action pitch clipping.

## Direct-core clipping audit

This is a read-only direct projection of the current production definition and
full upstream head poses, using the retained action holds and transition
samples. Bounds are avatar SVG units. Current SVG viewBox is `[-150,150]`;
the 60px shell at a 56px render maps to approximately `[-160.7,160.7]` and
the 80px Lab/window frame to approximately `[-214.3,214.3]`.

| Runtime state / important sample | Current ear bounds (min/max x, min/max y) | ViewBox | 60px shell | 80px/window |
|---|---|---|---|---|
| Neutral | `[-92.6,92.6]`, `[-159.4,14.1]` | y ~1.8 over | pass | pass |
| Surprised `expression-03` hold | `[-89.8,83.2]`, `[-167.3,22.8]` | y over | clips y | pass |
| Surprised → `expression-21` hold | `[-92.9,88.7]`, `[-179.1,11.8]` | y over | clips y | pass |
| Curious `expression-00` hold | `[-140.3,31.8]`, `[-135.7,39.2]` | pass | pass | pass |
| Curious → `expression-15` hold | `[-144.5,23.0]`, `[-151.8,29.4]` | y ~1.8 over | pass | pass |
| Playful `expression-02` hold | `[-94.5,92.0]`, `[-194.9,-2.7]` | y over | clips y | pass |
| Playful → `expression-17` hold | `[-132.2,48.6]`, `[-165.3,24.6]` | y over | clips y | pass |

The values above include both ear paths, rounded to one decimal, and were
computed from `advanceAvatarPlayback` → `sampleAvatarFrame` →
`renderAvatarFrame` at the source holds/transition checkpoints. The current
candidate is consequently *not* shell-clear in all retained actions. This is
not a genuine 80px/window overflow. The production wrapper has
`overflow: visible` and the 60px shell is the real clip; the 56px holder itself
does not clip. Candidate A at `y=-50` reduces neutral/action extents, but its
`expression-02` sample still reaches about `y=-166`; it needs either a small
further y adjustment or direct visual acceptance of natural shell occlusion.

This audit does not justify whole-mascot scaling. First render the bounded
smaller candidates at all listed checkpoints. If a shape that passes the
neutral gate remains shell-clipped, the smallest fallback is a uniform scale
of roughly `0.95` (not a new geometry baseline), with a fresh 1x evidence sheet;
that fallback is currently *not recommended* because y/height correction is
the more local fix and the 80px frame has ample clearance.

## OneWorks Avatar source-level comparison

Inspected upstream `oneworks-ai/avatar` main at
`ef13e742bcab606a2f8925da416e97c9fef41526`:

- Public reference: [repository](https://github.com/oneworks-ai/avatar/tree/ef13e742bcab606a2f8925da416e97c9fef41526), [live editor](https://avatars.bible-strong.app/), and the repository's [cover asset](https://github.com/oneworks-ai/avatar/blob/ef13e742bcab606a2f8925da416e97c9fef41526/.github/assets/avatar-cover-light-en.jpg).
- Cat preset is `src/avatarEntityPresets.ts:8-38,72-89,284-309,500-504` (the exact source file is the stable anchor). It contains exactly two non-face cone parts and one ellipse head:
  - left: `shape:'cone'`, `scaleX:.24`, `scaleY:.29`, implicit `scaleZ:.24`, `x:-56,y:-78,z:-8`, rotation `[-7,-13,-9]`, roundness `48`, `occludedByFace:true`;
  - right: `shape:'cone'`, `scaleX:.23`, `scaleY:.28`, implicit `scaleZ:.23`, `x:56,y:-78,z:-10`, rotation `[-6,13,9]`, roundness `52`, `occludedByFace:true`;
  - head: `shape:'ellipse'`, `scaleX:.73`, `scaleY:.68`, `x:0,y:12,z:0`, face enabled.
- OneWorks canonical geometry uses `SHAPE_SPECS` in `src/avatarGeometry.ts:230-241` (`cone` radii `139,139,124`; ellipse radii `153,118,122`). Thus the cat ear scales are approximately `66.7×80.6×59.5` canonical units before rotation, not explicit width/height/depth fields.
- Parts are rendered by `InteractiveAvatar.tsx:152-218` through
  `buildAvatarBodyGeometry`; that function samples a 3D surface, builds an SVG
  outline/cell paths, and applies `roundedVertexPolygonPath` for cone profiles
  (`src/avatarGeometry.ts:230-241,462,736-836`). `roundness` affects
  this *projected SVG outline rounding*, unlike avatar-core's cone
  `tipRoundness`/`baseRoundness` semantics.
- Definition schema is `oneworks.avatar`, version `1`, and uses
  `scene.entity.parts` with `AvatarEntityPart` plus `scene.appearance.bodyShape`
  (`packages/avatar/src/index.ts:14-16,128-141,228-270`). This is not
  `bible-strong/avatar-definition` and has no avatar-core `SurfaceConfig`
  dimensions. Its animation clips patch face/view/color-grade fields; they do
  not animate entity-part transforms. React/Web adapters use the same SVG
  `InteractiveAvatar` renderer and expose play/pause/resume/seek/stop, but are
  separate runtime/framework packages.

The OneWorks cat is therefore a better cat silhouette reference, especially
its spacing (`±56`), mirrored ear tilts, and explicit face occlusion. It cannot
be copied into Ameow without changing schema, renderer, canonical dimensions,
and rounding implementation. No extra node, decal, custom mesh, or custom
renderer from it is transferable under the fixed two-node avatar-core leaf.
Kirby remains the source-fidelity/authority baseline because the Ameow adapter
already pins its primary and expression data.

## Exact next repair boundary and evidence

The next repair may change only the two node surface dimensions/positions and,
if visual review requires it, mirrored local node rotation in the existing
`compactMascotDefinition.ts` adapter. Keep Kirby's primary sphere, expression
heads/eyes, action names/cadence, full/MR9, pointer/lifecycle/native authority,
and the `80/60/56` host geometry unchanged. Do not add OneWorks dependencies,
extra nodes, paths, decals, meshes, a new renderer, or whole-mascot scaling
unless a corrected candidate still fails a real shell-bound audit.

Required evidence is a tightly cropped neutral comparison at 1x/2x/3x plus
direct/browser sheets for neutral, every surprised/curious-short/playful-short
hold and transition, pointer approach, blink, hidden/resume, unmount/remount,
and Reduced Motion. Record tip spacing, visible forehead/notch, base shoulder
merge, ear/head continuity, SVG/viewBox overflow, shell clipping, and 80px
window clipping. Keep the current repair report's acceptance status unchanged.

## Blocker verdict

No authority, lifecycle, or upstream-integration blocker was found. There is a
geometry capability blocker for the exact combination of a broad tapered ear,
a genuinely finite rounded/blunt apex, and one legal avatar-core body node:
`diamond` can round a pole but is not a cat triangle, while `cone` always has a
single apex and its core roundness fields cannot make it blunt. The next repair
is therefore viable as a bounded spacing/size/pose experiment, but if no
diamond candidate passes the neutral gate, stop at this capability blocker;
do not import the OneWorks renderer or use frozen SVG paths.
