# MR2 Compact Flat Blob Cat Character - Technical Design

## 1. Ownership and composition

```text
Product / Application facts
  -> existing lifecycle + read-only Presentation projection
     -> MainWindowPresentationSurface compact visual target
        -> CompactCatCharacter inline SVG host
           -> Character-local MotionValues / blink controller
              -> SVG transforms and eye shape
```

`MainWindowPresentationSurface` owns composition, compact eligibility, stable geometry, DOM/native pointer facts, and the existing Pointer Field instance. Character code receives only the projection facts needed to render. Its public surface has no lifecycle dispatcher, Product callback, desktop bridge, native coordinate, placement, or completion handle.

The current compact-only `AnimatePresence` remains the replacement boundary. On collapsing, visual mode becomes compact and the Character mounts while the shell morph runs. On expanding, visual mode becomes full and the Character exits/unmounts. Shell `onAnimationComplete` continues to acknowledge the lifecycle epoch; Character completion never participates.

## 2. Static Mark representation

Recommend one inline SVG with a normalized 60x60 viewBox and persistent groups:

- **Body:** one rounded blob path (or rounded rect plus a small shaped crown) occupying most of the shell, with enough margin for deformation and clipping safety.
- **Ears:** one two-ear path or two mirrored paths with visible apices, rounded joins, and soft bases integrated into the body silhouette. Do not use circles/semicircles as ears.
- **Eyes:** two small capsule/ellipse primitives in a shared attention/blink group.

Use semantic Theme tokens for body/eye contrast. Do not embed another static asset, use SVG filters as a required silhouette mechanism, or introduce a logo export pipeline.

Character visual bounds should be approximately 54-56 logical pixels inside the 60px shell, confirmed by theme/platform screenshots. The exact path control points are visual-tuning constants local to this component. The 38px hotspot metric remains independent and unchanged.

Hands are excluded from the initial slice. If Architecture Review or visual validation requires one, add at most one hidden/private path and a local boolean target; do not expose gesture names or an expression API.

## 3. Technology decision

Use inline SVG + existing `motion/react` MotionValues/springs and the library's local `animate(...)` control for the brief blink.

Why this is the minimum fit:

- Body/Ears/Eyes are a handful of persistent vector primitives, not a dense field; SVG is more direct than Canvas.
- Theme and static geometry remain declarative and inspectable.
- MotionValue subscriptions and springs can update SVG transforms without React per-frame state and retarget from current values.
- Motion already exists and owns the surrounding presence/shell choreography; no dependency is added.
- Motion's local animation control handles a short eye-scale keyframe and can be stopped explicitly; no React per-frame state or new runtime is needed.

Rejected for MR2:

- Canvas 2D, because sparse named geometry and eye targeting do not justify an imperative draw loop.
- A DOM div/blob stack, because the ear silhouette and future icon consistency are clearer in one normalized vector coordinate system.
- Path morphing, because recognition and living behavior can be achieved with persistent primitives and transform-first motion.
- CSS infinite animation, because it makes settled idle work harder to bound and inspect.
- A Character state machine/runtime framework, shared scheduler, expression engine, Motion DSL, or shared Dot/Character renderer, because there is only one Character consumer and no stable repeated abstraction seam.

## 4. Pointer attention projection

Inputs are the existing stable-root `pointerField.x/y`, the compact visual center/size, and Reduced Motion.

Pure projection:

1. Validate finite x/y; otherwise return `(0,0)`.
2. Compute delta from compact visual center in stable-root coordinates.
3. Apply a compact response-radius falloff: points in the surrounding transparent viewport outside that radius produce neutral `(0,0)` rather than a permanently clamped stare.
4. Inside the response radius, normalize the delta, apply a small center dead zone, and clamp to a narrow ellipse, approximately `|eyeX| <= 2.0-2.4` and `|eyeY| <= 1.3-1.7` logical SVG units; final tuning is screenshot/manual evidence, not a new configuration system.
5. Derive at most a much smaller body squash/lean target from the same normalized delta.

The Surface remains the only field writer. Extend its existing Windows compact forwarded-mouse handler to call the current client-to-stable-root writer before hotspot evaluation. Reuse current Surface-owned observable mouseout/blur/hide/replacement cleanup to reset center. Windows passthrough supplies forwarded `mousemove` but no `mouseleave`; an unobservable exit therefore freezes the last already-clamped eye target until the next authoritative point or replacement. The springs settle and schedule no further work. Character never reads DOM events, starts a pointer-loss timer, or reads window/screen/native bounds.

The current immediate-expansion interaction contract bounds what the user can see: on Windows, pre-hotspot forwarded points may drive a bounded glance, but the first point that enters the compact hotspot also requests expansion; on other platforms, DOM enter does the same. The Character may show the entry point as a brief directional glance during its existing exit/presence choreography, but inside-hotspot compact mode is not a sustained eye-follow surface. MR2 must not modify hotspot, passthrough, or expansion timing to extend the cue.

Normal motion sends eye/body targets into local springs. A new target calls `set` on the existing target MotionValues; the springs continue from their current rendered value. Reduced Motion keeps a smaller direct eye offset, disables lag/overshoot and body deformation, and needs no replay.

## 5. Minimal living vocabulary

- **Eye attention:** event-driven continuous feedback while authoritative pointer coordinates change; springs run only until settled.
- **Blink:** one deterministic low-duty timer while compact, visible, and non-reduced. The callback starts one brief MotionValue eye `scaleY` keyframe through a stoppable local animation control and schedules the next timer. No random generator in MR2.
- **Body deformation:** optional tiny transform coupled to pointer target or the existing compact settle epoch; never an independent loop.
- **Breathing:** omitted. It would add repeated autonomous work without being required for identity.
- **Hands:** omitted initially; private optional primitive only if visual acceptance needs it.

