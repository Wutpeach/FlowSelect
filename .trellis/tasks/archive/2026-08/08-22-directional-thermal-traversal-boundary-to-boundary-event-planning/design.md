# Design — Localized Boundary Interaction + Subordinate <=12px Halo

## Baseline And Authority

- Git HEAD (`4db7722`, `motion/mr9-fullscreen-activation-fx`) is the accepted
  Thermal + Refraction checkpoint. The dirty Unified Boundary diff in this worktree is
  **rejected, frozen evidence only** — never a baseline, never reusable source.
- Product/Download/Presentation policy continues to decide eligibility and supply an activation
  target. It does not author shader choreography, and this phase adds no choreography.
- `expandedPresentationRuntime` remains the only frame/time authority. The shader consumes the
  existing normalized activation age and existing field scalars.
- One `ExpandedPresentationSurface`, canvas, linked WebGL program, draw, and runtime authority.
- Reduced Motion renders one deterministic developed state and schedules no continuing frames.
- Geometry stays 228 outer / 200 panel / r16 / origin (14,14) / 14px gutter
  (`windowMetrics.ts:1-22`, `geometry.ts:68-76,102-104`).
- Clean-room. No Paper source, morphology, palette, or derivative expression.

## Decision Record

**CLOSED (this phase):**

- New `tau` / traversal event contract, entry/exit rounded-ray projection, antipodal exit,
  `arrival` / `localAge`, event carrier `C(q,tau)`, Entry/Exit/timing choreography, and
  production activation replacement. Parked as a future redesign candidate (see Deferred).
- Absolute shared response energy `E = A * H` multiplied by `boundaryBand` (rejected Unified
  candidate). Falsified: S4 boundary-lit fraction 0.979; `H(baseTemperature)` is
  non-zero-capable across a broadly warm panel, so `E * boundaryBand` produced a near-complete
  perimeter. Do not rescue through threshold or weight tuning.
- Paper processed morphology, palette, object geometry, derivative implementation, and any
  traversal-grammar reassessment.

**LOCK (this phase):**

- Accepted 2D Multi-Temperature interior material (`baseTemperature`, `HEAT_STOP[7]`,
  `material2`/`rgb2`/`alpha2` projection, `covered2`/`energy` blending).
- Accepted Refraction direction/identity/gating (`∇bend`, `REFRACTION_EPS=0.02`,
  `REFRACTION_STRENGTH=0.16`, `env` envelope, first-order resample).
- Current production activation grammar.
- 228/200/14 geometry and rounded SDF.
- One surface/canvas/program/draw/runtime.
- Mode-off = accepted HEAD fallback (pixel/resource equivalent).

## Source Finding (HEAD anchors)

All anchors in `src/presentation/main-window/ExpandedPresentationSurface.tsx` at HEAD:

- Rounded SDF `roundedBoundary` (lines 150-155); `boundaryBand = smoothstep(-0.05,0,bd)*step(bd,0)`
  (line 181); `capture = boundaryBand * warm * 0.6` (line 182); `contact = boundaryBand * warm`
  (line 223); `warm = exp(-abs(d + 0.018) * 30.0)` (lines 178-179); frontier
  `d = p - front + bend`, `energy` lifecycle gate (lines 158-183).
- 2D temperature topology `baseTemperature` (lines 274-286) and material projection (lines
  286-311); `HEAT_STOP[7]` (lines 198-207).
- Refraction gate (lines 242-309): `∇bend` direction, `env` envelope, first-order resample,
  displaced `warm2`/`covered2`/`contact2` (`contact2 = boundaryBand * warm2`).
- Renderer/runtime lifecycle (lines 39-56, 586-624, 633-645); normalized activation age in the
  draw path (lines 603-624); production activation grammar (lines 340-402).

## Signal Inventory — Can Existing Signals Support Boundary Interaction Without New Authority?

