# MR9 Core-Removal Repair — Paper Literal Fidelity Frame 2–5 (synthetic core removed)

**Worktree**: `D:\Ameow\.cindy-worktrees\mr9-fullscreen-activation-fx`
**Lab**: dev-only Browser Lab `http://127.0.0.1:1421/lab.html` (existing Vite)
**Spike scope**: repair the literal-fidelity prototype by deleting the synthetic
centered rounded-rect core; keep the Paper-derived continuous dynamics, material
composition, renderer-owned texture feasibility, and Apache-2.0 license treatment.
**No commit. No production integration. No Frame 1/6–7/Chase/Closure/Lens/Noise.**

---

## 1. Defect and root cause

The prior literal-fidelity prototype encoded a **synthetic interior rounded-rect
core void** (`HEATMAP_CORE_SCALE = 0.30`) into the renderer-owned boundary
texture as Paper's logo-analog. It read as a fixed centered hole / rounded-square
frame in the middle of the window — an artifact that does not correspond to any
real Ameow geometry. Per Lead decision, it must be **removed**, not tuned.

### Root cause chain (why the Paper composition depends on a small silhouette)
Paper's `main()` (heatmap.ts L225–262) keys every *negative/band* term off the
silhouette `shape = img[0]`:
- `outerBlur = 1.0 - mix(1.0, img[1], shape)` (L230) — rim-of-silhouette proximity
- `contour = mix(img[2], 0.0, shape)` (L231) — small-blur edge line of the silhouette
- `innerBlur = mix(img[1], 0.0, shape)` (L232) — broad softness outside the silhouette
- `inner *= (1.0 - shape)` (L247–248) — erase heat where the silhouette is
- `inner += 2.0 * contour` (L246) — crisp bright line at the silhouette edge
- outer band `outer *= 0.9 * pow(outerBlur, 0.8)` (L250–262) — moving band hugging the silhouette rim

Ameow's only legal geometry is the **full rounded-window surface** (the 200×200 /
16px Main Window shell, `MAIN_WINDOW_FULL_PANEL_RADIUS / MAIN_WINDOW_PANEL_SIZE`).
With `shape = window surface`, each of these collapses:
- `(1.0 - shape)` erases the **entire visible surface** (heat would be 0 everywhere inside).
- `contour` (small blur of the full window) is **~1 everywhere inside**, so
  `inner += 2.0*contour` applied *after* the shadow carving re-saturates the
  field to 1 and **kills the phase-offset shadow dynamics**.
- `outerBlur` becomes a **window-rim proximity** field, so the outer band is a
  moving **window-rim frame** (a full/partial hot perimeter — forbidden).

> **Collapse check**: Paper's literal composition does NOT survive verbatim with
> the full window surface as the only geometry. The dependent mechanisms are the
> three terms above (contour-add, shape-erase, outer band), all of which require
> a small interior silhouette. The smallest repair that introduces **no second
> internal shape** is to delete the two erasing/saturating statements and pin the
> rim-frame band to weight 0 — the interior warm field and the three phase-offset
> shadows remain fully functional and supply all morphology.

## 2. Exact deletions and channel semantic changes

### Texture (renderer-owned, lazily created)
| Item | Before (defective) | After (repair) |
|---|---|---|
| Shape source | `rasterizeHeatmapCoreMask` (interior rounded-rect, `HEATMAP_CORE_SCALE=0.30`, `radius = corner*scale`) | `rasterizeHeatmapWindowSurface` — FULL rounded-window SDF, `half = 0.5`, `radius = cornerRadiusNorm` (0.08), same 200×200/16px projection |
| Constant | `HEATMAP_CORE_SCALE = 0.30` | **deleted** |
| R channel | core-mask shape | **window surface** (shape) |
| G channel | big blur of core (0.12×256 ≈ 22px ×3 passes) | big blur of **window surface** (same radii) |
| B channel | small blur of core | small blur of **window surface** |
| A channel | 255 | 255 (unchanged) |
| Lifecycle | create per install / bind unit 0 in draw / delete on dispose / null → early-out | **unchanged** (lazy, absent in default Progress) |

