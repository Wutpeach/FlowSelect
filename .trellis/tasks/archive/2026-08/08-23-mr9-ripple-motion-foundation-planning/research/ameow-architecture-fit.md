# Ameow repository-grounded architecture fit

Research date: 2026-08-23

## Repository baseline

The root worktree is the Trellis/journal line `main` at `a5db244`; it does not contain the current Product `src/presentation` tree. Repository-grounded motion analysis therefore uses the latest completed Product descendant:

- Product worktree: `D:/Ameow/.cindy-worktrees/compact-mascot-visual`
- Branch: `motion/compact-mascot-visual`
- HEAD: `2bb9a221708c211bdec8721e02d0e469de44ef89`
- MR9/UI Lab ancestor: `motion/mr9-fullscreen-activation-fx` at `2f5f1a01ade572fcf06e2d5df1e9fec8da941511`

The separate Paper checkpoint `motion/mr9-paper-heatmap-official-baseline` at `77eb561` diverges from the stable Presentation integration line and is retained as a NO-GO research checkpoint. It is not an implementation base or a reuse requirement.

No Product worktree is modified by this planning task.

## Current authority pipeline

The existing Expanded pipeline already has the correct one-way authority direction:

```text
Application / Product facts
        |
        v
feature-bounded Presentation opportunities + progress projection
        |
        v
pure resolveExpandedPresentationTarget priority
        |
        v
one ExpandedPresentationTarget
        |
        v
consumer-local runtime + one decorative WebGL2 host
        |
        v
pixels only; no semantic callback
```

Evidence:

- [`expandedPresentationTargets.ts`](D:/Ameow/.cindy-worktrees/compact-mascot-visual/src/presentation/main-window/expandedPresentationTargets.ts) defines current-state facts, explicitly not renderer commands or lifecycle/retention authority.
- [`expandedPresentationPolicy.ts:9`](D:/Ameow/.cindy-worktrees/compact-mascot-visual/src/presentation/main-window/expandedPresentationPolicy.ts:9) resolves one activation/progress/idle target before rendering.
- [`App.tsx:555`](D:/Ameow/.cindy-worktrees/compact-mascot-visual/src/App.tsx:555) composes the target.
- [`MainWindowPresentationSurface.tsx:629`](D:/Ameow/.cindy-worktrees/compact-mascot-visual/src/presentation/main-window/MainWindowPresentationSurface.tsx:629) makes renderer eligibility a read-only projection of settled Full lifecycle state. The renderer never progresses lifecycle.
- [`MainWindowPresentationSurface.tsx:1138`](D:/Ameow/.cindy-worktrees/compact-mascot-visual/src/presentation/main-window/MainWindowPresentationSurface.tsx:1138) mounts the sole Expanded decorative host and passes the already-resolved target.
- [`expandedPresentationRuntime.ts:139`](D:/Ameow/.cindy-worktrees/compact-mascot-visual/src/presentation/main-window/expandedPresentationRuntime.ts:139) is fail-closed; [`:155`](D:/Ameow/.cindy-worktrees/compact-mascot-visual/src/presentation/main-window/expandedPresentationRuntime.ts:155) bounds frame scheduling; [`:283`](D:/Ameow/.cindy-worktrees/compact-mascot-visual/src/presentation/main-window/expandedPresentationRuntime.ts:283) cancels/reset on sleep and [`:295`](D:/Ameow/.cindy-worktrees/compact-mascot-visual/src/presentation/main-window/expandedPresentationRuntime.ts:295) disposes it.
- [`ExpandedPresentationSurface.tsx:791`](D:/Ameow/.cindy-worktrees/compact-mascot-visual/src/presentation/main-window/ExpandedPresentationSurface.tsx:791) owns renderer/runtime setup, context loss/restoration, ResizeObserver, and cleanup. The canvas is `aria-hidden` and pointer-transparent at [`:888`](D:/Ameow/.cindy-worktrees/compact-mascot-visual/src/presentation/main-window/ExpandedPresentationSurface.tsx:888).

Current Intake and Folder opportunities also prove the intended authority split:

- Download Intake Presentation owns one latest bounded opportunity and removes it on expiry, replacement, terminal reconciliation, or reset; Application membership and primary identity remain read-only facts (`downloadIntakePresentation.ts`).
- Folder activation exists only after successful persisted output-path change (`folderActivationPresentation.ts`).
- The renderer receives origin and `startedAt`; it cannot invent either event.

The existing runtime is useful architecture evidence, not a direct Ripple controller. It derives Activation age from renderer-local time and supports immediate downward correction for Download progress, but it does not expose an arbitrary reversible transition phase. A Ripple candidate that imports upstream `trigger()`/GSAP would therefore create a second authority rather than fitting the current contract.

