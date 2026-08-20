# MR9 Literal Fidelity Spike — Literal-Reuse Map (pre-implementation)

Source authority: `@paper-design/shaders@0.0.80`
`packages/shaders/src/shaders/heatmap.ts` (verified local copy
`D:\paper-ref\heatmap-upstream.ts`, 487 lines; packaged artifacts under
`D:\paper-ref\package\`). License Apache-2.0 (package.json); packaged
`LICENSE` (full Apache-2.0 text) and `NOTICE` ("Paper Shaders, Copyright 2026
Paper, Powered by Paper Shaders: https://shaders.paper.design").

Target: `src/presentation/main-window/ExpandedPresentationSurface.tsx` heatmap
block + renderer, one canvas/program/runtime/draw, lab-only.

---

## A. Paper GLSL/preprocessing expressions reused literally or near-literally

### A1. Fragment shader helpers (literal)
| Anchor | Paper | Ameow |
|---|---|---|
| L77–79 | `float circle(vec2 uv, vec2 c, vec2 r) { return 1. - smoothstep(r[0], r[1], length(uv - c)); }` | reused verbatim |
| L81–83 | `float lst(float e0, float e1, float x) { return clamp((x - e0) / (e1 - e0), 0., 1.); }` | reused verbatim |
| L85–86 | `float sst(float e0, float e1, float x) { return smoothstep(e0, e1, x); }` | reused verbatim |

### A2. Moving negative-field structure (Paper `shadowShape` L90–164) — REMOVED
**Replaced by the Ameow-original latent thermal carrier** (Latent Carrier spike,
`research/mr9-latent-carrier.md`): Paper's Apple `shadowShape` translating-blob
helper (L90–164) and the `circle`/`lst`/`sst` helpers (L77–86) are removed from
`ExpandedPresentationSurface.tsx`. The three phase-offset *negative fields* that
Paper's `main()` subtracted are now driven by `latentCarrier(uv, p)` — a
continuous, low-frequency, warped-sin scalar field reconstructed from shader
phase/time, consumed only through soft thresholded subtractive carve and a
low-amplitude halo term. It is never drawn directly and carries no geometry
authority.

### A3. `main()` composition (L187–296)
| Anchor | Paper | Ameow |
|---|---|---|
| L225 | `float shape = img[0];` | `float shape = img[0];` (full rounded-window surface from generated texture) |
| L229–231 | `outerBlur = 1. - mix(1., img[1], shape); innerBlur = mix(img[1], 0., shape); contour = mix(img[2], 0., shape);` | only `shape = img[0]` kept; the window surface fills the interior so G/B are uniform inside and `outerBlur`/`contour` are removed (no interior silhouette edge) |
| L239–242 | `inner = .8 + .8*innerBlur; inner = mix(inner, 0., shadow); inner = mix(inner, 0., shadowCopy); inner = mix(inner, 0., shadowCopy2);` | `inner = 0.34 + 0.62*depth` (boundary-anchored, SDF depth) then `mix(inner, 0., carveA/B/C)` — three phase-offset latent-carrier carves (pattern adapted from L235–242) |
| L243 | `inner *= mix(0., 2., u_innerGlow);` | removed (fixed weight in the boundary-anchored base) |
| L246 | `inner += (u_contour * 2.) * contour;` | removed (contour re-saturation collapses with full-window shape); contour richness is supplied by the carrier's fine-scale carve modulation |
| L247–248 | `inner = min(1., inner); inner *= (1. - shape);` | `min(1., inner)` kept; shape-erase removed (would erase the whole visible surface) |
| L250–262 | `t *= 3.; t = mod(t-.1, 1.); outer = .9*pow(outerBlur,.8); y = mod(animationUV.y - t, 1.); animatedMask = sst(.3,.65,y)*(1.-sst(.65,1.,y)); animatedMask = .5+animatedMask; outer *= animatedMask; outer *= mix(0.,5.,pow(u_outerGlow,2.)); outer *= imgSoftFrame;` | adapted to `rimHalo = (1. - smoothstep(0.,0.22,depth)) * shellLine; outer = 0.10 * rimHalo * (1. - carrierA)` — a low-amplitude carrier-modulated cool halo hugging the real rounded boundary (never a hot frame) |
| L264–265 | `inner = pow(inner, 1.2); float heat = clamp(inner + outer, 0., 1.);` | verbatim |
| L268–269 | grain `heat += (.005 + .35*u_noise) * (fract(sin(dot(uv, vec2(12.9898,78.233)))*43758.5453123) - .5);` | verbatim with `u_noise = 0.03` (subtle) |
| L272–283 | palette loop `mixer = heat*u_colorsCount; gradient = u_colors[0]; gradient.rgb *= gradient.a; ... if (i==1) outerShape = m; c.rgb *= c.a; gradient = mix(gradient, c, m); color = gradient.rgb * outerShape; opacity = gradient.a * outerShape;` | verbatim, Ameow 8-stop ramp |
| L285–286 | `bgColor = u_colorBack.rgb*u_colorBack.a; color += bgColor*(1.-opacity); opacity += u_colorBack.a*(1.-opacity);` | verbatim, Ameow navy back |
| L287 | `color += .02 * (fract(sin(dot(uv+1., ...))*...) - .5);` | verbatim |

### A4. Preprocessing (Paper `toProcessedHeatmap`/`blurGray`/`multiPassBlurGray`, L297–487)
Reused: channel semantics **R=shape mask, G=big blur, B=small blur, A=255**;
integral-image box blur (`blurGray`) + multi-pass (`multiPassBlurGray`).
| Anchor | Paper | Ameow |
|---|---|---|
| L351–370 | bigBlurRadius = 0.15*size; innerBlurRadius = max(1, round(0.12*big)); contourRadius = 5; pack R=contour, G=big, B=inner | adapted to the rounded-rect **core** mask: R=core mask, G=bigBlur(3 passes), B=smallBlur(3 passes), A=255; radii relative to core size |
| L398–445 | `blurGray` integral-image box blur; `multiPassBlurGray` | adapted verbatim (TypeScript) |
| **Excluded** | SVG/image loading, luma conversion, canvas 2D pipeline | replaced by direct mask rasterization (no image) |

## B. Paper pieces EXCLUDED (never implemented)
- Apple `shadowShape` geometry: right/top/bottom circles, leaf, random balls (L119–162), the `contour`-driven top circle.
- **Latent Carrier spike (2026-08-20)**: the whole `shadowShape` helper (L90–164) and the `circle`/`lst`/`sst` helpers (L77–86) are removed and replaced by the Ameow-original latent thermal carrier. Paper's `main()` composition, palette loop, grain, composite, and the boundary-texture preprocessing remain adapted.
- Paper React `ShaderMount`/`ShaderSizing` runtime, `u_image` diamond/logo image.
- `blurEdge3x3` in-shader extra blur (L166–186) — skipped for the small texture (documented; G already multi-pass blurred).
- `u_angle` rotation — Ameow keeps the window orientation (angle 0).
- `getImgFrame`/`imgSoftFrame` (L46–56) — replaced by Ameow `windowEdgeFade` (analytic SDF falloff of the existing rounded window), so the Main Window rim stays cool.
- `heatmapMeta` color-count plumbing, `u_colors` uniforms — inlined as the Ameow 8-stop ramp.

## C. Ameow substitutions
| Paper input | Ameow substitution |
|---|---|
| Logo image (diamond) | **Full rounded-window surface** = the existing Main Window geometry projection (200×200/16px), rasterized into the boundary texture. The synthetic interior rounded-rect core void was removed in the MR9 repair; no internal object remains (Latent Carrier spike keeps only the full-window surface + SDF anchoring). |
| `u_image` texture | `u_heatmapBoundary` — renderer-owned RGBA texture generated lazily on the first Lab Heatmap draw / recreated after context restore on the next Heatmap draw / deleted on dispose (CPU box-blur, no GPU pass, no framebuffer). Production/default draws do not allocate it. Channels unchanged: R=window surface, G=big blur, B=small blur, A=255. |
| `u_time` / `t = .1*u_time - .3` | `p = reducedMotion ? <pinned mid> : fract(t * 0.10)` — Ameow's ~10s material cycle; Reduced Motion pins a bounded mid snapshot (no travelling frames). The latent carrier is reconstructed from `p`. |
| `shadowShape` (Apple blob) | **Latent thermal carrier** — Ameow-original continuous low-frequency warped-sin scalar field; three phase-offset instances drive soft subtractive carves and a low-amplitude halo. Never drawn; no geometry authority. |
| `u_innerGlow/u_outerGlow/u_contour/u_noise/u_colorsCount/u_colorBack` | fixed Ameow constants (innerGlow folded into the boundary-anchored base, outerGlow folded into `outer = 0.10*rimHalo*(1-carrierA)`, contour via carrier fine-scale carve modulation, noise≈0.03, 8 colors, navy back). |
| `u_angle` | 0 (window orientation). |
| `imgSoftFrame` | `rimEdgeFade = smoothstep(0.0, 0.10, -roundedBoundary(uv))` from the existing `roundedBoundary` SDF — keeps the Main Window rim cool/blue (no full hot perimeter). |

## D. License/notice files required (derivative obligations TRIGGERED)
- Full Apache-2.0 LICENSE text for the adapted portion.
- Paper NOTICE/attribution ("Paper Shaders, Copyright 2026 Paper, https://shaders.paper.design").
- Prominent modification notice (adapted source + Ameow substitutions; no trademark endorsement).
- Keep Ameow's MIT root LICENSE intact (do not overwrite).
→ Deliver as `THIRD_PARTY_NOTICES.md` at repo root (single traveling artifact), plus a modification-marker header in the adapted source file.
