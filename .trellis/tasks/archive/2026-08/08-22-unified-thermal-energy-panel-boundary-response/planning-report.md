# Planning Report — Unified Thermal Energy → Panel Boundary Response

Task: `08-22-unified-thermal-energy-panel-boundary-response`
Worktree: `D:\Ameow\.cindy-worktrees\mr9-fullscreen-activation-fx`
Status: **PLANNING ONLY — no implementation.** For GPT Architecture Lead Planning Review.

> Lead review note: the repository audit correctly identifies `baseTemperature` as the sole
> accepted 2D temperature topology, but raw `baseTemperature` is not by itself the complete
> visible-energy scalar: it has a deliberate floor of 0.24, while coverage/lifecycle remain
> separate accepted gates. The authoritative unified contract and corrected halo bound are in
> `lead-review.md`. Where this worker report says raw `E * boundaryBand` can never form a ring,
> or that current Refraction intensity already consumes `E`, defer to that Lead correction.

## 1. Verdict

**CONTINUE, bounded, to one minimal Browser Lab falsification spike.**

Repository evidence supports a small, architecture-preserving unification: the accepted
checkpoint already contains every required signal — the 2D multi-temperature field
(`baseTemperature`), the analytic rounded-boundary SDF, the boundary-local band, the
contact-gated capture, and the accepted Refraction identity. The unified model is a
composition of these accepted signals in the existing single draw. The only genuinely new
term is a subordinate exterior halo with an analytic 14px falloff. Primary uncertainty is
visual (edge stays localized, halo stays subordinate) — exactly what the spike tests.
Abandon only if a falsification gate fires (perimeter ring, clipped/high-energy halo at the
228 edge, second silhouette, duplicated energy authority, layer/interaction regression).

## 2. Exact unified-energy candidate

**Topology authority: `T := baseTemperature`** — the accepted 2D multi-temperature scalar
(`ExpandedPresentationSurface.tsx:274–286`), hoisted to be computed **once** per pixel
(pixel-identical hoist: it depends only on `q` and `bendTime`, not on the refraction
displacement). The complete accepted field sample also retains coverage/lifecycle as gates:

```text
T = baseTemperature(q, bendTime)              // sole 2D topology/temperature authority
A = covered2 * energy                         // accepted support × lifecycle activation
H = thermalResponse(T)                        // monotonic, zero-capable response derived only from T
E = A * H                                     // shared response energy; no independent topology
palette  = HEAT_STOP[7] + yellowZone + grain   // accepted material language (single)
```

`thermalResponse(T)` must be a bounded monotonic projection using the accepted palette/material
range, with a true zero for the cool floor. This is necessary because `T` is deliberately
re-centered to `[0.24, 1]`; using raw `T * boundaryBand` would energize the whole active boundary
and can recreate the rejected continuous perimeter. The Browser Lab spike must compare a small
set of derived response projections and stop if none preserves the accepted interior while
producing spatially broken/localized boundary energy. The projection is not a second field: it
contains no new coordinates, time, phase, noise, mask, palette, or morphology and is computed
only from `T`.

Consumers (bounded relationship from design.md):

1. **Interior material** — accepted: `material2 = clamp(mix(0.08,0.93,E) + warm2*0.18 +
   contact2*0.22, 0, 1) * covered2` → `rgb2/alpha2` (ramp, yellowZone, inwardCool2, alpha2),
   blended by `materialMix = covered2 * energy`. Unchanged from the accepted Refraction
   material; it becomes the unified interior authority.
2. **Refraction / Heat Haze** — identity LOCKED: direction `grad = ∇bend` (finite difference
   of `heatmapBend`), envelope `env = clamp(contact + warm*0.60 + bodyFloor*0.30, 0,1) * energy`,
   strength `0.16`, first-order analytic resample. Today the displaced material consumes `T`,
   but displacement amplitude does **not** yet consume `T`; it consumes `env`. Unified Lab mode
   therefore tests `envUnified = env * refractionResponse(H)` while keeping direction, base
   strength, and resample math locked. `refractionResponse` must be a bounded modulation derived
   only from `H`, with no new spatial authority. Any visible identity drift is falsification.
3. **Boundary-local edge response** — `edgeEnergy = E * boundaryBand`, where
   `boundaryBand = smoothstep(-0.05, 0.0, bd) * step(bd, 0.0)` is the accepted inward-thick
   local kernel (real rounded boundary via `roundedBoundary`). The zero-capable H-gating is what
   makes the response localized; raw `T` is insufficient because of its 0.24 floor. The accepted
   contact/inward-cool treatment
   (`contact2 = boundaryBand * warm2`, `inwardCool2 = contact2 * smoothstep(-0.16,-0.05,bd)`)
   stays as the bounded edge bias inside `material2`.
