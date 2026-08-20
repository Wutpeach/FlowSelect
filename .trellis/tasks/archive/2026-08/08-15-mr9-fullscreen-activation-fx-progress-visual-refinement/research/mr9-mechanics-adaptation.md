# MR9 Mechanics Adaptation — Paper-Informed Field Composition Prototype

**Spike**: replace the rejected clean-room frame-mimic heatmap grammar with a
**source-informed adaptation of Paper Heatmap's real continuous field
composition**, using only fixed analytic fields and phase-offset moving
subtractive masks. No Paper geometry, no texture/pass/runtime expansion.

**Worktree**: `D:\Ameow\.cindy-worktrees\mr9-fullscreen-activation-fx`
**Lab**: dev-only Browser Lab `http://127.0.0.1:1421/lab.html` (existing Vite)
**Files touched this spike** (only two source files):
- `src/presentation/main-window/ExpandedPresentationSurface.tsx` (heatmap block)
- `src/presentation/main-window/expandedPresentationSurface.test.ts` (contract)
All other dirty files in the worktree are pre-existing and untouched. **No commit.**

---

## 1. Primary source authority

Real upstream shader from `@paper-design/shaders@0.0.80`:
`packages/shaders/src/shaders/heatmap.ts` (local copy `D:\paper-ref\heatmap-upstream.ts`,
same file as `D:\paper-ref\package\dist\shaders\heatmap.js`), plus prior MR9 Paper
research (`research/paper-shaders-heatmap-checkpoint-{b,c}.md`,
`research/paper-shaders-heatmap-visual-spike.md`).

Visual reference (learned, never explicitly drawn): the preserved seven-frame
contact sheet
`.trellis/tasks/08-15-mr9-fullscreen-activation-fx-progress-visual-refinement/research/mr9-paper-heatmap-reference-7frame.png`
(diamond form; heat starts at the top apex, grows into an inward thermal shell,
morphs a cool cavity, peaks as a perimeter shell + cool centre, then contracts
to the bottom apex). The Ameow field is adapted to the **rounded Main Window**,
never reproducing the diamond.

### Paper's actual causal structure (from `heatmap.ts` `main()`)

Paper's input is a **processed texture** `img` holding, per channel, contour /
outer blur (150px) / inner blur (18px) of a logo silhouette. The animation does
**not** come from animating the shape: it comes from **moving shadow
silhouettes subtracting from a warm field**, plus a separately moving outer band.

| Paper anchor | Mechanism |
|---|---|
| L209–214 `tCopy = t + 1./3.; tCopy2 = t + 2./3.; ... mod(.,1.)` | three phase-offset times |
| L235–237 `shadowShape(animationUV, t, ...)` ×3 | three phase-offset moving negative silhouettes |
| L239 `inner = .8 + .8 * innerBlur` | static/slow warm inner field |
| L240–242 `inner = mix(inner, 0., shadow)` ×3 | subtractive erasure of the warm field |
| L229–230 `outerBlur = 1. - mix(1., img[1], shape); innerBlur = mix(img[1], 0., shape)` | boundary-near inner/outer energy relation |
| L250–259 `outer = .9 * pow(outerBlur,.8)`; `animatedMask = sst(.3,.65,y)*(1.-sst(.65,1.,y))` | coordinated halo/outer modulation (moving band) |
| L265 `heat = clamp(inner + outer, 0., 1.)` | scalar heat to palette ramp |
| L285-ish grain `fract(sin(dot(...)))-0.5` | fine material grain |

Paper-specific geometry that is **excluded**: `shadowShape` (Apple logo +
ball collection, L90–164), `u_image` sampling / blur passes / texture
preprocessing (`toProcessedHeatmap`, `blurGray`, `multiPassBlurGray`), Apple
`shadowShape` diamond contour, `imgSoftFrame`, color-count meta.

---

## 2. Exact source → Ameow mapping (adaptation, no copied expressions)

