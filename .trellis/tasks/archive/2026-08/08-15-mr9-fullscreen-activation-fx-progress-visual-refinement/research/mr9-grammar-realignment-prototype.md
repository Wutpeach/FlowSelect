# MR9 Browser Lab Motion / Material Grammar Realignment — Prototype

Date: 2026-08-19
Scope: first lab-gated prototype of the seven-frame Paper Heatmap Reference
Sequence on the 200×200 rounded Main Window. No Chase, dual-front, opposite
closure, Lens Distortion, Noise Dissolve, full activation state machine,
second pass, texture, canvas, renderer, or dependency. No Checkpoint D. No
commit.

## 1. Reference authority

Visual authority: `research/mr9-paper-heatmap-reference-7frame.png` (the
user-supplied seven-panel contact sheet). Its sequence is: (1) small hot wedge
at the top apex on a cold diamond; (2) hot cap fills the upper half; (3) hot
band follows the upper edges (shell emerging); (4) orange upper/lateral shell
with a cool central-lower region (cavity); (5) full orange/red diamond
perimeter with a large cyan/blue vertical oval cavity; (6) thin red-orange rim,
warm interior, large rounded cool centre (coordinated peak); (7) interior
nearly black, sole hot wedge at the bottom apex (edge-led exit). It is a
top → both sides → bottom flow of a boundary-following thermal shell with a
morphing cool cavity — NOT a diagonal interior sweep.

Ameow's domain is the rounded square (200×200, 16px radius); the diamond is
deliberately not reproduced. The grammar (edge origin → inward shell → morphing
cavity → peak → boundary contraction/dissipation) is adapted to the rounded
shell.

## 2. New vs old diagonal-sweep grammar

Old (Checkpoint B/C): one travelling diagonal plane front
(`DIR = normalize(0.90, 0.62)`, `d = dot(q, DIR) - front + bend`) sweeping
lower-left → upper-right, with a trailing cool body, a narrow warm frontier and
a compact pale core. REMOVED.

New: a renderer-local boundary flow on the rounded shell.
- `roundedBoundary(uv)` — analytic rounded-rect SDF of the real shell (unchanged
  authority: `uCornerRadius = MAIN_WINDOW_FULL_PANEL_RADIUS / MAIN_WINDOW_PANEL_SIZE`
  = 16/200 = 0.08).
- `nearestBoundaryPoint(uv)` — correct nearest point on the rounded shell
  (mirrored-quadrant decomposition: inner-square straight edges + corner arcs;
  reflects back through the sign of `uv - 0.5`). This was the key fix of the
  spike: the first version mis-classified the straight-edge strips as corners,
  which corrupted the whole arc map (onset appeared at the bottom, contraction
  at the upper-left).
- `boundaryArc(uv)` — renderer-local monotonic perimeter parameter in [0, 1):
  0 = top-edge midpoint, 0.25 = right, 0.5 = bottom, 0.75 = left (verified
  numerically). Used as a single top → bottom flow parameter; it is NOT a
  Chase/dual-front/closure scaffold (no `perimeterCoordinate`/`chaseDistance`/
  `dualFront`/`oppositeClosure` identifiers in the heatmap grammar, source
  asserted).
- The flow window (`center`, `halfW`, `flow`): a hot window that starts as a
  small wedge at the top-edge midpoint (halfW 0.045), widens to the full
  perimeter by the peak (fullCoverage mix at halfW 0.5), then narrows and
  settles at the bottom edge for contraction. Symmetric top → both sides →
  bottom.

## 3. Field / mask / cavity / envelope mechanisms (single fragment program)

Phase `p = fract(time * 0.10)` (~10 s cycle); Reduced Motion pins p = 0.58
(coordinated peak) with time = 0.

- **Energy envelope** (one weak → strong → weak for every term):
  `energy = smoothstep(0.0, 0.06, p) * (1.0 - smoothstep(0.86, 1.0, p))`.
