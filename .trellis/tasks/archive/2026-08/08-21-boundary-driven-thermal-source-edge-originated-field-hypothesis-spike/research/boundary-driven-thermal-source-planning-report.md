# Boundary-Driven Thermal Source / Edge-Originated Field Hypothesis Planning Report

Date: 2026-08-21
Status: planning complete; no spike implementation; awaiting GPT Architecture Lead Planning Review.

## Outcome

Repository evidence supports a minimal new hypothesis without a new architecture primitive: the current shader already contains a travelling, bent source contour (`front` / `d`). The next spike should stop treating the half-plane behind that contour as accumulated material and stop using `energy` as a phase-wide disappearance envelope. Instead, one broad finite-support influence around a remapped contour path should activate the accepted 2D material and Refraction as it enters, spans, and leaves the real rounded window.

## Stable checkpoint and rejected evidence

- Authoritative worktree: `D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx`, clean at `eaead65`.
- Accepted Thermal + Refraction + 2D material work: `046f228`; restored checkpoint cited by the rejected task: `8a80474`.
- `8a80474..HEAD` has no production-code delta. The subsequent commits only archive Directional Exit evidence and record the journal.
- The rejected report states at lines 4-14 and 118 that the experiment was rejected, the two product/test files were restored, no implementation commit exists, and all captures/reports remain archived.

No additional restoration was needed or performed in this planning turn.

## Repository-grounded signal inventory

`ExpandedPresentationSurface.tsx` already provides:

- `k`, `front`, `bendTime`, `DIR`, `p`, `bend`, and signed contour distance `d` at lines 163-170;
- `body`, `warm`, `core`, and the current phase-wide `energy` envelope at lines 171-177;
- real rounded-window SDF/band and contact capture at lines 147-155 and 180-183;
- the accepted 2D topology from three transformed `heatmapBend` frames at lines 269-293;
- Refraction direction from finite differences of the same low-frequency bend at lines 231-268;
- current half-plane/phase coverage authorities `covered`, `covered2`, and `materialMix = covered2 * energy` at lines 257-259, 268, and 309-311.

The baseline path also retains half-plane material through `behind/body` at lines 171-172 and consumes it in `heat`/`coolLift` at lines 183 and 189. A source model must replace those visibility roles too; changing only the Refraction gate would leave accumulated material behind the source.

The renderer binds existing time, Reduced Motion, mode, boundary, and palette uniforms and issues one `gl.drawArrays` at lines 586-624. The component remains the sole concrete host at lines 648-711. `expandedPresentationRuntime.ts` supplies renderer-local time and bounded frame scheduling at lines 103-194; Reduced Motion prevents Heatmap frame scheduling at lines 155-165. Targets and policy remain semantic projections with no terminal or renderer-owned lifecycle.

## Proposed causality

```text
existing time / Reduced Motion
        -> existing k + bendTime
        -> sourcePosition travelling beyond A -> through window -> beyond B
        -> bent contour distance abs(dot(q, DIR) + bend - sourcePosition)
        -> one broad finite-support sourceInfluence
             -> accepted 2D multi-temperature material response
             -> accepted Refraction direction and bounded envelope
             -> localized boundaryBand contact
        -> existing palette / grain / one draw
```

The source influence is a smooth compact-support scalar, not visible geometry. The projected half-span of the centered window is about `0.70` along `DIR`; the existing bend adds at most about `0.09`, giving a conservative source-space half-span near `0.79`. Around the middle of travel the support must exceed that span so the accepted material can become broadly/full-surface active. The source path must start and end farther outside than the window half-span plus its support. The current `front = mix(-0.58, 1.6, k)` fails the entry bound and must be replaced; its new mapping must also place pinned RM `k = 0.42` near the developed source-space center. Every fixed pixel then lies outside the same two-sided kernel before entry and after exit, where activated influence becomes exactly zero.

