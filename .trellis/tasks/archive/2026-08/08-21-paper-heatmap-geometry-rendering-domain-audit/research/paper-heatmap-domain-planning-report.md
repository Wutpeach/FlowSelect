# Paper Heatmap Geometry / Rendering Domain Planning Report

**Phase:** repository-grounded planning only

**Decision requested:** GPT Architecture Lead Planning Review

**Recommendation:** CONTINUE to one bounded Browser Lab spike; do not integrate production code

## Executive Decision

The central hypothesis is geometrically and architecturally viable enough to spike:

```text
exact real-panel latent silhouette
    -> processed inner / outer / contour fields
    -> Paper-derived scalar material causality
    -> existing Ameow palette / visual output
```

This does not create a second UI geometry authority. The real 200×200/radius-16 panel remains the
only visible/interactive panel. The latent silhouette is a renderer-local mask aligned to that
panel and owns no hit testing, layout, lifecycle, or native-window behavior.

The direction is not yet visually proven. Continue only to a static, Lab-gated, falsifiable spike.

## Repository Geometry Truth

| Question | Answer |
|---|---|
| Windows full outer bounds | 228×228 |
| macOS full outer bounds | 228×228 |
| Visible panel | 200×200, radius 16, at `(14,14)` |
| Surrounding gutter | 14px per side on both platforms |
| Native shadow | Disabled |
| Outer shadow | CSS box-shadow on a separate transparent panel-sized shell |
| Root viewport | 228×228 with `overflow: visible` |
| Current canvas | 200×200, inside and clipped by the panel shell |
| Backing store | CSS size × clamped DPR; Lab override may use 4× |

The `228 = 200 + 14×2` hypothesis is true on Windows and macOS. Key anchors:
`windowMetrics.ts:1-22`, `electron/main.mts:2112,2119-2127`,
`geometry.ts:45,68-76,93-112`, `MainWindowPresentationSurface.tsx:980-988,1083-1126`, and
`ExpandedPresentationSurface.tsx:569-588,791-805`.

The current panel shell's `overflow:hidden` is the effective canvas clip. WebGL cannot reach the
gutter today. A DOM/layer change is required; a native-size change is not.

The CSS shadow already uses the transparent gutter, but the configured shadow string alone does
not prove that its complete soft tail fits inside 14px. The spike must capture and sample the window
edge.

## Proposed Computational and Output Domain

- One canvas spans the real 228×228 output domain.
- The exact latent panel mask occupies `(14,14)` through `(214,214)` with radius 16.
- Internal preprocessing may use wider offscreen padding, but visible output stops at the 228 edge.
- The 14px gutter is therefore a hard visible-output budget for the current native bounds.
- If the desired halo is visibly truncated, the hypothesis fails for current bounds. A larger halo
  would ultimately require a larger native window, but this phase and the spike must not resize it.

Preferred layer split:

```text
shadow backdrop
real interactive panel background
one 228×228 non-interactive FX canvas
real 200×200/r16 clipped UI content
```

The canvas may overflow from the panel shell by 14px on every side; the UI content keeps a nested
real-panel clip above it. This lets the same canvas render panel interior and gutter FX without
covering controls or introducing a second panel.

## Latent Silhouette Ownership

The proposed silhouette is the exact rounded panel mask derived from repository geometry constants.
It is not current `sourceInfluence`, which is a travelling phase-driven Thermal field. Treating
`sourceInfluence` as the silhouette would repeat the wrong causality.

Authority remains:

- Product/native layers own BrowserWindow size, placement, reveal, and lifecycle.
- DOM panel owns layout, clipping, hit testing, dragging, and visible panel geometry.
- Renderer owns only reconstructible FX resources and scalar processing.
- Reduced Motion and existing renderer time authority remain unchanged.

No new architecture primitive is required beyond a local outer-domain mount option and one local
processed resource.

## Paper-Derived Mechanics Adaptation

Directly adaptable:

- one exact source silhouette feeding processed fields;
- distinct inner, outer, and contour responses from that source;
- scalar composition before palette mapping;
- renderer-local preprocessing sampled by the existing draw.

Must change for Ameow:

- Paper geometry becomes the exact 200×200/r16 panel mask;
- Paper logo/diamond and image-frame assumptions are removed;
- outer response is calibrated against Ameow's real 14px gutter and CSS shadow;
- final color/material uses the accepted Ameow palette/output and preserves Thermal + Refraction as
  fallback;
- Paper ShaderMount/React sizing is not used.

Prohibited:

- a 180×180 inset or any visible second rectangle;
- moving blob/object, perimeter outline, or detached frame;
- second canvas, renderer, program, draw, framebuffer, or GPU preprocessing pass;
- new entry/exit/convergence/timing mechanics;
- native resizing or production integration.

## Texture / Preprocessing Lifecycle

For the accepted analytic Thermal fallback, no texture is needed.

For this processed-silhouette hypothesis, one renderer-owned RGBA texture is the recommended
minimal candidate:

- R exact source coverage;
- G broad processed field;
- B narrow processed field;
- A contour response.

Reuse the already validated lifecycle evidence: lazy Lab-only creation, CPU preprocessing, sampler
input to the existing single draw, recreation after WebGL context restore, deletion on dispose, no
default-path allocation, and no framebuffer. The earlier visual carrier was rejected, but its
resource lifecycle remains valid evidence.

An analytic version may replace the texture only if channel debug views demonstrate equivalent
source → inner/outer/contour causality. Texture avoidance is not itself a success criterion.

## License / NOTICE

The current independently authored analytic Thermal code does not trigger a new Paper license
obligation.

Copying or near-verbatim adapting Paper GLSL or preprocessing requires, before review:

- Apache-2.0 license text for the adapted portion;
- Paper NOTICE attribution;
- prominent modification notice;
- root `THIRD_PARTY_NOTICES.md` entry plus a source provenance/modification header;
- preservation of Ameow's root MIT license.

The prior license/provenance research remains authoritative; no full Paper source re-audit is
needed.

## Minimal Browser Lab Spike

The spike must produce static debug/final evidence for:

1. exact panel-source alignment at four edge and four corner probes;
2. absence of inset/second visible geometry;
3. separate source, inner, outer, contour, and final composition channels;
4. actual gutter output and last-2px window-edge clipping on every side;
5. CSS shadow/FX coexistence and correct UI z-order;
6. one canvas/program/draw, no framebuffer, one lazy texture at most, correct restore/dispose;
7. Paper mode-off pixel/resource equivalence to the Thermal + Refraction fallback;
8. Reduced Motion frozen time and zero continuing frames;
9. Windows transparent compositing; macOS runtime evidence when available, otherwise explicit
   `NOT VERIFIED` debt against source-confirmed identical geometry.

Any failed gate stops the direction. Do not add repair masks, secondary silhouettes, framework
abstractions, or native size changes.

## Main Risks

- The desired halo may exceed the 14px visible-output budget.
- A 228 canvas layer may conflict with the existing CSS shadow or panel-content z-order.
- Processed contour may read as an inset frame or perimeter outline instead of material causality.
- Windows transparent-window compositing may treat gutter alpha differently from Browser Lab.
- A texture may leak, fail context restoration, or allocate on the default path.
- Near-verbatim Paper source may land without complete Apache/NOTICE delivery.
- The direction may still fail visually even when geometry and resources are correct.

## Recommendation and Phase Gate

**CONTINUE, bounded.** Repository truth supports an exact panel-aligned computational silhouette
and a real 228-domain experiment without changing native bounds or renderer authority. Previous
failures did not test this exact source geometry.

Do not proceed if Architecture Lead rejects the layer split, one-texture processed-domain model,
or 14px output-budget framing. Otherwise authorize only the minimal Browser Lab spike described
above. Stop after its evidence; do not integrate production behavior or commit the spike without a
new review decision.
