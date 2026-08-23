# Planning Report: Paper Official Source-Level High-Fidelity Adaptation

## Architecture Decision

**Recommendation: bounded GO for one isolated Browser Lab prototype after GPT Architecture Lead Planning Review.**

The minimum conceptual boundary is one expression in Paper 0.0.80's official fragment source. It changes which side of the processed object boundary feeds Paper's existing animated outer branch:

```glsl
// Official source, exterior domain
float outerBlur = 1. - mix(1., img[1], shape);

// Proposed derivative, interior domain
float outerBlur = 1. - mix(1., img[1], 1. - shape);
```

No second source formula is approved. If this candidate does not create recognizable Paper-native motion inside the panel, the minimum adaptation is a NO-GO and the experiment stops.

## 1. Official Source Pipeline and Responsibility Boundary

Authority is `@paper-design/shaders-react@0.0.80` with exact `@paper-design/shaders@0.0.80`, npm `gitHead` `60467401863c1917dd02016d0c1ff2f791d0b3c8`.

```text
black 200x200/r16 computational SVG
  -> official React Heatmap wrapper
  -> official toProcessedHeatmap
       white prefill + luminance
       R contour / G broad / B narrow / A 255
  -> official sizing + fixed image UV transform
  -> official fragment shader
       shape/domain split
       inner shadowShape x3 + outer animatedMask
       heat sum + Paper palette + colorBack composition
  -> official ShaderMount
       WebGL2 canvas + textures/mipmaps + observers + RAF + disposal
```

| Responsibility | Official boundary |
| --- | --- |
| Object encoding | `toProcessedHeatmap`: black source on white-preprocessed scalar space. |
| Coordinate grammar | Paper sizing vertex path, `v_imageUV`, fixed `0.5714285714` transform, angle rotation. |
| Interior/exterior split | `shape=img[0]`; `outerBlur`, `innerBlur`, and `contour` formulas; final inner `(1-shape)` gate. |
| Motion/timing | `t=.1*u_time-.3`, three phase-offset `shadowShape` calls, outer `animatedMask`. |
| Heat/material | `inner+outer`, official noise, seven-stop palette, alpha/background composition. |
| Runtime | `ShaderMount` frame clock, RAF, canvas/program, mipmaps, observers, pause/resume, disposal. |
| Ameow mapping | r16 SVG input, one real r16 panel, transparent `colorBack`, r16 external viewport, mutually exclusive Lab route. |

The processed R channel is the shape selector. For the accepted black panel input, `shape≈0` in the panel interior and `shape≈1` outside. The broad G channel is near 0 deep inside and near 1 far outside.

The official expression is algebraically `shape * (1-G)`, so the visible animated outer term is explicitly exterior-only. The proposed expression is `(1-shape) * (1-G)`, so it mirrors that same field into the object interior and zeros it outside.

## 2. Why the Current Result Is Perimeter-Oriented

Repository evidence rules out timing and composition as the root cause:

- The official baseline showed native frame advancement and Paper's characteristic moving blue/warm perimeter field.
- Scheme B used one real 200×200/r16 panel, the accepted r16 computational SVG, official transparent background composition, and one r16 viewport. It changed no Paper motion or shader source.
- The final C0-C4 public-prop matrix kept that composition fixed. C1 (`scale=1`) and C2 (`innerGlow=1`) did not create central moving heat. C3/C4 disabled `outerGlow`; visible movement disappeared while frame clocks continued. C4's raw 200×200 start/end captures were byte-identical.

Therefore the branch producing visible motion for this geometry is Paper's outer branch, and official source line 231 forces it to object exterior. Because Ameow's computational object nearly fills the 200×200 viewport, that exterior energy is perceived at the r16 perimeter and clipped by the panel viewport.

The smallest causal boundary is not the panel theme, transparent background, CSS clip, Production Thermal, or Paper's RAF. It is the source domain selector at the junction of the official outer branch and Ameow's intentionally fixed r16 object input.

## 3. Recommended Minimum Adaptation

Change only `shape` to `1-shape` in the `outerBlur` selector. This keeps:

- the same broad G field and its Paper preprocessing origin;
- the same object boundary and coordinate sampling;
- the same outer moving mask, direction, phase, and amplitude;
- the same heat accumulation, palette, grain, and alpha composition;
- the same native mount, clock, and resource lifecycle.

This is a Paper derivative, not a clean-room rewrite, because the copied fragment remains Paper's source and carries one documented editorial modification inside the original pipeline. Ameow does not reconstruct `shadowShape`, invent a carrier, or replace Paper timing/palette/morphology.

The textual repository boundary may include a Lab-local derivative shader module and minimal adapter because the published React `Heatmap` does not expose `fragmentShader` injection. That packaging seam must not be confused with the conceptual seam: only the selector may change behavior. Official exported preprocessing, defaults/uniform grammar, sizing, color parsing, and `ShaderMount` remain authoritative.