4. **Exterior halo (new, subordinate)** — boundary-carried `E` times a finite falloff with a
   support radius no larger than **12 CSS px**, preserving an explicit 2px zero guard band:
   `halo = E_projected * haloFalloff(bd) * (covered2 * energy)`, for `bd > 0`, where
   `E_projected = E evaluated at the panel-clamped UV` (carries the boundary's energy
   outward) and `haloFalloff = 1.0 - smoothstep(0.0, 1.0, clamp(bd / gutter, 0.0, 1.0))` with
   `gutter = haloSupport/228`, `haloSupport <= 12`. Output = the **same** `HEAT_STOP` ramp at low energy with a continuous
   low-alpha projection (`alpha_halo = smoothstep(0.0, ε, halo)`), so it is subordinate and
   transparent, never a second palette or detached glow. By 12px the falloff is exactly zero,
   so the final 2px are mathematically inactive rather than merely expected to be visually small.
   Corners reach zero earlier along their diagonals. The last-2px measurement remains the
   falsification check.

Straight-edge vs corner: the response has compact support at or before 12px; the corner diagonal
is longer and reaches zero earlier. No inset geometry, repair mask, or second silhouette.

**Texture requirement: NONE.** All four terms are analytic in the one draw (E, SDF, band,
falloff). A retained texture would require a repository-grounded reason that does not exist
for this candidate and would reopen resource/lifecycle/license scope.

## 3. Source anchors for the unified edit surface (planning; not edited)

- Hoist: `baseTemperature` construction (lines 274–286) to a shared
  `thermalEnergy2D(vec2 q, float bendTime)` helper computed once; refraction branch reads the
  same value (byte-identical material2 — test the invariant).
- Edge/halo block appended after the Refraction block, gated by a new lab-only
  `uBoundaryMode` (default 0 ⇒ accepted path byte-identical, no texture, no allocation).
- Outer-domain SDF variant for the 228 Lab canvas: same formula with
  `uPanelOrigin=(14,14)/228, uPanelSize=200/228, uPanelRadius=16/228` (proven in the rejected
  Paper spike); in the 200 domain it reduces to the accepted `roundedBoundary`.
- `E`/`q` in panel units so the 200×200 interior sampling/topology is unchanged when the
  canvas is 228 (reprojection risk — see §8 R3).

## 4. Reusable infrastructure (from archived work) vs remove

**Reusable (re-apply, Lab-only):**
1. Outer-domain canvas/layer split: 228×228 canvas, panel shell at (14,14), transparent UI
   content clip above, FX canvas `pointerEvents:none` (`repository-geometry-rendering-domain-audit.md`
   §4; rejected-spike layer demo). Interaction-safe clip uses the **repaired**
   `pointerEvents:"auto"` model (descendants need no opt-in).
2. Exact coordinate mapping 228/200/14/16 (constants, SDF projection).
3. Non-interactive FX canvas + singular CSS shadow ownership.
4. Debug/readback harness patterns: WebglReadback (same-commit readPixels), PNG export
   (`backingScale=4` → 912×912 for 228), uniform readout, counters
   (`canvasCount`, `linked`, `boundTexture2D`, `framebufferBound`), phase-pinned captures,
   last-2px/four-side/four-corner probes (all in archived `capture-*.html`/`capture-*.mjs`
   harnesses — rebuild without the Paper shader).
5. Accepted boundary grammar: `roundedBoundary`, `boundaryBand`, `capture`, `contact`,
   `inwardCool` — already in the accepted shader, reused by the unified model.
6. Lazy renderer-owned texture lifecycle pattern — documented, **not used** by this candidate.

**Remove (must NOT return to product):**
1. Paper processed interior authority: `uPaperBoundary` texture, `rasterizeRoundedRectMask`,
   `boxBlurGray`, `multiPassBlurGray`, `buildPaperBoundary`.
2. Paper processed-silhouette morphology: `inner = 0.8+0.8*innerBlur`,
   `outerBlur = 1-mix(1,bigBlur,shape)`, broad/narrow/contour channel composition.
3. Paper subtractive blob/shadow morphology: `paperShadowBlob`, `shadow1/2/3`, `shadowUnion`,
   phase-offset `t+1/3/+2/3`.
