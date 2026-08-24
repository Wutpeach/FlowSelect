# Boundary-Driven Thermal Source / Edge-Originated Field Hypothesis Design

## Stable Baseline and Evidence Disposition

The authoritative worktree is clean at `eaead65`. The accepted work commit is `046f228`, and the rejected Directional Exit task names `8a80474` as its restored stable checkpoint. The archived report confirms that only `ExpandedPresentationSurface.tsx` and `expandedPresentationSurface.test.ts` were changed by that prototype and then restored. No product-code diff exists after `8a80474`; only archive/journal commits follow it.

The rejected coordinate compression, anisotropic convergence, soft containment, terminal cleanup, and their tests must not be reused. Their captures and report remain design evidence for what failed visually.

## Existing Signals to Reuse

| Existing signal | Current job | Source-model job |
| --- | --- | --- |
| `k` | One continuous Lab phase; pinned to `0.42` in Reduced Motion | Keep as the only monotonic source path parameter |
| `front` | Position of the travelling diagonal front | Recast as source-contour position; replace its range so the whole support starts/ends outside both boundaries and the RM phase is developed |
| `DIR` | Lower-left to upper-right projection axis | Keep unchanged as source travel direction |
| `heatmapBend(q, bendTime)` | Low-frequency contour deformation, 2D topology input, Refraction gradient input | Keep as the shared non-linear spatial vocabulary |
| `d = dot(q, DIR) - front + bend` | Signed distance to the accumulating coverage front | Keep as signed distance to the source contour, not material ownership |
| `warm` | Narrow frontier temperature bias | Optional subordinate contour-local response; reject or reduce it if it reads as a moving strip |
| `core` | Narrow 2D Gaussian point on the frontier | Do not use it as a visible source marker; omit/reduce it if it reads as a moving blob |
| `roundedBoundary`, `boundaryBand` | Real 200x200 / 16px rounded shell and inward contact band | Keep as the only boundary/contact geometry |
| `baseTemperature` | Accepted broad 2D multi-temperature topology | Keep unchanged; evaluate only where source influence is active |
| Refraction `grad` | Finite difference of `heatmapBend` | Keep unchanged as displacement direction |
| `behind`, `body`, `energy`, `covered`, `covered2`, `bodyFloor`, `materialMix` | Swept half-plane material plus phase-wide fade/coverage | Remove from visibility authority or reformulate as source-local response; replace lifecycle gating with source influence |

## Proposed Source / Influence Causality

Use the existing bent travelling contour as the source. For centered pixel coordinate `q`:

```text
sourcePhase = existing k
sourcePosition = monotonic travel from beyond boundary A to beyond boundary B
xi = dot(q, DIR) + heatmapBend(q, bendTime)
signedSourceDistance = xi - sourcePosition
sourceDistance = abs(signedSourceDistance)
sourceInfluence = broadCompactFalloff(sourceDistance / supportWidth)
```

`broadCompactFalloff` is a shader-local smooth profile with a flat or very broad inner response and exact zero outside its finite support, for example a squared smoothstep complement. It is not rendered as geometry and is not a mask over a pre-existing object. It is the amount by which the accepted material is thermally excited at that pixel.

The centered square's half-span projected onto `DIR` is approximately `0.5 * (abs(DIR.x) + abs(DIR.y)) = 0.70`. The theoretical `heatmapBend` magnitude is bounded by `0.5 * 0.13 + 0.5 * 0.05 = 0.09`, so a conservative source-space half-span is about `0.79`. The influence support must exceed that span to admit a developed full-surface interval. The source path must begin before `-windowHalfSpan - supportWidth` and end after `windowHalfSpan + supportWidth`, ensuring the same two-sided kernel is zero both before entry and after exit. Exact support/feather constants remain spike hypotheses, not a new timing system.

The current `front = mix(-0.58, 1.6, k)` cannot satisfy those bounds: at `k = 0`, the contour is already inside the conservative window span. Keep `k` and `DIR`, but replace the source-position range. Reduced Motion remains pinned at `k = 0.42`; the new mapping must place that phase near source-space center so it remains a developed static snapshot. This changes renderer-local spatial projection only, not Reduced Motion authority or scheduling.

The finite source support necessarily has two sides, but neither side is an independently animated trailing deletion plane. Both are the symmetric or deliberately biased falloff of the same moving source kernel. If either side becomes visually legible as a deletion mask, the hypothesis fails rather than gaining a repair mask.

### Entry

The source begins far enough before boundary A that only the outer influence support intersects the DOM-clipped real rounded window. `boundaryBand * contourResponse * sourceInfluence` produces localized edge contact. As the source advances, more interior pixels fall inside the broad support. No independent entry mask, inset carrier, or synthetic origin geometry is needed.

### Developed presence

When the source is near the middle of its path, every visible point lies inside the broad support. The accepted `baseTemperature` field supplies the large blue/cyan/yellow/orange/red-orange topology. The contour may add a bounded warm bias, but it must not become a visible stripe dividing a blue body from a warm front. The existing narrow 2D Gaussian `core` is not required and must be omitted or strongly reduced if it reads as a travelling point/blob.

