# Compact mascot seam and visual-local behavior research

Date: 2026-08-24
Repository baseline: `main@8343d54`
Landed adapter: `ea3268f501cce5cfa93902cf5f99e2d5d228bfdf` (`feat(presentation): adapt Strobi mascot for compact mode`), an ancestor of `8343d54`.

## Executive result

The authoritative integration seam is unchanged and already narrow:
`MainWindowPresentationSurface` derives Compact mode, owns the existing 80/60/56
geometry and shell presence motion, and mounts one `CompactMascot` visual leaf.
The leaf consumes theme colors, explicit Reduced Motion, the existing Pointer
Field read-only, and a geometry-derived attention center. It emits no lifecycle,
Product, native, IPC, or completion authority.

There is no internal lifecycle or authority blocker for a cat derivative. There is
one concrete visual-host blocker that the next implementation plan must name:
the current SVG host paints only head and eye paths, while Kirby's ears would be
upstream body-node paths. Changing only a definition would silently omit the
ears. The host must gain exactly the required ear path slots (or an equivalent
source-specific composition), with no generic avatar framework.

The existing Strobi evidence is not evidence for a Kirby-derived cat shape. A new
pinned source-fidelity baseline and tightly cropped Compact evidence are required
for the cat derivative. The upstream AGPL governance item remains a separate
formal distribution/release gate, as recorded by the completed prior mascot task;
it is not an internal planning blocker.

## Verified repository facts

### Composition and authority boundaries

- `src/presentation/main-window/MainWindowPresentationSurface.tsx:552-598`
  derives projections/geometry and creates the sole renderer-local Pointer Field.
  `projections.visual.mode === "compact"` is the Compact visual decision.
- The existing Surface is the only Pointer Field writer. Normal pointer facts
  reset the field on leave before lifecycle dispatch
  (`MainWindowPresentationSurface.tsx:599-616`). Windows compact passthrough
  writes the forwarded point first, then evaluates the unchanged hotspot
  (`MainWindowPresentationSurface.tsx:712-749`). Window blur and document-hidden
  reset the field through the same writer (`:779-800`).
- Compact shell presence/settle/exit remains in the Surface's outer
  `AnimatePresence` and Motion wrappers (`MainWindowPresentationSurface.tsx:1190-1244`).
  The single leaf mount is at `:1232-1240`, fixed to
  `COMPACT_MASCOT_VISUAL_SIZE` (56px), with the visual center derived from
  `geometry.visualShell`.
- The current leaf prop contract is exactly
  `size`, `bodyColor`, `eyeColor`, `reducedMotion`, read-only `pointerField`,
  `attentionCenterX`, and `attentionCenterY`
  (`src/presentation/main-window/CompactMascot.tsx:20-31`). It has no Product,
  lifecycle, native-window, IPC, Full target, lock, or completion collaborator.
- `pointerField.ts:5-14,35-47,74-100` defines stable-root viewport-local
  MotionValues and pure writers. The mascot can read them but must never write
  them or measure transformed mascot content.
- Lifecycle remains owned by `lifecycle.ts:3-46,62-81` and the thin React
  binding at `reactAdapter.ts:19-35,72-85`; visual mode is a pure projection in
  `projections.ts:8-20,37-55,57-134`. A mascot behavior must not add another
  Compact/full state machine or transition acknowledgement.
- The architecture guard explicitly lists the pure Compact leaves
  (`compactMascotRecipe.ts`, `strobiDefinition.ts`, and
  `strobiPlaybackRuntime.ts`) and forbids Product/lifecycle/desktop/Electron
  imports and IPC (`src/architecture/import-guard.test.ts:581-633,635-656`).
  The DOM host is separately checked at `:865-901`; lifecycle and Pointer Field
  writer uniqueness are checked at `:904-941`.

### Current adapter behavior and test/evidence constraints

- `CompactMascot.tsx:42-72` creates SVG refs for one clip path, one head path,
  and two eye paths. `applyScene` updates only those four scene elements.
  Render output at `:129-166` contains only the head and clipped eyes.
