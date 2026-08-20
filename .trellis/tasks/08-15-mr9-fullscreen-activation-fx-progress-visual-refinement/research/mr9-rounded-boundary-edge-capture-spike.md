# MR9 Rounded Boundary Edge Capture — Prototype Spike

Date: 2026-08-19
Scope: Rounded Boundary Edge Capture only, on top of Checkpoint C. No Chase,
no dual-front/opposite closure, no Lens Distortion, no Noise Dissolve, no full
activation state machine, no perimeter redistribution. Stops at the prototype
and evidence.

## 1. Architecture ownership / source

- **One host unchanged**: the single `ExpandedPresentationSurface` WebGL2
  canvas/program in `src/presentation/main-window/ExpandedPresentationSurface.tsx`.
  Exactly one `<canvas>`, one `gl.drawArrays`, one linked program (source
  asserted by `expandedPresentationSurface.test.ts`).
- **Rounded boundary data is a renderer-local read-only projection**, sourced
  from the existing Main Window geometry:
  - `MAIN_WINDOW_PANEL_SIZE = 200`, `MAIN_WINDOW_FULL_PANEL_RADIUS = 16`
    (`src/constants/windowMetrics.ts`, `src/presentation/main-window/geometry.ts`).
  - New local constant `MAIN_WINDOW_CORNER_RADIUS_NORMALIZED =
    MAIN_WINDOW_FULL_PANEL_RADIUS / MAIN_WINDOW_PANEL_SIZE = 0.08` passed as
    `uniform float uCornerRadius`. No new layout/Product/lifecycle authority,
    no new module, no dependency.
- **Runtime untouched**: `expandedPresentationRuntime.ts` was NOT modified.
  The capture lives entirely inside the lab-gated `heatmapOutput` branch
  (uHeatmapMode gate), so production behavior is byte-for-byte unchanged and
  the existing bounded one-rAF / zero-rAF Reduced Motion scheduling is intact.
- **No Paper diamond/logo geometry**: the boundary is the real 200×200 / 16px
  continuous-corner Main Window shell, projected as an analytic rounded-rect
  SDF.

## 2. Exact surface → contact → capture mechanism

All inside `heatmapOutput` in the single fragment program (Checkpoint C field
kept as primary source: travelling diagonal band, body/warm/core separation,
coherent multi-scale bend, compact soft core, energy envelope, 9-stop ramp).

1. **Surface field (Checkpoint C, unchanged).** One travelling front:
   `k = fract(time*0.13)`, `front = mix(-0.58, 1.6, k)`, signed distance
   `d = dot(q, DIR) - front + bend(q)`. `body` (cool mass, d<0), `warm`
   (narrow frontier strip at d≈0), `core` (compact peak on the front), all
   scaled by the energy envelope.
2. **Rounded boundary projection (new).** The real shell is an analytic
   rounded-rect SDF in normalized UV:
   ```
   halfSize = vec2(0.5) - uCornerRadius
   qb       = abs(uv - 0.5) - halfSize
   bd       = length(max(qb, 0)) + min(max(qb.x, qb.y), 0) - uCornerRadius
   ```
   `bd = 0` is exactly the 16px-radius rounded boundary (the DOM clips the
   canvas to this same rounded rect), so the band follows the real boundary
   including the corner arcs.
3. **Inward-thick boundary band.** `boundaryBand = smoothstep(-0.05, 0, bd) *
   step(bd, 0)` — 1 at the boundary, soft falloff over ~10px of the 200px
   panel (meaningful inward thickness, material not outline), zero outside.
4. **Contact-gated localized capture.** `capture = boundaryBand * warm * 0.6`
   — multiplied by the Checkpoint C warm frontier, so it is nonzero ONLY where
   the travelling front actually meets the boundary: a small inward-thick
   patch that slides along the rounded boundary as the front advances. Added
   to the heat sum: `heat = (body*0.44 + warm*0.22 + core*0.55 + capture) *
   energy`.
