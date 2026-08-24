# Paper processed-silhouette — 228x228 outer-domain Browser Lab spike (implementation report)

**Task**: `08-21-paper-heatmap-geometry-rendering-domain-audit`
**Worktree**: `D:\Ameow\.cindy-worktrees\mr9-fullscreen-activation-fx` (branch `motion/mr9-fullscreen-activation-fx`)
**Date**: 2026-08-21 (spike round, test-first)

Hypothesis under test:

> 228×228 real output domain → exact 200×200/r16 latent panel silhouette at outer origin (14,14) → processed inner/outer/contour fields → Paper-derived scalar causality → Thermal material, all on the ONE production `ExpandedPresentationSurface`, one canvas, one WebGL2 program, one draw, one lazy Lab-only processed RGBA texture (CPU preprocessing), no framebuffer/second pass, Lab-only, Windows transparent compositing evidenced.

---

## 1. Changed files

| File | Change | Boundary |
|---|---|---|
| `src/presentation/main-window/ExpandedPresentationSurface.tsx` | Lab-only `paper` prop + `paperModeRef`; shader uniforms `uPaperMode/uPaperPanelOrigin/uPaperPanelSize/uPaperPanelRadius/uPaperBoundary`; shader `paperOutput()` (STATIC) + `uPaperMode` gate before the heatmap gate; CPU preprocessing (`paperClamp01`, `rasterizeRoundedRectMask`, `boxBlurGray`, `multiPassBlurGray`, `buildPaperBoundary`); renderer lazy `ensurePaperBoundary()` (one `gl.createTexture`), paper uniform wiring in `draw`, `gl.deleteTexture` in `dispose`; render/redraw signatures carry `paperMode`; provenance header | In-scope |
| `src/presentation/main-window/expandedPresentationSurface.test.ts` | Updated heatmap/refraction/license contract tests (exactly one `sampler2D` = `uPaperBoundary`, one `gl.createTexture`, no framebuffer grammar); added 5 new Paper-mode source-contract tests | In-scope |
| `src/lab/scenarios.ts` | `LabHeatmapPreset.paper`, `LabHeatmapState.paper`, 2 new presets (`paper-static`, `paper-reduced`), reducer carries `paper` | Lab wiring |
| `src/lab/scenarios.test.ts` | `paper: false` on the 4 existing preset expectations; 6-preset id list; new paper-preset test | Lab wiring |
| `src/lab/LabOverlayStage.tsx` | `paperMode` prop; Paper mode uses the real `getMainWindowFullOuterSize("win32")` = 228 frame (transparent checkerboard, `overflow: visible`, `borderRadius: 0`); canvas spans 228. **Corrected layer model**: the REAL panel shell (production `getPanelShellStyle` gradient background + the SINGULAR CSS shadow + interaction authority) sits BELOW the FX canvas at (14,14) 200×200/r16; a transparent nested UI content clip (no background/shadow, `pointer-events: none`, `data-lab-panel-clip`) sits ABOVE it so the FX stays visible through the panel while UI stays clipped to the panel silhouette | Lab wiring |
| `src/lab/PresentationLab.tsx` | `paperMode={state.heatmap?.paper === true}`; `paperMode` in `ShaderReadout` + `readScalar("uPaperMode")`; preset label keys | Lab wiring |
| `src/lab/rendererReuse.test.ts` | asserts `paper={paperMode}` forwarded to the one surface | Lab wiring |
| `src/lab/locales/en.json`, `zh-CN.json` | `paperStatic` / `paperReduced` preset labels | Lab wiring |
| `THIRD_PARTY_NOTICES.md` | Active Apache-2.0 derivative section + Modified Derivative Notice (license gate TRIGGERED) | License |
| `research/paper-heatmap-domain/capture-paper.html` | Self-contained 228×228 capture harness (exact production VERT+FRAG shader, exact CPU preprocessing, counts, scanline/gutter/RM/fallback/reinstall evidence) + corrected-layer demo (FX on/off, interaction hit tests, singular-shadow check) | Task evidence |