Paper's causal composition is kept one-to-one, but **every term is replaced by an
Ameow-analytic field** (no Paper GLSL expression is copied verbatim; all
geometry/constants are Ameow's).

| Paper (anchor) | Ameow substitution | Notes |
|---|---|---|
| static warm inner field `inner = .8 + .8*innerBlur` (L239) | `substrate = 0.15 + 0.62 * ring * (0.72 + 0.28*swell)` where `ring = exp(-pow((depth-0.24)*5.,2))` and `swell` is a slow low-frequency `heatmapNoise` drift | `ring` = warm band at depth ≈0.24 hugging the rounded shell, cooling toward both boundary (no hot frame) and centre (Paper's shape-void analog, now a soft caldera). `swell` is the "slow" part; no travelling structure |
| 3 phase-offset negative silhouettes (L235–237, offsets L209–214) | `coolMask(uvf, fract(p), 0.0)`, `coolMask(uvf, fract(p+1./3.), 1.0)`, `coolMask(uvf, fract(p+2./3.), 2.0)` | 3 smooth anisotropic/warped scalar masks, each on its **own independent trajectory** (`cy = 0.5+0.42*cos(τ·2π+φ_i)`, `cx` lateral drift, rotation `a`, anisotropy `sx/sy`), large only near its own cycle ends so the union covers most of the window at onset/exit and stays small mid-cycle |
| subtractive erasure `inner = mix(inner,0.,shadow)` ×3 (L240–242) | `heat *= (1.0 - m0); heat *= (1.0 - m1); heat *= (1.0 - m2)` | cool regions shift/bulge/pinch/reshape purely through **mask intersection** — no centered cavity primitive |
| outer/halo band (L250–259) | `halo = band * animated * 0.55 * (0.35 + 0.65*ring)` with `band = smoothstep(-0.05,0.,bd)*step(bd,0.)` and `animated` a narrow arc at `bandPos = p` whose width grows mid-cycle | strictly **localized/partial** boundary energy: only where a narrow arc passes. Starts at the top edge (onset), sweeps down and widens (shell growth), settles at the bottom (exit). Never a contiguous full frame |
| contour (L231/L246 analog) | `contour = band * (1.0 - m0*m1*m2) * 0.22` | crisp edge emphasis only where the masks do not cover it (partial by construction) |
| scalar heat + ramp (L265) | `heat = clamp(heat + halo + contour, 0., 1.); heat *= energy` with `energy = smoothstep(0.,0.09,p)*(1.-smoothstep(.86,.97,p))` | shared weak→strong→weak envelope (Paper's scalar heat→opacity authority) |
| grain (L285) | `heat += (heatmapHash(uv*512.) - 0.5) * 0.014` | Ameow's own sine-free hash, kept subtle (pre-existing in Ameow) |
| palette (L266+ / meta) | 8-stop `HEAT_COLOR[8]` ramp (near-black navy → deep blue → vivid blue → light blue/cyan → yellow → orange → red-orange), no white core | Ameow's own ramp from the prior Checkpoint work; Paper's stop structure is generic and re-derived |

**Phase pinning** (unchanged policy): `p = reducedMotion ? 0.58 : fract(t*0.10)` —
one continuous ~10s material cycle; Reduced Motion is a single bounded static
snapshot at the coordinated peak (p=0.58), `time` frozen, so no travelling
frames under Reduced Motion.

---

## 3. What was implemented (final grammar)

Single lab-gated `heatmapOutput` inside the **one** fragment program:

1. `roundedBoundary(uv)` — unchanged analytic rounded-rect SDF from
   `MAIN_WINDOW_FULL_PANEL_RADIUS / MAIN_WINDOW_PANEL_SIZE` (= 16/200 = 0.08),
   renderer-local read-only projection; `uCornerRadius` uniform.
2. `coolMask(uv, tau, instance)` — the three phase-offset moving subtractive
   masks (anisotropic smooth negative fields).
3. Inner energy field (`ring`/`substrate`), three subtractive erasures, the
   partial halo arc, the partial contour, the shared energy envelope, the
   8-stop thermal ramp, and the alpha ramp.

**Removed** (rejected frame-mimic helpers): `nearestBoundaryPoint`,
`boundaryArc`, `flow`/`windowed`/`halfW` shell widening, `capFill`/`shellDepth`,
`fullCoverage`, centered `cavity`/`cavR` primitive, `interiorFade`. The
pre-existing production activation grammar (Chase/dual-front/opposite-closure)
is untouched elsewhere in the shader.

---

## 4. Ordered captures

Folder `research/mr9-mechanics-adaptation/` (new; `research/mr9-grammar/`
evidence from the rejected prototype is untouched). Phase pinned by polling the
production WebGL2 `uTime` uniform (target tolerance 0.004).

| File | phase `p` | captured `k` | boundary-hot ring | center-hot | Frame reading |
|---|---|---|---|---|---|
| `f1-onset.png` | 0.05 | 0.046 | **0.0%** | 0.0% | localized top-edge onset, mostly dark |
| `f2-growth.png` | 0.18 | 0.178 | 1.2% | 22.7% | warm volume grows into a shell |
| `f3-shell.png` | 0.30 | 0.298 | 2.2% | 1.0% | coherent shell, asymmetric cool interior |
| `f4-cavity.png` | 0.44 | 0.438 | 4.0% | 13.6% | shell + morphing asymmetric cool lobes |
| `f5-perimeter.png` | 0.58 | 0.578 | 3.5% | 27.7% | shell + cool interior (peak window) |
| `f6-peak.png` | 0.70 | 0.696 | 0.8% | 26.3% | broad warm shell, cool asymmetric core |
| `f7-contract.png` | 0.86 | 0.858 | 0.9% | 0.0% | edge-led contraction, dark interior |
| `reduced.png` | 0.58 (time frozen) | — | 3.6% | 21.5% | bounded static shell snapshot |
| `contact-sheet.png` | — | — | — | — | labelled 7+reduced contact sheet |

**Pixel evidence that no frame has a contiguous 100% hot perimeter**: a 10px
inward band just inside the rounded boundary sampled at every other pixel —
max hot fraction across all frames is **4.0%** (f4); f1 and f7 are 0.0%/0.9%.
The center stays cool (0.0% hot at f1/f7; 1–28% mid-cycle, i.e. the asymmetric
cool interior shifts around the centre rather than a fixed centered oval).

Simulator used to iterate the model fast before porting (kept for
reproducibility): `research/sim_heatmap.py` + `research/mr9-mech-sim/*.png`.
Capture harness kept: `research/capture-mr9-mechanics.mjs` (+
`research/analyze_mechanics.py`).

---

## 5. Validation

- **Focused Vitest** — `expandedPresentationSurface.test.ts`: **15/15 pass**,
  including new contract tests: real phase-offset subtractive composition
  (`coolMask` ×3 at `fract(p)`, `fract(p+1/3)`, `fract(p+2/3)`, `heat *= (1-mN)`),
  no rejected grammar (`boundaryArc|nearestBoundaryPoint|capFill|shellDepth|
  fullCoverage|interiorFade|cavR|cd=length(cc)`), no full-perimeter hot
  authority (`shellBand|windowed|halfW|fullCoverage`), no
  `sampler2D|texture2D|textureGrad|u_image|shadowShape|u_colors`, one
  `<canvas>`, one `gl.drawArrays`, radius from existing constants
  (`MAIN_WINDOW_FULL_PANEL_RADIUS / MAIN_WINDOW_PANEL_SIZE`,
  `gl.uniform1f(cornerRadiusLocation, MAIN_WINDOW_CORNER_RADIUS_NORMALIZED)`).
- **Full suite** — 1764/1765 pass; the only failure is the **pre-existing**
  `browser-extension/architecture-guard.test.js` (untouched by this spike; the
  file is not in the diff).
- **`npx tsc --noEmit`** — PASS.
- **`npm run lint -- --quiet`** — 0 issues.
- **`git diff --check`** — clean (only pre-existing CRLF notices).
- **Chromium/WebGL2 (capture-log.json)**: `canvasCount=1`, program
  `linked=true`, `uHeatmapMode=1`, `uCornerRadius≈0.08`, `pageErrors=0`;
  Reduced Motion: `uHeatmapMode=1` and **`uTime` frozen** (18.723… across
  500 ms → no travelling frames).

---

## 6. License / derivative determination

**Determination: structural/mechanical adaptation — no Paper GLSL expression
copied; no Apache-2.0 obligation triggered.**

- The causal composition (static warm field × 3 phase-offset subtractive masks +
  localized outer-band + scalar ramp + grain) is adapted **one-to-one** from the
  anchors in §2, but every term is replaced by Ameow-analytic fields with
  Ameow's own constants, geometry, noise, and palette.
- No `shadowShape`, no `u_image` sampling, no blur/texture preprocessing, no
  `imgSoftFrame`, no diamond/Apple geometry, no `u_colors` meta is present
  (asserted by tests: `not.toContain("shadowShape")` etc.).
- The `1 - smoothstep(...)` mask and `x *= (1-m)` subtraction are generic GLSL
  idioms; the `+1/3, +2/3` phase offsets are the natural equal thirds for three
  copies and are documented as an adapted structure, not copied code.
- **Gate unchanged**: if any future slice copies or near-verbatim-adapts Paper
  expressions, Ameow's third-party notice convention applies (Apache-2.0
  LICENSE, Paper NOTICE/attribution, prominent modification notice, no
  trademark-authorization language). Not triggered by this spike.

---

## 7. Remaining differences / gaps (vs the Paper reference)

- **Onset scale**: f1 is a localized top-biased warm onset that reads
  cyan/light-blue rather than the reference's small orange wedge — the
  rounded-window geometry and the analytic substrate make the onset a "top
  field interaction" rather than a diamond-apex wedge.
- **Exit tightness**: f7 contracts toward the lower edge with a dark interior
  but is not a razor-thin bottom wedge; the warm residual still touches parts
  of the sides.
- **Cool-region character**: the asymmetric cool interior is multi-lobed and
  shifts (intended), but it is more fragmented than the reference's single
  morphing cavity — a natural consequence of three independent mask
  trajectories rather than a fixed shape void.
- **Interior warmth at peak**: f5/f6 show a warm shell with a cooler core but
  the interior is less uniformly yellow than the reference's warm f6 body.
- These are tuning-level differences; all **hard rejection criteria** pass
  (no full hot frame, no centered oval cavity, no clean diagonal band, no
  uniform fade, no noise/plasma, no explicit frame geometry, one
  canvas/program/draw, no texture/pass/runtime).

---

## 8. Texture / pass / runtime necessity verdict

**Not required.** Paper's texture preprocessing (`toProcessedHeatmap`/blur
passes) exists only to bake its logo silhouette into contour/blur channels. For
Ameow's rounded window there is no external shape to bake: the boundary is
analytic (`roundedBoundary`), so the inner field, boundary relation, moving
masks, and halo are all computed in one fragment shader pass over one canvas
with one linked program and one draw call. No second pass, no feedback texture,
no CPU preprocessing, no sampler. Paper's texture machinery is **not
indispensable** for the adapted mechanics — the emergent sequence is produced
entirely analytically.

---

## 9. Files touched & hard stop

Source (2): `src/presentation/main-window/ExpandedPresentationSurface.tsx`,
`src/presentation/main-window/expandedPresentationSurface.test.ts`.
Research/evidence (new, no commits): `research/mr9-mechanics-adaptation/*`
(captures, contact sheet, capture-log.json), `research/sim_heatmap.py`,
`research/mr9-mech-sim/*`, `research/capture-mr9-mechanics.mjs`,
`research/analyze_mechanics.py`, `research/mr9-mechanics-adaptation.md`.

**Hard stop statement**: This spike performed **no** Perimeter Chase, no
dual-front/opposite closure, no Lens Distortion, no Noise Dissolve, no final
Thermal FX polish, no Checkpoint D work, no texture/second pass/second
canvas/second renderer/second program, no dependency install, and no commit.
Production heatmap stays off by default (`uHeatmapMode` lab-gated, never set in
production). All pre-existing dirty work in the worktree is preserved.

---

## 10. Cindy Lead visual review

Architecture/mechanics evidence is valid: the rejected explicit cap/shell/
centered-cavity construction is gone, three phase-offset subtractive fields are
present, and the prototype stays inside the existing single WebGL2 authority.

The first prototype does **not** pass human visual acceptance. In the ordered
contact sheet, the subtractive masks read as hard near-black capsules/pointers
rather than softly shaping one continuous cool thermal region. The static
depth ring produces a conspicuous orange inner rounded-square/spiral, and the
low-weight contour can remain continuously blue because
`1.0 - m0*m1*m2` is near one wherever the three masks do not all overlap.
Therefore the source test can prove removal of full-perimeter widening
authority, but it cannot by itself prove absence of a decorative frame.

The pixel metric only proves that the boundary is rarely red/orange; it does
not prove Paper-like morphology. Treat this spike as mechanics evidence and a
failed visual candidate. Do not enter Chase, Checkpoint D, Lens, Noise, or
production integration without a new user-reviewed direction.