4. Paper fixed phases: `uPaperPhase`, `paperPhase` prop/slider.
5. Paper palette/scalar composition: `PAPER_STOP`, contour weights, `paperOutput`.
6. Independent outer response: `0.30*bigBlur*(1-shape)*outerFalloff` as a standalone Paper
   term — replaced by the unified `E_projected * haloFalloff`.
7. Boundary-Driven source-influence machinery: `sourceInfluence`/`qExit`/trailing/
   convergence/containment (rejected `08-21-boundary-driven`).
8. Any `MODIFIED DERIVATIVE` header / active-derivative license claims.

## 5. License / provenance consequences

- Recommended candidate (analytic, from accepted signals) stays **clean-room** — same
  `THIRD_PARTY_NOTICES.md` ("no active Paper-derived source shipped"), MIT root unchanged, no
  new obligation. Paper remains reference-only for boundary/halo language.
- If a later edit copies/adapts Paper GLSL (e.g., Paper's `0.9*pow(outerBlur,0.8)` outer or
  `mix(1, G, shape)` inner/outer transition), the **active Apache-2.0 derivative** obligations
  apply: source `MODIFIED DERIVATIVE` header, `THIRD_PARTY_NOTICES` active-derivative section
  (Apache-2.0 text + Paper NOTICE already present), and the license test flips. The plan
  recommends constructing the halo from accepted E + an analytic falloff to avoid this.

## 6. Minimal Browser Lab falsification spike

**Exact files likely affected (NOT edited in this phase):**
- `src/presentation/main-window/ExpandedPresentationSurface.tsx` — lab-gated `uBoundaryMode`
  (unified mode): hoist `E`, edge/halo consumers, outer-domain SDF variant. Production path
  byte-identical.
- `src/presentation/main-window/expandedPresentationSurface.test.ts` — source-contract tests:
  `E` computed once and shared; edge/halo consume `E` (no new scalar authority); no
  `PAPER_STOP`, no sampler/texture/framebuffer, one canvas/draw; clean-room license; no
  perimeter/phase/Paper grammar.
- `src/lab/scenarios.ts` — presets: `thermal-unified-moving`, `thermal-unified-reduced`,
  `thermal-unified-refraction`, `thermal-unified-refraction-reduced` (new `unified`/`boundary`
  flag, derived Heatmap category).
- `src/lab/LabOverlayStage.tsx` — outer-domain 228 composition (canvas 228, shell at (14,14),
  transparent clip, shadow backdrop, interaction preserved) re-derived from archived evidence.
- `src/lab/PresentationLab.tsx` — readout for `uBoundaryMode`/outer-domain uniforms; debug
  view toggle.
- `src/lab/locales/en.json`, `zh-CN.json`; `scenarios.test.ts`, `rendererReuse.test.ts`.
- Not touched: `expandedPresentationRuntime.ts` (heatmap scheduling already bounded; RM zero
  frames), production files, geometry/metrics, native bounds.

**Debug views / evidence matrix (independent views of each consumer):**
1. `E` field (baseTemperature) — proves 2D topology + single authority.
2. Accepted interior material composite (`material2`/`rgb2`).
3. Refraction on/off paired frames (displacement + env; pinned uTime).
4. `bd` / `boundaryBand` debug view (real rounded boundary, corner arcs).
5. Edge response (`E * boundaryBand`) debug view.
6. Halo contribution (`E_projected * haloFalloff`) debug view.
7. Final 228×228 composite with shell + UI clip + shadow (FX on/off).
8. Paper/off fallback + resource counters (`canvasCount`, `drawArrays`, `boundTexture2D`,
   `framebufferBound`, `createTexture` count).
9. Reduced Motion static equivalence (`diffBytes=0`).
10. Four-side/four-corner + last-2px alpha measurements (228 outer edge).
11. Interaction/shadow/hit-test (pill no-opt-in, clip `pointerEvents:auto`, shell shadow
    singular, FX canvas none, gutter hit = frame).

**Fixed observation states:** reuse the accepted pinned phases k ≈ 0.10 / 0.25 / 0.35 / 0.50
+ RM 0.42 (accepted capture phases), pinned via uTime polling. No scheduler/lifecycle/entry-exit.

**Windows evidence:** full transparent-window compositing + checkerboard alpha harness (as
archived). **macOS: NOT VERIFIED** unless a macOS host is available; must not be reported as
pass without one.