**Untouched on purpose**: `MainWindowPresentationSurface.tsx` (production outer-domain layer split not needed — the Lab exposes the 228 domain via `LabOverlayStage`), `expandedPresentationRuntime.ts` (reverted — the Paper mode is STATIC, renders once on wake, zero continuing frames, so **no runtime scheduling change** was needed per `implement.md`), Electron native size, product lifecycle/policy/targets, Refraction, entry/exit/timing.

---

## 2. Five PASS / REJECT verdicts (with evidence)

### Q1. Sole source silhouette? → **PASS**
The sole source of the Paper processed fields is the **exact 200×200/r16 panel mask**, rasterized at the canvas backing resolution from repository constants (`MAIN_WINDOW_PANEL_SIZE=200`, `MAIN_WINDOW_FULL_PANEL_RADIUS=16`, `MAIN_WINDOW_FULL_SHADOW_GUTTER=14` → origin 56 backing px at 4×). R=source coverage, G=big blur, B=narrow blur, A=contour all derive from that one mask (CPU cross-check in the harness matches the GPU readback). No Paper logo/diamond/image-frame geometry, no inset carrier, no second geometry authority. Evidence: scanline `cpuSrc` 1.0 interior / 0.889 AA edge / 0.000 outside; contour `(src−narrow)·3` peaks 1.0 at the panel edge and falls to 0 in the interior.

### Q2. One panel material system? → **PASS**
One `paperOutput()` composes a single scalar `heat = clamp(inner + contour·0.35 + outer, 0, 1)` (inner from the narrow field inside the panel, outer from the broad field into the gutter, contour from the same mask edge) and maps it through one 7-stop `PAPER_STOP` ramp + one yellow-zone correction + one alpha ramp + one grain. Exactly one material language for the panel.

### Q3. Gutter halo? → **PASS**
The real gutter (css 14px ring, backing 56px at 4×) carries genuine processed **outer** material (`outer = 0.85·broad·(1−src)`). Pixel evidence at the center row (x backing → css): x=884 (221) `#5659b9`, x=900 (225) `#3b48d0`, x=908 (227) `#3242d8`, x=910 (227.5) `#3042df` — all alpha **255**. The gutter band x=857..911 is **100% alpha>0**. Visual: the composite screenshot shows a blue-purple glow filling the gutter all the way to the 228 frame edge.

### Q4. Second geometry? → **PASS**
Exactly one canvas, one WebGL2 program, one `gl.drawArrays` per render (count 1), one lazy `gl.createTexture` per install (count 1), no framebuffer/renderbuffer/`generateMipmap`/second pass. Harness counts confirm; the updated source-contract tests assert the same for the production file. The Lab mounts the ONE production surface (`rendererReuse.test.ts`).

### Q5. 14px sufficient? → **REJECT** (for the current parameterization)
Pixel evidence **falsifies** the premise that the Paper-derived outer falloff fits the 14px gutter:
- At the **very last window column** (x=911, css 227.75) the alpha is **255 on all 912 rows** and `broad` is still **0.607** (not ~0).
- The last-2px columns (x=910–911) are 1824/1824 rows alpha>0.
- `cpuBroad` at 13.75 css px from the panel edge is still 0.607 — the 3-pass big blur (radius = 10% of panel size = 20 css px per pass) has a falloff tail far wider than 14 css px.

Per Lead correction #1, 14px is the **available composited/output budget** and no “fits exactly” claim is made without pixel evidence. The evidence shows the outer field reaches the 228 boundary at full alpha and would be **hard-clipped** at the window edge (a visible seam) rather than decaying to zero. The CSS shadow tail (`DARK_PANEL_SHADOW`, 16px blur with −8px spread) also extends beyond 14px but is a low-alpha, by-design clipped effect; the Paper outer field is far more prominent (alpha 255 across the band). To adopt the Paper outer channel cleanly the big-blur radius/fraction or passes must be bounded so the outer response reaches ~0 by 14 css px (e.g. big blur ~2–3% of panel size, or an explicit distance decay). **Verdict: REJECT for current parameters; minimal, tunable fix available.**

