# Repository Energy / Boundary Audit — Unified Thermal Energy → Panel Boundary Response

Task: `08-22-unified-thermal-energy-panel-boundary-response`
Worktree: `D:\Ameow\.cindy-worktrees\mr9-fullscreen-activation-fx` (HEAD `4db7722`, branch
`motion/mr9-fullscreen-activation-fx`)
Scope: repository evidence only. No production/test edits, no implementation, no captures.

## 0. Baseline verification (PRD precondition)

- Worktree is at the **accepted Thermal + Refraction checkpoint**: `ExpandedPresentationSurface.tsx`
  contains the analytic Heatmap field + Refraction gate and **no** Paper residue
  (`uPaperPhase`, `uPaperBoundary`, `paperOutput`, `paperShadowBlob`, `data-lab-panel-clip`,
  `MODIFIED DERIVATIVE` all absent from `src/` — only a test asserts their absence).
- `expandedPresentationRuntime.ts` has no Paper phase; heatmap scheduling is bounded and
  Reduced Motion schedules zero frames.
- `THIRD_PARTY_NOTICES.md` states **"no active Paper-derived source shipped"** (clean-room);
  the accepted test suite locks that license state and the one-canvas / one-draw / no-texture
  contract.
- Lab baseline: `LAB_PREVIEW_SIZE = 200` (`scenarios.ts:20`); 4 heatmap presets
  (`heatmap-moving`, `heatmap-reduced`, `heatmap-refraction-moving`, `heatmap-refraction-reduced`);
  `LabOverlayStage` mounts the one production surface at 200px with WebglReadback;
  `rendererReuse.test.ts` locks Lab→production reuse and forbids Lab renderer/shader reimplementation.

## 1. Accepted 2D multi-temperature field (the energy authority candidate)

All anchors in `src/presentation/main-window/ExpandedPresentationSurface.tsx`.

Construction (inside the `uRefractionMode != 0` gate, lines 274–286):

```glsl
vec2 pa = vec2(0.8 * q.x - 0.6 * q.y, 0.6 * q.x + 0.8 * q.y) * 2.2 + vec2(0.30, -0.20);
vec2 pb = vec2(q.x + 0.45 * q.y, q.y - 0.35 * q.x) * 2.8 + vec2(-0.25, 0.35);
vec2 pc = vec2(q.x * 1.7, q.y * 0.9) * 1.6 + vec2(0.10, 0.40);
float baseA = heatmapBend(pa, bendTime) * 16.0;
float baseB = heatmapBend(pb, bendTime) * 16.0;
float baseC = heatmapBend(pc, bendTime) * 16.0;
float baseT = clamp(baseA * 0.45 + baseB * 0.35 + baseC * 0.20, -1.0, 1.0);
float baseTemperature = clamp(0.5 + 0.5 * baseT + 0.24, 0.0, 1.0);
```

- Three genuinely distinct coordinate frames (rotation / shear / anisotropic scale at
  ~1.6–2.8×) sampling the existing low-frequency `heatmapBend(q, bendTime)` (lines 139–143).
- `q = uv - 0.5` (panel-centered), `bendTime = reducedMotion ? 0.0 : t` (line 165).
- **`baseTemperature` is displacement-independent** (depends only on `q` and `bendTime`, not on
  the refraction-resampled `d2`), so it can be hoisted/computed once without changing any
  accepted pixel.
- Accepted material projection (lines 286–311): `material2 = clamp(mix(0.08,0.93,baseTemperature)
  + warm2*0.18 + contact2*0.22, 0,1) * covered2`; `rgb2` via `HEAT_STOP[7]` ramp + `yellowZone2`
  green-pull + `inwardCool2` contact halo + `alpha2 = mix(0.55,1.0,smoothstep(0,0.5,material2))`;
  `materialMix = covered2 * energy` blends over the baseline `rgb/alpha`; grain added last.

**Candidate topology authority: `T := baseTemperature`** — the accepted 2D multi-temperature
scalar. It is stable before palette projection, spatially meaningful (2D lobes), consumed by the
accepted Refraction material, reconstructible at any UV in the single draw (analytic), and
test-asserted as the accepted "broad 2D heatmapBend temperature topology." Lead review correction:
because its deliberate range has a 0.24 floor, it cannot by itself be treated as zero-capable
response energy at the boundary. The planning contract therefore retains accepted activation
`A = covered2 * energy` and derives a zero-capable monotonic `H(T)`, with shared response
`E = A * H(T)`. This introduces no second topology.

## 2. Accepted palette / material projection (interior)

