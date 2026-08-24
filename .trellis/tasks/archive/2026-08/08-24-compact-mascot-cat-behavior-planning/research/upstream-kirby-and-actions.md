# Upstream Kirby source, shape candidates, and behavior inventory

Date: 2026-08-24
Upstream: `https://github.com/smontlouis/bible-strong-avatar-lab`
Pinned revision: `175691ab32cefe5faec7828af62f3d50210a8eb2` (`main`, checked out
under `.cindy-upstream/bible-strong-avatar-lab-175691a`). Kirby first appears in
the upstream Studio document at commit `3b2e134` and remains in the pinned
document. The previously archived report records the public source URL and
license evidence at
`.trellis/tasks/archive/2026-08/08-23-compact-mascot-visual-planning/research/upstream-bible-strong-avatar-lab.md:3-10,39-54`.

## Kirby: verified source shape

Kirby is the strongest starting point for this task because it already has a
round primary and exactly two symmetric accessory nodes. It is not already a
cat: both nodes are broad, rounded side spheres that read as side limbs/ears
depending on placement. The exact source object is
`.cindy-upstream/bible-strong-avatar-lab-175691a/src/features/studio/defaultStudioDocument.json:428-501`:

| Part | Exact source value |
|---|---|
| Primary | `sphere`, `240 × 240 × 240`, `roundness: 1` |
| Left node | `sphere`, `108.11015625 × 81.6 × 81.6`, position `[-103.30437876033604, 30.4449714479682, -9.784765625]`, z rotation `-14.843359375` |
| Right node | same dimensions, position `[98.15429266544173, 32.55003025735345, -9.784765625]`, z rotation `15.175000000000004` |
| Palette | body `#ffc2e9`, eyes `#3e4e65` |
| Default eyes | width `20`, height `60.473828125`, spacing `28.74921875`, y `-7`, zero x/angle offsets |

The source document stores Kirby in the Studio model (`library.avatars`) while
the published `avatar-core` runtime consumes a validated `AvatarDefinition`.
The repo contains an exported Strobi `.avatar.json` at
`examples/react-vite-consumer/src/strobi.avatar.json`, but no separate Kirby
export was found in the checked tree. A Kirby implementation therefore needs a
pinned, source-specific conversion/adapter like Ameow's existing
`src/presentation/main-window/strobiDefinition.ts`, not an assertion that the
Studio JSON is already a core definition.

## Minimum Kirby-to-cat derivative (recommendation)

Keep the source character recognizable and change only the two accessory nodes:

1. Keep the 240 sphere primary, two eyes, palette candidate, and the selected
   source expression values. Keep two nodes only; do not add a tail, whiskers,
   face features, gradients, or a new silhouette system.
2. Replace each side sphere node with a `cone` body node. Start from the source
   node width/depth and mirrored z tilts, move the node centers above the head,
   and tune height/x/y only until the cone bases tuck behind the sphere and the
   apices are clearly above it. The source values are a calibration seed, not
   a verified final ear measurement.
3. Keep node z depth behind the head initially (`-9.784765625`) so the sphere
   masks the ear bases. Retain mirrored left/right placement and tilt. If a
   head pose reveals a gap or causes an ear to cross the face, adjust only the
   two node positions/rotations in the source definition and record the chosen
   values in the new baseline.
4. Prefer `cone` over `diamond`: `cone` has one clear apex and a broad base,
   while `diamond` is pointed at both ends. Prefer body-node composition over
   hand-authored SVG paths because it reuses upstream projection, perspective,
   node depth sorting, and source pose behavior.

This is a derivative adaptation, not a claim that Kirby's exact source silhouette
is preserved. The minimum direct-composition contract is provided by the upstream
core: body nodes accept primitive surfaces including cone/diamond
(`packages/avatar-core/src/body.ts:18-27`; `avatarDefinition.ts:35-58`), each node
is rotated, translated, projected, and sorted by camera depth
(`packages/avatar-core/src/geometry.ts:1155-1234`), and `renderAvatar` returns
back/front node paths alongside head/eyes (`:1237-1260`).