## Architecture conclusion

**Conditional GO for an isolated Browser Lab source-fidelity control. No Production integration GO.**

The shader kernel fits Ameow's Presentation direction because it can be rendered as a pure function of textures, normalized origin, externally supplied phase, and fixed visual parameters. The upstream React component does not fit because it owns pointer input, animation lock, easing clock, pinch timing, completion, and A/B swap.

The initial control should be a Lab-only, candidate-specific canvas route that is mutually exclusive with the standard `LabOverlayStage`. It should not be forced through the current Thermal `ExpandedPresentationSurface`: that host has one procedural transparent WebGL2 program and no A/B scene textures, so reusing it would require rewriting Ripple before fidelity is established.

This is a bounded exception to the existing Lab reuse guard, not a new renderer framework. Today [`rendererReuse.test.ts:128`](D:/Ameow/.cindy-worktrees/compact-mascot-visual/src/lab/rendererReuse.test.ts:128) prohibits any Lab renderer/runtime/shader reimplementation because ordinary scenarios must mount the one Production host. A later approved prototype may narrow the guard to permit exactly one named Ripple candidate module only on the mutually exclusive Ripple route while retaining these invariants:

- ordinary Lab scenarios still mount exactly one Production `ExpandedPresentationSurface`;
- Ripple mode mounts exactly one Lab-only canvas and no Production Expanded canvas;
- no candidate import is reachable from the Production entry;
- no generic renderer registry, shader interface, effect list, or scheduler is introduced.

The existing isolation mechanism is strong and should be reused:

- [`vite.lab.config.ts:4`](D:/Ameow/.cindy-worktrees/compact-mascot-visual/vite.lab.config.ts:4) serves a loopback-only browser page with no Electron runtime;
- [`lab-main.tsx:9`](D:/Ameow/.cindy-worktrees/compact-mascot-visual/src/lab/lab-main.tsx:9) initializes a bridge-free browser entry;
- [`vite.config.ts:10`](D:/Ameow/.cindy-worktrees/compact-mascot-visual/vite.config.ts:10) pins Production build input to `index.html`, excluding the Lab;
- [`rendererReuse.test.ts:86`](D:/Ameow/.cindy-worktrees/compact-mascot-visual/src/lab/rendererReuse.test.ts:86) guards that separation.

## Responsibility boundary

| Responsibility | Direct reuse | Derivative | Ameow adapter / authority |
| --- | --- | --- | --- |
| Radial distance, two fBm fields, wavefront coverage, Gaussian/cosine envelope | pinned shader math | only after source-fidelity GO | none |
| Envelope-driven displacement, RGB split, glow, noisy reveal | pinned shader math | later Color/Hot Edge only | none |
| Vertex/fragment GLSL and texture sampling | exact WebGL1 control first | WebGL2 syntax/host port later | resource lifecycle around it |
| Demo images | optional reference evidence only | host-owned square fitting if used | prefer deterministic square Lab fixtures |
| Normalized origin | uniform semantics | characterize off-center normalization before changing | finite-check, clamp, top-left panel coordinates |
| Progress/easing | shader consumes `u_progress` | source-equivalent `power3.out` projection | owns raw phase, start/end/reverse/cancel |
| A/B state | none of upstream commit logic | none required | supplies ordered from/to textures and committed side |
| Pointer input | do not reuse | none | Lab/Ameow captures origin and publishes it |
| `animating` lock, GSAP timeline, `onComplete`, `state.swap` toggle | do not reuse | none | forbidden in visual leaf |
| Responsive sizing, DPR, resize, context loss | do not reuse wholesale | candidate-local fixed host | use Ameow's bounded cleanup/fail-closed principles |
| Pinch | pinned source math | Pinch OFF comparison only | user baseline is ON with Strength `.14` |
| Blend strength | no upstream source | none in this candidate | must not be invented or silently inferred |

## Ameow-owned transition contract

The minimum conceptual contract is concrete and candidate-specific:

```ts
type RippleVisualFrame = Readonly<{
  from: RippleTexture;
  to: RippleTexture;
  origin: { x: number; y: number };
  phase: number; // authoritative Ameow/Lab phase, clamp 0..1
  params: RippleSourceParams;
}>;
```

The exact implementation shape may remain component props plus one local renderer helper; it does not need a shared interface.

