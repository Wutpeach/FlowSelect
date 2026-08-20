# Paper Shaders Heatmap — Checkpoint C: Whole-Field Deformation + Compact Soft Local Core

Date: 2026-08-19 (updated after Lead visual review + core retune)
Scope: MR9 Fullscreen Activation FX · Checkpoint C only (subtle organic
whole-field deformation + compact soft local hot core of the Checkpoint B
travelling field). No Checkpoint D/E, no Lens Distortion, no Noise Dissolve, no
Edge Chase, no full activation grammar.

## 1. Baseline diagnosis (visual, before this round)

Checkpoint B is the accepted baseline: broad blue/cyan cool body as the primary
spatial volume, narrow warm frontier, local hot core, lower-left → upper-right
sweep, strong dark contrast. Evidence: `mr9-checkpoint-b-moving.png`,
`mr9-checkpoint-b-moving-later.png`, `mr9-checkpoint-b-reduced.png`.

Visual review of the Checkpoint B captures against the three Paper material
screenshots (learn thermal softness, organic continuous deformation, and
cool/warm continuity ONLY; not diamond/logo geometry, fixed masks, or outline
lighting) identified two remaining deviations:

1. **Hard elongated white core.** The pale hot core read as a bright, narrow,
   lens-shaped white slit/lozenge embedded in the warm band. Paper's material
   shows a soft local peak with smoothly blended gradients, no sharp internal
   hotspot.
2. **Frontier too smooth/parallel.** The warm frontier was a clean near-straight
   diagonal; Paper's field undulates and swells organically. Checkpoint B's
   bend (`(noise(pos*1.4 + front*3.0) - 0.5) * 0.16`) scrolled with the front
   at 3× rate (fast, chattery) and only locally wiggled the warm line.

### Lead review of the first Checkpoint C attempt

The first core retune (a screen-space-isotropic gaussian, decay 34, weight
0.95) was REJECTED by Lead visual review: it produced a huge pale-white
teardrop occupying a large part of the frontier/body (~0.5 × 0.33 of the
surface) and a large pale/warm mass clipped at the top/right edge in the
near-takeover capture. Root causes, in order of importance:

- **Weight too high (0.95)** made the pale ramp stop reachable across a broad
  gaussian footprint instead of a compact cap.
- **Gaussian too broad (decay 34)** gave the footprint too large a radius.
- **A mid-retune also exposed a coordinate bug:** a core written as
  `exp(-along²·σa - d²·σd)` with `along = dot(q - frontPoint, DIR)` is NOT a
  2D gaussian — `d = dot(q, DIR) - front + bend = along + bend(q)`, so `along`
  and `d` are the same axis. That degeneracy turned the core into a 1D ridge
  with no cross-front extent (a long pale band). The correct tangent axis is
  the front-perpendicular `perp = (-DIR.y, DIR.x)`.

## 2. What changed (all inside the existing scalar field)

All changes are inside `heatmapOutput` in the single fragment program of
`src/presentation/main-window/ExpandedPresentationSurface.tsx` (plus two source
assertions in `expandedPresentationSurface.test.ts`). No new authority, no new
dependencies, no second canvas/renderer/host, no Lab state/runtime/locale
change. The `heatmap?: boolean` prop, `uHeatmapMode` gate, bounded one-rAF
scheduling, and Reduced Motion static-snapshot behavior are untouched.

### 2a. Whole-field deformation (multi-scale, very low frequency, slow) — ACCEPTED AS-IS

The single signed distance `d = p - front + bend(q)` is still the one deformed
field that drives **body**, **warm frontier**, and the **core** — they all
follow the same bend, so the whole field deforms coherently (not merely the
orange line). The bend is two very low-frequency scales that evolve slowly and
independently of the travelling front:

```glsl
float heatmapBend(vec2 pos, float front, float time) {
  float swell = heatmapNoise(pos * 0.8 + vec2(time * 0.09, -time * 0.05)) - 0.5;
  float curl  = heatmapNoise(pos * 1.6 + vec2(-time * 0.04, time * 0.07)) - 0.5;
  return swell * 0.13 + curl * 0.05;
}
```