## 4. Untouched / Source-Faithful Surface

The following are locked:

- Paper version, upstream commit authority, and accepted input asset;
- white prefill, alpha interpretation, luma conversion, padding, all blur radii/passes, channel packing, PNG creation;
- vertex shader and sizing/fit/origin/offset/scale/rotation/world semantics;
- fixed image UV transform and angle transform;
- complete `shadowShape` source and all three phase offsets;
- `u_time` multiplier/offset, outer animated-mask formula, speed/frame defaults, and `outerGlow` amplitude;
- inner/contour formulas and weights;
- heat sum, clamp, noise, palette values/order/interpolation, premultiplication, `colorBack` composition;
- `ShaderMount`, canvas/program/texture/mipmap behavior, observers, RAF, visibility pausing, and disposal;
- Scheme B's one real panel, transparent official background, r16 clip, and Lab-only isolation.

Also locked out: Ameow Thermal/Refraction, prior Paper-like processed-silhouette code, custom entry/exit/traversal, CSS blend/filter/mask repair, output postprocessing, prop sweeps, and Production lifecycle work.

## 5. Isolated Browser Lab Prototype

### Feasibility

The prototype is feasible without touching Production because the accepted Paper worktree already isolates Paper modes, exact dependencies, the r16 source asset, the real panel recipe, runtime probes, disposal tests, and production-bundle checks.

Minimum future additions after approval:

1. one provenance-marked Lab-local derivative fragment based on the pinned official source;
2. one minimal adapter that routes the official processed image/default uniform set into official `ShaderMount` with the derivative fragment;
3. one mutually exclusive control-versus-derivative Lab route, focused tests, machine-readable runtime evidence, and tightly cropped visual evidence.

No abstraction for multiple shader patches, no package fork framework, and no Production integration should be created.

### Validation

| Question | Evidence | Pass condition |
| --- | --- | --- |
| Is the source change truly minimal? | Normalized upstream-vs-local source diff | Only provenance/import routing and the selector inversion. |
| Does heat occupy the interior? | Tight 200×200 captures at 0/3/6/9/12s | Colored Paper field is visible and changes in a central interior region, not only the r16 edge. |
| Is Paper identity retained? | Official control beside derivative plus native runtime samples | Same timing, palette, characteristic band/morphology, and native frame advancement. |
| Is runtime still Paper-owned? | Canvas/mount/frame/disposal probe | One Paper canvas per candidate, no Production canvas, native advancement, clean disposal/remount. |
| Is geometry still singular? | DOM/runtime assertions | One real panel; no visible source SVG, second panel, mask, blend, filter, or output layer. |
| Is Production isolated? | Renderer build identifier scan and changed-path audit | No derivative source in Production output; stable Thermal checkpoint remains clean. |
| Is licensing complete? | Header/NOTICE/license tests | Apache text, Paper NOTICE, modified-file notice, and pinned provenance are present. |

Primary dynamic evidence must use native `speed=1` with no frame override. Optional fixed-frame comparisons may validate equal-phase morphology only; they are not runtime behavior.

### Hard Stop

Stop with NO-GO if the derivative remains perimeter-only, produces a static core, reads as a thin inset frame, reduces to a generic scrolling band, loses recognizable Paper identity, or needs any second source/material/timing change. Do not tune another formula.

## 6. Risks

- The mirrored broad field may saturate the full-panel object and hide motion. This is a legitimate falsification result.
- Local wrapper plumbing may accidentally drift from official load/default semantics. Lock imports and normalized source differences; do not vendor preprocessing or `ShaderMount`.
- Independent mounts are not phase-locked. Do not claim equal pixels from matching wall-clock labels.
- Browser Lab success does not authorize Reduced Motion, Production lifecycle, export/readback, native-window, or packaging design.
- Copying source changes the license boundary from unmodified dependency attribution to distributed derivative obligations.

## 7. Apache-2.0 Derivative Handling

Before a derivative is committed, pushed, or distributed:

- provide the Apache-2.0 license text to recipients;
- retain every applicable upstream notice or per-file header actually present in copied source (the pinned `heatmap.ts` has no per-file copyright header, so none should be invented);
- place a prominent modified-file notice in every altered upstream-derived file;
- reproduce the package NOTICE readably in Ameow's third-party notices;
- preserve Ameow's MIT license and avoid implying Paper endorsement or trademark rights.

Recommended provenance records the package/version, npm `gitHead`, integrity, exact upstream path/URL, retrieval date, and the one-line semantic diff. A source-diff test should make any future drift explicit.

This is engineering compliance planning, not legal advice.

## Implementation Gate

Planning approval and explicit implementation authorization were received on 2026-08-23. Implement only the selector-inversion Browser Lab candidate and apply the Hard Stop exactly. Production, commit, integration, and self-awarded Architecture PASS remain prohibited.