| Category | Signal(s) at HEAD | Localization when panel broadly warm | Semantic meaning | Extra evaluations | Refraction coupling risk | Ring risk | Second energy/topology/time authority? |
|---|---|---|---|---|---|---|---|
| (a) Absolute local energy/intensity | `E = A * H` × `boundaryBand` (rejected dirty diff; `H = smoothstep(0.38,0.62,baseTemperature)`) | **CLOSED.** `H` saturates toward 1 across a broad warm field; no spatial decay -> 0.979 perimeter at S4 | "how hot the whole panel is" — bulk, not an arrival/contact event | n/a (rejected) | high (was coupled through env) | **critical** (the observed failure) | Yes — introduced a second response energy (`H(T)`) and perimeter authority |
| (b) Local spatial variation / gradient of existing Thermal/shared energy | `∇baseTemperature`, `∇(covered2*energy)` (would be new finite differences) | Poor — gradient of a broad smooth field is everywhere nonzero, no compact support; needs a threshold to force zero | "where temperature changes most" — interior variation, wrong semantics for a boundary-contact event | High (+6 `heatmapBend` evals for 3 frames, per pixel and per debug view) | High — `∇bend` is the LOCKED Refraction direction; reusing gradient magnitude couples boundary authority to Refraction identity | High — nonzero along the whole boundary in a warm field; thresholded = re-labeled perimeter | Yes — a new gradient-derived energy source (re-introduces (a) under another name) |
| (c) Boundary-normal interaction / normal derivative / flux from field + rounded SDF | `∇bd` (SDF normal) exists as accepted geometry; `∂T/∂n = ∇T·n` would be new | Normal **derivative**: same as (b) — non-zero-capable without threshold. SDF normal itself is pure geometry (fine) | "flux through the boundary" — but the derivative term again measures interior variation, not a contact event | Normal derivative: high (same finite differences). SDF normal: zero (already derivable from `bd`) | Medium — derivative couples to the field; geometry normal couples to nothing | High for the derivative term; zero for pure geometry normal | Derivative term: yes. Pure geometry modulation: no |
| (d) **Existing zero-capable arrival/change/contact/frontier signals** | `warm` (frontier strip), `capture = boundaryBand*warm*0.6`, `contact = boundaryBand*warm`, `contact2 = boundaryBand*warm2` (refraction-displaced) | **Strong.** `warm` is a narrow frontier strip regardless of bulk `body`/`heat`; `boundaryBand` is compact; product is localized at the front∩boundary segment even when the panel interior is broadly warm | Exactly "thermal frontier arrives at / contacts the real rounded boundary" — the accepted Rounded Boundary Edge Capture / edge-contact semantics | **Zero** — `boundaryBand`, `warm`, `capture`, `contact` are already computed in the accepted baseline path (lines 178-182, 223) | **None for baseline `capture`/`contact`** (derived from baseline `warm`, not displaced `warm2`); `contact2` stays inside the refraction gate untouched | **Low by construction** — both factors are compact/narrow; the future spike must measure the actual lit fraction | **No** — they are existing accepted scalars; the halo is a geometry projection of them, not a new energy/topology/time |

## Chosen Direction (ONE minimum)

**Boundary response and halo consume ONLY the existing accepted zero-capable localized
contact/frontier scalar `capture` / `contact` = `boundaryBand * warm` (HEAD lines 181-182, 223).**

- No new energy source: no `E`, no `H`, no `baseTemperature` response, no gradient, no normal
  derivative, no absolute-intensity threshold.
- If a boundary-normal factor is used (halo projection), it is **pure geometry modulation** of
  that existing scalar: the analytic rounded-SDF outward normal and distance, nothing more. It
  never becomes a new energy source.
- No thresholds that merely re-label absolute energy.

Rationale: repository evidence shows this scalar is sufficient. It is already the accepted
localized boundary interaction (`capture` feeds `heat`; `contact` feeds the accepted edge
cool-halo), already zero-capable (compact `boundaryBand`, narrow frontier `warm`), already
evaluated at zero extra cost, localized even when the panel is broadly warm, decoupled from the
LOCKED Refraction identity, and free of a second authority.