- **Start:** Ameow/Lab creates a new generation, fixes `from`, `to`, and origin, and sets phase 0.
- **Advance:** Ameow/Lab owns the clock and phase. The visual projection maps phase through the selected source-equivalent easing and writes `u_progress`.
- **Reverse:** Ameow/Lab decreases the same authoritative phase. The shader renders the same deterministic path backward; no autonomous noise time is added.
- **Cancel:** Ameow/Lab stops scheduling and chooses whether authoritative state settles to `from` or `to`. The visual leaf merely draws phase 0 or 1 and releases transient resources.
- **Complete:** Ameow/Lab commits `to` only after phase 1 is rendered and the entire radius-16 panel mask is target-stable. The renderer never toggles product state and never emits a semantic completion callback.
- **Replace:** a new generation invalidates stale scheduled frames and replaces textures/origin/phase.
- **Ineligible/dispose/context loss:** cancel pending frame(s), release GPU resources, and fail closed without changing Application/Product state.

The visual completion definition is **full target settlement across the clipped panel**, not the first noisy tendril touching an edge. This preserves Ripple's organic frontier and its end gate while satisfying the product boundary rule.

## Minimum isolated Browser Lab control

One mutually exclusive `Ripple source-fidelity` scenario is sufficient:

- one logical 200x200 host with radius 16 and one WebGL1 canvas;
- deterministic square A/B fixtures; no live DOM capture claim;
- click-to-set normalized point origin plus numeric origin facts;
- external phase scrub, Replay Forward, Reverse, and Cancel-to-from/Cancel-to-target controls;
- two locked presets from the same visual leaf:
  - user control baseline selected by default, including Pinch ON / Pinch Strength `.14`;
  - a Pinch OFF pure-wavefront comparison from the same visual leaf;
- one active canvas only; no Paper, Thermal, Refraction, Halo, Production preview, or Electron bridge;
- concise provenance/commit facts and advanced uniform/resource readout;
- no generic shader editor or arbitrary effect control schema.

Pinch ON / Pinch Strength `.14` is the confirmed default user-baseline capture. The Pinch OFF comparison isolates the pure wavefront where useful. `.14` must never be described as or mapped to blend strength.

## Production fit blocker deliberately left open

The current Expanded host is a transparent procedural overlay. Ripple requires stable image A and B samplers. Browsers cannot sample already-composited DOM behind a WebGL canvas. Therefore a future Production task must separately decide and prove one of these product-specific scene-source routes:

- authoritative before/after raster snapshots supplied to Ripple;
- both states rendered into owned GPU textures;
- a consciously derivative envelope-only overlay that no longer claims full upstream A/B source fidelity.

This planning task chooses none of them. It does not authorize `html2canvas`, DOM capture, a scene graph, a multipass compositor, or a second Production host. A successful static-texture Lab control proves motion fidelity only, not Production integration feasibility.

## Visual adaptation order after source-fidelity PASS

1. **Color:** change only color response/palette while freezing distance, noise, wavefront, envelope, reveal, displacement, RGB separation, and progress. Compare fixed-phase geometry against the source control.
2. **Hot Edge:** derive one narrow warm edge from the existing `delta/envelope`; do not create a second wavefront, second time source, or Thermal carrier.
3. **Refraction / Halo:** absent. Discuss only if later cropped evidence shows a specific visual deficiency that Color and Hot Edge cannot solve.

Past Paper/Thermal work may inform review vocabulary (interior occupancy, frontier readability, material distribution, water/jelly failure modes, tight evidence crops). It supplies no mandatory code, palette, shader block, renderer, or effect checklist.

## Risk and validation matrix

| Risk | Planning containment / evidence |
| --- | --- |
| Ripple looks organic but unreadable at 200x200 | fixed-phase canvas crops, compact phase sheet, center/edge/corner origins, edge-arrival and target-settlement probes |
| Lowering noise becomes the accidental solution | lock both fBm structures and baseline `noiseWarp=.70`; review envelope/frontier readability separately from noise presence |
| Excessive liquid/folded image | inspect displacement/RGB/glow independently; compare pinch-off user lane and source-default lane; do not change noise first |
| Demo semantics leak into authority | source tests forbid pointer listener, GSAP, `animating`, completion toggle, and semantic callbacks in the visual leaf |
| Static Lab textures hide Production scene-source gap | main report keeps Production integration blocked and labels the control motion-only |
| Existing Thermal host biases the candidate | mutually exclusive Lab-only Ripple host; zero Thermal/Paper imports in the candidate |
| Candidate leaks into Production bundle | Production entry/build graph assertion and artifact scan; `vite.config.ts` remains single-entry |
| Off-center normalization collapses far distances | exact upstream control first; origin matrix and radial-front morphology evidence before any derivative |
| Cross-GPU undefined reversed `smoothstep` | Chromium/Electron/WebGL probes on available GPU paths; no silent repair in control |
| Upstream install cannot reproduce | pin commit/blob/source and own dependency graph; do not depend on upstream lockfile |
| Evidence is technically valid but hard to review | tightly cropped 200x200 canvases or compact labelled sheets; no tall full-page screenshots or raw-JSON screenshots |