- `CompactMascot.tsx:74-118` creates one disposable source runtime. Normal
  visibility calls `runtime.start()`/`runtime.pause()`; cleanup removes the
  visibility listener and calls `runtime.dispose()`. Reduced Motion calls
  `runtime.renderStatic()` and subscribes to Pointer Field changes rather than
  running a frame loop (`:90-117`).
- `strobiPlaybackRuntime.ts:27-34,65-185` owns at most one pending rAF, uses a
  generation guard for stale callbacks, pauses/resumes avatar-core playback,
  and renders the local pointer offset every frame. `compactMascotRecipe.ts:5-19,
  29-76` provides the 300 viewBox/56px constants and bounded dead-zone/response
  radius projection. `compactMascotRecipe.test.ts:18-64` pins invalid/neutral,
  hotspot-band peak, diagonal bounds, and Reduced Motion amplitude.
- The landed adapter is deliberately fixed-source behavior, not random-action
  behavior: `strobiDefinition.ts:6-12,91-129` pins Strobi revision
  `175691ab...`, keeps only `neutral` plus the three `proud` expressions, and
  gives each step a 2300ms hold/500ms smooth transition with the source blink
  envelope. `STROBI_DEFAULT_ANIMATION` is always `proud`; the next phase must
  replace or wrap this single source lane deliberately rather than adding a
  competing scheduler beside a perpetual `proud` loop.
- Focused integration tests pin the seam and its negative space:
  `compactMascotArchitecture.test.ts:8-31` (one source-specific SVG leaf, no
  authority), `compactMascotSurface.test.ts:12-63` (56px mount, read-only field,
  Windows writer ordering, visibility/disposal, open-eye Reduced Motion),
  `strobiDefinition.test.ts:9-30` (pinned source revision and definition), and
  `strobiPlaybackRuntime.test.ts:59-118` (one frame, pause/resume, hidden mount,
  static Reduced Motion, stale callback disposal).
- The completed prior task's validation report records the stronger runtime
  evidence: `/.trellis/tasks/archive/2026-08/08-23-compact-mascot-visual-planning/
  research/implementation-validation.md:3-18,36-65,67-85`. Its tightly cropped
  assets include `research/evidence/derivative-1x-step-{1,2,3}.png`,
  `derivative-3x-{dark,light,checkerboard}.png`, `derivative-3x-blink.png`,
  `derivative-pointer.png`, `derivative-reduced.png`, and the direct package
  comparison frames. Those assets prove Strobi only.

### Specs/tasks that constrain the next phase

- `.trellis/spec/frontend/character-motion.md:1-49` defines the compact-only
  leaf, stable Pointer Field input, no completion callback, deterministic
  Reduced Motion, hidden/unmount cleanup, and no rAF/IPC/native authority.
  Required tests are listed at `:71-82`.
- `.trellis/spec/frontend/motion-guidelines.md:92-98` keeps lifecycle/pointer
  authority in the established Surface modules, while
  `:287-301` keeps scheduling/geometry/easing consumer-local and forbids
  speculative shared motion systems.
- `.trellis/spec/frontend/quality-guidelines.md:176-233` forbids feature-motion
  imports of Product/lifecycle/native authority, per-frame React state,
  unbounded queues, and ambiguous Reduced Motion completion. It requires stale
  callbacks to be no-ops and transient state to restore the latest persistent
  baseline.
- `.trellis/tasks/archive/2026-08/08-23-compact-mascot-visual-planning/
  research/ameow-compact-boundary.md:9-69` records the prior seam, 38px
  Windows hotspot/80px reachability independence, Full/MR9 isolation, Lab
  reuse, and the prior conclusion of no internal architecture blocker.
- `.trellis/tasks/08-24-compact-mascot-cat-behavior-planning/prd.md:5-27,37-47`
  explicitly keeps this phase planning-only, Compact-only, visual-local, and
  free of business-event reaction mappings, registries, plugins, or competing
  schedulers.

## Proposed one-authority behavior model (recommendation)

Use one source-specific, visual-local behavior runtime inside the existing
`CompactMascot` leaf. Extend the current `createStrobiPlaybackRuntime` shape (or
replace it with one equally narrow `createCompactMascotBehaviorRuntime`) rather
than adding a random-action timer beside it. One rAF is the only normal-motion
clock; the runtime derives action deadlines from its monotonic `now` and injected
`random`, so there is one scheduler and at most one action intent.