- **Shell** (boundary-hugging, inward-thick): `shellBand = 1 - smoothstep(0,
  shellDepth, depth)` where `depth = -bd` (0 at boundary); `shellDepth` grows
  0.06 → 0.36 during formation (p 0.16→0.56) and thins on contraction, so the
  shell reads as a growing material shell, never a fixed border. Rim falloff
  `(1 - 0.24*smoothstep(0, shellDepth, depth))` keeps the outer edge hottest.
- **Solid cap fill** (reference frames 2–3): `capFill` fills the top-originated
  region inward (`uvf.y` cutoff growing downward, widening horizontal gaussian)
  with `fillWeight = 1 - smoothstep(0.18, 0.48, p)` handing off to shell+cavity.
- **Morphing cool cavity**: `cavity = 1 - smoothstep(cavR, cavR+0.10, cd)` with
  `cd = length((uv-0.5) * (1.0, 0.82))` (slightly vertical-oval). `cavR` grows
  0.08 → 0.24 (p 0.32→0.58) then 0.28 on contraction; a single restrained
  low-frequency value-noise deformation
  `cavR += (heatmapNoise(cc*2.2 + vec2(time*0.09, -time*0.06)) - 0.5) * 0.06`
  makes it expand/bulge/pinch/reshape smoothly (verified: the cavity annulus
  differs measurably between the moving peak frame and the static reduced
  frame while the rest of the image is stable).
- **Warm body band** (yellow transition layer): between the shell inner edge
  and the cavity, `body = bodyBand * flow`, fading out just past the cavity
  boundary so the cool cavity always wins inside its own radius.
- **Halo**: `halo = exp(-depth*5.5) * smoothstep(0.12, 0.45, p)` — faint cool
  boundary glow rising with the envelope.
- **Contraction / edge-led dissipation**: `interiorFade = 1 - smoothstep(0.68,
  0.92, p)` cools the interior first while the shell persists, narrows to the
  bottom wedge (flow window), then the whole field fades under `energy`.
- Heat composition: `heat = max(shell*0.80, max(capFill*fillWeight*0.60,
  body*0.82)); heat = mix(heat, heat*0.12, cavity); heat += (cavity*0.32 +
  halo*0.30)*interiorFade; heat *= energy;` plus subtle sine-free hash grain.

## 4. Rounded boundary authority

The boundary comes only from the existing geometry constants
(`MAIN_WINDOW_FULL_PANEL_RADIUS / MAIN_WINDOW_PANEL_SIZE`) passed as
`uCornerRadius`. `roundedBoundary`, `nearestBoundaryPoint` and `boundaryArc`
are renderer-local read-only projections; no new layout/Product/lifecycle
authority, no new module, no dependency.

## 5. Paper reuse / license status

Clean-room. The scalar-heat-to-color-ramp idea and the seven-frame material
grammar are used as inspiration only; no upstream GLSL expression/block is
copied or adapted (no `getImgFrame`, `blurEdge3x3`, `shadowShape`, palette
loop, texture preprocessing, or runtime). The only retained noise helper
(`heatmapHash`/`heatmapNoise`, sine-free value noise) is pre-existing Ameow
spike code, not a Paper copy. Therefore NO Apache-2.0 LICENSE/NOTICE/
modification obligation is triggered. If a later slice adapts any Paper
expression, the gate stands: add the Apache-2.0 LICENSE + NOTICE attribution +
prominent modification marker before shipping.

## 6. Ordered capture paths (evidence)

`research/mr9-grammar/` (200×200 composited preview-frame screenshots, phases
pinned by polling the production `uTime` uniform; actual k in parentheses):

| File | Phase target | Actual k |
| --- | --- | --- |
| `f1-onset.png` | p 0.05 — localized top-edge onset | 0.046 |
| `f2-growth.png` | p 0.20 — inward/downward growth | 0.196 |
| `f3-shell.png` | p 0.34 — shell wrapping, cavity emerging | 0.336 |
| `f4-cavity.png` | p 0.46 — shell + clear cool cavity | 0.456 |
| `f5-perimeter.png` | p 0.58 — full perimeter shell + cavity | 0.578 |
| `f6-peak.png` | p 0.68 — coordinated peak | 0.676 |
| `f7-contract.png` | p 0.86 — contraction to bottom edge | 0.856 |
| `reduced.png` | p 0.58 static (Reduced Motion) | time frozen |
| `contact-sheet.png` | labeled 2×4 contact sheet | — |

