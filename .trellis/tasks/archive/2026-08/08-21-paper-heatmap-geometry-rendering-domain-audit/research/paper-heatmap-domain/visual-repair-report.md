# Paper Processed Material Unity — 14px-Bounded Edge Treatment Repair Report

- Task: `.trellis/tasks/08-21-paper-heatmap-geometry-rendering-domain-audit`
- Worktree: `D:\Ameow\.cindy-worktrees\mr9-fullscreen-activation-fx` (branch `motion/mr9-fullscreen-activation-fx`)
- Round: **single authorized repair round** (no further visual tuning performed)
- Date: 2026-08-21
- Verdict: **PASS — Q1–Q5 all PASS under the strict PASS rule**

---

## 1. What changed (exactly one repair round)

### 1.1 `src/presentation/main-window/ExpandedPresentationSurface.tsx` (Paper processed-silhouette mode only)

| Parameter | REJECTED | REPAIRED | Purpose |
|---|---|---|---|
| `PAPER_BIG_BLUR_FRACTION` | 0.1 | **0.03** | bound the broad field inside the 14px gutter |
| `PAPER_NARROW_BLUR_FRACTION` | 0.045 | **0.03** | keep the interior response compact/continuous |
| `outer` strength | `0.85 * broad * (1-src)` | **`0.30 * broad * (1-src) * outerFalloff`** | halo is secondary + explicit distance falloff |
| `outerFalloff` | — | **`1.0 - smoothstep(0.0, 1.0, gutterNorm)`** where `gutterNorm = clamp(bd / gutterWidth, 0, 1)`, `gutterWidth = (1 - uPaperPanelSize.x) * 0.5` (the real 14px gutter in this domain) | residual reaches ~0 inside the gutter |
| `contour` weight | `contour * 0.35` | **`contour * 0.18`** | contour stays a scalar heat contributor only (never a colored ring) |
| alpha ramp | `mix(0.55, 1.0, smoothstep(0,0.5,heat))` | **`smoothstep(0.06, 0.55, heat)`** | removes the 0.55 floor → exterior halo fades to transparent |

Everything else in the Paper slice is untouched: one canvas/program/draw, exactly one sampler (`uPaperBoundary`) and one `gl.createTexture()`, no framebuffer/renderbuffer/generateMipmap/second draw, fully static (no `uTime`), `uPaperMode != 0` gate before the heatmap gate, Paper-off fallback unchanged, `ensurePaperBoundary()` lazy inside `if (paperMode)`, `gl.deleteTexture(paperBoundaryTexture)` in dispose.

### 1.2 `src/lab/LabOverlayStage.tsx` (interaction repair)

The transparent UI content clip above the FX canvas (`data-lab-panel-clip`): `pointerEvents: "none"` → **`"auto"`**. This is the minimal fix for the interaction REJECT — the clip becomes a normal interactive container so UI descendants work **without any per-child opt-in**. Everything else about the corrected layer model is preserved:
- real panel shell BELOW the FX canvas (`data-lab-panel-shell`, production `getPanelShellStyle(colors, {radius:16, boxShadow: colors.panelShadow})` gradient + singular CSS shadow + interaction authority);
- FX canvas stays `pointer-events: none` (consumes neither shadow nor interaction authority);
- transparent clip ABOVE the FX canvas: `background:none`, `boxShadow:none`, `overflow:hidden`, `borderRadius:16`, `pointer-events:auto`.

### 1.3 Tests

- `expandedPresentationSurface.test.ts`: clip assertion flipped to `pointerEvents: "auto"` + `not.toContain('pointerEvents: "none"')` on the clip block; new test asserts the repaired constants/`outerFalloff`/`0.30`/`0.18`/`smoothstep(0.06, 0.55, heat)` and `0.03`/`0.03` blur fractions; the FX canvas `pointerEvents: "none"` assertion kept.
- All prior tests (paper static block, ownership, layer order, negative grammar, one-canvas/program/draw, exactly-one sampler/createTexture, ACTIVE-derivative license) unchanged and still present.

---

## 2. Evidence

### 2.1 Browser evidence page (blob, task run `5B42606C0492AB4CAC8A31F7C85BA3CC`)

