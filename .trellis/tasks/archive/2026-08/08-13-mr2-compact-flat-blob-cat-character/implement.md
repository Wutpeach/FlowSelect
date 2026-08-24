# MR2 Compact Flat Blob Cat Character - Implementation Plan

> Planning artifact only. Do not execute until GPT Architecture Lead explicitly approves this plan and opens the next phase gate.

## Entry gates

- [ ] GPT Architecture Lead approves MR2 planning or all requested repairs are incorporated and re-reviewed.
- [ ] Select a clean implementation target containing committed MR0 and MR1 (`mr1/expanded-dot-field` at `b84e13c` or its deliberate integration); keep paused M3 isolated.
- [ ] Re-read current frontend motion/design/quality specs and the MR0/MR1 approved task summaries from that selected baseline.
- [ ] Do not run `task.py start` until a later user message explicitly authorizes implementation.

The Windows argument-conversion risk is not a code-entry gate. It is a pre-manual-validation gate described in Slice 0 below.

## Planned slices

### 0. Preflight baseline and Windows validation readiness

- Confirm the selected tree is clean and contains MR1.
- Run focused `windows-risk-path`, preload bridge, and `mainWindowSurfacePolicy` tests.
- Before Character visual tuning, smoke one compact collapse/reachability cycle on Windows. If the historical native argument error reproduces, stop MR2 validation and route the repair to a separate native-correctness task/phase. Do not patch it in MR2.

### 1. Pin Character-local contracts with pure tests

- Add pure attention/geometry target tests for finite validation, neutral beyond the compact response radius, center dead zone, elliptical clamp, Reduced Motion amplitude, and zero body deformation under Reduced Motion.
- Add a consumer-local blink lifecycle harness with injected timer/animation-control collaborators. Prove one timer maximum, sleep/wake, permanent dispose, and stale-generation no-op behavior.
- Add composition/import guard expectations before wiring the component.

### 2. Add the Static Mark SVG leaf

- Create a compact-only `CompactCatCharacter` inline SVG with persistent Body, pointed-soft Ears, and capsule/ellipse Eyes.
- Use current theme tokens; tune an approximately 54-56px visual inside the 60px shell without changing shell or hotspot metrics.
- Do not add a graphics dependency, path-morph system, hand/gesture engine, or icon export work.

### 3. Add event-driven Living Character execution

- Consume the existing Pointer Field read-only and map stable-root coordinates into clamped eye/body targets.
- Use existing MotionValues/springs so new targets retarget from the current visual condition and React does not update per frame.
- Add one deterministic low-duty blink timer and stoppable local MotionValue blink only while compact, visible, and non-reduced.
- Omit continuous breathing and stochastic expressions. Keep body deformation tiny and target-coupled or omit it if visual validation shows eyes + blink are sufficient.

### 4. Replace legacy compact composition

- Replace `CatIcon` at the existing compact-only `AnimatePresence` boundary; remove its import from the Surface.
- Preserve the outer shell presence/settle recipe and lifecycle completion callback.
- Expand only the Character visual/frame bound to use the 60px shell. Leave geometry hotspot and native reachability metrics unchanged.

### 5. Complete sole-authority compact Pointer Field input

- In `MainWindowPresentationSurface`, feed Windows settled-compact forwarded mouse coordinates through the existing Pointer Field writer before hotspot evaluation.
- Reuse stable-root conversion and Surface-owned observable mouseout/blur/hide/replacement center reset. Accept a bounded, settled last target after an unobservable Windows passthrough exit. Add no Character listener, loss timer, native event, or continuous React state.
- Allow a bounded pre-hotspot glance; treat hotspot entry as a brief exit cue only, because that same entry must still request expansion immediately.
- Cover observable pointer loss, invalid coordinates, bounded zero-work passthrough-exit hold, compact -> expanding replacement, and surface remount neutral reconstruction.

### 6. Harden lifecycle, Reduced Motion, and architecture evidence

- Extend MR0 leaf/import guards to Character policy/controller/host and preserve unique lifecycle/Pointer Field writers.
- Verify hidden/expanded/disposed states cancel timer/animation-control/subscriptions; settled springs stop frame work.
- Verify Reduced Motion retains Static Mark + smaller direct attention but no autonomous blink, deformation, lag, or overshoot.
- Confirm no Character animation completion can dispatch lifecycle or mutate Product/Download/native state.

### 7. Full validation and manual evidence

Focused commands from the selected MR1 baseline:

```text
npm test -- src/presentation/main-window/characterRecipe.test.ts src/presentation/main-window/characterBlinkRuntime.test.ts src/presentation/main-window/characterSurface.test.ts
npm test -- src/presentation/main-window/lifecycle.test.ts src/presentation/main-window/projections.test.ts src/presentation/main-window/presentationCompletion.test.ts src/presentation/main-window/presentationCompositionContract.test.ts
npm test -- src/presentation/main-window/geometry.test.ts src/presentation/main-window/motionRecipes.test.ts src/presentation/main-window/pointerField.test.ts src/presentation/main-window/magnetic.test.ts src/utils/compactPointerHotspot.test.ts
npm test -- src/presentation/main-window/dotFieldRecipe.test.ts src/presentation/main-window/dotFieldRuntime.test.ts src/presentation/main-window/dotFieldSurface.test.ts src/architecture/import-guard.test.ts src/architecture/windows-risk-path.test.ts electron/mainWindowSurfacePolicy.test.mts electron/preloadBridgeContract.test.mts
npm test
npm run type-check
npm run lint
npm run build
git diff --check
```

Exact new Character test filenames may follow the final local module names; do not invent a broader test framework.

Manual Windows matrix:

- black/white theme Static Mark silhouette at representative display scale factors;
- pointer approach, clamp, center dead zone, leave/loss neutral, and hotspot expansion;
- collapse mount, immediate reversal, repeated compact/full replacement, and post-collapse settle;
- normal and Reduced Motion;
- monitor-edge reachability, placement, passthrough, drag/drop, context menu, and output-folder shortcut regressions;
- document hide/show and surface replacement;
- DevTools Performance: no Character-owned rAF, no React per-frame commits, no Main/preload/IPC frame path, at most one low-duty blink timer, zero Character timer/animation while hidden/expanded/disposed.

## Review gates

- [ ] Static Mark remains recognizable with all animation disabled.
- [ ] Character size uses the 60px shell while hotspot/reachability/native metrics remain unchanged.
- [ ] Pointer Field is the sole continuous source and the Surface is still its sole writer.
- [ ] Retarget starts from current visual values and no replay queue or canonical reset exists.
- [ ] Settled/hidden/expanded/disposed execution bounds are demonstrated, including stale callback invalidation.
- [ ] Reduced Motion preserves identity/attention without decorative continuous motion.
- [ ] No shared motion/renderer/scheduler/state-machine/expression abstraction or MR3/MR4 behavior entered the diff.
- [ ] Any Windows native repair, if required by the preflight, was handled and reviewed separately.

## Risky files and rollback points

- `MainWindowPresentationSurface.tsx`: preserve composition/event-writer ownership and avoid absorbing M3 overlap.
- `motionRecipes.ts` / `geometry.ts`: visual size may be decoupled; hotspot/native metrics must not change.
- `import-guard.test.ts`: extend existing rules without weakening MR0/MR1 coverage.
- Rollback the Character leaf, its compact composition, and the compact Pointer Field adapter together. No Product/lifecycle/native migration is needed.