5. **Causal guarantee (no perimeter illumination before contact).** Both
   `body` and `warm` are ~0 ahead of the front. Before the field reaches the
   boundary, `capture ≈ 0` at every boundary point → the boundary stays dark.
   After contact, only the boundary points crossed by the warm frontier light
   up (≤ ~27% of the boundary band at any phase, measured), so the capture is
   always a localized contact, never a full outline — including during the
   sweep and at Reduced Motion.

### Was a perimeter coordinate used?

**No.** The capture is purely field-driven via the rounded-rect SDF and the
Checkpoint C `warm` term. `perimeterCoordinate`, `chaseDistance`, `dualFront`,
and `oppositeClosure` do not appear in the capture block (source-asserted in
`expandedPresentationSurface.test.ts`). Chase scaffolding was not added "for
later".

## 3. Screenshot phase comparison (retained evidence)

Captures are on-screen Browser Lab `[data-lab-preview-frame]` element
screenshots (200×200 CSS), DOM overlays hidden for field isolation, same
pipeline as Checkpoint B/C. Files in `research/`:

| File | Phase | Observed |
| --- | --- | --- |
| `mr9-edge-pre-contact.png` | k≈0.03 | Field entering lower-left as a dim ignition dot; **boundary completely dark (boundary-lit 0.0%)** — no perimeter illumination before the field arrives. |
| `mr9-edge-first-contact.png` | k≈0.10 | Field sweeping in; warm frontier touches the boundary; **first localized capture** at the boundary crossing near the left/upper-left; no outline. |
| `mr9-edge-developed.png` | k≈0.25 | Cool body fills the swept region; **two localized capture patches** where the diagonal front crosses the rounded boundary (upper-left and lower-right crossings); no full border. |
| `mr9-edge-developed-later.png` | k≈0.35 | Body covers most of the swept region; capture patches track the front's boundary crossings, still localized. |
| `mr9-edge-late-sweep.png` | k≈0.50 | Near-takeover: cool body ~86%; capture remains localized at the crossings. |
| `mr9-edge-reduced.png` | k=0.42 static (Reduced Motion) | Static field with the localized capture present; `uTime` byte-identical across 500 ms (zero travelling frames). |
| `mr9-edge-contact-sheet.png` | all | Labeled 6-frame contact sheet. |

Objective pixel measurement (200×200 backing readback): boundary-band lit
fraction is 0.0% pre-contact and 20.6–26.6% at every post-contact phase —
localized contact patches, never a perimeter ring.

## 4. Validation

- Focused Vitest **61 passed** (58 baseline + 3 new):
  `scenarios.test.ts`, `expandedPresentationRuntime.test.ts`,
  `expandedPresentationSurface.test.ts`, `rendererReuse.test.ts`. New source
  assertions prove: `uCornerRadius` uniform + geometry-sourced projection
  (`MAIN_WINDOW_FULL_PANEL_RADIUS / MAIN_WINDOW_PANEL_SIZE`), rounded-rect SDF
  presence, `capture = boundaryBand * warm` contact-gating, and that the
  capture block adds no `perimeterCoordinate`/`chaseDistance`/`dualFront`/
  `oppositeClosure`.
- `npm run type-check` → PASS. `npm run lint -- --quiet` → 0 problems.
  `git diff --check` → clean.
- Browser Lab (Playwright Chromium, headless SwiftShader): `canvasCount === 1`,
  production WebGL2 program **linked**, `uHeatmapMode = 1` (moving) and `= 1`
  (reduced), `uReducedMotion = 0/1`, `uCornerRadius ≈ 0.08`, no page errors;
  Reduced Motion `uTime` static across 500 ms. Phase-pinned captures via
  `k = fract(uTime * 0.13)` polling.