- **Low frequency:** the whole surface spans ≈1.1 cells of `swell` and ≈2.2
  cells of `curl` — a broad swell plus one restrained secondary curl, an
  organic S-shaped body, not a high-frequency wobble.
- **Slow:** the noise lattice drifts at ~0.05–0.09 units/s (a fraction of one
  cell per ~7.7 s sweep) instead of chattering with the front (Checkpoint B
  scrolled at 3× front rate ≈ 0.85 units/s).
- **Bounded:** `|swell|,|curl| ≤ 0.5` ⇒ `|bend| ≤ 0.09` (0.5·0.13 + 0.5·0.05)
  in diagonal units.
- **Reduced Motion:** `time` is pinned to 0 ⇒ the deformation is a fixed static
  snapshot (no travelling frames; runtime zero-loop behavior unchanged).

### 2b. Compact soft local hot core (final retune)

Checkpoint B's core was an elongated slit because the pale ramp stop (heat ≥
0.78) was only reachable where the **narrow** warm band overlapped a small
bump, stretched along the front. The final Checkpoint C core is a 2D gaussian
in the two genuinely independent field coordinates — the front-tangent offset
and the **deformed signed distance** `d` — with isotropic decay and a moderate
weight so the pale threshold is reached only in a compact local area:

```glsl
vec2 frontPoint = DIR * front;
float alongFront = dot(q - frontPoint, vec2(-DIR.y, DIR.x)); // front tangent
float core = exp(-alongFront * alongFront * 200.0 - d * d * 200.0);
...
float heat = (body * 0.44 + warm * 0.22 + core * 0.55) * energy;
```

- **Seated on the bent front by construction:** the across-front axis is the
  deformed signed distance `d` (d = 0 is the deformed front), so the peak
  center always sits on the visible warm line regardless of the local bend;
  no fixed geometry or mask, and it can never sit detached in the void ahead.
- **Compact pale cap:** decay 200 + weight 0.55 reach the pale stop only in a
  small round area — measured pale-white cap ≈ 0.8–0.9 % of the surface AREA,
  with a linear extent of roughly 45 × 60 px (≈ 6 × 7 % of the 804 px frame)
  — plus a small bright center dot (heat clamps ≥ 1.0 only within ~0.03 of the
  peak).
- **Broader warm/cyan feather:** the falloff passes through orange
  (≈ 0.15–0.20 of the frame), yellow-green, then teal/cyan into the cool body —
  a soft local peak with a small cap and a wider warm/cyan halo, exactly the
  Paper material feel.
- **Softly oval, not a slit:** the cap is round in (tangent, deformed-normal)
  coordinates; on-screen it is a gently rotated oval (a diagonal orientation
  inflates its axis-aligned pixel bounding box to ~81–83 × 114–117 px
  (≈ 10 × 14 % of the 804 px frame), but the true white region's linear extent
  is only ~45 × 60 px (aspect ≈1.3:1), not a thin slit).
- **Transient:** it rides the travelling front and fades with the energy
  envelope (appears mid-sweep, gone by dissipation).

The color ramp, alpha mapping, grain, energy envelope, front/direction/timing,
and Reduced Motion phase pin (k = 0.42) are unchanged from Checkpoint B.

## 3. Paper reuse / license determination

**Clean-room; no upstream source copied or adapted.**

The field remains an analytic plane front + multi-scale value-noise bend +
2D gaussian peak built from the existing sine-free hash. No Paper expression,
helper, uniform, texture channel, `ShaderMount`/`ShaderSizing` runtime, or
React mount is present. The only shared high-level ideas remain "scalar heat →
thermal color ramp" and "soft organic material", which are unprotectable visual
techniques, not copyrightable expression.

