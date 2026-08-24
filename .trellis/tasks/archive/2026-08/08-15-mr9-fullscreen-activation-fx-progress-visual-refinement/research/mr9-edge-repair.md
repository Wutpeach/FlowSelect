# MR9 Edge Repair: Accepted Motion Baseline + Material/Palette/Edge Repair

**Date**: 2026-08-20 (third-replacement worker, worktree `mr9-fullscreen-activation-fx`)
**Status**: HARD STOP — final prototype of this bounded task. No further tuning round.
**Scope**: restore the archived Checkpoint B/C + Rounded Boundary Edge Capture motion
grammar exactly; apply one narrow, color-only Paper-inspired material/palette/edge
repair; finish with real captures + terminal evidence; verdict below.

---

## 1. Task framing and boundary compliance

- **No mechanics research.** No Chase/Closure/Lens/Noise machinery was introduced.
- **One canvas / one program / one draw.** The restored heatmap is fully analytic;
  the renderer allocates no texture, no preprocessing pass, no framebuffer.
- **No texture if analytic baseline.** `boundTexture2D=false`, `framebufferBound=null`
  verified live (see §6).
- **Honest licensing.** The rejected literal/latent-carrier prototypes were the
  only Paper-adapted sources; they were removed, not shipped. Current spike is a
  clean-room analytic field. `THIRD_PARTY_NOTICES.md` rewritten to state this
  explicitly (see §7).
- **Preserve prior research.** All archived spike evidence, checkpoints, sims, and
  the rejected-candidate captures remain untouched under `research/`.
- **No reset/revert, no out-of-scope edits.** Only the spike files changed.

## 2. Baseline proof (motion/contact grammar restored verbatim)

The unique user-accepted motion (from `paper-shaders-heatmap-checkpoint-b.md`,
`paper-shaders-heatmap-checkpoint-c.md`, `mr9-rounded-boundary-edge-capture-spike.md`)
is a Checkpoint B/C travelling diagonal surface heat with a **rounded-boundary edge
capture**. The literal-fidelity and latent-carrier candidates were rejected; this
worker abandoned them and restored the exact grammar. The restored shader
(`src/presentation/main-window/ExpandedPresentationSurface.tsx`,
`heatmapOutput`) is source-asserted by tests to contain, verbatim:

| Motion/contact element | Constant / formula (asserted in tests) |
|---|---|
| Travelling front phase | `k = reducedMotion ? 0.42 : fract(t * 0.13)` (one continuous phase, ~7.7 s) |
| Front position | `front = mix(-0.58, 1.6, k)` |
| Sweep direction (field) | `DIR = vec2(0.8235, 0.5674)` = `normalize(0.90, 0.62)`, lower-left → upper-right |
| Reduced-motion pin | `bendTime = 0.0`, `k = 0.42` → static snapshot, no travelling frames |
| Cool body | `body = exp(-behind * 1.1) * (1.0 - smoothstep(0.0, 0.05, d))` |
| Warm frontier | `warm = exp(-abs(d + 0.018) * 30.0)` |
| Compact core | `core = exp(-alongFront^2 * 200.0 - d^2 * 200.0)` |
| Energy gate | `energy = smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.66, 0.99, k))` |
| Rounded boundary | analytic rounded-rect SDF, corner `16/200 = 0.08` (real Main Window shell) |
| Boundary band | `boundaryBand = smoothstep(-0.05, 0.0, bd) * step(bd, 0.0)` |
| Edge capture | `capture = boundaryBand * warm * 0.6` (contact-gated, localized) |
| Composition | `heat = (body*0.44 + warm*0.22 + core*0.55 + capture) * energy` |

Field coordinate is the centered `q = uv - 0.5` (fixed critical bug in earlier
spike attempts). Geometry verified against archived `mr9-edge-*` grids: the field
enters the left edge, sweeps diagonally, and exits the upper-right.

**Rejected candidates are absent from active source** — tests assert the host does
not contain `u_heatmapBoundary`, `blurGray`, `multiPassBlurGray`,
`rasterizeHeatmap`, `latentCarrier`, `rimEdgeFade`, `shadowShape`, or a
`MODIFIED DERIVATIVE of Paper Shaders` claim.

## 3. Material / palette / edge repair (one narrow, color-only change)

The repair is purely a material/palette layer that *consumes* the restored scalars
and never touches the motion/contact formulas:

1. **Palette — 7-stop ramp, no white core, no green/teal cast**:
   `dark navy (0.010,0.014,0.045) → deep blue (0.035,0.090,0.360) → vivid blue
   (0.080,0.220,0.680) → light blue/cyan (0.090,0.400,0.940) → golden yellow
   (1.000,0.800,0.200) → orange (1.000,0.540,0.140) → red-orange (1.000,0.340,0.090)`.
   The max ramp value is red-orange; nothing ramps to white.
2. **Broader cool halo** (`coolLift = body * (1 - smoothstep(0.20,0.85,warm)) * 0.18 * energy`):
   lifts the swept cool mass toward light blue/cyan, gated away from the warm
   frontier so the front keeps a clean yellow → orange transition.
3. **Clearer yellow transition** (`hotLift = warm * 0.20 * energy` plus a
   `yellowZone` green-channel pull toward golden yellow): the cyan → yellow zone
   reads golden-yellow instead of muddy olive.
4. **Contact-gated edge treatment** (never a perimeter): the localized capture
   keeps its inward-thick warm compression (`capture` already feeds `heat`) and
   gains a soft inward cool halo just inside the contact
   (`inwardCool = contact * smoothstep(-0.16,-0.05,bd)`, mixed toward
   `(0.160,0.520,0.900)` at 0.35). No outline, decorative glow, or perimeter
   coordinate is used.

## 4. Source / material changes vs the removed prototypes

- **Removed** (with the abandoned literal/latent-carrier candidates):
  `u_heatmapBoundary` sampler, `latentCarrier`, `rimEdgeFade`, `blurGray` /
  `multiPassBlurGray` boundary-texture preprocessing, `rasterizeHeatmap*`
  texture builders, and the renderer-owned texture lifecycle.
- **Added**: clean-room analytic helpers `heatmapNoise` (sine-free value noise),
  `heatmapBend` (multi-scale very-low-frequency deformation, Checkpoint C 2a),
  `heatmapGrainHash` (subtle sine-free grain), `roundedBoundary` (rounded-rect
  SDF at the real 200×200/16 px shell), and the repaired `heatmapOutput`.
- The runtime (`expandedPresentationRuntime.ts`) keeps the lab-gated `heatmap`
  flag that schedules bounded frames only when set; Reduced Motion schedules no
  frames and renders a static snapshot.

## 5. Evidence paths

Captures and harness (relative to
`.trellis/tasks/08-15-mr9-fullscreen-activation-fx-progress-visual-refinement/`):

- **Harness**: `research/capture-mr9-edge-repair.mjs` (polls `uTime` to hit
  exact `k` phases; `backingScale=4` → 800×800 backing, one canvas).
- **Chronological frames** (200×200/16 px window, 201×201 analysis grid):
  `research/mr9-edge-repair/evidence/repair-pre-contact.png` (k≈0.026),
  `repair-first-contact.png` (k≈0.098), `repair-developed.png` (k≈0.249),
  `repair-developed-later.png` (k≈0.347), `repair-late-sweep.png` (k≈0.498),
  `repair-reduced.png` (k=0.42, frozen).
- **Terminal readouts**: `research/mr9-edge-repair/evidence/capture-log.json`
  and `analysis.json`.
- **Comparison sheets**: `research/mr9-edge-repair/repair-contact-sheet.png`,
  `baseline-vs-repaired.png`, `failed-vs-repaired.png`, `paper-vs-repaired.png`.
- **Analyser**: `research/analyze_edge_repair.py` (fixed luminance scaling;
  classifies inside/boundary pixels into dark/cool/warm/hot).

## 6. Terminal evidence (live WebGL readouts)

- `canvasCount = 1`, program `linked = true`, `heatmapMode = 1` when spike on.
- `cornerRadius = 0.07999999821186066` (16/200) — real rounded shell.
- `boundTexture2D = false`, `framebufferBound = null` — analytic, no texture.
- **Fresh default Progress** (spike never opened): `heatmapMode = 0`, no bound
  texture, no framebuffer — production path untouched.
- **Moving**: `uTime` advances continuously (delta matches wall clock).
- **Reduced Motion**: `uTime` frozen (`t1 === t2` across 500 ms), `k = 0.42`.
- **Page errors**: only the pre-existing React `borderColor` shorthand style
  warnings; no shader compile/link errors, no WebGL errors.