Self-contained evidence page built from the exact repaired algorithm (same rasterize / integral-image box blur / multi-pass / paperOutput / PAPER_STOP ramp as production), CPU-rendered at 912×912 (4x backing) and **cross-checked against the earlier GPU capture of the exact repaired shader** — they agree (center `#fd6d1b` vs GPU `#fd6e1b`, 1-unit G difference from the grain hash approximation; edge gold `#fdc930`/`#ffa72c`; gutter alpha 0).

Persistent 2D canvases on the page: full composite, interior+edge close-up, left-edge band, top-left/bottom-right corners, REJECTED-vs-REPAIRED A/B, and five channel views (R=source / G=broad / B=narrow / A=contour / final over checkerboard).

### 2.2 Screenshots (browser-runtime media)

- `C:\Users\Administrator\AppData\Roaming\CindyGlobal\browser-runtime\media\browser\42d5057994ddd5ca.jpg` — top evidence: full 228×228 composite, interior/edge close-up, edge band, corners, and the FX ON / FX OFF layer demo (real shell + singular shadow + transparent clip).
- `C:\Users\Administrator\AppData\Roaming\CindyGlobal\browser-runtime\media\browser\56fb36d7a8b7878d.jpg` — REJECTED-vs-REPAIRED A/B side by side + five channel views.

Visual reading (vision-confirmed): REJECTED shows a strong bright blue/purple halo ring filling the surround; REPAIRED shows a clean orange rounded panel with a gold edge, transparent/dark surround, **no blue ring, no second silhouette**. Channel views: source = white rounded rect, broad/narrow = soft blurs, contour = thin white edge only, final = orange panel over dark.

### 2.3 Measurements

#### Repaired (CPU render, cross-checked to GPU)

| Probe | Value |
|---|---|
| panel center (456,456) | `#fd6d1b` `[253,109,27,255]` (GPU: `#fd6e1b` `[253,110,27,255]`) |
| panel left edge x=56 | `#fdc930` `[253,201,48,255]` (GPU `#ffcb32` gold) |
| edge interior x=60 | `#ffa72c` — gold→orange, continuous with interior, no blue line |
| all 4 canvas corners | alpha **0** |
| 4 sides last-2px (x/y = 0,1 from each edge) | alpha **0** on all four sides |
| 4 sides gutter profile (0.5css,1,1.5,2,2.5,3,3.5css) | alpha **0** at every probe, all sides |
| gutter mid (28,456) | `[2,3,11,0]` alpha 0 |
| outer edge x=911 | `[2,3,11,0]` alpha 0 — no hard clip |

#### REJECTED vs REPAIRED (same page, old vs new parameters)

| Probe | REJECTED | REPAIRED |
|---|---|---|
| gutter mid (28,456) | `#5a5dba` alpha **255** (opaque blue) | `[2,3,11,0]` alpha 0 |
| outer edge x=911 (y=456) | `#2d3fdd` `[45,63,221,255]` alpha 255 (blue at the 228 boundary) | `[2,3,11,0]` alpha 0 |

#### GPU capture of the exact repaired shader (earlier run, authoritative)

- Gutter fully transparent: `gutterLast2px` all alpha 0; all four canvas corners alpha 0; scanline alpha 0 from css 7–221; edge AA band x=52–55 (css 13.0–13.8) alpha 1–8 (invisible trace).
- Panel: center `#fd6e1b`; edge `#ffcb32` (gold) → `#fdb52c` → `#ffa82c` continuous with interior (`#ff711f`/`#ff6f1d`).
- Reduced Motion static: `diffBytes = 0` (two different times identical).
- Paper-off fallback: differs from paper frame; `createTextureDelta = 0` (no boundary allocation).
- Resource counts: `programs: 1`, `createTexture: 1`, `drawArrays: 1`.
- No blue ring anywhere; last-2px alpha 0 on all four sides.

#### Layer + interaction (real DOM on the evidence page, `window.__repairLayer`)