- `HEAT_STOP[7]` (lines 198–207): dark navy → deep blue → vivid blue → light blue/cyan →
  golden yellow → orange → red-orange. Ramp loop lines 209–213; `yellowZone` green-pull lines
  215–217; grain `(heatmapGrainHash(uv*311.0+17.0)-0.5)*0.02` (line 294). `alpha = mix(0.55, 1.0,
  smoothstep(0.0, 0.5, material))` (line 229, baseline) / `alpha2` (line 303, 2D material).
- THERMAL_PALETTE (production uniforms `uThermalVoid/Deep/Ember/Flare/Gold/Core`) is the
  activation-path palette (`main()`), untouched by the heatmap spike.

## 3. Accepted Refraction / Heat Haze identity

Anchors lines 242–309:

- Direction: finite difference of the existing **low-frequency** `heatmapBend`
  (`REFRACTION_EPS = 0.02`, `grad = (bend(q+ε)−bend(q−ε)) * 0.5/ε`, lines 245–249).
- Envelope: `covered = 1 - smoothstep(0,0.05,d)`; `bodyFloor = covered * (1 -
  smoothstep(0.20,0.85,warm))`; `env = clamp(contact + warm*0.60 + bodyFloor*0.30, 0, 1) * energy`
  (lines 257–259). Hierarchy: boundary contact strongest > warm frontier > covered body >
  energy zero → exactly zero.
- Strength `REFRACTION_STRENGTH = 0.16`; `s = STRENGTH * env`; first-order analytic resample
  `dShift = s*(dot(grad,DIR)+dot(grad,grad))`, `alongShift = s*dot(grad,vec2(-DIR.y,DIR.x))`
  (lines 262–265); displaced `warm2/covered2/contact2` feed the displaced material.
- **Identity is LOCKED** (direction = ∇bend, base envelope, strength, resample). Do not replace
  direction with ∇E. Current displacement amplitude does not consume `baseTemperature`; unified
  Lab mode must explicitly test a bounded H-derived modulation of the existing envelope, and any
  identity drift is falsification.

## 4. Real rounded boundary signals (accepted)

- `roundedBoundary(uv)` (lines 150–155): analytic rounded-rect SDF, `<=0` inside, `0` on the
  boundary, `uCornerRadius = 16/200 = 0.08` (renderer-local projection of `MAIN_WINDOW_FULL_PANEL_RADIUS /
  MAIN_WINDOW_PANEL_SIZE`; constant at line 15–19, uniform at 65, set at 553).
- `boundaryBand = smoothstep(-0.05, 0.0, bd) * step(bd, 0.0)` (line 181) — inward-thick local
  kernel, zero outside; `capture = boundaryBand * warm * 0.6` (182) — contact-gated localized
  capture; `contact = boundaryBand * warm` (223) — the edge/cool-halo gate.
- Accepted boundary behavior: lit fraction 0% pre-contact and 8–12% post-contact (archived
  `mr9-rounded-boundary-edge-capture-spike.md` §3, `mr9-edge-repair.md` §6) — always localized,
  never a perimeter ring.

## 5. Geometry / layer / runtime authority (confirmed)

- 228 = 200 + 14×2 on Windows and macOS (`windowMetrics.ts:1–22`; `geometry.ts:68–76,102–104`);
  panel 200×200/r16 at (14,14); gutter 14px/side. Full audit: archived
  `repository-geometry-rendering-domain-audit.md` §§1–4.
- Production canvas is 200×200 inside the clipped panel shell (`MainWindowPresentationSurface.tsx:1095–1121`),
  shell `overflow:hidden` = effective clip; canvas `pointerEvents:none`, `aria-hidden`,
  `inset:0`. Shadow backdrop = separate transparent shell with singular CSS `panelShadow`
  (`getShadowBackdropStyle`; `ThemeContext` DARK_PANEL_SHADOW).
- The **228 outer domain reaches WebGL only through the proven Lab-only outer-domain layer**
  (canvas 228×228, panel shell at (14,14), transparent UI clip above, FX canvas non-interactive).
  Proven in the rejected Paper spike (`repository-geometry-rendering-domain-audit.md` §4;
  `lead-review.md` gate table; layer demo evidence). Production DOM change is out of scope here.
- Runtime: `expandedPresentationRuntime.ts` owns bounded rAF; heatmap frames only when
  `!reducedMotion && heatmap`; RM = static snapshot, zero continuing frames.
- Resource/lifecycle: one program, one draw, no sampler/texture/framebuffer (test-asserted:
  `not.toContain("sampler2D")`, `not.toMatch(/createTexture|createFramebuffer|framebufferTexture2D/)`).

