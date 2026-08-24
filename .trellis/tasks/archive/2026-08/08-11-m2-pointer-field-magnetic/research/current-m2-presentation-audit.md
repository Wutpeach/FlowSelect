# M2 Pointer Field and Magnetic — Current Architecture Audit

## Baseline

- Worktree: `D:/Ameow/.cindy-worktrees/auto-o3p8cr`
- Branch: `cindy/auto-o3p8cr`
- Initial worktree state: clean
- M0/M1 closeout: `.trellis/tasks/archive/2026-08/08-11-renderer-motion-architecture-m0-m1/review.md`
- M0/M1 accepted `lifecycle.ts` as the sole writable lifecycle authority, a stable native BrowserWindow for normal morphs, renderer-local continuous values for the temporary Edge Glow adapter, and no arbitrary renderer-controlled native bounds animation.

## Current ownership map

```text
App application facts / reduced-motion preference
  -> useMainWindowPresentation (thin reducer binding + effect executor)
  -> MainWindowPresentationSurface
       discrete DOM/native pointer facts -> lifecycle reducer
       pointer-move coordinates -> temporary EdgeGlow MotionValues
       shell projection -> geometry + shell motion recipe
       shell Motion completion -> epoch-matched lifecycle event
       manual drag only -> native setPosition
```

### Lifecycle and native facts

- `src/presentation/main-window/lifecycle.ts` owns `compact | expanding | full | collapsePending | collapsing`, pointer-inside truth, locks, epochs, and declared lifecycle effects.
- `src/presentation/main-window/projections.ts` derives visual, interaction, and native policy. Settled compact alone projects passthrough/hotspot; collapsing remains interactive.
- `src/presentation/main-window/presentationCompletion.test.ts` pins the single compact acknowledgement: matching Renderer Motion completion. Native reachability is independent and cannot complete lifecycle state.
- `src/App.tsx:380-412` adapts semantic native operations and reduced motion into the presentation executor. It does not own continuous pointer coordinates.
- `src/presentation/main-window/MainWindowPresentationSurface.tsx:162-207` and `:250-285` keep manual native window drag separate from shell motion; the only renderer `setPosition` call is the existing rAF-batched drag path at `:176-180`.
- `electron/mainWindowSurfacePolicy.test.mts` characterizes position-only compact reachability, cancellation, destroyed-window handling, and reduced-motion snapping.

## Continuous pointer data today

- `src/presentation/main-window/motionRuntime.ts` declares itself a temporary M0/M1 compatibility adapter, not the M2 Pointer Field.
- It owns two Motion values (`x`, `y`) plus `lastKnownScreenPointRef`, all named around the Edge Glow consumer.
- `MainWindowPresentationSurface.tsx:360-396` updates Edge Glow coordinates from the shell pointer-move handler before evaluating manual drag.
- `MainWindowPresentationSurface.tsx:582-667` stores screen coordinates, corrects them after morphs, and manages Edge Glow suppression/reveal timers.
- `MainWindowPresentationSurface.tsx:745-796` also captures screen coordinates from the compact hotspot mousemove path solely for later Edge Glow correction.
- `src/utils/mainWindowEdgeGlowPosition.ts` converts a screen point back into panel-local coordinates and clamps the result. This correction exists because the consumer is attached to a transforming shell.
- No remaining `mousePos` React application state exists after M0/M1. `motionRuntime.test.ts` currently proves only the temporary consumer's MotionValue writes and glow opacity formula.

## Edge Glow ownership and deletion surface

Edge Glow is entirely inside `MainWindowPresentationSurface.tsx`:

- compatibility imports and constants: `:46-57`
- reveal timer ref and visible React state: `:493-500`
- runtime and derived Motion values: `:544-546`
- screen-point correction and choreography: `:582-667`
- visibility predicate and style: `:912-918`, `:961-972`
- pointer-following overlay: `:1116-1130`

Deleting those paths removes a meaningful amount of surface logic. The discrete drag/drop glow at `:59-80`, `:918`, and `:1132-1146` has different semantics and should remain.

Obsolete Edge Glow-specific files after M2:

- `src/presentation/main-window/motionRuntime.ts` (replace the temporary API with the formal Pointer Field boundary rather than retaining compatibility names)
- `src/presentation/main-window/motionRuntime.test.ts`
- `src/utils/mainWindowEdgeGlowPosition.ts`
- `src/utils/mainWindowEdgeGlowPosition.test.ts`