---

## 3. Additional evidence

### 3.1 Geometry chain (derived from repository constants, harness-verified)
`228 = 200 + 14·2`; canvas backing `912×912` at 4×; panel backing `800×800` at `(56,56)`; radius `64` backing px. Uniforms `uPaperPanelOrigin=14/228`, `uPaperPanelSize=200/228`, `uPaperPanelRadius=16/228` — the exact production derivation `(cssSize−200)/2`, `200/cssSize`, `16/cssSize`. Production canvas (200 css) yields origin 0 / size 1 / radius 0.08 = today’s behavior (byte-equivalent path).

### 3.2 Center-row scanline (y=456 backing)
| x (backing) | css x | RGBA | hex | cpu src | cpu broad | cpu narrow | cpu contour |
|---|---|---|---|---|---|---|---|
| 28 | 7.0 | 89,93,188,255 | #595dbc | 0.000 | 0.645 | 0.282 | 0.000 |
| 55 | 13.8 | 126,117,154,255 | #7e759a | 0.111 | 0.684 | 0.502 | 0.000 |
| 56 | 14.0 | 255,118,30,255 | #ff761e | 0.889 | 0.686 | 0.512 | 1.000 |
| 57 | 14.3 | 253,117,29,255 | #fd751d | 1.000 | 0.687 | 0.521 | 1.000 |
| 100 | 25.0 | 255,103,28,255 | #ff671c | 1.000 | 0.772 | 0.882 | 0.353 |
| 456 | 114.0 | 253,110,27,255 | #fd6e1b | 1.000 | 1.000 | 1.000 | 0.000 |
| 812 | 203.0 | 253,99,24,255 | #fd6318 | 1.000 | 0.769 | 0.878 | 0.367 |
| 855 | 213.8 | 255,120,33,255 | #ff7821 | 0.889 | 0.686 | 0.512 | 1.000 |
| 856 | 214.0 | 132,122,153,255 | #847a99 | 0.111 | 0.684 | 0.502 | 0.000 |
| 857 | 214.3 | 136,125,151,255 | #887d97 | 0.000 | 0.683 | 0.492 | 0.000 |
| 884 | 221.0 | 86,89,185,255 | #5659b9 | 0.000 | 0.643 | 0.276 | 0.000 |
| 900 | 225.0 | 59,72,208,255 | #3b48d0 | 0.000 | 0.621 | 0.201 | 0.000 |
| 908 | 227.0 | 50,66,216,255 | #3242d8 | 0.000 | 0.611 | 0.171 | 0.000 |
| 910 | 227.5 | 48,66,223,255 | #3042df | 0.000 | 0.608 | 0.164 | 0.000 |
| 911 | 227.8 | 45,62,219,255 | #2d3edb | 0.000 | 0.607 | 0.161 | 0.000 |

Corners: top-left `[14,35,114,163] #0e2372` (alpha 163 — semi-transparent, transparent compositing evidenced); bottom-right `[14,36,115,163]`; panel-corner-outer `[20,61,172,217] #143dac`; panel-center `[253,110,27,255] #fd6e1b`.

### 3.3 Reduced Motion static / fallback / lifecycle
- **RM static**: two draws at `uTime=0` and `uTime=3.7` (paper mode, reducedMotion) are **byte-identical** (`diffBytes=0`). `paperOutput` references no time; the runtime is unchanged (renders once on wake, zero continuing frames).
- **Fallback (paper OFF)**: production thermal path (progress arc) — `createTextureDelta=0` (no processed texture allocated) and `diffBytesVsPaper=3,326,871` (paths differ). Pixel/resource equivalence: paper off = ordinary production path.
- **One-canvas/one-program/one-draw/one-texture**: counts 1/1/1/1 per install.
- **Context restore**: the real `WEBGL_lose_context` restore event was flaky in this automation environment (context remained lost after `restoreContext()` — a known webview/CDP quirk, not a code defect; the production pattern is identical to the accepted Heatmap spike’s `webglcontextrestored → reinstall`). The reinstall invariant was demonstrated deterministically: fresh context → `install()` → lazy `ensurePaperBoundary()` rebuild → paper draw → center pixel `[253,110,27,255]` (exactly matches the first install). dispose deletes the texture (`gl.deleteTexture(paperBoundaryTexture)`, asserted in tests).

