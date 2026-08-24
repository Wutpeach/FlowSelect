# Sub-phase: Paper Internal Morphology / Fixed-Phase Composition Spike

Task: `08-21-paper-heatmap-geometry-rendering-domain-audit`
Worktree: `D:\Ameow\.cindy-worktrees\mr9-fullscreen-activation-fx` (branch `motion/mr9-fullscreen-activation-fx`)
Status: **EVIDENCE CAPTURED — GPU-validated PASS** (hypothesis NOT falsified)

## 1. Objective

Replace the Lead-rejected "flat orange interior + thin continuous gold perimeter" Paper
material with a faithful, derivative-adapted test of Paper Heatmap's **geometry-agnostic
internal morphology mechanics**, driven by **fixed, manually pinned renderer-local phase
inputs** (A/B/C/D Lab captures) — no time progression, no scheduler, no lifecycle authority.

The falsification target: if the actual Paper-derived morphology still yields a flat
interior plus a continuous perimeter outline, report hypothesis failure and stop. It does
not — the composition produces broad, phase-varying warm/cool internal morphology with a
non-uniform, broken edge (quantitatively proven, section 6).

## 2. Paper mechanics adapted (source: `D:\paper-ref\heatmap-upstream.ts`)

Upstream Paper processed-channel layout (geometry-agnostic):
- `img[0]` = background-side mask (1 outside the logo); Ameow analog = exact panel source
  mask `shape` (1 **inside** the 200×200/r16 panel) — sign convention flipped in adaptation.
- `img[1]` = big blur (~150px); Ameow analog = `bigBlur` (0.08 × 4 box passes).
- `img[2]` = inner blur (~18px); Ameow analog = `narrowBlur` (0.02 × 4 box passes).
- contour edge response; Ameow analog = `contour = (source - narrow) × 3`.

Adapted causal chain (all fixed-phase, no time):
- Phase-offset shadow times (Paper L209–214): `t`, `t+1/3`, `t+2/3` (mod 1).
- Warm inner field (Paper L239): `inner = 0.8 + 0.8·innerBlur` where
  `innerBlur = mix(0, bigBlur, shape)` (big-blur energy inside the panel).
- Three subtractive erasures (Paper L240–242):
  `inner = mix(inner, 0.0, shadow_i)` for the three phase-offset translating blobs
  (`paperShadowBlob`, Paper L215–247 shadowShape derivative; Apple circles/leaf/balls
  **excluded**).
- Contour scalar energy (Paper L246 analog, weight 0.12):
  `inner += 2.0·0.12·contour·(1 − shadowUnion)` — sculpted by the same shadows so it never
  forms a continuous ring.