The core's built-in `mickey` surface is not a better cat candidate. It creates two
round ellipsoid ears at fixed 23%-radius offsets
(`packages/avatar-core/src/geometry.ts:1046-1064`), and body-node definitions
explicitly exclude `mickey`/`cursor` (`avatarDefinition.ts:46-48`). It is useful as
proof of the upstream accessory mechanism, but not for clearly pointed ears.

## Candidate comparison

| Candidate | Verified source shape | Compact/cat assessment |
|---|---|---|
| **Kirby** | Round sphere plus exactly two symmetric sphere nodes; pink/navy palette; source nodes already give accessory layering. | **Recommended baseline.** Smallest route to two pointed ears by changing only two node surfaces/placements; preserves cute round mass. Requires Kirby-to-core conversion and host support for node paths. |
| Strobi | Exact published export; sphere only, `nodes: []` (`defaultStudioDocument.json:7-17`; `examples/react-vite-consumer/src/strobi.avatar.json:1-17`). | Stronger source-fidelity/runtime baseline and already landed in Ameow, but not a stronger cat candidate: adding ears would be a new composition from scratch. Keep as technical renderer/evidence reference, not replace Kirby for this shape task. |
| Freddy | Cube primary with two top spheres and a cylinder (`defaultStudioDocument.json:37-145`). | Has top accessories, but the cube/cylindrical body is less cute/round and needs more changes than Kirby. Not stronger. |
| Cloudee | Small sphere primary plus four sphere nodes (`:503-617`). | More complex, all rounded, no clean two-ear silhouette. Violates the minimum-change goal. |
| Onee | Cone primary, no body nodes (`:651-683`). | Pointed body, but no two ears and not a better cat derivative. |
| Cubee | Rounded cube primary, no nodes (`:619-648`). | Not a better round cat base. |

Conclusion: no stronger candidate is required. Strobi is the strongest existing
runtime/source-fidelity reference, while Kirby is the stronger *cat-shape*
baseline. A future decision to use Strobi instead would be a product-shape
choice, not a repository finding that Kirby is unsuitable.

## Exact upstream expression and animation inventory

The pinned Studio document has **27 expressions** and **23 animations**. The
Studio expressions are global behavior resources; Kirby's avatar object does not
contain a private behavior library in the pinned document. The exact source is
`defaultStudioDocument.json:686-1257` (expressions) and `:1258-2190`
(sequences). All 23 animations have `playbackMode: "loop"`, and every step uses
`transitionMs: 500` and `transition: "smooth"`; the table preserves exact step
order and timing groups. `expression-XX` IDs below are the pinned source IDs.

### Expressions

The 25 ordinary static expressions are: `expression-00` upward-side-glance,
`01` downward-gaze, `02` joyful-down-right, `03` surprised-left, `04`
sleepy-squint, `05` skeptical-right, `06` small-attentive, `07` angry-right,
`08` curious-left, `09` asymmetric-down-right, `10` attentive-left, `11`
joyful-wide, `12` wide-downward-gaze, `13` eyes-closed, `14` skeptical-left,
`15` far-right-glance, `16` angry-left, `17` playful-right, `18`
asymmetric-up-left, `19` gentle-downward-gaze, `20` wide-down-left, `21`
surprised-wide-left, `22` drowsy-closed, `23` suspicious-right, and `24`
shy-downward. Two later custom expressions are `expression-3d2bed26-...`
(`angry-brows`, body motion `shake`, eye color/body color overrides) and
`expression-5220eaee-...` (`uneasy-left`, eye motion `shake`, body motion
`slowDrift`, body color override). Exact numeric poses, eye sizes, angles, and
colors remain in the pinned JSON and must not be approximated if directly reused.

Only those two custom expressions declare ambient motion; the other 25 use
`eyeMotion: "none"` and `bodyMotion: "none"`. This matters for source fidelity:
`proud`, `idle`, `curious`, and `playful` derive motion from authored pose
transitions and blink, not an extra ambient drift. The core ambient mechanics are
`packages/avatar-core/src/ambientMotion.ts:3-15,22-40,43-78,81-115`.