- One GLSL bug fixed during the spike: the SDF variable was initially named
  `half`, which is a reserved GLSL keyword and failed shader compilation
  (renderer correctly failed closed → canvas stayed default). Renamed to
  `halfSize`; compile confirmed via `LINK_STATUS` in the browser.

## 5. Current visual issues / known limitations

1. **Two contact patches, not one.** A diagonal front crosses the closed
   rounded boundary at two points (entry + exit), so the capture shows two
   localized patches (e.g. upper-left and lower-right crossings at k≈0.25).
   This is geometrically honest but reads as two contacts; a later Chase
   phase would unify/normalize this into the intended single Edge Capture →
   Dual-front Chase beat. Acceptable for the prototype and consistent with
   the "material contact" reading.
2. **Headless SwiftShader alpha quirk (inherited from Checkpoint B/C).**
   Captures composite slightly dimmer than designed alpha; the capture weight
   (0.6) was chosen so it reads clearly in the capture pipeline. A real-GPU
   re-verify is retained for a later slice.
3. **Lab preview shell radius is 14px vs production 16px.** The Lab's preview
   frame uses `borderRadius: 14` while the shader projects the real 16px
   radius; the 2px difference is negligible at 200px and the production DOM
   clip is the authority.
4. **Phase pinning is time-driven.** `k` is continuous
   (`fract(uTime*0.13)`), so phase-pinned evidence requires polling uTime;
   there is intentionally no time-scrub control (production uTime stays
   continuous).
5. `readPixels` outside the draw frame returns cleared data
   (`preserveDrawingBuffer: false`); the pixel buckets above were measured on
   the composited element screenshots, not the GL readback.

## 6. Paper reuse / license determination

**Clean-room; no upstream source copied or adapted.** The capture is an
analytic rounded-rect SDF multiplied by the existing Checkpoint C field. No
Paper expression, texture channel, `blurEdge3x3`, `shadowShape`,
`getImgFrame`, palette-mixing loop, or runtime is present. The only shared
high-level idea remains "scalar heat → thermal color ramp" / "boundary-adjacent
energy", which is an unprotectable visual technique, not copyrightable
expression. Therefore no Apache-2.0 LICENSE / NOTICE / modification-marker
obligation is triggered. The existing gate stands unchanged: if a later slice
copies any Paper GLSL, add the Apache-2.0 LICENSE text + NOTICE attribution +
prominent modification marker before shipping.

## 7. Files touched (this spike only)

- `src/presentation/main-window/ExpandedPresentationSurface.tsx` — added
  `uCornerRadius` uniform, rounded-rect boundary SDF + contact-gated localized
  capture inside the lab-gated `heatmapOutput`, geometry-sourced normalized
  radius constant, uniform plumbing. Production path unchanged (heatmap
  defaults off).
- `src/presentation/main-window/expandedPresentationSurface.test.ts` — 3 new
  source assertions (boundary projection source, contact-gating + no
  perimeter/chase/closure, one canvas/program/draw authority).
- `research/mr9-rounded-boundary-edge-capture-spike.md` — this artifact.
- Evidence: `mr9-edge-{pre-contact,first-contact,developed,developed-later,
  late-sweep,reduced}.png` + `mr9-edge-contact-sheet.png`.
- Temporary capture harness was deleted after use (per the "no new persistent
  Playwright harness" constraint); screenshots retained.

`expandedPresentationRuntime.ts`, lab scenario/state/locales, thermal palette,
and all other production files were NOT modified. No commit was made; the diff
is left for review.

## 8. Readiness for a later Chase phase

The prototype proves the causal chain (surface heat → rounded-boundary contact
→ localized inward-thick capture, no pre-contact illumination, no outline) in
one pass. For a later Chase phase, the natural extension points are: (1) a
boundary-anchored arc coordinate over the same rounded-rect SDF (to unify the
two crossing contacts into one Edge Capture beat and enable dual-front/opposite
closure), and (2) an occlusion-style capture (Paper `shadowShape` concept,
clean-room) after capture completes. Both remain out of scope here.
