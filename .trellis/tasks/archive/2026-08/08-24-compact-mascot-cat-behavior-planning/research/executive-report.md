# Compact mascot cat-behavior executive report

Date: 2026-08-24 · Baseline: `main@8343d54` · Upstream:
`smontlouis/bible-strong-avatar-lab@175691ab32cefe5faec7828af62f3d50210a8eb2`

## Verdict

Proceed with a Kirby-derived, Compact-only visual phase behind the existing
`MainWindowPresentationSurface -> CompactMascot` seam. No internal lifecycle,
Product, native, IPC, Full/MR9, or authority blocker was found.

Three gates must be explicit before implementation:

1. The current host paints only head/eyes (`src/presentation/main-window/
   CompactMascot.tsx:42-71,143-166`), while upstream body nodes produce
   `backPaths`/`frontPaths` (`.cindy-upstream/.../avatar-core/src/geometry.ts:
   1217-1260`). A Kirby definition alone will omit ears; add exactly two
   source-specific ear path slots and test their layer order.
2. Existing Strobi evidence does not prove Kirby ears. Capture a new pinned
   source baseline and cropped derivative evidence before claiming fidelity.
3. Upstream reactions are loop-only. The first Ameow allowlist must be fixed
   local `once` clips inside the same runtime, not a second scheduler or an
   unbounded loop.

The AGPL-3.0-only core/derivative governance question remains a separate formal
release gate, not an internal planning blocker (`package.json:47-51`;
`package-lock.json:312-323`; prior approved report at
`.trellis/tasks/archive/2026-08/08-23-compact-mascot-visual-planning/research/
upstream-bible-strong-avatar-lab.md:48-54`).

## Authoritative seam (verified)

- `MainWindowPresentationSurface.tsx:552-598,1190-1244` owns Compact projection,
  80/60/56 geometry, shell AnimatePresence, and the sole 56px mascot mount.
- `pointerField.ts:5-14,35-47,74-100` is the continuous pointer authority;
  Surface writes it (`MainWindowPresentationSurface.tsx:599-616,712-749,
  779-800`), and the leaf reads it only.
- `CompactMascot.tsx:20-31` accepts only size, colors, explicit Reduced Motion,
  read-only pointer values, and visual center. It has no callbacks or authority
  escape hatch.
- Existing tests/guards pin this boundary:
  `compactMascotArchitecture.test.ts:8-31`, `compactMascotSurface.test.ts:12-63`,
  `strobiDefinition.test.ts:9-30`, `strobiPlaybackRuntime.test.ts:59-118`,
  and `src/architecture/import-guard.test.ts:605-633,865-941`.

## Kirby and candidate comparison (verified + recommendation)

Kirby is the best cat-shape baseline: a 240³ sphere plus exactly two mirrored
rounded sphere nodes, pink `#ffc2e9` body, navy `#3e4e65` eyes, and tall narrow
eyes (`defaultStudioDocument.json:428-501`). Minimal derivative recommendation:
keep the sphere/eyes/two-node construction, replace both sphere nodes with
mirrored `cone` body nodes, move them above the head, preserve behind-head z
depth and mirrored tilt, and tune only dimensions/positions from visual evidence.
No tail, whiskers, gradients, registry, or new shape system.

| Candidate | Decision |
|---|---|
| Kirby | **Use for cat shape**: smallest two-accessory adaptation. |
| Strobi | **Keep as runtime reference**: official export and current Ameow adapter, but `nodes: []`, so not a stronger cat shape. |
| Freddy/Cloudee/Cubee/Onee | Reject: cube/multi-node/rounded or single-cone silhouettes require more changes. |
| Upstream `mickey` surface | Reject for this goal: built-in ears are round ellipses, not pointed cat ears (`geometry.ts:1046-1064`). |

## Exact reusable action shortlist

All values below are pinned from `defaultStudioDocument.json:1258-2190`; every
step is `transitionMs: 500`, `transition: "smooth"`, and every animation is a
loop. IDs are source expression IDs.

| Action | Exact ordered expressions | Hold / blink (ms) | Use |
|---|---|---|---|
| `curious-short` | `00,15`, consecutive tail of `curious` | `2300` each; `2100 / 2800-5000 / 260` | Local `once` action |
| `playful-short` | `02,17`, consecutive opening of `playful` | `2300` each; `2100 / 2800-5000 / 260` | Local `once` action |
| `surprised` | `03,21` | `2300` each; `1200 / 1800-3600 / 220` | Local `once` action |
| `idle` | `00,08` | `5200` each; `2600 / 3400-6200 / 280` | Quiet baseline/fallback |

Directly reusable: avatar-core validation, procedural sphere/node projection,
expression pose values, source step/hold/transition/blink values, and
`playAvatarAnimation`/`advanceAvatarPlayback`/pause/resume APIs
(`packages/avatar-core/src/runtime.ts:47-217`). Ameow-specific composition:
pointed cone ears, additive bounded pointer eye offset, one-cycle intermittent
policy, explicit Reduced Motion, and visibility/remount lifecycle. Do not map
these actions to clicks, downloads, or other Product events in this phase.

## One visual-local behavior owner (recommendation)

Extend the current source runtime into one `CompactMascot`-local behavior runtime:
one normal-motion rAF, one playback state, one `nextActionAt`, one generation
guard. Random deadlines use a fixed visible-normal 18-32 second range and are
checked by that same rAF; no second timer, queue, registry, or competing
scheduler.

| Boundary | Required behavior |
|---|---|
| Start | Visible + normal mount starts baseline pointer-follow and arms one bounded random deadline. |
| Pointer | Always read-only/additive in baseline and action; never selects actions or writes hotspot/lifecycle. |
| Action start | Only when baseline/visible/normal; fixed allowlist above; suppress new intents while active. |
| Action end | Consume local `once` completion, return to baseline, re-arm the 18-32 second deadline. No callback. |
| Hidden | Pause source playback and deadline; cancel active frame; visible resumes exact phase/remaining delay. Surface still resets Pointer Field on hidden. |
| Reduced Motion | Cancel action/deadline and decorative frames; render deterministic open eyes plus smaller direct pointer response. Normal re-entry starts fresh baseline/deadline, not invisible replay. |
| Unmount/remount | Dispose/cancel/invalidate stale callbacks; remount creates fresh local runtime and never replays shell lifecycle. |

This follows the authority, Pointer Field, Reduced Motion, and cleanup intent in
`.trellis/spec/frontend/character-motion.md:24-49,71-82`, plus
`.trellis/spec/frontend/quality-guidelines.md:176-233` and the current runtime's
one-frame/pause/dispose contract (`strobiPlaybackRuntime.ts:121-185`). The
character-motion spec still contains retired `CompactCatCharacter`/no-rAF wording;
later implementation must reconcile that wording narrowly to the already
Architecture-approved `CompactMascot` seam.

## Evidence required before fidelity approval

Use the pinned upstream document/conversion as Baseline A and tightly cropped
Compact element/canvas crops or compact sheets (never blank full-page captures or
raw JSON). Capture:

- Kirby neutral silhouette, two ear tips/bases, 1x/2x/3x;
- all selected action holds/transitions and blink closure/reopen;
- pointer neutral/cardinal/diagonal and Windows pre-hotspot approach;
- hidden/visible pause-resume and unmount/remount;
- explicit Reduced Motion: open eyes, no rAF/action work, reduced direct pointer;
- black/white themes, all existing Lab backgrounds, and Full side-by-side
  regression.

Record exact source values versus Ameow-specific adaptations, and do not call the
result source-faithful until the ear path layering and 56px clipping are proven.