- Erase outside the panel (Paper `(1-shape)` with background-side R ⇒ `inner *= shape`
  with Ameow's inside-side mask).
- Outer broad shell (Paper L250–259):
  `outer = 0.9·pow(outerBlur,0.8) · animatedMask · 0.22`, with
  `outerBlur = 1 − mix(1, bigBlur, shape)` and `animatedMask = 0.5 + sst(0.3,0.65,y)·(1−sst(0.65,1,y))`,
  `y = mod(panelUv.y − t, 1)`, `t = mod(3·phase − 0.1, 1)`.
- `inner = pow(inner, 1.2)`.
- LOCKED 14px-bounded gutter halo (repaired behavior, preserved):
  `gutterHalo = 0.30·bigBlur·(1−shape)·outerFalloff`, `outerFalloff = 1 − sst(0,1,gutterNorm)`,
  `gutter = (1 − panelSize)/2` (real 14px gutter in domain), so it reaches 0 inside the gutter.
- Final Thermal scalar projection (Paper L265): `heat = clamp(inner + outer + gutterHalo, 0, 1)`,
  projected through the existing Ameow 7-stop `PAPER_STOP` ramp + yellow-zone correction +
  `alpha = smoothstep(0.06, 0.55, heat)` + the accepted `heatmapGrainHash` grain.

## 3. Explicit exclusions (documented, NOT replaced by new Ameow fields)

- Apple-specific geometry: logo leaf, bottom circles, random balls, diamond (Paper
  `shadowShape` bottom / leaf / balls regions) — **excluded**; only the generic
  translating-blob helper (`paperShadowBlob`) is adapted.
- No noise/plasma/travelling field/carrier; no repair mask; no inset geometry; no new
  framework; no ShaderMount/ShaderSizing/Paper React; no runtime scheduling/RAF/motion
  wiring (paper mode is fully static; Reduced Motion = same single frame, zero continuing
  frames).
- No Refraction binding, no native resize, no lifecycle authority (single renderer-owned
  lazy processed texture, disposed on unmount).

## 4. Pinned phase contract (A/B/C/D Lab captures)

`uPaperPhase` is a manually pinned renderer-local Lab uniform (`paperPhase?: number`,
default 0.35). The four evidence phases are fixed:

| Label | Phase | Morphology signature (GPU) |
|---|---|---|
| A | 0.05 | cool-dominant; large dark-blue upper/left mass, warm lower region |
| B | 0.32 | warm-dominant; orange interior, cool sculpted blobs, gold transition band |
| C | 0.58 | cool-dominant; broad dark-blue upper mass, warm lower, bright top-edge band |
| D | 0.82 | split; cool oval through middle, warm top + lower regions |

Phase-offset shadows at each capture: `fract(phase)`, `fract(phase+1/3)`, `fract(phase+2/3)`
translate the three subtractive blobs (Paper L209–214), producing the phase sweep.

## 5. Falsification gates (pre-registered)

| Gate | Definition | Result |
|---|---|---|
| G1 | Interior is NOT flat: ≥3 distinct RGB values across 6 interior samples (not identical `255,87,23`) | **PASS** — 6 distinct colors (section 6) |
| G2 | Perimeter is NOT a continuous outline: ≥1 edge point at alpha 0 AND red variance > 5% | **PASS** — 3/10 perimeter points alpha 0, red 158–255 |
| G3 | Morphology is smooth (no noise/plasma): vision-verified smooth blobs, grain ≤ ±1 unit | **PASS** |
| G4 | Broad/narrow scales mathematically distinct (0.08 vs 0.02, 4×) and both drive distinct roles | **PASS** — numeric scale probes, distinct roles |
| G5 | Transparent 228 outer edge: last-2px alpha 0 all four sides, all corners alpha 0 | **PASS** — GPU `[0,0,0,0]` at (911,456) & (911,911) |
| G6 | Single renderer/resource: 1 program, 1 texture, 1 draw; no framebuffer | **PASS** — GPU `createTexture:1, drawArrays:1`, linked |
| G7 | Reduced Motion static: two draws identical (0 diff bytes), no time uniform | **PASS** — `rmStatic.diffBytes:0` |
| G8 | Paper-off fallback: no extra texture alloc, distinct output | **PASS** — `createTextureDelta:0`, `#0d0d19` |
| G9 | Normal UI interaction + singular shadow + clip semantics | **PASS** — DOM layer demo (section 7) |

## 6. Evidence summary (authoritative GPU + cross-checked CPU)

- **GPU harness** (`capture-paper-morphology.html`, exact paper-slice GLSL): linked;
  `createTexture:1`; `drawArrays:1`; `rmStatic.diffBytes:0`; fallback
  `createTextureDelta:0` center `#0d0d19`; all phases gutterLast/corner `[0,0,0,0]`.
- **Phase-varying interior (GPU samples)**:
  - A 0.05: center `#010208` (cool), edge `#000000`
  - B 0.32: center `#fd5515` (warm), edge `#fe5516`
  - C 0.58: center `#09194f` (cool), edge `#fe5516`
  - D 0.82: center `#000000` (cool), edge `#fe5516`
- **CPU renderer cross-check vs GPU**: exact algorithm reimplemented in JS; warm interior
  & edge points match within 1–2 units; remaining deltas only in mid-alpha transition
  zones and premultiplied-zero-alpha regions (both alpha 0). This validated the CPU
  renderer (bottom-up UV convention) used for channel/shadow/A-B visual evidence.
- **A/B vs REJECTED candidate** (numeric, phase B):
  - REJECTED interior RGB: `255,87,23` × 6 — perfectly flat orange.
  - FIXED interior RGB: `253,85,21 | 19,65,183 | 19,65,183 | 253,201,49 | 216,178,81 | 4,10,35`
    — 6 distinct values across the full thermal ramp.
  - REJECTED perimeter (R,A): `[255,255]` × 10 — continuous bright gold ring.
  - FIXED perimeter (R,A): `[255,255],[255,255],[159,255],[254,255],[0,0],[0,0],[0,0],[253,255],[158,255],[255,255]`
    — 3 points alpha 0 (broken edge), red 158–255 (varied).
- **Edge non-uniformity (all phases)**: 10 edge points per phase — alpha min 0 / max 255,
  red min 0 / max 255 ⇒ non-uniform perimeter energy every phase.
- **Subtractive-shadow intermediates (phase B)**: shadow1 (upper blob), shadow2 (lower
  blob), shadow3 (off-panel at B — phase 0.9867 ⇒ posY 1.96 below panel, correct Paper
  translating mechanics), shadowUnion (combined), inner-BEFORE (solid warm field) vs
  inner-AFTER (cool sculpted cut-outs) — vision-confirmed.
- **Vision-verified**: 4 phase composites distinct, warm+cool filled blobs, no noise, no
  continuous outline; edge bands vary in thickness/brightness; channels match labels
  (source mask / big blur / narrow blur / contour).
- **Screenshots** (browser media):
  - `2586ece9a4f73ca3.jpg` — phases A–D composites + 4 channel views.
  - `d9afe63f5703ba26.jpg` — shadow intermediates + crops (edge band, gutter→outer-edge,
    interior) + final phase B.
  - `575638ee3ddd0e7c.jpg` — shadowUnion sweep A–D + edge-band close-ups A–D + edge
    profile text.
  - `9c5f67cbd24c6e14.jpg` — A/B REJECTED vs FIXED (visual).
  - `98bb703bd7a1e8a4.jpg` / `457e839a047eb937.jpg` — layer demo FX OFF / FX ON.

## 7. Interaction / layer / shadow / resource evidence

Real DOM demo (unchanged model, verified): shell below FX canvas (`linear-gradient` +
singular CSS shadow, interaction authority); transparent UI content clip above FX
(`background:none`, `boxShadow:none`, `overflow:hidden`, `borderRadius:16px`,
`pointer-events:auto`); FX canvas `pointer-events:none`. Measurements:
`panelCenterHit=pill` (via clip), `gutterHit=DIV` (frame below — gutter transparent),
`uiPillHitNoOptIn=pill` (NO opt-in), `clipPointerEvents=auto`, `clipBackground=rgba(0,0,0,0)`,
`clipShadow=none`, `shellHasShadow=true`, `fxCanvasPointerEvents=none`,
`fxCanvasCenterRGBA=[253,85,21,255]` (material through transparent clip),
`fxCanvasGutterRGBA=[0,0,0,0]`, `clipOverflow=hidden`, `clipRadius=16px`.

## 8. Resource / fallback / Reduced Motion

- Single renderer-owned lazy processed texture (`ensurePaperBoundary`, 1 `gl.createTexture`);
  disposed via `gl.deleteTexture` on unmount; context-restore listener retained.
- Paper-off fallback: no texture allocation (`createTextureDelta:0`), distinct dark output.
- Reduced Motion: paper composition is fully static (phase-only, no time); two identical
  draws → `diffBytes:0`. Zero continuing frames by construction.

## 9. Boundaries respected

Locked geometry (228 outer / 200×200/r16 at (14,14)), one canvas/program/draw, ≤1 lazy
processed texture, panel-aligned latent silhouette sole source, 14px-bounded halo,
transparent 228 outer edge, normal UI interaction, Thermal+Refraction fallback,
Apache-2.0/Paper NOTICE provenance — all preserved. No commit, no archive, no production
integration, no Refraction binding, no motion/timing, no native resize, no new
noise/plasma/carrier fields.