Therefore no Apache-2.0 LICENSE / NOTICE / attribution / modification-marker
obligation is triggered. If a later slice copies any Paper GLSL, the existing
gate stands: add the Apache-2.0 LICENSE text + NOTICE attribution + prominent
modification marker in the shader before shipping.

## 4. Checkpoint B → C comparison (measured on-screen captures)

| Aspect | Checkpoint B | Checkpoint C |
| --- | --- | --- |
| Cool body | broad cyan/blue primary mass | unchanged — broad cool mass remains the primary spatial volume |
| Warm frontier | clean near-straight diagonal | organic curved front, bulges/pinches around the core and swells with the slow bend; still narrow (≈3.5–5.9 % of frame) |
| Hot core | narrow hard white slit/lozenge | compact soft local peak — small pale cap (~0.8–0.9 % area) + broader warm/cyan feather |
| Dark areas | directional ahead-void | unchanged — strong dark contrast retained (~23–24 % of frame) |
| Field shape | one banded diagonal body | same band, now whole-field deformed (S-shaped, slowly undulating) |
| Motion | band sweeps, bend scrolls fast | coherent sweep + slow whole-field deformation |

Captures (all `[data-lab-preview-frame]` at 4× DPR, DOM overlays hidden for
field isolation, same pipeline as Checkpoint B):

- `mr9-checkpoint-c-moving.png` — k≈0.31 mid-sweep: band crosses the surface,
  cool body behind, compact soft pale peak on the front, dark void ahead.
- `mr9-checkpoint-c-moving-later.png` — k≈0.48 near-takeover: cool body covers
  most of the surface, warm frontier receded to the upper-right, compact pale
  peak fully inside the frame (measured pale bbox (667,135)–(748,251), NOT
  clipped; only the narrow frontier ribbon itself crosses the frame edge).
- `mr9-checkpoint-c-reduced.png` — Reduced Motion static mid-sweep snapshot
  (k = 0.42), deformation frozen, compact pale peak fully inside.

Objective pixel measurements across all three captures: pale-white cap area
0.82–0.90 %, warm/frontier 3.5–5.9 %, cool body ≈46 %, dark ≈24 %; no pale
mass touches any frame edge (clipped = false in every capture). The two moving
captures show the warm/core pixel buckets shifting between phases (field
animates coherently); the reduced snapshot is byte-identical across 500 ms
(static, no travelling loop).

## 5. Validation results

- Focused Vitest (all 58 pass, unchanged count; source assertions extended):

```powershell
npx vitest run src/lab/scenarios.test.ts `
  src/presentation/main-window/expandedPresentationRuntime.test.ts `
  src/presentation/main-window/expandedPresentationSurface.test.ts `
  src/lab/rendererReuse.test.ts
