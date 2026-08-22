# Browser Lab Falsification Spike Work Plan

## Scope

Execute exactly one Lab-only candidate implementing the approved `T/A/H/E` contract. This is a falsification spike, not production integration and not a parameter-repair phase.

## Step 1 — Freeze Baseline and Candidate Contract

- Verify production/test state still matches the accepted Thermal + Refraction checkpoint before edits.
- Preserve all task planning and archived rejected evidence.
- Treat `lead-review.md` as authoritative when it corrects the worker planning report.
- Record the pre-edit diff/status and do not touch unrelated work.

## Step 2 — Implement the Minimum Shared-Energy Path

- Hoist/reuse accepted `baseTemperature` as `T` without changing accepted interior pixels.
- Keep accepted support/lifecycle as `A` and add only a monotonic, zero-capable response `H(T)`; no new coordinate/time/phase/noise/mask/palette/morphology.
- Derive shared `E = A * H` once and make Refraction amplitude, boundary response, and halo consume it.
- Keep Refraction direction, base strength, analytic resample, and accepted visual identity locked.
- Use accepted rounded-boundary math and one material projection; add no boundary-only palette.
- Project the same boundary E outward with analytic compact support ≤12 CSS px and a strict final-2px zero guard band.

## Step 3 — Reapply Only Proven Lab Infrastructure

- Reuse the Lab-only 228 canvas/layer split and exact 200/r16 panel placement at (14,14).
- Keep FX canvas non-interactive, UI clip normally interactive, UI content clipped, and CSS shadow singular.
- Keep production/native geometry and production integration untouched.
- Add only the smallest Lab presets/readouts/debug views required for evidence.

## Step 4 — Source and Automated Gates

- Source-contract tests: one topology authority; one canvas/program/draw; no texture/sampler/FBO/preprocessing/Paper morphology; fallback default off.
- Prove accepted interior equivalence and Refraction direction/base constants.
- Prove halo compact support and final-2px zero behavior mathematically/readback-wise.
- Prove Reduced Motion static/zero-continuing-frame authority and fallback zero new resources.
- Prove layer order, pointer events, UI hit testing, drag semantics, singular CSS shadow, and transparent compositing hooks.
- Run focused Vitest, type-check, lint, full tests, and `git diff --check`; report existing failures separately.

## Step 5 — One Visual Evidence Round

Capture, without repair iteration:

- `T`, `A`, `H`, and shared `E` debug views;
- accepted interior material and unified-off comparison;
- existing Refraction envelope versus shared-energy-modulated response;
- boundary distance/band and `E × boundaryBand`;
- projected halo and final 228 composite;
- four sides, four corners, and final-two-pixel measurements;
- FX off/on shadow/layer comparison;
- hit testing/drag/interaction evidence;
- Windows transparent-window compositing.

macOS must be marked NOT VERIFIED unless a real host is available.

## Stop Conditions

Immediately stop and report hypothesis failure, without a parameter repair round, for any:

- continuous perimeter or second silhouette;
- detached/inset halo or second palette/topology/time authority;
- nonzero/high-energy final 2px at any side/corner;
- Refraction identity drift;
- accepted interior or unified-off fallback regression;
- texture/FBO/second canvas/program/draw or new scheduler authority;
- UI interaction/drag, CSS shadow, transparent compositing, or Reduced Motion regression.

## Deliverables

- Lab-only implementation and focused tests.
- Task-local reproducible evidence/harness and captures.
- `implementation-report.md` with exact result, evidence, validation, changed files, platform status, and any falsification.
- No commit/archive/task completion/production integration.
