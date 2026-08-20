# MR9 Latent Thermal Carrier + Boundary Anchoring Spike (Browser Lab Frame 2–5)

**Worktree**: `D:\Ameow\.cindy-worktrees\mr9-fullscreen-activation-fx`
**Lab**: dev-only Browser Lab `http://127.0.0.1:1421/lab.html` (existing Vite)
**Baseline**: the MR9 core-removal repair (`research/mr9-core-removal-repair.md`)
— the synthetic centered core is already gone; this spike restores Paper-like
inner/outer/contour richness **without** any visible fixed internal geometry,
re-anchoring the material to the real 200×200/16px rounded Main Window boundary.
**No commit. No production integration. No Frame 1/6–7/Chase/Closure/Lens/Noise.**

---

## 1. Problem

After the core-removal repair the field is morphologically honest but thin: the
warm interior (uniform `0.8` base) plus three Paper translating-blob shadows
produced a "two thermal bands with a moving cool gap". It lacks Paper's
inner/outer/contour richness and, because the shadows translated a primitive,
the cooler regions read as moving blobs rather than continuous deforming
morphology. The window boundary participates only as a thin cool rim.

## 2. Design

### 2.1 Latent thermal carrier (Ameow-original, no second geometry authority)
`latentCarrier(vec2 uv, float p)` is a pure, continuous, low-frequency scalar
field reconstructed entirely from the current shader phase `p`
(`p = reducedMotion ? 0.28 : fract(t * 0.10)`). It is the sum of four warped
sinusoids plus a low-frequency flow warp:

```
w = uv + 0.09 * vec2(sin(uv.y*3.3 + p*τ*0.7), cos(uv.x*2.7 - p*τ*0.5))
c = 0.55*sin(w.x*4.1 + p*τ*0.45) + 0.35*sin(w.y*3.6 - p*τ*0.35)
  + 0.20*sin((w.x+w.y)*2.2 + p*τ*0.30) + 0.12*sin((w.x-w.y)*5.4 - p*τ*0.25)
carrier = clamp(c*0.5 + 0.5, 0.0, 1.0)
```

- **Reconstructible**: pure function of `uv` and `p` — no external state, no
  uniform other than the existing time, no per-frame CPU work.
- **Continuously deforming**: the warp + phase terms make iso-lines bulge,
  shift, pinch and reshape as `p` advances — not a translating primitive.
- **Never an object**: it is consumed only through (a) soft thresholded
  subtractive carve (`smoothstep(0.52,0.92,carrier)`) and (b) a low-amplitude
  halo term (`0.10 * rimHalo * (1.0 - carrierA)`). Its contour is never drawn
  and it is never mapped 1:1 to warm color.
- **Not a geometry authority**: it has no Product/layout/lifecycle/native
  meaning; the sole visible geometry remains the rounded Main Window surface.

### 2.2 Boundary anchoring (independent of the carrier)
The real rounded-window boundary participates separately:
- `depth = smoothstep(0.0, 0.28, -roundedBoundary(uv))` — SDF distance from the
  real rim (0 at the shell, 1 deep inside), continuous through the rounded
  corners. It drives the warm interior gradient and the broad cool halo, so the
  material reaches straight edges and corners (no inset active rectangle).
- `shellLine = smoothstep(0.25, 0.85, shape)` — the texture's shape channel
  gates the halo to the exact rounded shell line.
- `rimEdgeFade(uv)` keeps the exact rim cool (no full hot perimeter).
- The processed texture channels are unchanged (R=window surface, G=big blur,
  B=small blur, A=255; lazy, renderer-owned, immutable). Because the full-window
  surface fills the interior, G/B are uniform ~1 inside and carry only
  boundary/corner softness; the shape channel + the SDF (the same geometry
  authority the texture is rasterized from) do the interior anchoring.

### 2.3 Paper inner/outer/contour relationships restored vs still disabled
| Relationship | Paper (heatmap.ts) | Spike status |
|---|---|---|
| inner warm volume | `inner = .8 + .8*innerBlur` (L239) | **Adapted**: `inner = 0.34 + 0.62*depth` — boundary-anchored, cool blue halo at rim, warm deep interior, continuous everywhere |
| phase-offset subtractive | `mix(inner,0.,shadow/Copy/Copy2)` (L235–242) | **Adapted**: three phase-offset latent-carrier carves `carveA/B/C` (Paper L209–214 phase offsets) |
| contour | `inner += 2.*contour` (L246) | **Restored as soft multi-scale modulation**: a fine warped field modulates the carve strength (`mix(0.75,1.25,fine)`), so cool-region edges get irregular detail without a drawn line or 1:1 warm mapping |
| shape-erase | `inner *= (1.-shape)` (L247–248) | **Still disabled** (would erase the whole visible surface with window-as-shape) |
| outer band | `outer = .9*pow(outerBlur,.8)*animatedMask` (L250–262) | **Restored as boundary-anchored cool halo**: `outer = 0.10 * rimHalo * (1.0 - carrierA)` — low amplitude, localized, never a hot frame |
| scalar-heat anchor | `heat = clamp(inner+outer,0.,1.)` (L265) | Kept literal |
| palette/grain/composite/early-out | L268–287 | Kept literal (Ameow 8-stop ramp, navy back) |

