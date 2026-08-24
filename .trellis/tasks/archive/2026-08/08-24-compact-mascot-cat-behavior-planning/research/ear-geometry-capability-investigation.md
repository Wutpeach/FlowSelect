# Compact cat-ear geometry capability investigation

Date: 2026-08-24
Scope: research only; no product-code recommendation is an Architecture PASS.
Baseline: pinned upstream `smontlouis/bible-strong-avatar-lab@175691ab32cefe5faec7828af62f3d50210a8eb2` and installed `@bible-strong/avatar-core@0.1.0`.

## Executive verdict

The rejected `205 × 150 × 155` cone is failing for structural reasons, not
because its three roundness values need more tuning:

- `SurfaceConfig.roundness` is not read by the cone profile. The current
  `roundness: 0.7` therefore contributes no cone silhouette rounding.
- `tipRoundness` only bends the last part of the meridian toward the apex; the
  endpoint remains radius zero. It cannot produce a blunt/rounded silhouette
  tip.
- `baseRoundness: 1` is capped at a 20% base profile interval and retains
  80% of the cone radius at the base. With width 205 and centers at ±50, the
  base extends to approximately ±132 in head space while its y is about -13;
  this exceeds the sphere's local outline and reads as lateral shoulder wedges.

The best supported experiment is a `diamond` node with high `roundness` and
full current head pose, followed by a narrower `capsule` if a softer/blunter
ear is acceptable. Neither is verified against the supplied visual target yet.
There is no supported composite-within-body-node representation that gives a
wide tapered ear with a genuinely rounded tip: `mickey` and `cursor` are
primary-only special surfaces and are excluded from body-node definitions.
If the target requires both a pointed cat contour and a visibly flat/rounded
apex, avatar-core 0.1.0 has a capability blocker under the stated constraints;
do not solve it with frozen SVG paths or a custom renderer.

## Verified supported surfaces and semantics

Installed declarations and schema: `node_modules/@bible-strong/avatar-core/dist/
{surfaces.d.ts,avatarDefinition.d.ts,body.d.ts}`. The readable pinned source
is `.cindy-upstream/bible-strong-avatar-lab-175691a/packages/avatar-core/src/`:

| Surface | Body-node status | Projection / roundness semantics |
|---|---|---|
| `sphere` | supported | Ellipsoid from `superellipsoid(..., 1, 1)`; `roundness`, `morphRoundness`, `tipRoundness`, and `baseRoundness` do not alter it (`surfaces.ts:63-78,299-309`). |
| `cube` | supported | Lp superellipsoid. `roundness: 0` is a cube; increasing it changes the exponent toward 2 (ellipsoid-like); the other three controls are unused (`surfaces.ts:108-147,397-430`). |
| `capsule` | supported | Two ellipsoidal caps plus a straight section. Cap radius is `min(width/2,height/2)` and `straightHalf = max(0,(height - 2*capRadius)/2)`; the roundness controls are unused (`surfaces.ts:80-104`). |
| `cylinder` | supported | Revolved radial profile. `roundness` controls quarter-round cap edge fraction up to `0.22`; `morphRoundness` blends the profile toward an ellipsoid. It has no apex (`surfaces.ts:197-232,299-319`). |
| `cone` | supported | Vertical cone meridian; apex is local `y = -height/2`, base is `y = +height/2`. `tipRoundness` is at most `0.24` of the meridian and `baseRoundness` at most `0.20`; `morphRoundness` is the only general cone-to-ellipsoid blend. `roundness` is not consulted (`surfaces.ts:149-195,250-284,340-348`). |
| `diamond` | supported | Lp surface with exponent `1 + clamp(roundness)/2`; `roundness: 0` is an octa/diamond and `roundness: 2` is ellipsoid-like. Tip/base/morph controls are unused (`surfaces.ts:106-147`). |
| `mickey` | primary-only special | `compositeBackPaths` makes two fixed projected ellipses at fixed offsets; it is excluded from `BodyNodeSurfaceType` (`avatarDefinition.ts:35-59`; `geometry.ts:1046-1064`). |
| `cursor` | primary-only special | Its primary projection is a cone apex plus a rounded cylinder body; body-node schema excludes it (`avatarDefinition.ts:46-48`; `geometry.ts:809-825`). |