### Animations and exact timing

The source names, ordered expression IDs, holds, and blink envelopes are:

| Animation | Ordered steps (`expression-id`, each `hold/transition`) | Blink (`initial / min-max / duration`, ms) |
|---|---|---|
| `sleeping` | `13,22,04`; `3600/500` | `4800 / 6500-9500 / 420` |
| `waking` | `13`; `2300/500` | `1200 / 1800-3600 / 220` |
| `idle` | `00,08`; `5200/500` | `2600 / 3400-6200 / 280` |
| `listening` | `10,01,19`; `2300/500` | `3200 / 4800-7200 / 240` |
| `thinking` | `08,16,14,17,05`; `2300/500` | `2100 / 2800-5000 / 260` |
| `searching` | `15,09,03,20,12,18`; `2300/500` | `2100 / 2800-5000 / 260` |
| `working` | `07,16,11,10`; `2300/500` | `2100 / 2800-5000 / 260` |
| `excited` | `02,17,21,03,11`; `2300/500` | `1200 / 1800-3600 / 220` |
| `bored` | `04,22,00`; `3600/500` | `4800 / 6500-9500 / 420` |
| `suspicious` | `14,05,23`; `2300/500` | `2100 / 2800-5000 / 260` |
| `angry` | `07,16`; `2300/500` | `2100 / 2800-5000 / 260` |
| `drowsy` | `04,22,13`; `3600/500` | `4800 / 6500-9500 / 420` |
| `happy` | `02,11,17,19`; `2300/500` | `2100 / 2800-5000 / 260` |
| `curious` | `03,21,00,15`; `2300/500` | `2100 / 2800-5000 / 260` |
| `confused` | `14,05,08`; `2300/500` | `2100 / 2800-5000 / 260` |
| `surprised` | `03,21`; `2300/500` | `1200 / 1800-3600 / 220` |
| `proud` | `15,08,02`; `2300/500` | `2100 / 2800-5000 / 260` |
| `shy` | `00,24,13`; `2300/500` | `2100 / 2800-5000 / 260` |
| `sad` | `04,13,22`; `3600/500` | `4800 / 6500-9500 / 420` |
| `laughing` | `02,11,17`; `2300/500` | `1200 / 1800-3600 / 220` |
| `scared` | `03,21`; `2300/500` | `1200 / 1800-3600 / 220` |
| `playful` | `02,17,11,08`; `2300/500` | `2100 / 2800-5000 / 260` |
| `celebrate` | `02,08,17`; `2300/500` | `1200 / 1800-3600 / 220` |

The exact pinned source sections for representative resources are:

- `idle`: `defaultStudioDocument.json:1324-1353`;
- `thinking`: `:1395-1445`;
- `curious`: `:1802-1845`;
- `proud`: `:1919-1955`;
- `playful`: `:2107-2150`;
- `celebrate`: `:2153-2188`.

For a first random-action allowlist, `curious`, `playful`, and `surprised` are
the smallest expressive candidates. `idle` can be the quiet fallback. Avoid
`angry`, `sad`, `scared`, and `sleeping` until a product reaction policy exists;
the current PRD explicitly defers event-to-reaction mapping. This allowlist is a
visual-local recommendation, not a verified product decision.

## Runtime mechanics, dependencies, and reduced motion

### Core playback mechanics

The source-independent runtime is in
`packages/avatar-core/src/runtime.ts` and is dependency-light: the package
manifest declares only `ajv` (`packages/avatar-core/package.json:1-18`), and
the published package is `@bible-strong/avatar-core@0.1.0`. It provides:

- `playAvatarAnimation(definition, key, now, from?)` to start from an optional
  current frame (`runtime.ts:88-111`), which is the correct interruption/retarget
  primitive;
- deterministic transition/hold advancement with `loop`, `once`, and
  `pingPong` (`:113-185`); `once` stops and removes `activeAnimation`, while
  loop wraps to step zero;