### 2.4 Removed Paper code
Paper's Apple `shadowShape` translating-blob helper (L90–164) and the now-dead
`circle`/`lst`/`sst` helpers (L77–86) are removed from the shader and replaced
by the latent carrier. The `MODIFIED DERIVATIVE` header, `THIRD_PARTY_NOTICES.md`
and `research/mr9-literal-reuse-map.md` are updated accordingly.

## 3. Channel semantics

Unchanged (honest, lazy, renderer-owned): `R = full rounded-window surface`,
`G = multi-pass big blur`, `B = multi-pass small blur`, `A = 255`. The shader
consumes `img[0]` (shape → shellLine) and the `img.a == 0` early-out; the SDF
(`roundedBoundary`, same geometry authority as the rasterizer) drives interior
depth/corner continuity. No channel was added or repurposed; no extra texture,
framebuffer, or pass.

## 4. Files changed (this spike)

- `src/presentation/main-window/ExpandedPresentationSurface.tsx` — shader:
  `latentCarrier` replaces `heatmapShadow`; `heatmapOutput` body re-anchored to
  the boundary and driven by the carrier; dead `circle`/`lst`/`sst` removed;
  derivative header updated. Renderer/lifecycle untouched.
- `src/presentation/main-window/expandedPresentationSurface.test.ts` — contract
  tests updated/added (see §6).
- `THIRD_PARTY_NOTICES.md` — modification notice updated for the carrier.
- `research/mr9-literal-reuse-map.md` — reuse map updated (A2/A3/B/C).
- `research/capture-mr9-carrier.mjs`, `research/analyze_carrier.py` — capture +
  analysis harnesses for this spike.
- `research/mr9-latent-carrier.md` — this artifact.

## 5. Visual gate checklist (final — replacement Worker verdict)

