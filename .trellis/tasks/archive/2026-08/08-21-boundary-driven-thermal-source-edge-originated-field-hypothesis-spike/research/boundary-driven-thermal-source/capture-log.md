# Boundary-Driven Thermal Source — Browser Capture Log

Author: Orca worker x4355jcnfl4kfwjp4fa8gcp5
Worktree: `D:\Ameow\.cindy-worktrees\mr9-fullscreen-activation-fx`
Harness: standalone WebGL2 evaluate-based renderer on a CDP-controlled Edge tab (about:blank),
embedding the exact `heatmapOutput` source (with new `sourceInfluence` grammar) verbatim from
`src/presentation/main-window/ExpandedPresentationSurface.tsx`. Lab navigation was policy-blocked
and `bash`/node/playwright were unavailable in this session, so this standalone harness is the
Browser-Lab adaptation used for phase evidence. Time pinning follows the archived
`capture-thermal-refraction.mjs`: `uTime = k / 0.13`, `k = fract(t*0.13)`, RM pins `k = 0.42`.

Phases: before-entry (k=0.00), first-contact (k=0.03), mid-ramp (k=0.15), developed-early (k=0.31),
developed-middle (k=0.42), developed-late (k=0.53), near-exit (k=0.65), post-boundary (k=0.84),
exact-zero (k=1.00), plus reduced-motion (k=0.42, bendTime=0).

Metrics: luminance = 0.2126R+0.7152G+0.0722B (0..255). activeFraction = fraction of in-window
pixels with L>8. quads = mean L per quadrant in readPixels order [LL, LR, UL, UR]. bands = mean L
per 0.2-wide xi bin along DIR (xi = dot(q, DIR)), bins xi in [-0.8,-0.6]..[0.6,0.8] — bin 0 is the
lower-left diagonal end, bin 7 the upper-right diagonal end. Window = rounded rect, corner 0.08.

## 1. Compile/link status

Both pre-repair and post-repair fragments compile and link clean under WebGL2 (SwiftShader):
`vsOk=true fsOk=true linkOk=true`, empty info logs.

## 2. Influence envelope (sourceInfluence rendered as gray; unchanged by the warm repair)

16x16 luminance grid ×100 at each k (row 0 = lower-left, row 15 = upper-right):

| phase | envelope read |
|---|---|
| k=0.03 | exactly one cell ~1 at the lower-left corner; everything else 0 → first contact is a localized lower-left rounded-corner onset |
| k=0.15 | smooth monotonic ramp 63→0 along the diagonal (no hard edge); a broad soft entry ramp, not a wipe |
| k=0.31 | min 53 (far UR corner) everywhere else ≥65; ≥90 across ~85% of the window |
| k=0.42 / RM | 95..100 across the whole window → developed full-surface, near-uniform influence |
| k=0.53 | mirror of 0.31 (min 48 at LL corner) |
| k=0.65 | mirror of 0.15 (ramp 0→80 along the diagonal) |

Topology-only (influence forced 1) at k=0.42 spans luminance 22..80 — the diagonal luminance
variation in developed frames is largely the accepted 2D topology's own distribution, not the
influence envelope.

## 3. Pre-repair composite captures (Refraction ON) — REJECT: thin diagonal warm strip

| phase | active | meanL | quads | bands |
|---|---|---|---|---|
| before-entry | 0.0000 | 2.21 | [2.22,2.20,2.21,2.21] | all ≈2.2 |
| first-contact | 0.0000 | 2.21 | [2.24,2.20,2.21,2.21] | band0=2.75 only |
| mid-ramp | 0.6337 | 31.76 | [78.82,15.55,29.52,3.15] | [124.1,105.1,71.6,28.6,9.3,2.8,2.2,2.3] |
| developed-early | 1.0000 | 114.79 | [157.55,119.65,120.99,60.97] | [169.1,175.5,176.8,122.0,92.6,67.3,67.4,59.6] |
| developed-middle | 1.0000 | 118.40 | [156.58,128.76,124.59,63.66] | [175.6,179.1,174.4,119.3,107.1,71.3,68.8,64.9] |
| developed-late | 1.0000 | 103.45 | [123.82,125.70,98.75,65.52] | [108.2,133.7,142.5,104.8,96.2,76.5,68.0,71.9] |
| near-exit | 0.8645 | 35.71 | [8.48,51.03,24.01,59.31] | [2.2,3.3,10.9,22.9,46.0,63.0,69.4,80.5] |
| post-boundary | 0.0000 | 2.21 | [2.21,2.20,2.21,2.21] | all ≈2.2 |
| exact-zero | 0.0000 | 2.21 | [2.21,2.20,2.21,2.21] | all ≈2.2 |
| reduced-motion | 1.0000 | 120.51 | [161.21,119.33,140.96,60.52] | [160.5,169.2,180.3,129.2,110.2,67.5,63.7,70.2] |

