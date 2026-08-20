# MR9 Literal Fidelity Spike — Paper Heatmap Frame 2–5 Literal Adaptation Prototype

**Spike**: produce a **literal-fidelity** prototype of reference Frames 2→3→4→5
(authorized derivative reuse of `@paper-design/shaders@0.0.80` `heatmap.ts`),
rather than the clean-room grammar/mechanics candidates. Deliver a browser-only
prototype with correct derivative licensing, WebGL/texture lifecycle proof,
full-resolution captures, and a research artifact.

**Worktree**: `D:\Ameow\.cindy-worktrees\mr9-fullscreen-activation-fx`
**Lab**: dev-only Browser Lab `http://127.0.0.1:1421/lab.html` (existing Vite, no new dep)
**Files touched this spike** (only source + contract + license notice):
- `src/presentation/main-window/ExpandedPresentationSurface.tsx` (heatmap block + renderer)
- `src/presentation/main-window/expandedPresentationSurface.test.ts` (contract)
- `THIRD_PARTY_NOTICES.md` (repo root, new — Apache-2.0 + Paper NOTICE + modification notice)
All other dirty files in the worktree are pre-existing and untouched. **No commit.**

---

## 1. Source authority

Upstream: `@paper-design/shaders@0.0.80`
`packages/shaders/src/shaders/heatmap.ts` — local copy
`D:\paper-ref\heatmap-upstream.ts` (487 lines); packaged `D:\paper-ref\package\`
(`LICENSE` full Apache-2.0; `NOTICE` = "Paper Shaders, Copyright 2026 Paper,
Powered by Paper Shaders: https://shaders.paper.design").

Reuse map: `research/mr9-literal-reuse-map.md` (pre-implementation A–C mapping).

Visual reference: `research/mr9-paper-heatmap-reference-7frame.png`
(1448×1086, seven frames; heat starts at the top apex, spreads into an inward
thermal shell, morphs a cool cavity, peaks, contracts to the bottom apex).
Adapted to the **rounded Main Window**; the diamond is never reproduced.

## 2. What was copied/adapted (exact anchors)

### Copied verbatim (shader helpers)
| Anchor | Upstream | Ameow |
|---|---|---|
| L77–79 | `circle` (`1. - smoothstep(r[0], r[1], length(uv - c))`) | verbatim |
| L81–83 | `lst` | verbatim |
| L85–86 | `sst` | verbatim |

### Adapted near-literally (moving negative-field silhouette)
`heatmapShadow` ← Paper `shadowShape` (L90–164) with **all Apple geometry removed**
(right/top/bottom circles, leaf, random balls, contour top-circle):
- L91–102 descending blob `posY = mix(-1., 2., t)`, `mainCircleScale =
  sst(0.,.8,posY) * lst(1.4,.9,posY)`, vertical squash `* vec2(1., 1. +
  1.5*mainCircleScale)`
- L104–108 `innerR = .4`, `outerR = 1. - .3*(sst(.1,.2,t)*(1.-sst(.2,.5,t)))`,
  `pow(s, 1.4) * 1.2`
- L110–118 `topFlattener = lst(-.4,0.,pos)*(1.-sst(0.,1.2,pos))`, `pow(...,3.)`,
  mixed by `1.-sst(0.,.3,pos)`
- Renamed `shadowShape` → `heatmapShadow` (test contract keeps `shadowShape`
  absent).

### Adapted near-literally (composition, `heatmapOutput` ← Paper `main()` L187–296)
- Channel semantics: `shape = img[0]` (core mask), `outerBlur = 1.-mix(1.,img[1],shape)`,
  `innerBlur = mix(img[1],0.,shape)`, `contour = mix(img[2],0.,shape)` (L225–233)
- Three phase-offset shadows `p`, `fract(p+1./3.)`, `fract(p+2./3.)` (L209–214, 235–237)
- `inner = 0.8 + 0.8*innerBlur`; sequential `mix(inner, 0., shadow)` ×3; `min(1., inner)`;
  `inner *= (1. - shape)` (L239–248); `inner = pow(inner, 1.2)` (L264)
- Outer band `tOuter = fract(p*3. - 0.1)`; `y = fract(uv.y - tOuter)`;
  `animatedMask = sst(0.3,0.65,y)*(1.-sst(0.65,1.,y))`; `0.5 + animatedMask` (L250–262)
- `heat = clamp(inner + outer, 0., 1.)` (L265); grain `(0.005+0.35*0.03)*(hash-0.5)` (L268–269);
  extra fine grain `0.02*(hash(uv+1.)-0.5)` (L287)
- Premultiplied gradient loop (L272–283): `HEAT_ALPHA[8] = (0.00,0.65,0.90,1.00×5)`,
  `rgb *= a`, `if (i == 1) outerShape = m;`, `heatColor = gradient.rgb * outerShape`,
  composite over back color, `heatAlpha += 1.*(1.-heatAlpha)`
- Early-out `if (img.a == 0.)` → navy (L216)

### Ameow substitutions (not Paper)
- Paper `u_image` → renderer-owned **`u_heatmapBoundary`** (texture), built once from
  the existing Main Window geometry projection: interior rounded-rect core void,
  `HEATMAP_CORE_SCALE = 0.30`, same normalized corner radius
  (`MAIN_WINDOW_FULL_PANEL_RADIUS / MAIN_WINDOW_PANEL_SIZE = 16/200 = 0.08`).
  Preprocessing mirrors Paper `toProcessedHeatmap` (integral box blur):
  R = core mask blurred 5px; G = big blur `0.12 × 256 ≈ 22` px ×3 passes;
  B = small blur `0.12 × big` ×3 passes; A = 255. 256×256, RGBA8, LINEAR,
  CLAMP_TO_EDGE. Created lazily on the first Lab Heatmap draw, recreated after
  context restore on the next Heatmap draw, and deleted on dispose. Production/
  default draws do not allocate the processed texture.
- Paper `imgSoftFrame` → `windowEdgeFade = smoothstep(0.,0.10,-roundedBoundary(uv))`
  — keeps the Main Window rim cool (no full hot perimeter).
- Paper uniforms inlined: `u_innerGlow=1`, `u_contour=1`, `u_outerGlow≈0.95`,
  `u_noise=0.03`, `u_colorBack = navy (0.008,0.012,0.038)`.
- Palette: Ameow 8-stop ramp deep blue→vivid blue→cyan→yellow→orange→red-orange
  (production `thermalVoid` untouched).
- Cycle: `p = reducedMotion ? 0.28 : fract(t*0.10)` (~10 s); Reduced Motion pins
  one bounded mid snapshot (`uTime` frozen by renderer).

## 3. Hard debugging: `clamp(0.0, 1.0, s)` reversed argument order

The first browser capture of the new config showed **heat ≈ 0 everywhere**
(faint blue only) while the Python simulator predicted ~12.5% warm. The bound
texture was verified correct (R/G/B matched the sim row-through-center), the
compiled fragment shader source was dumped from the live program and matched
the served module, uniforms confirmed (`uHeatmapMode=1`, `uReducedMotion=false`,
`uCornerRadius=0.08`). Root cause: the GLSL line

```
s = clamp(0.0, 1.0, s);   // clamp(value, min, max) — REVERSED
```

GLSL `clamp(x, minVal, maxVal)` with `minVal > maxVal` is **undefined**; on
SwiftShader it returned 1.0, making the three moving shadows erase the whole
warm field (the sim's earlier `clamp(0., 1., s)` bug mirrored exactly this).
Fixed to `s = clamp(s, 0.0, 1.0);`. After the fix, browser ↔ sim parity:
**median per-pixel RGB diff = 13/255** after the expected vertical flip
(browser vUv is bottom-up, sim is top-down); p90 = 69 (sharp contour/grain AA
differences). This proves the browser executes the intended Paper composition.

## 4. Validation evidence (automated)

| Check | Result |
|---|---|
| Focused Vitest `expandedPresentationSurface.test.ts` | **16/16 pass** (incl. literal-Paper composition anchors, texture lifecycle, boundary projection, license notice) |
| Full Vitest suite | 1765/1766 pass — only pre-existing `browser-extension/architecture-guard.test.js` failure (untouched, not in diff) |
| `npx tsc --noEmit` | pass |
| `npm run lint -- --quiet` | pass (0 issues) |
| `git diff --check` | clean (only pre-existing CRLF warnings) |
| Browser Lab readout | `canvasCount=1`, `linked=true`, `heatmapMode=1`, `boundTexture2D=true`, `activeTextureUnit=33984 (TEXTURE0)`, `framebufferBound=null`, `pageErrors=[]`, Reduced Motion `uTimeFrozen=true` |
| Texture lifecycle | created lazily on the first Lab Heatmap draw, bound on unit 0 + `uniform1i` for Heatmap draws, reconstructed after context restore on demand, and deleted on dispose; production/default draws allocate no texture; null texture → `img.a==0` early-out → navy (failure isolation) |

### Perimeter / artifact pixel checks (per-frame, hot = r>150 ∧ r>1.3g ∧ r>1.8b)
| Frame | boundary-band hot frac | center hot frac |
|---|---|---|
| f2 (p=0.10) | 0.0% | 0.0% |
| f3 (p=0.18) | 11.1% | 0.0% |
| f4 (p=0.26) | 13.9% | 9.4% |
| f5 (p=0.34) | 7.5% | 28.1% |
| in-between-b (0.22) | 11.5% | 0.0% |
| in-between-c (0.30) | 10.3% | 30.9% |
| reduced (0.28) | 12.7% | 17.7% |

No contiguous full hot Main Window frame at any phase (max boundary band 13.9%,
a full hot frame would be ~90%). Center heat varies 0→31% as the warm volume
sweeps — no static centered oval/cavity.

## 5. Captures (all in `research/mr9-literal-fidelity/`)

- Canonical Frames 2–5 aligned to Paper F2–F5: `f2.png` (p=0.10), `f3.png`
  (0.18), `f4.png` (0.26), `f5.png` (0.34); upscaled `f*-big.png`
- In-betweens: `in-between-a.png` (0.14), `in-between-b.png` (0.22),
  `in-between-c.png` (0.30)
- Reduced Motion: `reduced.png` (pinned p=0.28, uTime frozen)
- Labeled comparison/contact sheet: `paper-vs-ameow-comparison.png`
  (Paper F2–F5 diamond row vs Ameow F2–F5 rounded row)
- Metrics: `perimeter-analysis.json`, `capture-log.json` (readouts above)

## 6. Visual assessment (subjective, separated from automated evidence)

Vision review of the labeled comparison sheet (per Ameow frame):
- **F2**: plausible warm-onset (top band) + cool lower; no hot frame, no
  capsule/pointer/oval; smooth gradients.
- **F3**: warm top + cool lower, directionally consistent with Paper F3 but
  reads a bit split into bars; no hot frame/artifacts; smooth.
- **F4**: best match — warm volume expands while retaining a clear cool central
  pocket; no hot frame; the small centered rounded core void boundary is
  visible (Paper-logo analog); smooth.
- **F5**: warm field with an enlarged cool pocket, plausibly follows the Paper
  progression; no hot frame/artifacts; smooth.

Overall arc: emergence → spread → enclosure → pocket growth is reproduced with
**soft, continuously morphing fields** (morph, not translate). The centered
rounded-square core void (scale 0.30) is the Paper-logo analog; it is small,
never a full centered oval/capsule, and never reads as a black pointer.

## 7. License status

- Root `LICENSE` stays **MIT** (Copyright (c) 2026 Wutpeach) — untouched.
- New root **`THIRD_PARTY_NOTICES.md`** (in worktree): complete Apache-2.0 text
  (reproduced verbatim per Section 4), Paper `NOTICE` ("Paper Shaders, Copyright
  2026 Paper, https://shaders.paper.design"), and a modification notice
  identifying the adapted source (`ExpandedPresentationSurface.tsx`), the
  upstream (`heatmap.ts`), and the Ameow substitutions. No trademark endorsement.
- `MODIFIED DERIVATIVE of Paper Shaders Heatmap` header comment sits directly
  above the adapted shader block in the source.
- Contract test asserts the notice file + root license contents.

## 8. Remaining gaps (out of scope for this spike)

- Frames 1, 6, 7 (onset/exit) and Chase/Closure/Lens/Noise-Dissolve polish are
  explicitly excluded (Lead scope).
- Production integration (default-off `uHeatmapMode` gate only; no runtime
  wiring) not attempted.
- p90 pixel diff vs sim (69) from sharp contour/grain AA is acceptable; a
  high-frequency dither would close it but is unnecessary for the prototype.

## 9. Files changed (spike-scope only)

- `src/presentation/main-window/ExpandedPresentationSurface.tsx` — shader block
  + renderer texture lifecycle
- `src/presentation/main-window/expandedPresentationSurface.test.ts` — contract
- `THIRD_PARTY_NOTICES.md` — license deliverable (new)
- `research/mr9-literal-reuse-map.md`, `research/mr9-literal-fidelity.md` (this),
  `research/capture-mr9-literal.mjs`, `research/sim_literal.py`,
  `research/mr9-literal-fidelity/*` — research/evidence (new)

---

## 10. Cindy Lead review

The derivative, texture ownership, and single-renderer architecture are valid.
Lead changed the processed boundary texture to lazy Lab-only allocation: a
fresh non-Heatmap Progress draw reports `uHeatmapMode=0`, no bound texture, and
no framebuffer; the first Heatmap draw creates and binds one read-only
`TEXTURE_2D`. Context restoration reinstalls an empty renderer slot and the
next Heatmap draw reconstructs it; disposal deletes it. Production/default
draws therefore pay no preprocessing or texture-allocation cost.

The first prototype does **not** pass human visual acceptance. In
`paper-vs-ameow-comparison.png`, the 0.30-scale processed core is clearly
visible as a centered blue rounded-square outline/fixed hole. The warm field
forms top/bottom rectangular bands and, in F4/F5, a red-orange shape wrapped
around that square hole. This remains UI-like geometry rather than Paper's
broad, continuously blended thermal morphology. The captured gradients are
softer than the previous capsule candidate, but their spatial distribution is
still materially unlike Paper Frames 2–5.

Automated perimeter metrics prove only that the Main Window boundary is not a
100% red/orange frame. They do not prove absence of an interior rounded-square
frame or fixed geometric hole. Treat this spike as evidence that literal Paper
composition and renderer-owned preprocessing are feasible, but treat the
visual candidate itself as **Visual REJECT**. Do not continue onset, exit,
Chase, Closure, Lens, Noise, production integration, or further fidelity
polish without a new user-reviewed direction.
