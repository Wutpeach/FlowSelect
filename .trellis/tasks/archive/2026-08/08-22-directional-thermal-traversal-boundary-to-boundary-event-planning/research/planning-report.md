# MR9 Localized Boundary Interaction + Subordinate Halo — Architecture Repair Planning Report

Date: 2026-08-22
Status: planning (architecture repair of existing artifacts); no implementation; awaiting GPT
Architecture Lead Planning Review
Recommendation: **CONTINUE only to one bounded Browser Lab falsification spike** for a localized
boundary-interaction response + subordinate <=12px halo.

## Direct Judgment

The active phase narrows to the accepted architecture: existing Thermal field/shared energy +
real 200x200/r16 boundary geometry -> **localized boundary-interaction response** ->
**subordinate <=12px halo**. No new authority is required. The repository already contains a
zero-capable, localized, accepted boundary-contact scalar (`capture`/`contact` =
`boundaryBand * warm`); the boundary response and halo should consume that scalar and nothing
else. The earlier Directional Thermal Traversal / Entry -> Propagation -> Exit proposal is
**parked as a future redesign candidate** and removed from all current planning surfaces.

No implementation occurred in this repair. The worktree source was inspected but not modified;
the dirty Unified Boundary diff remains frozen rejected evidence.

## Repository Truth

Accepted checkpoint = Git HEAD `4db7722` (branch `motion/mr9-fullscreen-activation-fx`).
The worktree working tree currently carries the rejected Unified Boundary diff (visible
`uBoundaryMode` / `uPanelOrigin` / `uPanelSize` uniforms, `panelUv` mapping, `H`/`E`/
`edgeEnergy = E * boundaryBand`, and the UNIFIED THERMAL -> PANEL BOUNDARY RESPONSE block).
That diff is **evidence only**; it is not the baseline.

HEAD already provides (anchors in `src/presentation/main-window/ExpandedPresentationSurface.tsx`):

- one shader/program/canvas/draw and renderer lifecycle (`:39-56, :586-624, :633-645`);
- normalized activation age from `startedAt / ACTIVATION_DURATION_MS` and one draw (`:603-624`);
- one runtime with bounded scheduling and at most one pending frame; Reduced Motion static,
  zero continuing frames (`expandedPresentationRuntime.ts:103-194, 263-305`);
- analytic rounded SDF `roundedBoundary` (`:150-155`);
- accepted moving field `k/front/DIR/d/body/warm/core/energy` (`:158-183`);
- **accepted localized boundary scalars**: `boundaryBand = smoothstep(-0.05,0,bd)*step(bd,0)`
  (`:181`), `capture = boundaryBand * warm * 0.6` (`:182`), `contact = boundaryBand * warm`
  (`:223`), `warm = exp(-abs(d + 0.018) * 30.0)` (`:178-179`);
- accepted 2D temperature topology `baseTemperature` (`:274-286`) and material projection
  (`:286-311`); `HEAT_STOP[7]` (`:198-207`);
- accepted Refraction gate (`:242-309`): `∇bend` direction, `env` envelope,
  `REFRACTION_EPS=0.02`, `REFRACTION_STRENGTH=0.16`, first-order resample, displaced
  `warm2`/`covered2`/`contact2`;
- older production activation grammar (`:340-402`) — unchanged, not in this phase's scope.

Geometry remains source-confirmed: 228 outer / 200 panel / r16 at (14,14) / 14px gutter
(`windowMetrics.ts:1-22`, `geometry.ts:68-76,102-104`). The accepted canvas is panel-sized and
clipped; prior Lab evidence proved a 228 canvas can sit between the real shell and a transparent
interactive 200/r16 UI clip with one CSS shadow and normal hit testing. The Lab-only
panel-origin/size mapping uniforms are reused for measuring the real boundary in the 228 domain.

The rejected Unified Boundary candidate remains failure evidence: real component shader did not
compile, a focused source-contract test failed, and its S4 boundary response illuminated 97.9%
of the perimeter (`08-22-unified-thermal-energy-panel-boundary-response/research/unified/lead-implementation-review.md`).

## CLOSED / LOCK

**CLOSED:** new `tau`/traversal contract; entry/exit projection and antipodal exit;
`arrival`/`localAge`; event carrier `C`; Entry/Exit/timing choreography; production activation
replacement; absolute shared energy `E` multiplied by `boundaryBand` (0.979-perimeter failure;
no threshold/weight rescue); Paper processed morphology, palette, object geometry, and
derivative implementation.

**LOCK:** accepted 2D Multi-Temperature interior material; accepted Refraction
direction/identity/gating; current production activation grammar; 228/200/14 geometry; one
surface/canvas/program/draw/runtime; clean-room route; actual component compile/link hard gate.

## Signal Inventory And Decision