The local state can be conceptually:

```text
mode: dormant | baseline | action
source playback: avatar-core playback state
nextActionAt: monotonic deadline (nullable)
pausedAt / remainingActionDelay: local pause bookkeeping
generation: stale-callback invalidation
```

The pointer lane is always live in `baseline` and `action`: read the existing
Pointer Field, project a bounded eye offset, and apply it at scene render time.
An action may author head/eye pose and blink, but it never takes ownership of the
Pointer Field or the shell. Do not let pointer movement select an animation key;
this keeps pointer-follow the default while avoiding event churn.

Recommended lifecycle semantics:

1. **Start:** when the Compact leaf is mounted and normal-motion/visible, render
   the source neutral/baseline pose, start one rAF, and arm one bounded random
   action deadline. If an action is already being resumed from visibility pause,
   resume that exact source playback instead of replaying it.
2. **Action start:** only when visible, normal-motion, baseline, and no action is
   active. Select from one fixed, source-derived allowlist (the candidate list
   is in the upstream report). There is no FIFO; a second random result is
   suppressed while an action runs.
3. **Interruption:** pointer movement does not interrupt the authored action; it
   remains the additive eye-follow lane. Hidden pauses the source timeline and
   freezes the action deadline. Reduced Motion cancels the decorative action and
   random deadline, renders a deterministic open-eye/static target, and keeps
   only the smaller direct pointer projection. Unmount stops the clock, cancels
   pending work, increments generation, and makes stale callbacks no-ops.
4. **End:** detect the chosen source cycle's end (or use a source-specific
   `once` composition with the same source step values), capture the current
   frame, return to the baseline source pose through one bounded transition, and
   arm the next deadline. There is no callback to Surface/Product.
5. **Resume:** visible after hidden resumes the paused source state and the
   remaining random-delay budget using `pauseAvatarPlayback`/
   `resumeAvatarPlayback`-equivalent bookkeeping. Reduced Motion re-entry to
   normal starts a fresh baseline and fresh deadline rather than replaying an
   invisible action; this is deterministic and avoids claiming an action
   completed while Reduced Motion was active. Remount always starts a fresh local
   runtime and never replays shell lifecycle.

This model keeps action arbitration local and latest-only. The current avatar-core
runtime already provides the useful primitives: exact transition/hold phases and
loop/once/ping-pong modes (`avatar-core/src/runtime.ts:47-66,88-185`), pause/resume
time shifting (`:188-217`), and frame sampling with reduced-motion interpolation
gating (`:263-347`). The behavior wrapper should reuse those primitives, not
introduce a second animation DSL.

## Architecture blockers and unknowns

### Blockers to flag before implementation

1. **Ear path capacity (real implementation blocker, not authority blocker).**
   Upstream body nodes become `AvatarGeometry.backPaths`/`frontPaths` through
   `renderAvatar` (`.cindy-upstream/.../packages/avatar-core/src/geometry.ts:
   49-66,1217-1259`), but the current host only allocates head/eye refs. The
   implementation must add exactly two source-specific ear path slots and paint
   them on every scene, then add coverage for layer order/clipping at 1x/2x/3x.
2. **Source-action completion shape.** Upstream's built-in library is loop-only;
   intermittent behavior needs either one-cycle wrap detection or a local
   `once` composition that preserves every source step/hold/transition value.
   The choice must be made in design and tested for interruption/resume.

### Not blockers / unknowns

- No Surface/lifecycle/native/Full/MR9 redesign is indicated. The leaf prop seam
  is already sufficient for a source-specific renderer.
- Exact ear cone dimensions/positions, whether ears should always stay behind the
  sphere under every head orientation, and final theme token colors require the
  new visual baseline; they are not inferable from the existing Strobi evidence.
- The only Kirby source hit in the checked upstream tree is the default Studio
  document; no separate Kirby `.avatar.json` export was found in the indexed
  repository. The pinned document is therefore the current source identifier.
- `@bible-strong/avatar-core@0.1.0` is AGPL-3.0-only with an AJV runtime
  dependency (`package.json:47-51`; `package-lock.json:312-323`). This is a
  separate release/distribution governance prerequisite, not an internal
  authority blocker for planning or Lab work.
