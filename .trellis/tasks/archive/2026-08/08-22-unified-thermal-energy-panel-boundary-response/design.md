# Design Questions and Candidate Architecture

## Planning Objective

Determine the smallest architecture that projects the accepted Ameow 2D Thermal energy through the real panel boundary into a bounded exterior halo while preserving the accepted interior and Refraction identities.

This document is a research frame, not an approved implementation design. Repository evidence must confirm or revise every candidate statement below.

## Repository Questions

### Accepted Energy Authority

- Trace the accepted Thermal shader path from its scalar/topology construction through palette/material output.
- Identify which scalar is stable before palette projection and remains spatially meaningful for Refraction and boundary sampling.
- Distinguish topology/energy from visibility, alpha, lifecycle progress, grain, palette, contact highlights, and Refraction displacement.
- Determine whether the source can be reused directly or needs a named shader-local expression assembled from already accepted signals.

### Boundary Geometry and Response

- Confirm the exact outer-domain mapping for panel origin (14,14), size 200×200, and radius 16.
- Define a signed real rounded-boundary distance or equivalent panel-local coordinate usable both inside and in the gutter.
- Boundary response must be a local transform of unified energy near that distance field, not an independent contour color or phase.
- Evaluate how energy at/near the boundary can be extended outward without shrinking the source silhouette or inventing an inset carrier.

### Shared Consumers

For one energy field `E`, determine a bounded relationship of the form:

```text
E → accepted palette/material
E and ∇E → accepted Refraction response
E sampled near real boundary × boundary-local kernel → edge response
boundary-carried E × bounded exterior falloff → halo
```

The report must say whether Refraction should consume `E`, its gradient, the existing accepted displaced sample, or a precisely named combination. It must preserve Refraction direction and strength unless a later review reopens them.

### 14px Halo Domain

- Use the true 228×228 output and exact panel placement; do not alter native bounds.
- Specify a finite-support or otherwise provably negligible exterior falloff by the final 2px of the BrowserWindow.
- State how corners differ geometrically from straight edges and how four-side/four-corner evidence will verify them.
- Treat a clipped high-energy halo at the outer edge as falsification, not as a repair opportunity.

## Infrastructure Audit

Classify previous Paper-spike work into:

1. Reusable capability: outer-domain canvas/layer split, exact panel coordinate mapping, non-interactive canvas, UI clipping and hit-testing preservation, singular CSS shadow, Lab presets/debug views, readback/evidence harness, lazy renderer-owned resource lifecycle if actually needed.
2. Remove: Paper processed boundary texture if the unified analytic field makes it unnecessary, broad/narrow/contour channels that manufacture interior topology, subtractive morphology/blob shadows, fixed Paper phases, Paper palette/scalar composition, independent outer response.
3. Conditional: derivative/licensing files and provenance, retained only to the extent derivative source remains in the candidate.

Prefer no texture or preprocessing if the accepted Thermal field and analytic rounded-boundary mapping can produce the required response in the existing single draw. A retained texture requires a repository-grounded reason and must remain one lazy reconstructible renderer-owned resource with correct restore/dispose behavior and no fallback allocation.

## Visual Authority Rules

- Boundary terms may scale, redistribute, or weakly extend `E`; they may not create energy where no relevant Thermal energy reaches the boundary.
- Edge and halo use the same palette/material projection unless the plan justifies a continuous low-energy/low-alpha projection from the same scalar.
- No constant perimeter term, boundary-only color ramp, full continuous ring, detached glow, or independent time/phase.
- A weak edge response must become spatially localized according to the accepted 2D field rather than uniformly tracing the entire rounded rectangle.
- Paper mode off/fallback must retain accepted pixel and resource semantics.

## Minimal Spike Shape

Plan a Browser Lab-only static/pinned-state comparison, not a production integration. It should expose at least:

- accepted unified Thermal energy `E`;
- accepted interior material;
- accepted Refraction response/intensity source;
- signed boundary distance or boundary-local weight;
- energy-gated boundary response;
- halo contribution;
- final 228×228 composite;
- Paper/off fallback and resource counts.

Use representative fixed accepted Thermal states only as observation points. Do not add a scheduler, lifecycle, entry/exit state, or timing curve.

## Required Risks

- Boundary response becomes a continuous perimeter outline.
- Halo is detached, uniformly animated, or color-authoritative.
- Reprojecting a 200×200 energy field into 228×228 changes accepted interior sampling/topology.
- Refraction consumes a different scalar than material/halo and visually drifts.
- Corners concentrate energy or expose hard falloff seams.
- Outer-domain layering regresses CSS shadow, UI clipping, hit testing, or drag semantics.
- Retained texture/preprocessing creates unnecessary resource or licensing scope.
- Reduced Motion or fallback begins allocating/scheduling new work.

## Decision Output

The final planning report must recommend continue or abandon, identify the minimum complete spike, and list objective acceptance/falsification gates. No implementation follows until GPT Architecture Lead approves the plan.
