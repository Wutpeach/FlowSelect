# Compact Character Motion Contract

## 1. Scope / Trigger

Applies to the compact-only Character leaf under
`src/presentation/main-window/` and its narrow Surface wiring. It does not
establish a shared Character/Dot renderer, runtime, scheduler, state machine,
or expression system.

## 2. Signatures

```ts
type CompactCatCharacterProps = {
  size: number;
  bodyColor: string;
  eyeColor: string;
  reducedMotion: boolean;
  pointerField: { x: MotionValue<number>; y: MotionValue<number> };
  attentionCenterX: number;
  attentionCenterY: number;
};
```

The Character exposes no completion callback and accepts no Product,
lifecycle, native, or IPC collaborator.

## 3. Contracts

- Inline SVG Body/Ears/Eyes form a complete Static Mark without animation.
- The Surface remains the sole Pointer Field writer. Windows compact forwarded
  `mousemove` uses the same writer before unchanged hotspot evaluation.
- Attention has a center dead zone, continuous hotspot-approach peak and
  response-radius decay, elliptical eye clamp, and tiny normal-only squash.
- Observable window blur/document hidden reset through the Surface writer.
  Unobservable Windows passthrough exit may hold a bounded dormant target.
- Springs retarget from current values. One deterministic blink timer is
  canceled on hidden, Reduced Motion, replacement, or disposal; interruptions
  restore open eyes and stale callbacks cannot continue.
- Reduced Motion keeps the Static Mark and smaller direct eye attention, with
  no blink, body deformation, lag, or overshoot. Hidden springs settle.
- Character owns no rAF, React frame state, lifecycle acknowledgement, native
  geometry, BrowserWindow/preload call, or IPC frame path.
- The 80x80 reachable frame, 60x60 shell, hotspot, passthrough, placement, and
  reachability policy remain independent and unchanged.

> **Motion 12 source warning**: `useSpring(source)` does not rebind when a
> different MotionValue is supplied later. Never use
> `useSpring(reduced ? frozen : live, options)`. Bind permanently to one stable
> source, gate values, and settle hidden springs when Reduced Motion activates.

## 4. Validation / Error Matrix

| Condition | Required result |
| --- | --- |
| dead zone or at/outside response radius | neutral eyes; body scale 1 |
| new normal pointer target | current-condition retarget; no replay |
| normal -> Reduced Motion | direct smaller attention; springs settle; blink stops open |
| Reduced Motion -> normal | stable sources resume current target |
| window blur or document hidden | Surface resets Pointer Field to center |
| unobservable passthrough exit | bounded target may freeze; zero active work |
| expanded/replaced/disposed | timer and stale callbacks stop |

## 5. Good / Base / Bad Cases

- Good: Surface publishes one point; a pure recipe derives bounded targets;
  local springs settle and stop.
- Base: settled Character holds one future blink timer and no rAF.
- Bad: Character tracks a second x/y pair, dispatches completion, or swaps a
  `useSpring` source identity conditionally.

## 6. Tests Required

- `characterRecipe.test.ts`: silhouette, attention boundaries/clamps,
  deformation, Reduced Motion, stable-source gate sequences.
- `characterBlinkRuntime.test.ts`: one timer, stop/restart, stale generation,
  permanent disposal.
- `characterSurface.test.ts`: composition, writer ordering, neutral reset, no
  rAF/completion escape, stable sources, spring settling, blink-open cleanup.
- `src/architecture/import-guard.test.ts`: no authority/native/IPC imports or
  side channels; lifecycle and Pointer Field writers stay unique.
- Existing geometry, hotspot, presentation, Windows-risk, and native-policy
  suites remain green unchanged.

## 7. Wrong vs Correct

```ts
// Wrong: Motion 12 does not rebind this source.
const springX = useSpring(reducedMotion ? frozenZero : targetX);

// Correct: stable identity, gated value, explicit Reduced Motion settle.
const springX = useSpring(stableGatedSourceX, options);
if (reducedMotion) springX.jump(targetX.get());
```
