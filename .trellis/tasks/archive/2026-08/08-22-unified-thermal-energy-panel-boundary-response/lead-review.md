# Cindy Lead Review — Unified Thermal Energy → Panel Boundary Response

Status: **PLANNING PASS WITH CORRECTIONS**  
Next gate: GPT Architecture Lead Planning Review  
Implementation: **NOT STARTED**

## Direct Judgment

Continue to one bounded Browser Lab falsification spike. The accepted renderer already has the
right topology, palette, rounded-boundary SDF, Refraction identity, runtime authority, and proven
228/200/14 Lab layer capability. No texture, preprocessing pass, second renderer, or Paper
morphology is required.

The Develop Worker audit is repository-grounded, but two claims required correction before this
plan could be accepted:

1. `baseTemperature` is the sole accepted 2D **temperature topology**, not by itself a complete
   visible-energy scalar. It has a deliberate minimum of 0.24; raw
   `baseTemperature * boundaryBand` can therefore produce a continuous active perimeter.
2. Current Refraction material samples `baseTemperature`, but current displacement intensity is
   `0.16 * env`; `env` is built from contact/front/body coverage and lifecycle energy, not from
   `baseTemperature`. Unified mode must explicitly test an energy-derived amplitude modulation.

## Authoritative Unified Contract

Use one accepted Thermal field sample:

```text
T(q,t) = accepted baseTemperature                 sole 2D topology/temperature authority
A(q,t) = accepted covered2 × lifecycle energy     support/activation gate
H(q,t) = monotonic zero-capable response(T)        derived response, no new topology
E(q,t) = A × H                                     shared response energy
```

`H` may only remap `T`. It may not introduce coordinates, time, phase, noise, processed geometry,
a second mask, or a second palette. Its cool end must reach true zero so low-temperature pixels do
not illuminate the complete rounded boundary. Candidate thresholds should be tied to existing
`HEAT_STOP` transition ranges and evaluated in the Lab; this phase does not bless parameter values.

Consumers:

- Interior: preserve the accepted `material2`/`rgb2` projection and `A` blending exactly. `T`
  remains its topology source; warm/contact remain bounded accepted biases, not authorities.
- Refraction: preserve `∇bend`, `REFRACTION_STRENGTH = 0.16`, the existing local `env`, and the
  first-order resample. Unified mode tests only a bounded `H`-derived modulation of `env`.
- Boundary: `edgeEnergy = E * boundaryBand`. It modifies the same material scalar/ramp; it does
  not emit a boundary-only color.
- Halo: sample/project the same boundary `E` along the outward normal and multiply by an analytic
  compact-support falloff. Use the same Thermal palette with subordinate alpha.

This is one authority with distinct accepted responsibilities: `T` provides topology, `A`
provides support/lifecycle, the rounded SDF provides geometry, and `H` is only a deterministic
response curve.

## Boundary and 14px Model

- Geometry remains exact: output 228×228; panel 200×200/r16 at (14,14).
- Interior edge kernel remains the accepted real rounded `boundaryBand`.
- Exterior sampling clamps/projects to the real panel boundary; it does not shrink the silhouette
  or introduce an inset carrier.
- Halo support must end at or before 12 CSS px from the panel boundary. The final 2px of the 14px
  gutter are an explicit zero guard band on straight sides; corners reach zero sooner.
- Output at the final two rows/columns and all four corners must be alpha/energy zero. A merely dim
  but nonzero edge is a failed bound, not a tuning success.

## Reuse and Removal

Reuse only:

- Lab-only 228 canvas/layer split with normal `pointer-events:auto` UI clip;
- non-interactive FX canvas, singular CSS shadow, and exact panel mapping;
- readback/debug/counter/evidence harness patterns;
- accepted `roundedBoundary`, `boundaryBand`, palette, material, and Refraction code.

Remove from any candidate:

- `uPaperBoundary` and all processed broad/narrow/contour textures or CPU blurs;
- Paper subtractive morphology, blobs, fixed phases, palette, and independent outer response;
- Boundary-Driven `sourceInfluence`/exit/convergence machinery;
- active Paper derivative headers/notices when no derivative source remains.

The recommended analytic candidate needs no texture and remains clean-room/MIT. Any later
near-verbatim Paper source reuse reopens Apache-2.0/NOTICE/provenance obligations.

## Minimal Browser Lab Spike

Lab-only, one draw, no scheduler or production integration. Preserve a byte/pixel-equivalent
unified-off fallback.

Independent debug evidence must show:

1. `T` topology;
2. `A` support/lifecycle;
3. derived `H` and final `E`;
4. accepted interior material;
5. existing Refraction `env` beside unified `env × response(H)`;
6. real rounded boundary distance/band;
7. `E * boundaryBand` edge response;
8. projected `E × falloff` halo;
9. final 228 composite, FX off/on shadow/layer comparison, and resource counters.

Use representative pinned accepted Thermal states only for observation. No new timing or phase
authority. Capture four sides, four corners, final-two-pixel strips, hit testing/drag behavior,
Reduced Motion static equivalence, and Windows transparent compositing. macOS remains
**NOT VERIFIED** without a host.

## Acceptance / Falsification

Accept only if all are true:

- `T` is the only topology input and `H/E` are visibly/source-traceably derived from it.
- Unified-off preserves accepted pixels and zero texture/resource allocation.
- Unified-on preserves accepted interior topology and Refraction identity.
- Refraction amplitude correlates with `E` without changing direction or becoming a second field.
- Boundary energy has visible gaps/local variation at every observation state; no continuous ring.
- Halo is weaker than interior/edge, shares their material language, and is exactly zero in the
  final 2px on all sides/corners.
- One canvas/program/draw, no texture/framebuffer, singular CSS shadow, normal interaction,
  Reduced Motion zero-continuing-frame authority.

Immediately stop and report hypothesis failure for any continuous perimeter, detached/inset halo,
second palette/topology/time authority, high-energy/nonzero outer edge, Refraction identity drift,
fallback/resource regression, or layer/interaction regression. Do not enter a repair loop.

## Risks

The primary visual risk is that the accepted temperature floor still makes a derived response too
broad and produces a ring. The primary architecture risk is treating Refraction support (`env`) as
if it were already unified energy. Secondary risks are 200→228 sampling drift, corner seams,
detached halo color, interaction/shadow regression, and unnecessary license/resource scope.

## Lead Conclusion

Architecture hypothesis is sufficiently grounded for one falsification spike, with the corrected
`T/A/H/E` contract. The worker's raw `baseTemperature * boundaryBand` formulation is not approved.
Stop here and wait for GPT Architecture Lead Planning Review.