The six legal body-node primitives are explicit in `body.ts:18-25`, and the
definition type excludes `mickey`/`cursor` in `avatarDefinition.ts:46-54`.
The upstream schema test rejects `cursor` as a node (`src/features/avatar/
__tests__/avatar-definition-test.ts:385-392`) while accepting node transforms
and all roundness fields (`:24-39,286-296`). Thus there is no hidden node
surface or nested/composite node type available in the installed package.

## Why the current cone reads as a roof

The exact cone profile is `coneProfileAt` (`surfaces.ts:250-280`):

1. At the base, `baseFraction = baseRoundness * 0.2`. With `1`, the profile
   starts at `radiusScale = 1 - 0.2 = 0.8`, not at a narrow attachment.
2. Through the central interval, radius decreases linearly as `1 - progress`.
3. At the tip, `tipFraction = tipRoundness * 0.24`; the cubic ends at
   `radiusScale = 0` and `verticalProgress = 1`. Every legal cone therefore
   has a single geometric apex, regardless of `tipRoundness`.
4. `morphRoundness` can blend toward an ellipsoid, but the ellipsoid also has
   zero radius at its pole, so even a full morph does not create a flat tip.

The body-node projector samples 17 latitudes × 49 longitudes, applies local
  node quaternion, position, then the avatar pose quaternion and perspective,
  computes a 2D convex hull, and smooths/densifies that hull
  (`geometry.ts:1155-1190`; projection denominator `:266-270`). Smoothing the
  hull cannot invent a finite-width apex when the sampled 3D surface itself
  terminates at one point. `roundness: 0.7` is especially misleading because
  the body-node cone path never invokes the head-only rounded primitive branch;
  body nodes always use the sampled hull (`geometry.ts:1183-1190`).

For the rejected dimensions, the local base center is `position.y + height/2
= -88 + 75 = -13`. The 0.8 profile radius gives a half-width of about 82
(`205/2 × .8`); centers ±50 therefore reach about ±132. The 240 sphere at
y=-13 reaches only about ±119.3 before perspective. Since back paths are
painted behind the head, the sphere masks only its own interior; the excess
outer base remains as a pair of lateral wedges. Moving the node deeper in z
changes depth ordering/perspective but does not make the 2D outer base fit the
head. Rotating the cone can make the wedge less symmetric, not remove its
finite broad base.

## Candidate search within the constraints

All candidates preserve exactly two nodes, static node-level position/rotation,
the 240 sphere, and avatar-core's current-pose projection. Values are starting
ranges for a visual probe, not acceptance values.

| Rank at 1x | Parameterized candidate | Why it may work | Main risks / retained-action behavior |
|---|---|---|---|
| 1 | **Rounded diamond:** each node `{type:"diamond", width:115–135, height:185–210, depth:105–125, roundness:1.5–2}`; centers about `±42–48, y=-72–-88, z=-65–-80`; optional mirrored local z tilt `±6–12°`. | It is the only legal tapered surface whose `roundness` directly changes the tip profile. At high roundness the pole becomes ellipsoid-like rather than cone-like, while the lower pole can intersect the sphere and disappear behind it, leaving two broad ears and a natural center notch. | At low roundness it remains a diamond point; near 2 it becomes bunny/leaf-like. The lower pole may show a side wedge if too wide or too high. Full head pose is physically coherent but can tilt ears significantly during `expression-00/15`, `02/17`, `03/21`; validate every hold and transition at 1x. |
| 2 | **Rounded capsule:** each node `{type:"capsule", width:105–135, height:170–205, depth:95–125, roundness:1}`; centers about `±42–50, y=-90–-115, z=-65–-80`; mirrored local z tilt `±6–12°`. | Capsule has genuinely rounded top and bottom caps, so it is the strongest blunt-tip option using current core geometry. Two nodes naturally retain a shallow center notch when their centers are separated. | It is pill/bunny-like rather than pointed cat-like. A wide capsule is vertically broad at the head's top and can recreate shoulder tabs; a narrower one may lose the requested large ears. Action pose is coherent under full pose but changes their overlap with the sphere. |
| 3 | **Cone fallback only:** narrower `{type:"cone", width:125–155, height:175–210, depth:105–130, tipRoundness:1, baseRoundness:0.2–0.6, morphRoundness:1.5–2}`; centers about `±42–48, y=-90–-110, z=-65–-85`, with mirrored local z tilt. | Morphing reduces the straight roof profile and narrower dimensions reduce the lateral wedge. It stays semantically cat-like if a small apex is acceptable. | It cannot meet a requirement for a visibly rounded/blunt tip: the cone pole remains a single point. It is therefore not a credible final candidate for the supplied large rounded ears unless visual review explicitly accepts a point. |

