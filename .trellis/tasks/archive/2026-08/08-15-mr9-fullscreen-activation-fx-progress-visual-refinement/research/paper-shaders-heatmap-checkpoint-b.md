# Paper Shaders Heatmap — Checkpoint B: Moving-Field Material Tuning

Date: 2026-08-19
Scope: MR9 Fullscreen Activation FX · Checkpoint B only (field width / direction /
timing tuning of the existing Heatmap prototype). No Checkpoint C/D/E, no Lens
Distortion, no Noise Dissolve, no Edge Chase, no full activation grammar.

## 1. Baseline diagnosis (visual, before this round)

Working tree: `motion/mr9-fullscreen-activation-fx` at HEAD `59b62ea`, with the
uncommitted MR9 Heatmap spike preserved. Baseline screenshots:
`research/mr9-heatmap-moving.png`, `research/mr9-heatmap-reduced.png`.

Visual review of the baseline identified four concrete deviations from the
Paper-Heatmap material reference:

1. **Cool body too thin** — the blue/cyan field appeared only as thin halos
   ringing the warm regions, not as a standalone mass.
2. **Warm/core tangentially clipped** — the hot core and warm frontier sat at
   the top/right edges, partially cut by the frame, reading as peripheral blobs.
3. **Central dark too large** — a dominant uninterrupted dark central void
   overpowered the field.
4. **Isolated blobs / perimeter feel** — the two drifting noise lobes produced
   disconnected edge-localized hot spots rather than one sweeping body.

Root cause: the baseline field was built from two low-frequency drifting value
noise lobes (`(lobe - 0.30) * 2.1`), which yields a mostly-dark surface with a
few tall noise peaks that happen to sit at the frame edges.

## 2. What changed (single travelling diagonal thermal band)

All changes are inside `heatmapOutput` in the single fragment program of
`src/presentation/main-window/ExpandedPresentationSurface.tsx` (plus one test
assertion in `expandedPresentationSurface.test.ts`). No new authority, no new
dependencies, no second canvas/renderer/host, no Lab state/runtime/locale
change. The `heatmap?: boolean` prop, `uHeatmapMode` gate, and the bounded
one-rAF scheduling from the spike are untouched.

### Field replacement

```glsl
const vec2 DIR = vec2(0.8235, 0.5674);            // normalize(0.90, 0.62)
float k     = reducedMotion ? 0.42 : fract(time * 0.13); // one continuous phase
float front = mix(-0.58, 1.6, k);                 // travelling front position
float p     = dot(q, DIR);
float bend  = heatmapBend(q, front);              // ±0.08 organic curvature
float d     = p - front + bend;                   // <0 behind, >0 ahead
float behind = max(-d, 0.0);
float body   = exp(-behind * 1.1) * (1.0 - smoothstep(0.0, 0.05, d));
float warm   = exp(-abs(d + 0.018) * 30.0);
vec2 frontPoint = DIR * front;
float core   = exp(-dot(q - frontPoint, q - frontPoint) * 70.0)
             * exp(-abs(d - heatmapBend(frontPoint, front) + 0.012) * 14.0);
float energy = smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.66, 0.99, k));
float heat   = (body * 0.44 + warm * 0.22 + core * 0.18) * energy;
```

Key mechanics:

- **One travelling signed field replaces the two noise lobes.** A plane front
  sweeps diagonally lower-left → upper-right; `d < 0` is the swept (behind)
  region, `d > 0` is the un-swept void ahead.
- **Cool body is the primary mass.** `body` peaks at the front line and fades
  **gently** (decay rate `1.1`, was a buggy/aggressive `2.6` with the wrong
  sign) so a wide band of cyan → blue → deep blue trails the front toward the
  origin. The ahead side is masked off so the void stays dark.
  - Important sign-fix: the spike's `exp(-max(-d, 0.0) * 2.6)` actually puts
    the body **ahead** of the front (`max(-d,0) == 0` when `d > 0`), which is
    why the baseline felt edge-hugging. Now `behind = max(-d,0)` + an explicit
    `(1 - smoothstep(0, 0.05, d))` ahead mask puts the body on the trailing
    side and keeps a soft front edge.