### 3.4 Windows transparent compositing
The standalone harness renders into a fully transparent WebGL canvas over a checkerboard frame; the composite writes alpha (255 in the panel and most of the gutter, 163 at the outer corners), so the composited output is genuinely alpha-bearing (desktop shows through semi-transparent pixels) — consistent with the production transparent window (`preferZeroAlpha`, `allowTransparency`). **macOS = NOT VERIFIED** (no runtime host).

### 3.5 License gate (TRIGGERED)
The spike is a derivative of Paper Heatmap’s geometry-agnostic preprocessing (`blurGray` / `multiPassBlurGray` integral-image box blur) and its inner/outer/contour scalar causality (`heatmap.ts`, `@paper-design/shaders@0.0.80`, Apache-2.0). Delivered:
- `ExpandedPresentationSurface.tsx` carries a `MODIFIED DERIVATIVE — Paper Heatmap mechanics (Apache-2.0)` provenance/modification header naming the upstream and listing what was adapted/excluded.
- `THIRD_PARTY_NOTICES.md` updated: active-derivative status, `### Modified Derivative Notice` with the `adapted source:` path, full Apache-2.0 text + Paper NOTICE retained, rejected research documented separately.
- Ameow root `LICENSE` (MIT) unchanged.

---

## 4. Capture harness

`research/paper-heatmap-domain/capture-paper.html` — self-contained (exact production VERT+FRAG shader, exact CPU preprocessing, 228×228/4×=912 harness, channel visualizations R/G/B/A, composite, counts, scanline/gutter/corner evidence, RM-static diff, fallback no-allocation diff, reinstall demo, corrected-layer demo). Run in the Browser Lab context via blob navigation; numeric summary in `window.__paperSummary`, gutter metrics in `window.__gutterMetrics`, layer evidence in `window.__layerEvidence`.

Screenshot evidence (host browser media):
- `...\CindyGlobal\browser-runtime\media\browser\e77f0ecb314a9417.jpg` — full harness page (composite + R/G/B/A channels + evidence tables).
- `...\CindyGlobal\browser-runtime\media\browser\ba9f7fd4cde5f8e2.jpg` — shadow/UI comparison: Panel A (canvas spans full 228, blue outer glow reaches the frame edge) + Panel B (opaque 200×200/r16 panel shell at (14,14), singular CSS shadow in the gutter, UI pills clipped inside).
- `...\CindyGlobal\browser-runtime\media\browser\9d09a461fb02045c.jpg` — corrected-layer demo: **FX ON** (orange paper material through the transparent clip + blue-purple gutter glow + singular shadow) and **FX OFF** (same DOM, blank FX: real shell gradient + singular shadow only).

## 4a. Corrected layer model (Lead correction round)

**Lead decision**: the approved layer split permits a transparent nested UI content clip ABOVE the FX canvas while the REAL panel shell retains the actual panel background and interactive authority. Minimum correction applied (no repair round beyond it):

- Added the **real panel shell** below the FX canvas in `LabOverlayStage` paper mode — `getPanelShellStyle(colors, { radius: 16, boxShadow: colors.panelShadow })`, i.e. the actual production `linear-gradient(bgGradientStart→bgGradientEnd)` panel background and the SINGULAR production `panelShadow` (no duplication).
- The **nested UI content clip** above the FX canvas is fully transparent: `background: none`, `boxShadow: none`, `overflow: hidden`, `borderRadius: 16`, `pointer-events: none`, `data-lab-panel-clip`.
- `data-lab-panel-shell` / `data-lab-panel-clip` layer order asserted by the source-contract test (shell index < surface index < clip index; exactly one `boxShadow: colors.panelShadow`; clip style block has no background/shadow).