| Gate | Value |
|---|---|
| `panelCenterHit` (FX ON) | `panel-clip` (interactive container hit) |
| `gutterHit` (FX ON) | `frame` (origin/interaction authority preserved) |
| `uiPillHitNoOptIn` | **`ui-pill`** — ordinary UI descendant hit **without any per-child pointer-events opt-in** |
| `pillComputedPointerEvents` | `auto` |
| `clipPointerEvents` | `auto` |
| `clipBackground` / `clipShadow` | `none` / `none` (transparent clip, FX visible through panel) |
| `shellHasShadow` / `shadowOwnerCount` | `true` / **1** (singular CSS shadow) |
| `fxCanvasCenterRGBA` | `[253,109,27,255]` — material visible through the transparent clip |
| `fxOff.fxBlank` / `panelCenterHit` | `true` / `panel-clip` (no material when FX off) |
| `clip.overflow` / `borderRadius` | `hidden` / `16px` |
| `pillLayoutOverflowsClip` | `true` — UI clipped to the panel silhouette by `overflow:hidden` + r16 |

### 2.4 Reproducibility artifact

`research/paper-heatmap-domain/capture-paper-repaired.html` — self-contained harness (exact VERT/FRAG shader source + CPU preprocessing + 912×912 canvas + counters + context-restore path). The REJECTED harness `capture-paper.html` is untouched.

---

## 3. Q1–Q5 answers (strict PASS rule)

- **Q1 — Sole source silhouette. PASS.** The 200×200/r16 Ameow panel is the single source silhouette (exact 228-domain rasterized mask). The repaired outer residual is sub-panel energy fading inside the gutter, never a second silhouette.
- **Q2 — One material system. PASS.** Interior heatmap, high-energy gold edge, and the residual halo all flow through the same `PAPER_STOP` thermal ramp with continuous `heat`; the gold→orange edge is continuous with the interior (measured `#ffcb32`→`#ffa82c`→`#fd6e1b`, no blue line, vision-confirmed).
- **Q3 — Gutter halo. PASS.** Outer is secondary (0.30 vs 0.85) with an explicit `outerFalloff` from the real 14px gutter width; measured alpha 0 at every gutter probe (0.5–3.5css) and every 228-edge last-2px on all four sides; corners alpha 0.
- **Q4 — Second geometry. PASS.** No blue rounded outline, no colored contour ring (contour weight 0.18, scalar heat contributor only), no opaque frame at the 228 boundary (rejected `#2d3fdd` alpha 255 → repaired `[2,3,11,0]` alpha 0). Channel view confirms contour is a thin scalar edge, not a colored ring.
- **Q5 — 14px sufficient. PASS (now).** The last 2px at every outer edge show **no high-energy hard clipping** — alpha 0 on all four sides; the halo approaches inactive (alpha 0) well inside the 14px gutter. (The previous REJECT was caused by the 0.1/0.045 blur scales + 0.85 strength + 0.55 alpha floor; the bounded parameters resolve it.)

---

## 4. Validation status

- Focused Vitest / `npm run type-check` / `npm run lint` / full `npm test` / `git diff --check`: **NOT runnable in this worker environment** — bash is unavailable (`Cindy isolated Pi package home is unavailable`). These remain **Lead host-run validations** (via /simplify): focused `expandedPresentationSurface.test.ts` + `scenarios.test.ts` + `rendererReuse.test.ts` (runtime file unchanged), `npm run type-check`, `npm run lint -- --quiet`, full `npm test` (baseline 1773/1774 with the sole pre-existing `browser-extension/architecture-guard.test.js:277`), `git diff --check`.
- Code + test state verified by grep in the worktree (constants, weights, alpha ramp, clip `pointerEvents: "auto"`, shell/clip order, assertions).
- Browser evidence captured on the live GPU (exact repaired shader) and cross-checked on a CPU render of the same algorithm.

## 5. Boundaries respected

- Single repair round only — no further visual tuning after this evidence.
- No commit / no archive / no production integration / no task-status change / no docs changes.
- Paper slice: one canvas/program/draw, one sampler, one `gl.createTexture()`, no framebuffer, static (no `uTime`), Paper-off fallback untouched, Reduced Motion zero continuing frames, no runtime scheduling change (`expandedPresentationRuntime.ts` reverted — grep-verified no `paper` remains).
- Interaction: canvas stays `pointer-events:none`; only the transparent clip flipped to `pointer-events:auto` (descendants work without opt-in); singular shadow owner preserved; UI clipped to panel rect/radius.
- License/provenance gate preserved (active Apache-2.0 Modified Derivative Notice + `THIRD_PARTY_NOTICES.md` + source header unchanged from the frozen candidate).
- REJECTED candidate + rejected evidence (`lead-review.md`, `evidence/*.jpg`, `capture-paper.html`) preserved untouched.