- **Warm frontier is narrower** — `exp(-abs(d + 0.018) * 30.0)` is ~6% of the
  surface diagonal, a thin ribbon just behind the front.
- **Pale core is smaller and more restrained** — a compact 2D bump
  (gaussian `70`) riding the *bent* front (evaluates the bend at the front
  anchor so the core tracks the visible warm line), amplitude `0.18` so it
  peaks at heat ≈ 0.81 (soft pale), not blown.
- **Direction / timing** — one continuous phase `k = fract(time * 0.13)`
  (~7.7 s per cycle). The front range `[-0.58, 1.6]` extends past the surface
  diagonal extent so the cycle reads: **ignition** (k<0.12, small warm/cyan
  patch enters lower-left) → **sweep** (k 0.12–0.55, band crosses) →
  **takeover** (k 0.55–0.66, full cool body covers the surface) →
  **exit/dissipation** (k 0.66–0.99, energy envelope fades, residual contracts
  toward the departing front, ends dark). No stage state machine — one
  continuous phase as allowed by the task.
- **Reduced Motion** pins `k = 0.42` (a representative static mid-sweep
  snapshot); no travelling frames (existing runtime zero-loop behavior kept).
- **Ramp** widened from 7 to 9 stops to kill the murky cyan→yellow green zone:
  navy → deep blue → blue → cyan-blue → cyan (cool body) → teal-green →
  yellow-green → yellow-orange (frontier) → pale core. Colors were brightened
  (e.g. cyan `(0.32, 0.80, 0.86)`) and alpha raised
  (`mix(0.55, 1.0, smoothstep(0.0, 0.50, heat))`) so the cool body reads as a
  clearly visible primary mass over the dark surface.

## 3. Paper reuse / license determination

**Clean-room; no upstream source copied or adapted.**

The field is an analytic plane front + low-frequency bend + the spike's
sine-free value-noise hash. No Paper expression, helper, uniform, texture
channel, `ShaderMount`/`ShaderSizing` runtime, or React mount is present. The
only shared high-level idea remains "scalar heat → thermal color ramp", which
is an unprotectable visual technique, not a copyrightable expression.

Therefore no Apache-2.0 LICENSE / NOTICE / attribution / modification-marker
obligation is triggered. If a later slice copies any Paper GLSL, the existing
gate stands: add the Apache-2.0 LICENSE text + NOTICE attribution + prominent
modification marker in the shader before shipping.

## 4. Baseline comparison (measured on-screen captures)

| Aspect | Baseline (mr9-heatmap-moving) | Checkpoint B (mr9-checkpoint-b-moving) |
| --- | --- | --- |
| Cool body | thin halos around warm spots; not a mass | broad cyan/blue band is the primary mass (≈60% of surface at mid-sweep) |
| Warm frontier | top/right edge, clipped | narrow ribbon inside the surface, crossing diagonal |
| Pale core | large, peripheral, partially clipped | small local bump riding the front, inside the surface |
| Central dark | dominant central void | directional void ahead of the front (top-right), balanced |
| Field shape | 2–3 disconnected noise lobes | one continuous diagonal banded body |
| Motion | noise lobes drift | coherent band sweeps lower-left → upper-right |

Phase progression across the two moving captures:

- `mr9-checkpoint-b-moving.png` (k≈0.33): mid-sweep — band crosses the
  surface, cool body behind, dark void ahead at the top-right.
- `mr9-checkpoint-b-moving-later.png` (k≈0.50): near-takeover — the cool body
  covers ~85% of the surface, the warm frontier has receded to the top-right
  edge, only a corner void remains.

Visual reference priority honored: broad blue/cyan mass, narrow warm frontier,
small restrained pale core, dark surroundings, clean restrained material —
matching the Paper screenshots (material) and the six-stage diagram's
ignition → sweep → takeover → exit/dissipation direction (semantics). No
diamond/logo/mask/outline lighting was learned.

## 5. Validation results

Focused Vitest (all 58 pass):

```powershell
npx vitest run src/lab/scenarios.test.ts `
  src/presentation/main-window/expandedPresentationRuntime.test.ts `
  src/presentation/main-window/expandedPresentationSurface.test.ts `
  src/lab/rendererReuse.test.ts
