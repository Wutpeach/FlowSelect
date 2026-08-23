# Research: Upstream Paper Heatmap Pipeline

- Query: Which official source stages define object, interior, exterior, motion, and heat-field domain?
- Scope: external upstream source plus published package
- Date: 2026-08-23

## Authority

- Package: `@paper-design/shaders-react@0.0.80` with exact `@paper-design/shaders@0.0.80`.
- Published npm `gitHead`: `60467401863c1917dd02016d0c1ff2f791d0b3c8`.
- Core source: <https://github.com/paper-design/shaders/blob/60467401863c1917dd02016d0c1ff2f791d0b3c8/packages/shaders/src/shaders/heatmap.ts>.
- React wrapper: <https://github.com/paper-design/shaders/blob/60467401863c1917dd02016d0c1ff2f791d0b3c8/packages/shaders-react/src/shaders/heatmap.tsx>.
- Mount/runtime: <https://github.com/paper-design/shaders/blob/60467401863c1917dd02016d0c1ff2f791d0b3c8/packages/shaders/src/shader-mount.ts>.

## Source Pipeline

| Stage | Official behavior | Responsibility |
| --- | --- | --- |
| React wrapper | Resolves the image, runs `toProcessedHeatmap`, builds official defaults/uniforms, then mounts `ShaderMount` with mipmaps. | Component defaults and lifecycle handoff, not domain selection. |
| Preprocessing | `heatmap.ts:299-376` uses a 1000px source dimension, 375px padding, white prefill, RGB luminance, broad/narrow/contour blurs, then packs contour/broad/narrow into R/G/B and writes alpha 255. | Converts a black-on-white input into the scalar channels consumed by the shader. Transparency is interpreted through the white prefill. |
| Coordinates | `heatmap.ts:189-226` derives `imgUV` from Paper sizing, applies the fixed `0.5714285714` image transform, and rotates `animationUV` by the official angle uniform. | Preprocessing/coordinate grammar and spatial sampling. |
| Domain split | `shape = img[0]` at line 227; `outerBlur`, `innerBlur`, and `contour` are formed at lines 231-233; `inner *= (1. - shape)` at line 250. | Defines which side of the processed object boundary feeds each branch. |
| Motion/morphology | `t = .1 * u_time - .3`, three phase-shifted `shadowShape` evaluations, and the outer `animatedMask` at lines 235-264. | Paper-native timing, morphology, and traversal. |
| Heat/palette | `heat = clamp(inner + outer, 0., 1.)` at line 267, followed by noise, the official palette loop, and `u_colorBack` composition. | Heat accumulation, palette, alpha, and final output. |
| Runtime | `ShaderMount` owns the WebGL2 canvas/program, texture/mipmap upload, sizing, observers, frame clock/RAF, pausing, and disposal. | Canvas and animation authority. |

## Object / Interior / Exterior Semantics

Fact: for the accepted black r16 source on Paper's white-preprocessed background, the object interior tends toward `shape≈0`, while exterior tends toward `shape≈1`; broad channel G tends toward 0 deep inside the black object and 1 far outside.

The official outer-domain expression is:

```glsl
float outerBlur = 1. - mix(1., img[1], shape);
```

It is algebraically `shape * (1 - G)`: zero in the object interior and active only on the exterior side of the boundary. The existing animated outer mask is therefore domain-gated outside the object before heat accumulation.

The official inner and contour terms use the complementary side:

```glsl
float innerBlur = mix(img[1], 0., shape);
float contour = mix(img[2], 0., shape);
...
inner *= (1. - shape);
```

These are object-interior terms. They retain Paper's three subtractive `shadowShape` evaluations, but repository evidence shows they do not yield visible moving central heat for the Ameow full-panel object.

## Minimum Source Seam

Evidence supports one conceptual change at official line 231:

```glsl
// Official exterior selector
float outerBlur = 1. - mix(1., img[1], shape);

// Candidate interior selector
float outerBlur = 1. - mix(1., img[1], 1. - shape);
```

Truth table:

| Region | `shape` | Official | Candidate |
| --- | ---: | ---: | ---: |
| Object/panel interior | 0 | 0 | `1 - G` |
| Object exterior | 1 | `1 - G` | 0 |

Fact: this changes only which side of the existing boundary feeds Paper's already-native animated outer branch. It leaves the G channel, coordinates, time, masks, amplitude, heat sum, palette, compositing, mount, and lifecycle intact.

Inference to test: the selector inversion should move the visible Paper-native moving band into the panel interior. It is not visually proven until an isolated Browser Lab prototype passes the falsification gates.

## Caveats

- The variable remains named `outerBlur`; renaming it would increase textual churn without changing behavior and is not part of the minimum experiment.
- No alternative formula, prop sweep, blur change, timing change, or palette change is justified before this single seam is tested.