- `pauseAvatarPlayback` and `resumeAvatarPlayback`, which preserve exact phase,
  direct-transition, and blink timeline progress by shifting timestamps
  (`:188-217`);
- expression interpolation and random blink scheduling
  (`:220-272,274-335`); `blink` uses `initialDelayMs`, then a random interval
  between min/max, and closes over `durationMs`;
- source ambient body/eye motion applied by `renderAvatarFrame` only in normal
  motion (`:337-348`).

The optional upstream React package is not the production seam. Its component
has no Pointer Field prop and accepts only definition/animation/expression,
size, callbacks, and a controller (`packages/avatar-react/src/Avatar.tsx:71-99`).
It paints SVG path attributes instead of React frame state
(`:197-215`), but it reads `window.matchMedia` internally each frame
(`:38-41`), keeps blink sampling active when reduced motion is true, and has no
visibility lifecycle (`:333-358`). It also exposes completion/controller APIs
(`:360-453`) that must not cross Ameow's visual leaf boundary.

### Ameow adaptation requirements

The current `@bible-strong/avatar-core@0.1.0` dependency is already exact in
Ameow's `package.json:47-51` and `package-lock.json:312-323`; the next phase
should not add `avatar-react`, Studio UI, Motion 13, Tailwind, or a second
runtime dependency. The Studio app itself uses React 19.2.3, Motion 13, Vite 8,
and many editor dependencies (`.cindy-upstream/.../package.json:16-73`), none of
which is needed for the leaf.

The source core's Reduced Motion behavior is not sufficient by itself:
`sampleAvatarFrame` skips direct/step interpolation when `reduceMotion` is true
but still samples blink (`runtime.ts:294-332`), while `renderAvatarFrame` only
suppresses ambient motion (`:343-347`). Ameow must explicitly force open eyes,
stop the decorative rAF/action schedule, use the explicit environment prop, and
keep only the smaller direct Pointer Field projection, matching
`.trellis/spec/frontend/character-motion.md:38-49` and the landed Strobi adapter's
`CompactMascot.tsx:90-100` behavior.

### Visibility and interruptibility gap

The upstream core is a pure timestamp state machine and has no `document.hidden`
listener; the React wrapper schedules one rAF while `playback.status ===
"playing"` and cancels that frame on effect cleanup
(`avatar-react/src/Avatar.tsx:333-358`). The Ameow host therefore remains
responsible for visible/hidden pause, stale-generation invalidation, unmount
disposal, and explicit Reduced Motion. Keep all of that inside one
Compact-specific runtime; do not add a global visibility service.

## Evidence and source-fidelity needs

The prior Strobi implementation evidence proves the general core adapter and
Compact seam, but not Kirby. Before cat implementation can pass visual review,
capture a new Baseline A from the pinned upstream document/conversion and compare
the derivative at 1x/2x/3x on existing Lab backgrounds:

- Kirby neutral, full silhouette, and both ear tips/bases at default pose;
- each chosen random action at all source holds/transitions;
- blink closure and reopen with ears visible and behind/front layering stable;
- pointer neutral, cardinal, diagonal, and Windows pre-hotspot approach;
- hidden/visible pause/resume; unmount/remount fresh local runtime;
- explicit Reduced Motion: open eyes, no rAF/action schedule, direct smaller
  pointer response;
- black/white themes and every existing Lab preview background;
- Full target side-by-side to prove no mascot/Full/MR9 change.

Evidence must be element/canvas crops or compact contact sheets, not tall blank
page captures or raw JSON, per the persistent visual-evidence feedback and the
prior evidence examples under the archived task's `research/evidence/`.

The source-fidelity comparison must state what is exact (primary sphere, selected
eye/expression numbers, step/hold/transition/blink numbers, core renderer) and
what is Ameow-specific (cone ears, pointer offset, random one-cycle policy,
explicit Reduced Motion, visibility/remount lifecycle, theme tokens). Until the
Kirby conversion and ear host are evidenced, those details remain unknown rather
than Architecture PASS claims.