```

- `npm run type-check` → PASS (tsc --noEmit + tsconfig.electron.json).
- `npm run lint -- --quiet` → PASS (0 problems).
- Browser Lab (Playwright Chromium, headless SwiftShader):
  - `canvasCount === 1`, production WebGL2 program linked, no page errors.
  - `uHeatmapMode = 1`, `uReducedMotion = 0` for the moving field; `= 1` for
    the reduced snapshot.
  - Moving captures at two controlled phases show the band position advancing
    (sweep → takeover), i.e. the field animates coherently.
- Source/composition: no new authority/dependency added — no package.json
  change; one canvas, one `gl.drawArrays`, one `uHeatmapMode` gate in the one
  fragment program; heatmap remains lab-gated (production default off).

## 6. Honest acceptance assessment

Fulfilled:

- Blue/cyan is now the primary moving mass and spatial volume ✓
- Warm frontier is narrower than the body ✓
- Pale core is small, local, and does not enter as a big block ✓
- Central dark is gone; a directional ahead-void remains and does not
  overpower the field ✓
- The field reads as one banded/diagonal thermal body advancing across the
  surface, with a continuous phase giving ignition/sweep/takeover/exit ✓

Known limitations / open items (for later slices):

1. **Headless SwiftShader alpha compositing quirk.** In the headless capture
   pipeline, low-alpha bright content composites dimmer than the shader's
   designed alpha (verified: the same field at alpha=1 reads the exact
   designed colors; the semi-transparent composite reads ~0.6×). The field was
   tuned brighter/more opaque so the captures show the intended material. On a
   real GPU the alpha may read slightly hotter than the captures; the next
   slice should re-verify on a non-SwiftShader/real GPU and re-tune `heatAlpha`
   if needed. This is a capture/renderer-path nuance, not a field defect.
2. **The frontier is very smooth/parallel.** Slight width variation or a
   second harmonic in the bend would push further toward Paper's tactile
   feel; deliberately left out to keep the diff minimal.
3. **One continuous phase is not a real activation grammar.** Checkpoint C/D/E
   (ignition → sweep → edge capture → chase → closure → dissipation as a state
   machine, plus origin-local ignition and the surrounding grammar) remain
   unimplemented by design.
4. The progress ring underlay is present in the Lab scenario; the checkpoint
   captures hide the DOM overlays (capture-time only) to isolate the field.
   The heatmap-vs-progress composition is a later-slice concern.

## 7. How to run

```
npm run dev:lab        # serves http://127.0.0.1:1421/lab.html
```

Open the Lab → Heatmap Spike category → `heatmap-moving` / `heatmap-reduced`
presets.

The one-shot Playwright capture harness used for this round's evidence was a
temporary, in-session diagnostic only and has been **deleted** — per the narrow
"no new persistent Playwright harness" constraint, it is not part of the repo
deliverables. The captures it produced are retained:

- `research/mr9-checkpoint-b-moving.png` (k≈0.33, mid-sweep)
- `research/mr9-checkpoint-b-moving-later.png` (k≈0.50, near-takeover)
- `research/mr9-checkpoint-b-reduced.png` (reduced-motion snapshot)

(On-screen canvas captures at 4× DPR, DOM overlays hidden for field isolation;
same pipeline as the prior spike harness `run-browser-lab-validation.mjs`, which
remains the retained reference for re-running Lab browser validation.)

## 8. Files touched this round

- `src/presentation/main-window/ExpandedPresentationSurface.tsx` — heatmap
  field: travelling band (body/warm/core/energy/ramp/alpha tuning) inside the
  existing lab-gated `heatmapOutput`; spike header comment updated.
- `src/presentation/main-window/expandedPresentationSurface.test.ts` — ramp
  assertion `HEAT_COLOR[7]` → `HEAT_COLOR[9]`.
- `research/mr9-checkpoint-b-moving.png`, `mr9-checkpoint-b-moving-later.png`,
  `mr9-checkpoint-b-reduced.png` — new captures (baseline screenshots kept).

Removed (not retained): `research/run-mr9-checkpoint-b.mjs` — the one-shot
capture harness used for this round's evidence was deleted after use; the
screenshots and validation results above remain valid evidence of the field.

No commit was made; the diff is left for review. Production behavior is
unchanged (heatmap defaults off, lab-gated).