| Category | Verdict | Reason (localization under broad warmth / semantics / cost / Refraction coupling / ring risk / second authority) |
|---|---|---|
| (a) Absolute local energy/intensity (`E * boundaryBand`) | **CLOSED** | `H(baseTemperature)` saturates ~1 in a broadly warm panel -> 0.979 perimeter. Bulk intensity, not a contact event. Created a second response-energy and perimeter authority. |
| (b) Gradient of existing Thermal/shared energy | **Reject** | Everywhere nonzero in a smooth warm field; needs a threshold to force zero (= re-labeling). Wrong semantics (interior variation). +6 `heatmapBend` evals. `∇bend` is the LOCKED Refraction direction -> coupling/drift risk. High ring risk. New energy authority. |
| (c) Boundary-normal derivative / flux | **Reject as energy** | Normal *derivative* shares (b)'s non-zero-capable, threshold, cost, and ring problems. The rounded-SDF normal itself is pure accepted geometry and is adopted only as geometry modulation (halo projection/falloff), never as an energy source. |
| (d) Existing zero-capable contact/frontier scalars `warm`, `capture`, `contact`, `contact2` | **CHOSEN** | `warm` is a narrow frontier strip regardless of bulk warmth; `boundaryBand` is compact; the product is localized at the front∩boundary even when the panel is broadly warm. Semantics = "frontier arrives at / contacts the real rounded boundary" (the accepted Rounded Boundary Edge Capture). Zero extra evaluations (already computed at HEAD). Baseline `capture`/`contact` are decoupled from the LOCKED Refraction path (`contact2` stays inside the refraction gate). Low ring risk by construction; the spike must measure the actual lit fraction. No second energy/topology/time authority. |

**Chosen minimum direction:** boundary response and halo consume ONLY the existing accepted
zero-capable localized scalar `capture` / `contact` = `boundaryBand * warm`
(HEAD `:181-182, :223`). Any boundary-normal factor is pure geometry modulation of that scalar
(SDF normal + distance), never a new energy source. No thresholds that re-label absolute `E`.

## Boundary Response And Halo

- Boundary response = the existing accepted interaction (`capture`/`contact`): inward-thick,
  contact-gated warm compression at the real rounded boundary. The spike adds no second boundary
  term; it adds only the outward halo projection of the same scalar. Boundary-lit fraction must
  stay localized and visibly broken at every phase (target well below 35%).
- Halo = only outward projection/leakage of that chosen interaction: sample the same
  `boundaryBand * warm` formula at the nearest boundary foot (analytic SDF projection), multiply
  by an analytic compact-support falloff that ends at 12 CSS px (`12/200 = 0.06` panel units;
  the final 2px of the real 14px gutter are exactly zero on straight sides; corner diagonals
  reach zero sooner), and render with the same `HEAT_STOP[7]` palette at subordinate alpha. No
  halo clock, phase, noise, topology, palette, or permanent floor.

## Spike Plan (repaired, minimal)

Boundary response + halo only. No Entry/Exit/traversal/timing/Refraction redesign. Lab-only gate
consumes `capture`/`contact`; actual component compile/link is the hard gate (standalone harness
auxiliary only). Debug views required for: accepted source signals (`warm`, `boundaryBand`,
`capture`/`contact`), chosen interaction, halo, and final composite. Evidence required:
four-side/four-corner outer alpha (final 2px exactly zero), shadow, interaction, resource,
Reduced Motion, and fallback (mode-off == HEAD) evidence; native alpha PNGs and compact
landscape sheets (max 4 columns/row), no tall blank full-page captures. Runtime source
(`expandedPresentationRuntime.ts`) unchanged.

## Acceptance And Falsification

Acceptance: one canvas/program/draw/runtime; boundary response derived only from
`capture`/`contact`; halo <=12px with exact zero in the outermost 2px on all sides/corners;
mode-off fallback pixel/resource equivalent; interior and Refraction locked; Reduced Motion zero
continuing frames; normal interaction; singular CSS shadow; actual compile/link.

Immediate stop, with no parameter-repair loop, on: near-complete perimeter at any phase;
interaction detached from the existing contact/frontier scalar; independent halo or nonzero
outer edge; Refraction/interior drift; extra authority/resources; or compile/layer regression.

## Risks

1. A thresholded or absolute-intensity relabeling of `capture`/`contact` can regress into the
   closed `E * boundaryBand` perimeter (0.979). Guard: response consumes only the accepted
   scalar and geometry; any new threshold is a falsification.
2. Sampling the interaction at the boundary foot could broaden the lit arc if the foot sampling
   ignores `boundaryBand` compactness. Guard: foot sample reuses the same formula; lit-fraction
   gate stays below 35%.
3. Halo could drift toward an independent layer (own clock/topology). Guard: halo = same scalar
   × analytic falloff only; outer-2px exact-zero gate.
4. The halo path could feed back into Refraction/interior. Guard: mode-off pixel diff, identity
   lock, and Refraction off/on evidence.
5. 228 outer-domain layering could regress hit testing or duplicate the CSS shadow. Guard:
   FX-off/on shell/shadow pair + interaction evidence, one shadow owner.
6. Standalone harness success can mask a real component GLSL compile failure. Guard: actual
   component compile/link is mandatory.

## GPT Architecture Lead Decisions Requested

None for the traversal proposal (withdrawn and parked). This repair only asks for Planning
approval of the narrowed plan: one localized boundary-interaction response + subordinate <=12px
halo consuming the existing `capture`/`contact` scalar, with mode-off as the accepted fallback,
and macOS `NOT VERIFIED` accepted at the Lab gate when no host exists.

## Statement

No implementation, tuning, commit, archive, or Architecture PASS occurred in this planning
repair. All dirty/rejected evidence is preserved; the only files written are the four planning
artifacts of this task (`prd.md`, `design.md`, `implement.md`, `research/planning-report.md`) and
their context manifests.