Channel semantics now: `R = real rounded-window surface/boundary`,
`G = multi-scale big softness`, `B = multi-scale small softness` — no inner object.
The repaired shader samples `img[0]` (shape) and `img[1]` (big blur) for
`innerBlur`; `img[2]` (small blur) is retained in the texture as part of Paper's
`toProcessedHeatmap` channel contract / multi-scale softness but is no longer
sampled (the small-blur contour it drove is weight 0).

### Shader `heatmapOutput`
- **Removed** `inner *= (1.0 - shape);` (Paper L247–248) — with window-as-shape it erased the whole visible surface.
- **Removed** `inner += 2.0 * contour;` (Paper L246) and the `contour` variable — with window-as-shape, small blur ≈ 1 inside, re-saturating the carved field.
- **Removed** the outer-band block (`tOuter`, `animatedMask`, `outerBlur`) — with window-as-shape it is a window-rim frame; pinned to `float outer = 0.0;` (weight 0) so Paper's L265 anchor `heat = clamp(inner + outer, 0.0, 1.0)` stays literal.
- **Kept** (Paper-derived): helpers `circle`/`lst`/`sst` (L77–86); `innerBlur = mix(img[1], 0.0, shape)` (L232, now the window's own multi-scale softness); three phase-offset shadows (L209–214, 235–242); `inner = 0.8 + 0.8*innerBlur` + sequential `mix(inner, 0., shadow)×3` (L239–245); `min(1.0, inner)` (L247); `rimEdgeFade` (cool rim, Ameow `imgSoftFrame` substitution); `pow(inner, 1.2)` (L264); `clamp(inner + outer, 0., 1.)` (L265); grain (L268–269, 287); 8-stop premultiplied palette loop (L272–283); navy back composite; early-out `img.a == 0`.
- **Morphology**: warm/cool regions arise purely from the continuous phase-offset subtractive shadow interaction over the window-surface softness field. No fixed internal geometry.

## 3. Evidence chain (why this is the correct repair)

1. Paper's three interior/band terms mathematically collapse with window-as-shape (§1).
2. The remaining composition (interior field + three shadows + rim fade) is exactly the Paper dynamics that produced the accepted warm-volume/cool-pocket morphology in the prior captures (the outer band and contour contributed ~nothing outside the old small void).
3. The deleted lines were the only code paths that referenced a nonexistent inner object; deleting them is the root-cause fix (no tuning of scale/softness/roundness, no substitute primitive).
4. Reduced Motion still pins a single bounded snapshot (`p = 0.28`; `uTime` frozen by the renderer).

## 4. Implementation status (final)

- [x] `src/presentation/main-window/ExpandedPresentationSurface.tsx` — shader block edited (core removal + weight-0 repairs + comments); texture builder rewritten to `rasterizeHeatmapWindowSurface`; `HEATMAP_CORE_SCALE` deleted; renderer lifecycle untouched (lazy create / unit-0 bind / dispose delete / null early-out).
- [x] **Orca review fix 1**: a backtick inside a GLSL `//` comment in the shader template literal (`so \`innerBlur\` is the window's own big blur`) terminated the template string early and broke `tsc` (TS1005 at line 200). Removed the backticks; shader text unchanged otherwise.
- [x] **Orca review fix 2**: `expandedPresentationSurface.test.ts` — removed an unused `heatmapBlock` local that `tsc` flagged (TS6133) in the "removes the synthetic centered core" test.
- [x] `src/presentation/main-window/expandedPresentationSurface.test.ts` — contract updated: proves core/synthetic primitives absent (rasterizer inventory = exactly one), one canvas/program/draw, lazy texture lifecycle + default-Progress absence, context-restore/dispose semantics, license notice. 17 tests total (was 10 on the MR9 baseline; +7 added by this repair).
- [x] `THIRD_PARTY_NOTICES.md` — modification notice updated to describe the window-surface substitution and the weight-0 outer/contour terms; Apache-2.0 text + Paper NOTICE retained; root `LICENSE` (MIT) untouched.
- [x] `research/mr9-core-removal-repair.md` — this artifact.
- [x] `research/capture-mr9-repair.mjs`, `research/analyze_repair.py`, `research/sim_repair.py` — capture/analysis harnesses. Simplify pass: `sim_repair.py` is now repair-only (removed the literal-mode branch and dead `OUTER_MUL`/`SHADOW_SCALE` constants; fixed output paths and a broken tail that referenced nonexistent files); `capture-mr9-repair.mjs` now records boolean uniforms (`uReducedMotion`) and adds a fresh default-Progress readout proving no texture allocation/binding when the Heatmap gate was never opened.

## 5. Validation & captures — COMPLETE (Orca rerun)

### Automated
| Gate | Result |
| --- | --- |
| Focused Vitest (`expandedPresentationSurface` 17 + `expandedPresentationRuntime` 15) | **PASS** — 32/32 |
| Lab scenario/runtime/rendererReuse/stateFixtures/exportPng | **PASS** — 67/67 (5 files) |
| `npx tsc --noEmit` + `tsc -p tsconfig.electron.json --noEmit` (`npm run type-check`) | **PASS** |
| `npm run lint -- --quiet` | **PASS** |
| `git diff --check` | **PASS** (only pre-existing CRLF warnings) |
| Full suite `npm test` | **PASS except 1 known unrelated** — 200 files, 1766 passed / 1 failed. The failure is `browser-extension/architecture-guard.test.js:277` (source-shape assertion), file unchanged vs HEAD; it reproduces on the clean MR8 baseline and is owned outside MR9 (see `research/mr9-validation.md`). |

### Browser Lab phase-pinned captures (Playwright, `capture-mr9-repair.mjs`)
Outputs in `research/mr9-core-removal/`:
- Chronological repaired F2–F5 + in-betweens + reduced: `f2.png` (p=0.10), `in-between-a.png` (0.14), `f3.png` (0.18), `in-between-b.png` (0.22), `f4.png` (0.26), `in-between-c.png` (0.30), `f5.png` (0.34), `reduced.png` (0.28). Captured `k` vs target error < 0.005 each.
- Contact sheet: `repair-contact-sheet.png`.
- Repair-before vs repair-after vs Paper: `paper-before-after-repaired.png` (Row 1 Paper F2–F5 diamond refs, Row 2 Ameow BEFORE = `research/mr9-literal-fidelity/f2..f5.png`, Row 3 Ameow AFTER).
- Texture channel evidence: `boundary-texture-channels.png` + `texdump.json` (GPU readback).
- Simulator cross-check: `simrep-f2..f5.png`, `simrep-red.png` (Python mirror of the GLSL).
- Readout log: `capture-log.json`.

### Readouts (from `capture-log.json`)
- **Moving**: `canvasCount: 1`, `linked: true`, `heatmapMode: 1`, `cornerRadius: 0.08` (16/200), `reducedMotion: false`, exactly one bound texture on unit 0 (`boundTexture2D: true`, `activeTextureUnit: 33984`=TEXTURE0), `framebufferBound: null`, `pageErrors: []`.
- **Reduced**: `heatmapMode: 1`, `reducedMotion: true`, `uTimeFrozen: true` (t1 === t2 = 23.1131) — static bounded snapshot, no travelling frames.
- **Cleared**: `heatmapMode: 0`, no framebuffer, program still linked. (`boundTexture2D: true` here is WebGL's persistent binding state from the prior heatmap draw; the mode-0 draw never samples it. Dispose deletes the object.)
- **Fresh default Progress** (page reloaded, Heatmap category never opened): `heatmapMode: 0`, `boundTexture2D: false`, no framebuffer, linked — default Progress never allocates or binds the heatmap texture. Lazy lifecycle confirmed.

### Texture readback (`texdump.json`, 256×256 RGBA)
- `A` = 255 everywhere (min 255) — Paper early-out never hit.
- Center (128,128) = `(255,255,255)` in every channel — **no interior core void** (a synthetic core would read dark here).
- `R` (window surface): 255 across the interior; falls to 31 at the far corner (2,2) — only the four rounded corners are outside.
- `G` (big blur ×3): stays 249 even at (2,2) — soft field extending past the boundary.
- `B` (small blur ×3): 64 at (2,2) — tighter falloff than G.
- Cross-check: Python simulator (`sim_repair.py`) reproduces the exact GLSL pipeline and lands within ~1% of the real browser warm-fraction/max-brightness on all five phases, confirming texture + shader math consistency.

### Pixel metrics (support only; visual judgment in §6)
| Frame | warm_frac | maxbright | band_hot_frac | center_hot_frac |
| --- | --- | --- | --- | --- |
| F2 (0.10) | 0.66% | 173.0 | 0.0000 | 0.0000 |
| F3 (0.18) | 11.77% | 182.7 | 0.0990 | 0.0000 |
| F4 (0.26) | 13.08% | 182.7 | 0.0631 | 0.0000 |
| F5 (0.34) | 0.07% | 170.0 | 0.0000 | 0.0000 |
| Reduced (0.28) | 10.46% | 182.3 | 0.0432 | 0.0000 |

Frame-to-frame mean diff: F2→F3 126.8, F3→F4 154.1, F4→F5 232.0 — the field is actively morphing, never a static frame. `center_hot_frac = 0` in every phase (no fixed centered hot/cool void). `band_hot_frac` ≤ 0.10 is the localized thermal blob touching the inner band region, NOT a full hot perimeter frame.

### Visual judgment (inspected the images directly, vision-assisted)
Inspected `repair-contact-sheet.png`, `paper-before-after-repaired.png`, `f2/f4/f5/reduced.png`, and `boundary-texture-channels.png`:
- **Centered rounded-square / fixed hole: GONE.** The BEFORE row (literal fidelity) shows the centered rounded-rect dark artifact in all four frames; the AFTER row shows none. The center is occupied by the moving shadow morphology (dark gap between thermal bands that shifts frame to frame) — not a stationary cutout.
- **Replacement fixed internal geometry: NONE.** No circle, ellipse, superellipse, polygon, smaller rounded rect, capsule, or shell in any frame or in the texture channels.
- **Continuous cool/warm morphology: PRESENT.** Smooth blue → cyan → yellow/orange gradients within the thermal bands; F2–F5 show continuous phase evolution (upper band → balanced two-band → lower-mass).
- **Paper-derived material dynamics regression: documented.** The AFTER field is less morphologically rich than the Paper diamond reference (which needs a small silhouette for its outer band + contour line). The retained dynamics (three phase-offset subtractive shadows over the window softness field) still produce continuous, moving, phase-dependent warm/cool morphology — useful morphology is retained without a fixed silhouette, so no hard-stop is triggered. Exact visual loss: no rim-hugging outer band and no crisp contour re-saturation (both weight 0), so the composition is two thermal bands with a moving cool gap rather than Paper's multi-region diamond.
- **Full hot Main Window perimeter/frame: ABSENT.** The rim stays dark/cool in every frame (rimEdgeFade); no phase renders a hot frame.

## 6. License status

Derivative obligations remain active and satisfied: `THIRD_PARTY_NOTICES.md`
carries the complete Apache-2.0 text, Paper's NOTICE ("Paper Shaders, Copyright
2026 Paper, https://shaders.paper.design"), and a prominent modification notice
identifying the adapted source, the upstream `heatmap.ts`, and the Ameow
substitutions (window-surface texture, weight-0 outer/contour). The
`MODIFIED DERIVATIVE of Paper Shaders Heatmap` header sits above the shader
block. No trademark endorsement implied. Root `LICENSE` stays MIT.

## 7. Remaining defects (accepted)

- **B channel unused by the shader**: the small-blur channel is still encoded (Paper channel contract, multi-scale softness) but no longer sampled because the contour it drove is weight 0. Keeping it is deliberate (texture = faithful Paper-derived material, not an internal object); it costs one 256×256 read-only allocation already paid for by the same texture.
- **Morphology richness vs Paper reference**: reduced as documented in §5 (outer band + contour weight 0). Accepted because the alternative is a fixed interior silhouette, which is forbidden.
- **Persistent binding state after a heatmap draw**: WebGL keeps unit 0 bound to the heatmap texture after the last heatmap draw until dispose; mode-0 draws never sample it and a fresh renderer never creates it (verified). Documented, not a defect in the shipped path.

## 8. Hard stop

- No Frame 1 onset / Frames 6–7 exit / Chase / Closure / Lens / Noise / Dissipation / production integration.
- No second renderer, canvas, pass, framebuffer, or generic multipass framework (the texdump harness creates a throwaway debug FBO for readback evidence only; it is not part of the renderer).
- No commit; all pre-existing dirty work preserved; unrelated files untouched. `mod_served.tsx` at the repo root is a stray Vite HMR serving artifact from the prior environment-debug phase, not owned by this repair, and was left untouched.