## 7. Objective acceptance gates and immediate-stop falsification gates

**Acceptance (all required):**
- AG1 E is the sole energy authority (source-asserted: one `baseTemperature`/`thermalEnergy2D`
  consumed by interior, Refraction material, edge, halo).
- AG2 Unified-off pixel + resource equivalence with the accepted checkpoint (fallback).
- AG3 Boundary response localized: boundary-lit fraction well below ~35% per frame and edge
  varies with the 2D field (not a ring); 4-side probes show gaps.
- AG4 Halo subordinate: last-2px alpha 0 on all four sides and all four corners; bd=gutter
  point ≈ 0; halo reads as faint/transparent low-energy, no bright rim.
- AG5 One palette (`HEAT_STOP` only; no `PAPER_STOP`, no boundary-only color ramp).
- AG6 One canvas / one program / one draw; no sampler, texture, framebuffer, second pass.
- AG7 Reduced Motion: `diffBytes = 0` across 500 ms; zero continuing frames.
- AG8 Interaction: UI pill hit-test with no opt-in; clip auto/transparent/no-shadow; FX
  canvas none; singular CSS shadow; gutter hit = frame.
- AG9 Windows transparency verified; macOS NOT VERIFIED stated (not passed).

**Immediate-stop falsification (stop, report REJECT; do not repair):**
- FG1 Continuous perimeter/ring (boundary-lit ≈100% or visually a full outline/second
  silhouette).
- FG2 Duplicate energy authority (contact/contour/lifecycle/alpha term becomes an independent
  energy source; edge or halo uses a different scalar than interior).
- FG3 Halo clipped or high-energy at the 228 edge (last-2px alpha > 0 or bright) — falsification,
  not a repair opportunity.
- FG4 Detached/inset glow, second geometry, independent halo animation, or a second palette.
- FG5 Texture/preprocessing reintroduced without a repository-grounded reason.
- FG6 Refraction visually drifts (displaced material decorrelates from the E-driven material)
  or Refraction direction/strength changed.
- FG7 Outer-domain layering regresses CSS shadow, UI clip, hit testing, or drag.
- FG8 Reduced Motion or fallback allocates/schedules new work.

## 8. Major risks

- R1 (primary) Edge response reads as a continuous perimeter outline.
- R2 Halo reads detached, uniformly animated, or color-authoritative.
- R3 Reprojecting the 200×200 field into the 228 canvas changes accepted interior
  sampling/topology — mitigate by computing E/q in panel units (identical interior samples);
  verify with an interior pixel-equivalence view.
- R4 Refraction consumes a different scalar than material/halo and drifts — enforce shared E.
- R5 Corners concentrate energy or expose hard falloff seams — corner bd > 14 already decays;
  verify the 45° diagonal with four-corner probes.
- R6 Outer-domain layering regresses shadow/clip/hit/drag — re-apply the repaired layer model
  and verify interaction gates.
- R7 License scope creep if a Paper expression is copied instead of analytic construction.
- R8 RM/fallback begins allocating/scheduling — keep static/zero-allocation.

## 9. Unresolved questions (for Architecture Lead)

1. Interior authority confirmation: unified mode makes the interior the accepted
   **2D multi-temperature material** (`material2`/`rgb2` from E), with the travelling-front
   baseline (`body/warm/core`) remaining the non-unified fallback. Confirm this is the
   intended "accepted interior material."
2. Boundary edge gating: prefer pure `E * boundaryBand` (energy-gated by the 2D field) or the
   accepted `contact2 = boundaryBand * warm2` (frontier-gated)? Plan proposes E-gating with
   the accepted `warm2*0.18 + contact2*0.22` bounded biases retained inside material2.
3. Halo energy carry: `E_projected` (boundary-clamped panel UV, constant along the normal,
   only falloff decays) vs `E(uv)` at the gutter pixel (gutter-local field values). Plan
   proposes `E_projected` (cleaner "boundary-carried" semantics; the spike's debug view 6
   will show the difference).
4. Outer-domain Lab composition is a Lab-only re-derivation of the proven 228 layer; confirm
   production DOM change stays out of scope until after spike approval.
5. macOS evidence: no host available — confirm NOT VERIFIED is acceptable for this planning
   gate.

## 10. Boundary compliance

Planning/research only: no production/test edits, no shader/Lab/layer implementation, no
visual capture round, no entry/exit/timing/Refraction redesign/production integration/native
resize, no commit/archive/task-completion. Rejected experiments and prior dirty work preserved.