### 4a.1 Evidence (real DOM on the blob harness, `window.__layerEvidence`)

| Check | Result | Meaning |
|---|---|---|
| `fxOn.panelCenterHit` | `panel-shell` | The transparent clip does NOT intercept — the real panel shell is the hit target at the panel center |
| `fxOn.panelEdgeHit` | `panel-shell` | Same at the panel edge |
| `fxOn.gutterHit` | `frame` | Gutter clicks reach the frame (origin authority) |
| `fxOn.clipPointerEvents` | `none` | The clip is never an interaction sink |
| `fxOn.clipBackgroundImage` / `clipBoxShadow` | `none` / `none` | The clip is fully transparent (FX visible through it) |
| `fxOn.shellBackground` | `linear-gradient(rgb(42,39,49) 0%, rgb(33,31,39) 100%)` | Real panel background present below FX |
| `fxOn.shellHasShadow` | `true` | The singular CSS shadow lives on the real shell |
| `fxOn.shadowOwnerCount` | `1` | **One** shadow owner — no duplication |
| `fxOn.fxCanvasCenterRGBA` | `[255,113,31,255]` | Real paper material at the panel center (opaque, visible through the transparent clip) |
| `fxOn.pillInheritsPointerEvents` | `none` | `pointer-events` is inherited: the clip's `none` propagates to children → UI content inside the clip is read-only in paper mode |
| `fxOn.pillHitWithExplicitAuto` | `ui-pill` | Explicit `pointer-events: auto` on a child re-enables it (production-faithful per-element opt-in) |
| `fxOff.panelCenterHit` | `panel-shell` | Same hit model with FX off |
| `fxOff.fxBlank` | `true` | FX OFF = the canvas is fully transparent (no material allocated) |
| Pill clip geometry | layout rect overflows the clip boundary (right 381 > clip 342) and is **visually clipped** by `overflow: hidden` + `borderRadius: 16` | UI stays clipped to the panel silhouette |

**Interaction model (paper mode)**: the clip is purely a clipping boundary — it never intercepts; the real panel shell / frame remains the interaction authority; UI content inside the clip is read-only by default (inherits `pointer-events: none`) and can be re-enabled per element with explicit `pointer-events: auto` (verified). FX OFF vs FX ON confirmed in the screenshot: FX OFF shows only the real shell gradient + singular shadow; FX ON shows the paper material through the transparent clip with the gutter glow and the same singular shadow.

---

## 5. Lead validation

The Cindy Lead completed host validation after the Worker handoff:

1. Focused Vitest (`expandedPresentationSurface`, runtime, scenarios, renderer reuse): **77/77 PASS**.
2. `npm run type-check`: **PASS**.
3. `npm run lint -- --quiet`: **PASS**.
4. Full `npm test`: **1779/1780 PASS**; the sole failure is the reproduced pre-existing
   `browser-extension/architecture-guard.test.js:277` guard.
5. `git diff --check`: **PASS**, with CRLF conversion warnings only.

The Lead's direct visual/architecture verdict supersedes the Worker's five-question interpretation;
see `lead-review.md`. The three browser screenshots were copied into the task-local `evidence/`
directory so review does not depend on the transient browser-runtime path.

## 6. Boundaries honored
Lab-only (`paper` never set by production; lab wiring only); one canvas/program/draw + one lazy CPU texture; no framebuffer/second pass/`generateMipmap`; no entry/exit/timing/Refraction redesign; no native resize; no commit/archive; prior dirty Boundary-Driven spike changes preserved; runtime scheduling unchanged (the `expandedPresentationRuntime.ts` paper changes were **reverted** — Paper mode is static, renders once on wake, zero continuing frames); RM static with zero continuing frames; one `ExpandedPresentationSurface` authority.

**Correction round scope**: only the Lab paper-mode layer model changed (real panel shell added below FX, nested clip made fully transparent above FX, singular shadow kept on the real shell, tests + harness + report updated). No production file, no runtime, no geometry/material/shaders changed in the correction round.