- [x] No **full/permanent hot perimeter** — PASS (rim stays cool in every phase; `band_hot` is localized interior mass, never a rim frame).
- [x] Cool regions bulge/shift/pinch/reshape with blue/cyan/yellow/orange-red transitions — PASS (real morphing; phase diffs 30–100+).
- [ ] No fixed/centered **or recognizable moving** internal object — **FAIL** (a single localized vertical column/block is visible and moves across phases; vision reads it as a recognizable rounded-rectangular column; centroid shifts x=136→158 across F2→F5).
- [ ] Thermal field **visibly attached to the real rounded straight edges/corners** — **FAIL** (edge band p50 brightness = 6.0, p90 ≈ 32 vs the accepted core-removal repair p90 ≈ 100–105 and p99 ≈ 155–171; bright edge-band pixels 0.6–0.9% vs 15–18%; every vision pass reads "inset with dark margins", 0/4 edges touched).
- [ ] Paper-like inner/outer/contour richness **visibly improved over core-removal** — **FAIL** (single dominant column with one blue halo vs the repair's two moving thermal bands; vision judges the carrier thinner/more localized than the repair).

## 6. Source-contract tests (this spike)

- one canvas / one program / one draw call; no framebuffer/second pass;
- no `heatmapShadow`/`posY`/`circle`/`sst` (translating-blob + dead helpers
  removed); no fixed/substitute internal geometry rasterizer;
- `latentCarrier` is continuous time-varying sin math (no primitive, no
  external state) and is consumed only via soft carve + low-amplitude halo
  (never 1:1 warm mapping);
- real rounded-window boundary independently participates (`depth`,
  `shellLine`, `rimHalo`, `rimEdgeFade`);
- no perimeter coordinate / Chase / Closure grammar in the heatmap block;
- lazy texture absent for fresh default Progress; Reduced Motion frozen;
- license/NOTICE markers present.

## 7. Validation & captures — COMPLETE (replacement Worker, 2026-08-20)

> The environment is fully operational in this replacement run; the prior
> "sandbox bash unavailable" block did not recur. Every report below is from an
> actual execution, not source assertion.

### Automated
| Gate | Result |
| --- | --- |
| Focused Vitest (`expandedPresentationSurface` 19 + `expandedPresentationRuntime` 15) | **PASS** — 34/34 |
| Lab scenario/runtime/rendererReuse/stateFixtures/exportPng | **PASS** — 67/67 (5 files) |
| `npm run type-check` | **PASS** |
| `npm run lint -- --quiet` | **PASS** |
| `git diff --check` | **PASS** (only pre-existing CRLF warnings) |
| Full suite `npm test` | **PASS except 1 known untouched** — 199 files / 1768 passed / 1 failed. The failure is `browser-extension/architecture-guard.test.js:277` (source-shape assertion), file unchanged vs HEAD (`git diff` empty), reproduces on the clean MR8 baseline, owned outside MR9. |

### Browser Lab phase-pinned captures (`capture-mr9-carrier.mjs`, Playwright)
Outputs in `research/mr9-latent-carrier/`:
- Chronological F2–F5 + in-betweens + reduced: `f2.png` (p=0.10), `in-between-a.png` (0.14), `f3.png` (0.18), `in-between-b.png` (0.22), `f4.png` (0.26), `in-between-c.png` (0.30), `f5.png` (0.34), `reduced.png` (0.28). Captured k vs target error < 0.005 each.
- Contact sheet: `carrier-contact-sheet.png`; three-way Paper vs repair vs carrier: `paper-vs-repair-vs-carrier.png`.
- Simulator cross-check: `simcar-f2..f5.png`, `simcar-red.png` (Python mirror of the exact GLSL; verified faithful — 79% of pixels within mean-diff < 15 of the real capture at the matched phase; residual divergence is phase-motion blur during the moving screenshot).
- One-correction prototypes (see §7a): `simcar-gated-*.png`, `simcar-anchor-*.png`.
- Readout log: `capture-log.json`.

### WebGL / lifecycle readouts (`capture-log.json`)
- **Moving**: `canvasCount: 1`, `linked: true`, `heatmapMode: 1`, `cornerRadius: 0.08` (16/200), `reducedMotion: false`, exactly one bound texture on unit 0 (`boundTexture2D: true`, `activeTextureUnit: 33984` = TEXTURE0), `framebufferBound: null`, `pageErrors: []`.
- **Reduced**: `heatmapMode: 1`, `reducedMotion: true`, `uTimeFrozen: true` (t1 === t2 = 23.1134) — static bounded snapshot, zero travelling frames.
- **Cleared**: `heatmapMode: 0`, `linked: true`, `framebufferBound: null` (unit 0 keeps the prior binding state; the mode-0 draw never samples it).
- **Fresh default Progress** (reload, Heatmap category never opened): `heatmapMode: 0`, `boundTexture2D: false`, `framebufferBound: null`, `linked: true` — default Progress never allocates or binds the heatmap boundary texture. Lazy lifecycle confirmed.

### Pixel metrics (support only; the verdict is the visual judgement in §5/§7a)
| Frame | warm% | cool% | maxbright | edge-band p50/p90/p99 | edge>60% |
| --- | --- | --- | --- | --- | --- |
| F2 | 17.9 | 14.4 | 182.3 | 6.0 / 32.0 / 58.3 | 0.6% |
| F3 | 21.1 | 14.4 | 182.3 | 6.0 / 33.0 / 59.3 | 0.8% |
| F4 | 24.2 | 14.8 | 182.3 | 6.0 / 34.3 / 59.7 | 0.9% |
| F5 | 7.1 | 13.9 | 182.3 | 6.0 / 31.0 / 58.3 | 0.6% |
| Reduced | 24.7 | 14.8 | 182.3 | 6.0 / 34.3 / 60.0 | 0.9% |
| **Core-removal repair (accepted baseline)** | 0.7–13.1 | 22–34 | 170–183 | 5.7–7.0 / **30.7–105.3** / **109–171** | **15–18%** |

Frame-to-frame mean diff 30.0 → 29.4 → 98.6 → 100.7: the field actively morphs (never static). `maxbright` is constant at 182.3 (finite, clamped — no NaN/undefined `pow`; the pre-`pow` clamp is present and correct).

## 7a. Defect audit + the one minimal evidence-backed correction (REJECT)

### Audit results (task step 2)
- **GLSL compile/runtime**: compiles and links (linked=true), runs with 0 page errors. All `pow` inputs are pre-clamped to [0,1] (the fine carve modulation may exceed 1 and sequential `mix` may go slightly negative, but `inner = clamp(inner, 0.0, 1.0)` before `pow` keeps the field NaN-free). Constant-bounds loop, const array constructors valid ES 3.00.
- **No latent primitive silhouette / exposed contour**: `latentCarrier` is pure warped-sin scalar math consumed only through soft carve + low-amplitude halo — no primitive is encoded and no contour is drawn. PASS as code.
- **Genuine continuous phase-dependent morph**: PASS (three phase-offset instances; morphing is real).
- **Rounded-window participation at straight edges and corners**: **FAILS**. The three carves drive `inner` to 0.0 at every edge midpoint at every phase (probe: `left/right/top/bottom-mid = 0.0` for p = 0.05…0.45), so the SDF-anchored rim is erased and the material never reaches the boundary. Edge-band p50 = 6.0 (dark) vs the accepted repair p90 ≈ 100–105.
- **No inset active rectangle / full hot perimeter**: no hot perimeter (PASS); the surviving visible mass is, however, inset from all four edges and reads as a single column (borderline/FAIL under the "recognizable moving geometry" and boundary gates).
- **Honest Paper reuse / notice**: `THIRD_PARTY_NOTICES.md` (complete Apache-2.0 text + Paper NOTICE + modification notice) and `research/mr9-literal-reuse-map.md` describe the carrier substitution accurately. The one inaccuracy found: the header/notice claim the rim stays "cool blue/cyan at the rim" and the material "reaches straight edges and corners" — actual behaviour is a dark inset margin; this is the defect below, not a license problem.

### Root cause (evidence-backed)
`inner = 0.34 + 0.62 * depth` anchors the interior to the real SDF, but the three full-field phase-offset carves (`smoothstep(0.52–0.96, carrier)`) operate uniformly over the whole window including the exact rim, driving `inner` to 0 at the boundary and across 34–58% of the window at every phase. The result is a single surviving warm column (the region where all three carriers are jointly low), a dark inset margin everywhere else, and no boundary participation. This violates the decision that the rounded-window SDF/processed boundary field "must independently anchor halo, edge softness and corner continuity" — it is fully suppressible by the carrier.

### The one minimal evidence-backed correction (evaluated in the validated sim, NOT applied)
To restore boundary anchoring I gated the carves behind the boundary depth (interior-only carve) and added an SDF-only cool rim floor (`max(inner, rimAnchor)`), keeping `latentCarrier`, the palette, and every other term identical. Simulated at the exact GLSL (79% pixel-faithful):
- `simcar-gated-*`: rim still dark; edge-band >60% ≈ 4% (repair is 15–18%); vision reads 0/4 edges touched.
- `simcar-anchor-*`: a continuous blue rim halo appears but stays dark enough to read as a margin (edge >60% ≈ 4%, p90 still ≪ repair); the interior remains a single recognizable warm block; vision reads 0/4 edges touched.
The correction cannot bring the field to the repair's visible boundary reach without raising the anchor amplitude into a static blue frame / shell (forbidden geometry) or rebalancing carve thresholds (tuning, forbidden beyond the one minimal correction). It also does not remove the recognizable single-column interior morphology or restore multi-region Paper richness.

### Verdict — Visual REJECT
Hard-gate failures (inspected on the real captures, contact sheet, and three-way comparison, not metrics alone):
1. **Recognizable moving internal geometry** — the single localized vertical column is a recognizable moving object (vision, multiple passes).
2. **Field visibly participates in real rounded straight edges/corners** — inset with dark margins on all four straight edges and all four rounded corners; 0/4 edge contact; edge band dark (p50 = 6.0) and ~15–20× weaker than the accepted repair.
3. **Paper-like inner/outer/contour richness visibly improved over core-removal** — thinner/more localized than the repair; no multi-region structure.

Per the task's hard stop, this is the anticipated conflict: with the full rounded-window surface as the only geometry, Paper's composition collapses (contour-add / shape-erase / outer band all need a small silhouette, as the core-removal repair already documented), and the latent-carrier substitution — constrained to be an object-less scalar field that is never drawn and never a geometry authority — cannot simultaneously (a) avoid a recognizable moving warm mass, (b) restore visible boundary anchoring, and (c) restore Paper richness, without a second geometry, a redesign, or tuning beyond one minimal correction. The mechanism is therefore not accepted; the working tree is left unchanged (only research evidence added); no commit.

## 8. Hard stop

- No Frame 1 onset / Frames 6–7 exit / Chase / Closure / Lens / Noise /
  Dissipation / production integration.
- No second renderer, canvas, pass, framebuffer, generic carrier abstraction,
  motion framework, dependency, or CPU per-frame pipeline.
- No commit; the spike source, tests, notices and prior evidence are preserved
  unchanged by this replacement run (only `research/mr9-latent-carrier/`
  captures + this artifact were added).
- Remaining accepted defect (unchanged): B channel (small blur) is encoded but
  not sampled; persistent unit-0 binding after a heatmap draw is documented;
  fresh default Progress never allocates/binds (verified).
- No commit; prior repair evidence preserved.