## Transform ownership today

- `src/presentation/main-window/motionRecipes.ts` returns the shell morph targets and per-property transitions.
- `MainWindowPresentationSurface.tsx:996-1022` applies the recipe to the shadow node.
- `MainWindowPresentationSurface.tsx:1023-1100` applies the same morph authority to the separate shell node; `onAnimationComplete` at `:1078` acknowledges only the active lifecycle epoch.
- Content and compact icon are descendants of the shell at `:1102-1194`.
- The stable root viewport at `:987-995` has no visual transform.

Magnetic cannot write `x/y` on either existing morph node. The safe composition is a new outer renderer-only transform layer inside the stable viewport and around both shadow and shell. That outer layer owns only Magnetic displacement; the existing child nodes retain spatial morph transforms and completion.

## Stable coordinate requirement

The current Edge Glow pointer calculation uses `e.currentTarget.getBoundingClientRect()` on the transforming shell (`MainWindowPresentationSurface.tsx:360-363`). Reusing that basis for Magnetic would measure the pointer relative to a node moved by Magnetic and create a visual feedback loop.

The M2 Pointer Field should instead measure `clientX/clientY` against the stable viewport root (`:987-995`). Viewport-local pixel coordinates are a useful minimal shared representation for Magnetic now and plausible later visual consumers, without encoding a Magnetic-specific normalized value in the authority. Pointer leave resets the coordinates to the viewport center so Magnetic returns to zero without adding a second boolean pointer-inside authority.

## Surface growth risk

`MainWindowPresentationSurface.tsx` is currently about 1,200 lines and already hosts shell DOM, drag/drop, compact hotspot, native pointer-boundary subscription, lifecycle completion, geometry, recipes, and temporary Edge Glow choreography. M2 should not move existing unrelated responsibilities merely to improve the count, but it must keep new math and spring behavior out of the surface. The expected surface diff is:

- add one stable root ref/event writer;
- create/consume one Pointer Field runtime;
- compose one outer Magnetic visual layer;
- delete the larger Edge Glow runtime/choreography/overlay block.

No provider, context, generalized effect registry, or monolithic motion hook is justified by one real consumer.

## Reduced-motion evidence

- `App.tsx:389` passes the current preference to compact native reachability.
- `App.tsx:2836-2842` passes the same preference to the presentation surface.
- `motionRecipes.test.ts` already verifies reduced motion suppresses shell elasticity and compact icon pulse.
- `mainWindowSurfacePolicy.test.mts` verifies reduced motion snaps native compact reachability.

M2 can therefore treat reduced motion as a Magnetic consumer policy: render numeric zero displacement immediately while keeping Pointer Field writes and all discrete lifecycle/native behavior intact.

## Test baseline and gaps

Existing focused contracts:

- `lifecycle.test.ts`: transition table, locks, pointer facts, interruption, epochs.
- `projections.test.ts`: visual/interaction/native projections.
- `presentationCompletion.test.ts`: sole renderer completion acknowledgement and passthrough timing.
- `motionRecipes.test.ts`: shell choreography and reduced-motion recipes.
- `geometry.test.ts`: spatial-only shell/hotspot geometry.
- `panelHover.test.ts`: local pointer/drop hover reduction.
- `compactPointerHotspot.test.ts`: compact hotspot hysteresis.
- `electron/mainWindowPointerBoundary.test.mts`: native pointer-boundary facts.
- `electron/mainWindowSurfacePolicy.test.mts`: compact reachability and reduced motion.

M2 gaps:

- no formal Pointer Field API or stable-viewport coordinate test;
- no pure Magnetic target/policy tests;
- no guard that the Magnetic modules are renderer-only and native-window independent;
- no guard that Edge Glow compatibility code is fully removed;
- no direct contract that reduced motion and compact mode produce zero Magnetic displacement independently of lifecycle correctness.

## Planning conclusion

The minimum repository-grounded architecture is:

1. replace the temporary Edge Glow adapter with a focused Pointer Field module owning viewport-local `x/y` Motion values;
2. add one Magnetic consumer module that derives bounded displacement and reduced/full-mode policy from the field;
3. add an outer Magnetic wrapper around the current shadow + shell composition while leaving shell morph transforms and completion untouched;
4. feed the field from the stable viewport root and center it on semantic pointer leave;
5. remove Edge Glow code and obsolete utilities/tests completely;
6. retain every lifecycle, native surface, compact, drag, drop, and application boundary from M0/M1.