Zero is defined relative to the stable pre-entry void output. The current shader uses a dark navy/alpha floor even when material is inactive; that floor may remain only if pre-entry and post-exit frames are pixel-equivalent. Thermal material and Refraction delta must be zero on both sides, with no terminal-only darkening or alpha cleanup.

## Entry, developed presence, and exit

- **Entry:** the outer influence first intersects the DOM-clipped real rounded shell near lower-left A. Boundary heat is only `boundaryBand * source response`; there is no anchor shape or perimeter path.
- **Developed:** broad support covers the visible shell. The accepted three-frame `heatmapBend` topology, palette, and grain determine the material appearance; contour warmth remains a local bias. The existing Gaussian `core` is not used as a visible travelling source point.
- **Exit:** the same source continues beyond upper-right B. Local influence falls to zero as distance exceeds support. Material and Refraction share this gate, so neither needs independent disappearance choreography.

## Ownership and architecture

Ownership remains unchanged. Product/lifecycle decides surface eligibility; Presentation policy resolves one target; renderer runtime supplies reconstructible time/frames; the fragment shader derives source influence; one renderer/program/draw produces pixels. Reduced Motion keeps `k = 0.42`, `bendTime = 0`, and zero continuing frames.

No new field, scene, layer, choreography, terminal, lifecycle, scheduler, renderer, texture, framebuffer, or post-processing primitive is needed. A shader-local influence function is the maximum justified addition.

## Directional Exit route to remove permanently

- all trailing deletion half-plane coverage;
- whole-field `qExit` translation, anisotropic compression, and convergence coordinates;
- soft elliptical containment and terminal cleanup;
- terminal point/icon/fragment identity and independent convergence onset;
- any acceptance criterion that asks the material itself to move, compress, shrink, or become a contained object.

These constructs are absent from the restored production checkpoint and must stay absent.

## Minimum future spike

Expected product/test scope is two files: `ExpandedPresentationSurface.tsx` and `expandedPresentationSurface.test.ts`. Reuse the existing Browser Lab heatmap/refraction mode, renderer time, capture path, palette, topology, Refraction, boundary SDF, and runtime. Add only the source-influence formula, coverage substitutions, source-contract tests, and task-local evidence/report. Do not change targets, policy, runtime, lifecycle, Lab architecture, dependencies, or production callers.

## Develop Worker review corrections

Independent read-only review found and closed three planning gaps:

1. Reusing the old `front` range would begin with the contour already inside the source-space window and would place RM `k = 0.42` off center; the path range is now explicitly reopened while RM authority stays locked.
2. Replacing only `energy/covered2` would leave `behind/body/bodyFloor` as old half-plane material authority; the plan now removes every such visibility role from both baseline and Refraction paths.
3. The shader's inactive output has a dark navy/alpha floor, so exact zero is now defined as zero activated delta plus pre-entry/post-exit pixel equivalence, not an unexplained fade to transparent or navy.

## Primary risks

1. Support width/travel range may trade a diagonal wipe at one extreme for a synchronized diagonal fade at the other. This is one primary falsification risk; broadness alone may not solve it.
2. A narrow bright contour may read as a moving strip and the existing Gaussian `core` may read as a moving point/blob. Neither may become a source object.
3. Fixed support may fail to provide a sufficiently long developed interval. Do not solve this with a hold state or second phase.
4. Entry and exit may feel globally synchronized if the influence is too broad. Inspect regional disappearance and reject global-fade readings.
5. Refraction may outlive or precede material if it is not gated by the identical influence scalar.
6. An unchanged dark navy/alpha floor may be mistaken for terminal fading unless pre-entry and post-exit are proven pixel-equivalent.
7. Any need for semantic source lifecycle state or a new renderer primitive invalidates the bounded hypothesis.

## Planning verdict

**Ready for GPT Architecture Lead Planning Review.** The hypothesis is repository-grounded and architecturally bounded. It is not visually proven. The next gate is explicit Planning Review approval; do not start implementation before that approval.
