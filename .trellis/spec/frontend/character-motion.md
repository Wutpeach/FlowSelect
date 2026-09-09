# Compact Character Motion Contract

## 1. Scope / Trigger

Applies to the compact-only Character leaf under
`src/presentation/main-window/` and its narrow Surface wiring. It does not
establish a shared Character/Dot renderer, runtime, scheduler, state machine,
or expression system.

## 2. Signatures

```ts
type CompactMascotProps = {
  size: number;
  bodyColor: string;
  eyeColor: string;
  reducedMotion: boolean;
  pointerField: { x: MotionValue<number>; y: MotionValue<number> };
  attentionCenterX: number;
  attentionCenterY: number;
  previewPose?: "neutral" | "surprised" | "curious-short" | "playful-short";
};
```

The Character exposes no completion callback and accepts no Product,
lifecycle, native, or IPC collaborator. `previewPose` is a Lab-only frozen
capture seam; production leaves it undefined.

## 3. Contracts

- `CompactMascot` is a source-specific SVG leaf: pinned Kirby 240-unit sphere,
  exactly two core-projected diamond-ear nodes, and the upstream eye paths.
  The shared Compact runtime always paints both ear paths behind the opaque
  head/body; core whole-node back/front classification remains geometry output,
  not Compact's final paint layer. It is not a generic body-node renderer.
- The Surface remains the sole Pointer Field writer. Windows compact forwarded
  `mousemove` uses the same writer before unchanged hotspot evaluation.
- Attention has a center dead zone, continuous hotspot-approach peak and
  response-radius decay, elliptical eye clamp, and tiny normal-only squash.
- Observable window blur/document hidden reset through the Surface writer.
  Unobservable Windows passthrough exit may hold a bounded dormant target.
- One Compact-local `avatar-core` runtime owns baseline playback, pointer
  attention, one intermittent action, its deadline, visibility, Reduced
  Motion, disposal, and stale-generation invalidation. Normal motion uses one
  rAF as both playback and deadline clock; no timer, queue, priority bus, or
  second scheduler is allowed.
- Pointer attention remains read-only and additive during baseline and an
  action. It never chooses, starts, interrupts, cancels, or extends an action.
- The fixed visual-only allowlist is `surprised` (03→21), `curious-short`
  (00→15), and `playful-short` (02→17): each is a local `once` clip preserving
  2300ms holds, 500ms smooth transitions, and pinned blink data. A visible
  normal baseline arms one 18–32s quiet deadline; immediate repeats are barred.
- Hidden pauses exact playback/deadline progress and cancels rAF; visible
  resumes it. Reduced Motion cancels decorative action/deadline/rAF/blink,
  renders neutral open eyes plus smaller direct attention, and normal re-entry
  starts a fresh baseline/deadline. Dispose invalidates callbacks; remount is
  a fresh visual session.
- A defined Lab `previewPose` replaces the behavior runtime with one
  deterministic core-rendered sample and disposable Lab-pointer subscriptions.
  Reduced Motion still settles every preview pose to neutral; production never
  supplies this prop.
- The leaf owns no Product, lifecycle, native geometry, BrowserWindow/preload,
  IPC, completion callback, or React per-frame state.
- The 80x80 reachable frame, 60x60 shell, hotspot, passthrough, placement, and
  reachability policy remain independent and unchanged. A source-specific
  0.95 mascot render scale may sit centered inside the unchanged 56px holder
  only when direct full-pose bounds prove it is needed to clear the shell.

> **Motion 12 source warning**: `useSpring(source)` does not rebind when a
> different MotionValue is supplied later. Never use
> `useSpring(reduced ? frozen : live, options)`. Bind permanently to one stable
> source, gate values, and settle hidden springs when Reduced Motion activates.

## 4. Validation / Error Matrix

| Condition | Required result |
| --- | --- |
| dead zone or at/outside response radius | neutral eyes; body scale 1 |
| normal pointer target, including action | additive bounded eye offset; no action policy |
| quiet deadline | one allowlisted local once action; no queue or immediate repeat |
| action completion | current-frame return to idle; fresh quiet deadline; no outward callback |
| normal -> Reduced Motion | neutral open eyes, direct smaller attention, zero rAF/deadline/blink |
| document hidden -> visible | pause/freeze then exact playback/deadline resume |
| replaced/disposed/remounted | stale callbacks stop; remount starts fresh baseline |

## 5. Good / Base / Bad Cases

- Good: Surface publishes one point; a pure recipe derives bounded targets;
  local springs settle and stop.
- Base: settled Character holds one future blink timer and no rAF.
- Bad: Character tracks a second x/y pair, dispatches completion, or swaps a
  `useSpring` source identity conditionally.

## 6. Tests Required

- `compactMascotDefinition.test.ts`: pinned Kirby facts, two diamond-ear capacity,
  action source steps/timings, validation and node layering.
- `compactMascotBehaviorRuntime.test.ts`: one frame, deadline/action lifecycle,
  no-repeat, pause/resume, Reduced Motion/static rendering, stale disposal.
- `compactMascotSurface.test.ts`: composition, Pointer Field writer ordering,
  visibility and no timer/authority escape.
- `src/architecture/import-guard.test.ts`: no authority/native/IPC imports or
  side channels; lifecycle and Pointer Field writers stay unique.
- Existing geometry, hotspot, presentation, Windows-risk, and native-policy
  suites remain green unchanged.

## 7. Wrong vs Correct

```ts
// Wrong: a second timer competes with the playback frame clock.
setTimeout(startRandomAction, delay);

// Correct: the one Compact runtime checks its deadline from its one rAF.
if (now >= nextActionAt && currentAction === null) startLocalOnceAction();
```