```

- `npm run type-check` → PASS (tsc --noEmit + tsconfig.electron.json).
- `npm run lint -- --quiet` → PASS (0 problems).
- `git diff --check` → clean (no whitespace errors).
- No `package.json` / `package-lock.json` change.
- One-off Browser Lab capture harness (temporary, since deleted) — 17/17 checks
  on the final retune:
  - exactly one `<canvas>`, production WebGL2 program linked, no page errors;
  - `uHeatmapMode=1` / `uReducedMotion=0` moving, `=1`/`=1` reduced;
  - moving: `uTime` advances between frames (continuous bounded one-rAF);
  - moving: dark / cool / warm / pale-core pixel buckets all present at k≈0.31
    (core bucket 0.8 % — compact);
  - moving: warm/core buckets shift between k≈0.31 and k≈0.48 (coherent motion);
  - reduced: `uTime` unchanged across 500 ms (no travelling rAF loop) and
    identical warm/core/cool buckets across 500 ms (static).
- Source/composition: one canvas, one `gl.drawArrays`, one `uHeatmapMode` gate
  in the one fragment program (asserted in `expandedPresentationSurface.test.ts`);
  runtime scheduling tests confirm heatmap animates with ≤1 pending frame and
  Reduced Motion heatmap schedules zero frames.

## 6. Honest acceptance assessment

Fulfilled (final retune):

- Whole-field deformation is accepted as-is: subtle, organic, very low
  frequency, slow, bounded (±0.09), acting on the one deformed signed
  distance so body/frontier/core all bend coherently ✓
- The elongated white slit / the rejected huge teardrop is now a COMPACT soft
  local peak: small pale cap (~0.8–0.9 % of surface) with a broader warm/cyan
  feather, softly oval, no fixed geometry or mask ✓
- No clipped pale/warm mass in any capture (frontier ribbon crosses the frame
  normally; the pale cap is fully inside, including the near-takeover shot) ✓
- Broad blue/cyan body remains the primary mass (≈46 %); warm frontier stays
  narrow (≈4–6 %); strong dark contrast retained (≈24 %) ✓
- Reduced Motion remains a static snapshot with zero continuous rAF ✓
- Clean-room; no Paper source copied; no license obligation triggered ✓

Known limitations / open items (for later slices):

1. **The pale cap reads slightly larger to the eye than its true area.**
   Measured pale-white AREA is only ~0.8–0.9 % of the surface, but the
   diagonal orientation makes its axis-aligned pixel bounding box
   ~81–83 × 114–117 px (≈ 10 × 14 % of the 804 px frame), and the surrounding
   orange/cream ring can read as part of the "hot mass" when scanning quickly.
   If a later slice wants it even smaller/lighter, raise the core decay above
   200 or lower the weight below 0.55; both trade off the peak's visibility.
2. **Headless SwiftShader alpha compositing quirk** (inherited from Checkpoint
   B): low-alpha bright content composites dimmer in the capture pipeline than
   the shader's designed alpha; the field is tuned so captures show the
   intended material. A real-GPU re-verify and `heatAlpha` re-tune remain for a
   later slice.
3. **One continuous phase is still not a real activation grammar.** Checkpoint
   D/E (ignition → sweep → edge capture → chase → closure → dissipation as a
   state machine, origin-local ignition, surrounding grammar) remain
   unimplemented by design.
4. The progress ring underlay and heatmap-vs-progress composition remain a
   later-slice concern; the progress DOM/circular arc path is untouched.

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

- `research/mr9-checkpoint-c-moving.png` (k≈0.31, mid-sweep)
- `research/mr9-checkpoint-c-moving-later.png` (k≈0.48, near-takeover)
- `research/mr9-checkpoint-c-reduced.png` (reduced-motion snapshot)

(On-screen canvas captures at 4× DPR, DOM overlays hidden for field isolation;
same pipeline as the retained Lab reference harness.)

Note: the retained `run-browser-lab-validation.mjs` reference harness currently
fails before the heatmap section because the Lab's activation-preset buttons
carry no `data-lab-preset` attribute in the preserved dirty worktree (pre-existing
drift, not caused by this round). The heatmap path itself was validated by the
temporary harness above plus the focused Vitest suite.

## 8. Files touched this round

- `src/presentation/main-window/ExpandedPresentationSurface.tsx` — heatmap
  field: multi-scale low-frequency slow whole-field bend (accepted) + compact
  2D-gaussian soft local core in (front-tangent, deformed signed distance),
  all inside the existing lab-gated `heatmapOutput`; spike header comment
  updated (clean-room statement preserved).
- `src/presentation/main-window/expandedPresentationSurface.test.ts` — added
  four source assertions for the deformed-signed-distance invariant, the
  multi-scale bend, and the front-tangent/deformed-d core.
- `research/mr9-checkpoint-c-moving.png`,
  `research/mr9-checkpoint-c-moving-later.png`,
  `research/mr9-checkpoint-c-reduced.png` — new captures (Checkpoint B
  screenshots kept for comparison).

Removed (not retained): `research/run-mr9-checkpoint-c.mjs` and transient
debug crops/probes — the one-shot capture harness was deleted after use;
screenshots and validation results above remain valid evidence.

No commit was made; the diff is left for review. Production behavior is
unchanged (heatmap defaults off, lab-gated).