- **Boundary contact is localized, never a perimeter** (per `analysis.json`,
  7460 boundary pixels): warm boundary fraction = **0.0 % pre-contact** →
  **12.4 % at first contact** → 8.3 % / 8.8 % / 11.4 % / 10.3 % through the
  sweep and reduced frames. `max_brightness` caps at **0.8** in every frame
  (no white core).

## 7. Licensing status (honest)

- Current spike is **clean-room**: plane front + value-noise bend + rounded-rect
  SDF + 2D gaussian core + 7-stop ramp. It shares only the unprotectable
  high-level idea of “scalar heat → thermal color ramp” with Paper Shaders.
- The earlier literal-fidelity / core-removal / latent-carrier prototypes were
  rejected and their Paper-adapted helpers were **removed**; they survive only as
  historical evidence under `research/`.
- `THIRD_PARTY_NOTICES.md` rewritten: header now states *“no active Paper-derived
  source shipped”*, documents the clean-room status, lists the removed
  preprocessing as historical research only, and keeps the Apache-2.0 text +
  Paper NOTICE for attribution. No `MODIFIED DERIVATIVE` claim remains.
- Root project license stays MIT (asserted by test).

## 8. Validation

- `npm run type-check`: pass.
- `npm run lint -- --quiet`: pass.
- `git diff --check`: clean (only pre-existing CRLF warnings).
- Focused tests: `src/presentation/main-window` + `src/lab` — **25 files /
  248 tests pass**, including the new heatmap test block (exact baseline
  constants, rejected-candidate absence, material layering, reduced-motion pins,
  one-canvas/no-texture, honest license notices).
- Full suite: **1766 / 1767 pass**. The single failure is the pre-existing,
  out-of-scope `browser-extension/architecture-guard.test.js:277` source-shape
  assertion that reproduces unchanged on the clean MR8 baseline (no
  browser-extension file is modified by this task); it does not block MR9.
- Visual (direct image inspection): see §9.

## 9. Visual verdict — explicit accept/reject

Judgment is from **direct inspection of the captured PNGs** (contact sheet,
comparison sheets, and individual 800×800 frames), not from the analysis script
alone.

- **Motion preservation — ACCEPT.** The repaired column matches the archived
  Checkpoint B/C grammar: same diagonal sweep (field lower-left → upper-right),
  same cool body + narrow warm frontier + compact core structure, same energy
  gating (absent pre-contact, strong mid-sweep, fading late), same localized
  boundary contact points migrating along the diagonal.
- **Palette improvement — ACCEPT.** Blue body is distinctly saturated blue (not
  grey/teal); clean golden-yellow → orange → red-orange leading edge; no green/
  olive cast; no white core (`max_brightness` 0.8 and visually the hottest
  region is red-orange).
- **Localized edge treatment — ACCEPT.** Contact is a short localized arc where
  the front meets the rounded boundary (first contact ~45–55 px down the left
  edge), with an inward-thick cool halo just inside the contact; the rest of the
  perimeter stays dark. Boundary warm fraction stays 8–12 %, never a ring.
- **Absence of internal objects / inset domains / full perimeter — ACCEPT.**
  No internal geometry, no inset domain, no full-perimeter heating in any frame.
- **Clean-room vs Paper — ACCEPT (visual).** No Paper logo/diamond shape, no
  inner silhouette, no Apple contour; plain rounded-rect window, analytically
  smooth field.

**Overall: ACCEPT.** This is the final prototype for this bounded task.

## 10. Remaining differences vs Paper reference (informational, not blockers)

- Pre-contact is nearly dark with only a faint cool blue (deliberate: the energy
  gate and honest field entry; Paper glows earlier).
- The warm band shows localized width/bulge variation along the front (smooth
  field variation, not copied geometry).
- Late-sweep/reduced frames are predominantly cool blue with a partial warm edge
  at the upper-right contact (the front has left the window); this matches the
  accepted baseline sweep, not Paper’s full-frame symmetric look.
- No white-hot peak and no Paper-style full-frame glow — intentional per the
  repair brief (no white core).

## 11. Hard stop / no-commit

This is the end of the bounded first prototype round. No further tuning round was
entered. **No commit was made** — all changes remain as working-tree diffs for
Lead/user review. No out-of-scope files were edited.