## 6. Rejected candidates and why (no duplicate energy authority)

| Candidate | Verdict | Reason |
|---|---|---|
| `heat` / `material` (baseline `body/warm/core/capture`) | NOT the authority | Travelling-front 1D signal (`d = dot(q,DIR)-front+bend`), not a 2D multi-temperature topology; couples energy to contact position. Stays as the non-unified fallback (accepted, untouched). |
| `warm` / `warm2` | NOT the authority | Narrow frontier strip `exp(-abs(d+0.018)*30)` — a bias, not topology. Bounded bias only (`warm2*0.18`). |
| `energy` (k-phase envelope) | NOT the authority | Lifecycle/timing gate `smoothstep(0,0.12,k)*(1-smoothstep(0.66,0.99,k))`; stays a global gate, never the field. |
| `capture` / `contact` / `contact2` | NOT the authority | Boundary-contact terms (`boundaryBand*warm`) — exactly the "contact/contour terms that would duplicate authority." Bounded biases only (`contact2*0.22`). |
| `covered` / `covered2` | NOT the authority | Coverage masks answer "where Thermal exists," not temperature. Visibility gates only. |
| `baseA/B/C` alone | NOT the authority | Construction inputs of `baseTemperature`, not separate authorities. |
| `alpha` / `alpha2` | NOT the authority | Output opacity derived from material. |
| Paper `PAPER_STOP` / `uPaperPhase` / processed channels / subtractive blobs | REMOVED (rejected) | Archived evidence; must not return (see planning §5 remove list). |

**Authority separation to preserve:** topology/energy = `E`; coverage = `covered2`; lifecycle =
`energy`; palette = `HEAT_STOP`; visibility = `alpha`; displacement direction = `∇bend`;
Refraction intensity = `env`; boundary-local kernel = `boundaryBand`.

## 7. Texture necessity (repository-grounded)

**No texture is required.** The accepted field is fully analytic (E from `heatmapBend` frames,
boundary from the rounded-rect SDF, falloff from smoothstep). The renderer allocates no texture
today and the accepted tests lock that. Retaining the rejected processed-silhouette texture
(`rasterizeRoundedRectMask`, `boxBlurGray`, `multiPassBlurGray`, `uPaperBoundary`) has no
justification for this candidate and would re-open the resource/lifecycle/license scope the
archive closed. The lazy renderer-owned texture lifecycle pattern stays documented as reusable
infrastructure only if a later candidate ever needs it.

## 8. License state

- Accepted checkpoint: **clean-room** — "no active Paper-derived source shipped" (`THIRD_PARTY_NOTICES.md`;
  test-asserted). Root license MIT.
- If the unified candidate is built **only from accepted analytic signals** (E, `heatmapBend`,
  `roundedBoundary`, `HEAT_STOP`, analytic falloff) it stays clean-room: no new Apache-2.0
  obligation. High-level ideas ("scalar heat → ramp", "energy decays with distance") are not
  copyrightable expression.
- If any Paper GLSL expression is copied or near-verbatim adapted (e.g., Paper's
  `outer = 0.9*pow(outerBlur,0.8)*...` or `mix(1, G, shape)` inner/outer transition), the
  **active-derivative** obligations return: source `MODIFIED DERIVATIVE` header + `THIRD_PARTY_NOTICES`
  active-derivative section (Apache-2.0 text + Paper NOTICE already present) + the license
  test flips from "no active derivative" to "active derivative." Plan prefers avoiding this.

## 9. Evidence reuse inventory (no new captures)

- Accepted: `08-20-thermal-refraction-browser-lab-spike/research/thermal-refraction-implementation-report.md`
  (env/envelope/hierarchy, acceptance, 76 focused / 1770 full tests), `mr9-edge-repair.md`
  (accepted material/edge + terminal evidence), `mr9-rounded-boundary-edge-capture-spike.md`
  (boundaryBand/capture, lit-fraction evidence).
- Geometry/domain: `08-21-paper-heatmap-geometry-rendering-domain-audit/research/repository-geometry-rendering-domain-audit.md`
  (228/200/14/16, canvas/clip/shadow, outer-domain capability, falsification gates).
- Rejected (avoid-lists): same audit task `lead-review.md` + `visual-repair-lead-review.md` +
  `fixed-phase-lead-review.md` (interaction pointer-events REJECT, halo-at-228-edge REJECT,
  second-silhouette REJECT, subtractive-band morphology REJECT); `08-21-boundary-driven-...
  /research/boundary-driven-thermal-source-planning-report.md` (signal inventory, remove-list,
  risks).