### Exit

The same `sourcePosition` continues beyond boundary B. For every fixed pixel, `sourceDistance / supportWidth` eventually crosses the finite-support limit, so `sourceInfluence` becomes exactly zero. Thermal material blend and Refraction envelope both reach zero from that same local distance. There is no global exit alpha, trailing deletion plane, compression, containment shape, or terminal cleanup.

## Material and Refraction Reuse

- Keep the three transformed `heatmapBend` coordinate frames, `baseTemperature`, seven-stop ramp, yellow-zone repair, grain, and local edge color treatment.
- Remove `behind/body/energy` from the baseline visible material path and remove `covered/covered2/bodyFloor/energy` from the Refraction visibility/envelope path. Keeping any of those as a half-plane/phase authority would leave old accumulated material behind the source.
- Blend the accepted Thermal response against the stable pre-entry void output with `sourceInfluence`. Use the identical void output before entry and after exit; do not make alpha zero unless the pre-entry baseline already does so.
- Keep Refraction finite-difference direction and fixed strength. Replace its coverage/energy envelope inputs with the same source influence plus existing contour/contact hierarchy.
- Keep `signedSourceDistance` signed for Refraction's directional first-order math; apply `abs` only to the influence profile. Default material and Refraction gating to the same unshifted influence, introducing a shifted influence sample only if direct inspection proves it necessary.
- Keep contour warmth and boundary contact as bounded additive temperature/intensity biases. Neither controls the base 2D topology.
- Do not add a second shader pass, texture, framebuffer, sampler, renderer, or material abstraction.

## Ownership and Authority

```text
existing renderer time / Reduced Motion snapshot
        -> existing renderer-local k and bendTime
        -> sourcePosition + bent contour distance
        -> one local sourceInfluence scalar
             -> accepted 2D Thermal material response
             -> accepted Refraction envelope/direction
             -> localized real-boundary contact
        -> existing one draw
```

Product lifecycle still decides whether the Expanded surface is eligible. Presentation policy still resolves one semantic target. The renderer runtime still owns only reconstructible frames. The source is a shader calculation, not semantic state or lifecycle authority.

No new architecture primitive is justified for the spike. A small local helper for the influence profile is acceptable only if it improves formula clarity; it must not become a generic field API.

## Directional Exit Constructs to Remove Permanently

- `trailingFront`, `trailingD`, `leadingCoverage`, `remainingCoverage`, and `activeCoverage` deletion-half-plane vocabulary.
- Existing `behind`, `body`, `covered`, `covered2`, and `bodyFloor` may remain only if reformulated as symmetric source-local response; they must not preserve accumulated half-plane visibility.
- `exitProgress`, `qExit`, `exitTravel`, `exitScaleAlong`, and `exitScaleAcross` whole-field translation/compression.
- `exitCenter`, anisotropic containment coordinates, containment ellipse/falloff, and `terminalCleanup`.
- Any separate convergence onset, terminal point, terminal icon/fragment, or terminal lifecycle/state.
- Any acceptance claim based on material being packed, compressed, contained, or cleaned up after convergence.

## Paper Shaders Boundary

Paper Shaders may be consulted only for high-level mechanics: a contour/source can have inner/outer influence, and material response can be separated from the source. Do not copy shader source, parameters, logo/diamond shapes, internal carriers, or literal Paper composition.

## Visual and Architecture Risks

| Risk | Planning response / rejection gate |
| --- | --- |
| The support/travel pairing reads as a diagonal wipe at one width or a synchronized diagonal fade at another | Treat both as one primary falsification risk; inspect a mid-ramp frame and reject the hypothesis if no bounded middle region avoids both readings |
| The contour reads as a moving strip/object or `core` reads as a point/blob | Keep contour warmth subordinate, omit/reduce `core`, and reject if any source marker becomes an object |
| Full-surface developed presence is too short or absent | Derive support width from the window's `DIR` projection before timing tuning; do not add a hold state or second phase |
| Exit leaves a global synchronized fade impression | Inspect late frames and per-region disappearance; do not add terminal cleanup or global alpha compensation |
| Refraction survives after material or appears before contact | Gate both material visibility and Refraction envelope with the same source influence |
| Post-exit looks like a terminal fade to dark navy | Require pixel equivalence between pre-entry void and post-exit zero; the stable void floor is not activated Thermal material |
| Source path needs semantic lifecycle state | Stop the spike; that would exceed Browser Lab scope and reopen architecture |
| Shader cost grows | Reuse the existing analytic signals and one scalar profile; no loop, texture, second pass, or new noise |

## Rollback

The future spike must remain a small, uncommitted shader/test/evidence diff. Rollback restores `ExpandedPresentationSurface.tsx` and its source-contract test to the clean checkpoint; task research remains as evidence. No production integration or migration exists to unwind.