Visual (400px developed-middle): "a narrow bright yellow diagonal streak … a noticeable thin band"
→ **pre-repair REJECT: visible thin diagonal warm strip** (interior source marker from `warm2*0.18`
in `material2` plus baseline warm 0.22/0.20).

Evidence screenshots:
- 9-phase contact sheet: `C:\Users\Administrator\AppData\Roaming\CindyGlobal\browser-runtime\media\browser\6440df445828ccc8.png`
- developed-middle 400px (strip visible): `...\browser\f6fa34636efcc137.png`

## 4. Repair applied (minimal, reversible, single pass)

- baseline interior warm: `heat` warm term 0.22 → **0.10**; `hotLift` 0.20 → **0.08**
- Refraction `env` warm term 0.40 → **0.25** (weak envelope)
- `material2` interior `warm2` 0.18 → **0.06** (the strip's material bias)
- unchanged: sourceInfluence support/path, RM authority, 2D topology, palette, grain, Refraction
  strength/direction, boundary contact/capture, coolMass front-suppression design.

## 5. Post-repair composite captures (Refraction ON) — PASS on the re-shot sequence

| phase | active | meanL | quads | bands |
|---|---|---|---|---|
| before-entry | 0.0000 | 2.21 | [2.21,2.22,2.21,2.20] | all ≈2.2 |
| first-contact | 0.0000 | 2.21 | [2.23,2.22,2.21,2.20] | band0=2.76 only |
| mid-ramp | 0.6349 | 31.76 | [78.80,15.56,29.52,3.14] | [124.1,105.1,71.6,28.6,9.3,2.8,2.2,2.3] |
| developed-early | 1.0000 | 114.81 | [157.63,119.66,120.99,60.96] | [170.4,175.6,176.7,122.0,92.6,67.3,67.4,59.5] |
| developed-middle | 1.0000 | 115.49 | [156.41,126.47,116.59,62.49] | [175.6,179.1,174.3,116.8,97.5,71.1,68.8,64.8] |
| developed-late | 1.0000 | 103.43 | [123.82,125.70,98.74,65.45] | [108.3,133.7,142.5,104.8,96.2,76.5,68.0,70.2] |
| near-exit | 0.8642 | 35.70 | [8.48,51.04,24.01,59.29] | [2.2,3.3,10.8,22.9,46.0,63.0,69.3,80.4] |
| post-boundary | 0.0000 | 2.21 | [2.21,2.22,2.21,2.20] | all ≈2.2 |
| exact-zero | 0.0000 | 2.21 | [2.21,2.22,2.21,2.20] | all ≈2.2 |
| reduced-motion | 1.0000 | 118.09 | [161.07,114.14,138.09,59.04] | [160.5,169.2,180.2,128.2,101.3,67.2,63.7,70.1] |

Void equivalence: before-entry / post-boundary / exact-zero are pixel-identical (meanL 2.21,
minL 1.08, maxL 3.36 — same values to 2dp in all three phases).

Visual (400px developed-middle): full-surface smooth multicolored material; **no thin diagonal
filament/band**; warm colors are broad blended lobes; no hard edges, no isolated dots.

Evidence screenshots:
- 9-phase contact sheet: `...\browser\208074e0a7eb02d7.png`
- developed-middle 400px (clean): `...\browser\ab36b2e001c35e25.png`

## 6. Post-repair baseline (Refraction OFF) — known residual marker in the fallback path

| phase | active | meanL | quads | bands |
|---|---|---|---|---|
| before-entry | 0.0000 | 2.21 | [2.21,2.22,2.21,2.20] | all ≈2.2 |
| first-contact | 0.0000 | 2.21 | [2.22,2.22,2.21,2.20] | band0=2.39 only |
| mid-ramp | 0.5003 | 13.65 | [32.76,7.03,12.02,2.78] | [62.7,45.9,26.0,12.3,5.4,2.5,2.2,2.3] |
| developed-middle | 0.9937 | 139.96 | [157.46,122.04,128.39,151.96] | [140.2,151.8,160.2,150.9,**87.4**,163.3,156.7,147.3] |
| near-exit | 0.7033 | 24.13 | [4.75,24.50,14.33,52.93] | [2.2,2.5,5.0,11.0,24.9,47.8,69.6,63.3] |
| exact-zero | 0.0000 | 2.21 | [2.21,2.22,2.21,2.20] | all ≈2.2 |

Visual (180px developed-middle, Refraction OFF): "a distinct narrow diagonal feature … a thin dark
band with bright blue edges" crossing the interior. This is the warm-contour trough in the
no-refraction fallback: the accepted `coolMass` front-suppression
(`sourceInfluence * (1 - smoothstep(0.12,0.45,warm))`) drops coolMass to ~0 at the source contour,
and the reduced warm terms (0.10+0.08) no longer back-fill the material at the contour. Root cause
is the suppression window, not the warm bias per se. Not a wipe/fade/blob; it is an interior
source marker in the fallback only. Reported honestly for the Lead's decision; no second repair was
made (per instruction).

Evidence screenshot: `...\browser\f7636eea25c8821e.png`

## 8. ROUND 3 (FINAL) — Lead decision: remove the coolMass interior warm-suppression

Lead ruling: the baseline trough is unacceptable (still a visible source marker, violates AC4);
spike scope is NOT narrowed to Refraction-only. Final minimal repair: `coolMass = sourceInfluence`
(no warm suppression), and warm is excluded from the baseline interior material entirely:
`heat = coolMass * 0.44 + capture`, `coolLift = coolMass * 0.18` (no warm window),
`hotLift` removed, `material = clamp(heat + coolLift, 0, 1)` = `sourceInfluence * 0.62` uniform in the
interior. warm now acts ONLY as: boundary contact (`capture`/`contact`/`inwardCool`), the weak
Refraction envelope (`env` warm·0.25), and the Refraction `warm2`·0.06 — never baseline interior
material. sourcePosition/support, 2D topology, palette, grain, Refraction strength/direction, RM,
void alpha floor unchanged.

Compile/link: PASS (WebGL2). Same 6-phase capture, BOTH paths:

### Refraction OFF (baseline) — no interior marker

| phase | active | meanL | minL | maxL | quads | bands |
|---|---|---|---|---|---|---|
| before-entry | 0.0000 | 2.21 | 1.08 | 3.36 | [2.21,2.22,2.21,2.20] | all ≈2.2 |
| mid-ramp | 0.5003 | 13.65 | 1.08 | 69.31 | [32.76,7.03,12.02,2.78] | [62.7,45.9,26.0,12.3,5.4,2.5,2.2,2.3] |
| developed-middle | 1.0000 | 160.77 | 115.10 | 205.52 | [156.8,163.5,163.1,159.7] | [140.2,151.8,160.0,163.5,163.5,162.0,156.7,147.3] |
| near-exit | 0.7033 | 24.13 | 1.08 | 75.48 | [4.75,24.50,14.33,52.93] | [2.2,2.5,5.0,11.0,24.9,47.8,69.6,63.3] |
| exact-zero | 0.0000 | 2.21 | 1.08 | 3.36 | [2.21,2.22,2.21,2.20] | all ≈2.2 |
| RM | 1.0000 | 160.89 | 115.10 | 204.80 | [156.8,163.6,163.3,159.9] | [141.0,152.1,160.0,163.6,163.5,162.2,157.2,148.0] |

Developed-middle band profile is now smooth and monotonic (140→152→160→163→163→162→157→147)
with NO dip at the warm contour; quadrants near-uniform (157–163). Visual: "smooth, uniform
tan/beige interior; no visible diagonal dark/bright stripe or line crossing the interior";
localized orange/red boundary-contact glow at the real rounded edges (intended).
Evidence: `...\browser\ea4a08b7855b6b95.png`

### Refraction ON — unchanged and clean

| phase | active | meanL | minL | maxL | quads | bands |
|---|---|---|---|---|---|---|
| before-entry | 0.0000 | 2.21 | 1.08 | 3.36 | [2.21,2.22,2.21,2.20] | all ≈2.2 |
| mid-ramp | 0.6349 | 31.76 | 1.08 | 130.69 | [78.8,15.56,29.52,3.14] | [124.1,105.1,71.6,28.6,9.3,2.8,2.2,2.3] |
| developed-middle | 1.0000 | 115.49 | 44.91 | 205.52 | [156.4,126.5,116.6,62.5] | [175.6,179.1,174.3,116.8,97.5,71.1,68.8,64.8] |
| near-exit | 0.8642 | 35.70 | 1.08 | 124.04 | [8.48,51.04,24.01,59.29] | [2.2,3.3,10.8,22.9,46.0,63.0,69.3,80.4] |
| exact-zero | 0.0000 | 2.21 | 1.08 | 3.36 | [2.21,2.22,2.21,2.20] | all ≈2.2 |
| RM | 1.0000 | 118.09 | 36.96 | 205.52 | [161.1,114.1,138.1,59.0] | [160.5,169.2,180.2,128.2,101.3,67.2,63.7,70.1] |

Identical to round-2 post-repair (baseline change is invisible at developed because
`materialMix = sourceInfluence ≈ 1`; entry/exit identical too). Visual: full-surface smooth
multicolor field with broad lobes; **no thin diagonal stripe/line/band**; no hard wipe edges.
Evidence: `...\browser\a9fc31b20b22cdc1.png`

## 9. FINAL VERDICT

- Both Refraction ON and OFF: pre/post void pixel-equivalent (meanL 2.21 / minL 1.08 / maxL 3.36
  identical in before-entry, post-boundary, exact-zero).
- Both paths: developed full-surface (activeFraction=1, all quadrants filled).
- Both paths: no bright or dark diagonal marker/strip/trough (round-3 visual + monotonic band
  profiles). Entry/exit are broad soft diagonal ramps, not wipes; no global synchronized fade;
  no blob.
- Reduced Motion: full developed snapshot, bendTime frozen, both paths.
- PASS for the boundary-driven thermal-source hypothesis on both paths after the final minimal
  repair. Host validation (vitest/type-check/lint/full test/git diff --check) still to be run by
  the Lead (bash unavailable in this session).

## 7. Per-phase verdict summary

| check | refraction path | baseline (no-refraction) fallback |
|---|---|---|
| compile/link | PASS | PASS |
| before-entry / post-exit void pixel-equivalence | PASS (meanL/minL/maxL identical) | PASS |
| first-contact localized at real lower-left rounded corner | PASS (band0 first, single corner cell) | PASS (band0 first) |
| entry = broad soft diagonal ramp, no hard wipe | PASS (bands 124→2.3 smooth, 37% void at k=0.15) | PASS (bands 62.7→2.3) |
| developed = full-surface 2D material, no strip/blob | PASS (active=1, vision: broad lobes) | residual: thin dark warm-contour trough |
| exit symmetric with entry, reaches exact zero | PASS | PASS |
| Reduced Motion pins developed snapshot, freezes bend | PASS | PASS |
| no global synchronized fade | PASS (never whole-window dimming; always diagonal-correlated) | PASS |

## 10. Cindy Lead real Browser Lab rerun (final source of truth)

The worker's three standalone-harness rounds above are retained as repair history. The Lead then
ran the repository's actual `/lab.html` surface and found a faint Refraction interior line still
visible at full resolution. The remaining `warm2 * 0.06` material bias was removed; `warm2` now
contributes only at the real rounded boundary. The full Refraction envelope and `contact` are also
explicitly multiplied by `sourceInfluence`, making the finite-support zero contract exact.

Final harness: `capture-final.mjs`. Evidence: `final-evidence/` with 20 phase PNGs and
`capture-log.json`. The first readable localized boundary-contact capture is pinned at k=0.08;
mid-ramp remains k=0.15, developed frames k=0.31/0.42/0.53, near-exit k=0.65,
post-boundary k=0.84, exact-zero k=0.95, and Reduced Motion k=0.42.

Direct visual verdict:

| check | final result |
|---|---|
| lower-left entry | PASS: localized, soft boundary-originated influence; no inset carrier |
| mid-ramp | PASS: broad soft falloff; no hard deletion/wipe edge |
| developed baseline | PASS: full-surface continuous field; no dark trough or contour marker |
| developed Refraction | PASS: accepted broad 2D multi-temperature lobes; no bright/dark line |
| upper-right exit | PASS: same broad source support leaves through boundary B |
| exact zero | PASS: before-entry, post-boundary, and exact-zero PNGs are SHA-256 identical in both modes |
| Reduced Motion | PASS: developed snapshot; runtime zero-frame contract covered by focused tests |
| resources | PASS: one canvas, linked WebGL2 program, no bound texture/framebuffer in all 20 captures |

Shared void SHA-256:
`9a81140b7d7f7dcf83df8a2466248af7b27d98ec558e7c09dcecde31155cea1f`.

The Lab logged one existing React style warning about mixing `border` and `borderColor`; no page
exception, shader compile/link failure, texture, or framebuffer issue occurred.