Reference: `research/mr9-paper-heatmap-reference-7frame.png` (+ .webp original).

## 7. Validation

- Browser Lab (Playwright Chromium headless SwiftShader, existing Vite server
  on 127.0.0.1:1421, `lab.html`): `canvasCount === 1`, WebGL2 program linked,
  `uHeatmapMode === 1`, `uCornerRadius ≈ 0.08`, no page errors.
- Reduced Motion: `uTime` byte-identical across 500 ms (no travelling frames);
  the static snapshot is the bounded p = 0.58 peak.
- Focused Vitest 51 passed (surface 14, runtime 15, scenarios 22, renderer
  reuse; includes the new grammar/authority source assertions).
- `npm run type-check` PASS; `npm run lint -- --quiet` 0 problems;
  `git diff --check` clean.
- Pixel metrics on the captures (boundary-band hot fraction / centre cool
  fraction): f1 2.1%/90%, f2 5.2%/88%, f3 46.9%/97%, f4 79%/97%, f5-f6
  100%/97% (full shell + cool cavity at peak), f7 17.7%/dark (contraction).
  No permanent full perimeter in onset/growth/exit frames; the centre is a
  real cool cavity at the peak (not prelit before the shell arrives).
- Cavity morph is time-evolving: the moving peak frame vs the static reduced
  frame differ by mean 19.9 (max 126) in the cavity annulus vs 6.4 whole
  image — a localized low-frequency undulation, not a global change.

## 8. Unresolved visual differences vs the reference

1. **Geometry**: the reference is a diamond; the rounded-square adaptation
   keeps a square-ish shell. The "hot frame" reading is strongest at f4–f6
   (the reference is also perimeter-dominant there); the temporal rise/fall
   (2% → 100% → 18% boundary-hot) keeps it from being a permanent outline.
2. **Interior warmth**: the reference f6 interior is broad yellow-orange; the
   current body band is a thin yellow annulus with a large blue cavity. A later
   tuning pass can widen the body band / raise its weight if the lead wants
   more interior volume.
3. **Corner pockets**: dark blue corner wedges inside the shell remain
   (straight-side projection); they read as cooler material, not an artifact.
4. **Cavity morph amplitude** is intentionally restrained (≤ ±0.03 radius) to
   stay low-frequency; it is visible over a cycle but subtle in any still.
5. The lab preview shell radius is 14 px vs production 16 px (Lab chrome only;
   the shader projects the real 16/200).

## 9. Files touched (this spike only)

- `src/presentation/main-window/ExpandedPresentationSurface.tsx` — heatmap
  grammar replaced inside the lab-gated `heatmapOutput` (helpers
  `roundedBoundary`, `nearestBoundaryPoint`, `boundaryArc`; new flow/shell/
  cavity/body/halo/envelope; 8-stop palette navy → deep blue → vivid blue →
  light blue/cyan → yellow → orange → red-orange, no white core, no teal/
  grey cast). Production path and activation grammar untouched.
- `src/presentation/main-window/expandedPresentationSurface.test.ts` — heatmap
  grammar assertions updated (edge-originated shell + morphing cavity, no
  diagonal/Chase identifiers, one canvas/program/draw).
- `research/mr9-grammar/*.png` + `research/mr9-paper-heatmap-reference-7frame.*`
  — evidence.
- `research/mr9-rounded-boundary-edge-capture-spike.md` — prior spike artifact
  (kept as technical background).
- `research/capture-mr9-grammar.mjs` — reusable phase-pinned capture harness
  (drives the existing Lab; no new persistent test fixture).

No commit made; the diff is left for review.