## Boundary Response

- The boundary response is the existing accepted interaction: `capture`/`contact` renders as an
  inward-thick, contact-gated warm compression at the real rounded boundary (already accepted at
  HEAD, lines 182, 223). The repaired spike does not add a second boundary term; it adds only
  the outward halo projection of the same scalar.
- The Lab-only gate must not re-light any boundary pixel from any signal other than
  `capture`/`contact`. Boundary-lit fraction must stay localized and visibly broken at every
  phase (target well below 35%; any near-complete side/perimeter is a falsification).

## Halo

- The halo is **only outward projection/leakage of the chosen localized interaction**
  (`capture`/`contact`), sampled at the nearest point on the real rounded boundary and carried
  outward along the analytic SDF normal.
- Same Thermal material language: `HEAT_STOP[7]` ramp with subordinate, low alpha. No halo
  clock, phase, noise, topology, palette, or permanent floor.
- Analytic compact support ends at **12 CSS px** from the real boundary (`12/200 = 0.06` panel
  units in the 228 outer domain). The final 2px of the real 14px gutter
  (`bd >= 12/200`) are **exactly zero** on straight sides; corner diagonals reach zero sooner.
- Design-level shape (consistent with the retained useful harness evidence; the rejected diff
  remains evidence only):

```text
bd      = roundedBoundary(panelUv)                 // accepted SDF
outward = roundedBoundaryNormal(panelUv)           // analytic SDF geometry helper
foot    = panelUv - bd * outward                   // nearest boundary point (geometry)
interactionB = warm evaluated at foot              // contact at bd=0; no new energy
haloFalloff  = 1 - smoothstep(0, 1, clamp(bd / 0.06, 0, 1))   // <=12px, exact 0 in final 2px
halo         = interactionB * haloFalloff          // projection + falloff, no new energy
```

## Locks For The Future Spike

- Accepted interior (`material2`/`rgb2`/`alpha2`, `baseTemperature`, `covered2`/`energy`) stays
  byte-equivalent when the boundary/halo Lab mode is off, and unchanged in intent when on.
- Accepted Refraction direction/identity/gating stays locked; the boundary/halo path must not
  feed into or alter `env`, `∇bend`, the resample, or `material2`.
- Mode off (boundary/halo flag false) remains the accepted HEAD fallback, pixel- and
  resource-equivalent.

## Reuse / Remove Summary

Reuse: activation origin/age, runtime, one renderer/draw, rounded geometry, `boundaryBand`,
`warm`, `capture`, `contact`, `HEAT_STOP`, the 228 Lab outer-domain layer pattern, context
lifecycle, Lab PNG/readback patterns.

Refactor: none of the accepted interior/Refraction path. The repaired candidate adds only a
Lab-gated outward halo projection of the existing `capture`/`contact` scalar.

Remove from the candidate: the rejected `uBoundaryMode` T/A/H/E block, `E = A * H`, `edgeEnergy
= E * boundaryBand`, `H`/`baseTemperature` response, panel-mapping uniforms if they were only
for that block (halo needs the 228 layer panel mapping to measure the real boundary — reuse the
proven Lab-only panel-origin/size uniforms), every traversal element, every Paper mechanism.

## Deferred / Future (PARKED)

Directional Thermal Traversal / Entry -> Propagation -> Exit (new `tau`/traversal contract,
entry/exit projection, antipodal exit, `arrival`/`localAge`, carrier `C`, Entry/Exit/timing
choreography, production activation replacement, Paper traversal reassessment) is **parked as a
future redesign candidate** and is out of scope for every part of this design. It requires new
authority and a new contract; it returns only through a new, explicitly authorized task.

## Architecture Decisions Requested

**None.** This repair requests no new architecture decisions; it narrows the plan to the locked
accepted architecture and the chosen existing scalar. The traversal decisions previously listed
are withdrawn and parked.