The result is quiet but responsive rather than always moving.

## 6. Character-local lifecycle

### Mount / initialize

- Create persistent SVG primitives and local MotionValues.
- Read current Pointer Field and projection immediately, so replacement reconstructs the correct target without history.
- Start at most one blink timer only when compact, document-visible, and non-reduced.

### Retarget / settle

- Pointer, Reduced Motion, theme, or geometry changes recompute the target from current authoritative inputs.
- Springs retarget from their current output. No reset-to-neutral/replay step.
- When Motion springs settle, their internal frame work stops. The Character owns no rAF.

### Sleep / wake

- The normal compact/full boundary uses replacement rather than retaining a Character through Expanded mode.
- Document hidden or temporarily ineligible state acts as sleep: cancel timer and stop the active local Motion animation, invalidate generation, and keep no scheduled work.
- Wake/re-entry recomputes from current Pointer Field/theme/preference and schedules one future blink; lost continuity is acceptable.

### Dispose / stale invalidation

- Unmount increments a local generation, clears the single timer, stops the active animation control, unsubscribes from MotionValues/visibility, and drops references.
- Timer and animation callbacks capture generation and verify it before any visual write or reschedule.
- There are no promises or completion callbacks to lifecycle/Product. Any unavoidable finish continuation is generation-guarded and Character-local.

## 7. Reduced Motion

Reduced Motion renders identical Static Mark primitives and theme semantics. It retains clamped attention at a smaller amplitude as direct feedback. It disables Character springs with overshoot/lag, body squash/lean, autonomous blink, repeated settle pulse, and any future travelling hand appearance. It does not alter the outer lifecycle recipe or produce fake completion.

## 8. Native contract preservation

MR2 changes only compact visual composition and the sole Surface Pointer Field adapter. It does not change:

- `MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE` / compact reachable frame (80);
- `MAIN_WINDOW_COMPACT_SHELL_SIZE` (60) or centered placement;
- geometry hotspot frame/radii and hysteresis;
- compact passthrough timing or pointer-boundary ownership;
- semantic native reachability/cancellation operations;
- stable native Main Window viewport and renderer-only morph;
- placement interpolation or BrowserWindow APIs.

Decouple the visual Character size from `motionRecipe.icon.size/frameSize` as needed, but leave hotspot geometry untouched. Rename icon-local recipe fields only if needed for clarity within the same small diff; do not refactor window policy.

## 9. Windows risk decision

Risk A remains reachable and independent. It does not block pure Character implementation because Character never crosses the bridge and automated policy/architecture tests remain runnable. It does gate trustworthy Windows visual/manual acceptance.

Before manual Character tuning:

1. run the focused Windows risk, bridge, and surface-policy tests;
2. perform a clean compact-collapse smoke that exercises reachability before evaluating Character visuals;
3. if the conversion error reproduces, stop MR2 validation and open a separate native-correctness phase against the exact bridge/policy chain;
4. after its independent tests/manual validation pass, resume MR2 without importing native responsibility into Character code.

This is a validation-readiness dependency, not a bundled MR2 repair.

## 10. Validation design

### Pure Character policy

- Static geometry descriptor contains Body/Ears/Eyes and bounded 60x60 coordinates.
- Attention projection validates finite values, falls to neutral beyond the compact response radius, applies center dead zone, clamps x/y, resolves center on observable invalid/reset/loss input, and keeps an unobservable passthrough-exit hold bounded and dormant.
- Reduced target retains smaller attention and zero body deformation/overshoot.
- Retarget tests prove output continues from current spring condition rather than canonical reset.

### Blink/lifecycle harness

- fake timer proves at most one pending timer;
- sleep/dispose clear timer and active animation;
- wake schedules from current eligibility;
- stale generation callbacks cannot animate or reschedule;
- reduced/hidden/expanded states have zero pending blink work.

### Composition and architecture guards

- compact composition contains `CompactCatCharacter` and no `CatIcon`;
- Character leaves cannot import Product/Download, lifecycle/effect authority, desktop/Electron/IPC, center-overlay, native geometry/bounds, DOM/screen coordinate reads, or Pointer Field writer helpers;
- lifecycle and Pointer Field writer uniqueness remain pinned;
- no Character completion callback is exposed;
- static source checks prove no Character-owned rAF and no shared framework/dependency addition.

### Regression and manual evidence

Run Character-focused tests plus lifecycle, projection, completion, geometry, recipe, Pointer Field, Magnetic, hotspot, Dot Field, architecture, Windows risk, bridge, and native surface-policy regressions. Then run the full test/type/lint/build/diff-check gate.

Windows manual coverage: both themes; normal/Reduced Motion; pointer approach from all directions; clamped eyes; leave/loss neutral; hotspot expansion; collapse mount; rapid reversal; compact reachability near monitor edges; passthrough; drag/drop and context regressions; repeated replacement; document hide/show; idle Performance trace showing no Character rAF and only one low-duty timer. macOS remains NOT VERIFIED unless separately run.

## 11. Rollback

The Character is an independently replaceable compact visual leaf. Rollback restores the legacy compact visual at the same presence boundary and removes the compact forwarded-pointer adapter if no other consumer requires it. Lifecycle, Product/Download state, Pointer Field authority, Dot Field, and native policy remain untouched.