No candidate can produce a true rounded trapezoidal/triangular ear with both a
wide, smoothly merged base and a finite-width rounded apex using one legal
node. `mickey` would provide two ellipses but is not legal as a body node and
its ears are not pointed; `cursor` is a primary-only two-part composite. A
composite within a body node, custom mesh, extra node, SVG overlay, or frozen
path would violate the task boundaries.

## Current-pose transform limits

The current dirty calibration's `projectCompactMascotEarPose` is still a real
avatar-core 3D projection, not a frozen path: it extracts the pose quaternion
to Euler angles, scales pitch/yaw/roll by `[0.22, 0.22, 0.55]`, rebuilds a
quaternion, and calls `renderAvatar` with the two body nodes
(`src/presentation/main-window/compactMascotDefinition.ts:91-107`; node
projection `geometry.ts:1169-1182`). The resulting paths remain current-pose
3D samples and depth-split through `accessoryLayers` (`geometry.ts:1217-1234`).

It is nevertheless not physically one rigid avatar. The head/eyes use `R`
while ears use a separately reconstructed `R'`; node positions are rotated by
`R'`, not `R`. Therefore ear centers, attachment/intersection points, and
camera depth diverge from the sphere as head pitch/yaw/roll changes. The
remap also attenuates action motion non-uniformly (for example a 35° yaw becomes
about 7.7°, while a 20° roll becomes about 11°), which is a visual policy, not
a transform available in the definition schema. The diagnostic
`research/evidence/3d-ear-calibration-diagnostic.png` proves current-pose
projection but is not visual acceptance evidence; the task's repair report
records the roof/wedge rejection (`repair-report.md:20-55,64-80`).

The best definition-level formulation under current core is: keep node
positions and mirrored local z rotations static, and pass the **full** avatar
pose to the body-node projection. This preserves one rigid head-relative body
and lets sphere overlap/depth respond naturally in every expression. It may
make ears tilt too much for the retained actions, but that is an honest visual
tradeoff. If the target needs ears to remain upright while the head turns,
there is no definition-level solution in avatar-core 0.1.0: `AvatarExpression`
has head/eye fields only (`avatarDefinition.ts:61-74`) and `BodyNode` has only
one static position/rotation (`body.ts:5-16`). Per-expression node transforms
would require an upstream schema/core change; custom 2D paths are explicitly
forbidden here.

## Required next evidence and blocker status

Before any implementation decision, render the three candidates from the
source functions at neutral plus all retained action holds/transitions and
inspect tightly cropped 1x/2x/3x sheets. Record ear tip width, base shoulder
extent, center notch depth, sphere intersection, and whether both nodes remain
behind the head. Include blink, pointer, hidden/resume, Reduced Motion, and
Full/MR9 regression only after the shape candidate survives neutral/action
review.

**Status:** no authority or lifecycle architecture blocker was found. There is
a geometry capability blocker for the exact combination “large broad tapered
ear + genuinely rounded/blunt apex + one legal current-pose body node.” The
ranked diamond/capsule experiments are research candidates, not Architecture
approval. Do not claim PASS until visual review accepts one; if none passes,
stop at the capability blocker rather than introducing a forbidden renderer.
