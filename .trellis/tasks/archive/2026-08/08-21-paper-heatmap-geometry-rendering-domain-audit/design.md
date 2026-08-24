# Paper-Derived Processed-Silhouette Architecture Design

## Decision

Proceed to one bounded Browser Lab spike after GPT Architecture Lead approval.

The spike will test whether the exact Ameow panel silhouette can drive Paper-style processed
inner, outer, and contour fields in the existing renderer without creating a second visible
geometry. It will not test entry, exit, convergence, or timing.

## Repository Geometry Baseline

| Domain | Current repository truth |
|---|---|
| Native BrowserWindow | 228×228 on Windows and macOS; transparent, frameless, non-resizable; no native shadow |
| Visible/interactive panel | 200×200 at outer-domain origin `(14,14)`, radius 16 |
| Transparent gutter | 14 CSS px per side |
| Shadow | CSS box-shadow on a separate transparent 200×200 shell; composited in the gutter |
| Viewport root | 228×228, `overflow: visible` |
| Current canvas | 200×200 inside the panel content wrapper; clipped by panel `overflow: hidden` |
| Backing store | CSS dimensions × clamped DPR (`MAX_DPR=2`); Lab may request an absolute 4× backing scale |

Source anchors are consolidated in
`research/repository-geometry-rendering-domain-audit.md` §§1–4.

The 14px gutter is the current visible-output budget. The CSS shadow string does not prove that
its full soft tail, or a future halo, fits without edge clipping. The spike must measure this.

## Geometry and Authority Separation

```text
Product / native / layout / hit testing
    -> real 228 BrowserWindow
    -> real 200×200/r16 panel at (14,14)

Renderer-local computation only
    -> exact panel-aligned latent coverage mask
    -> processed inner / outer / contour channels
    -> scalar material response
    -> existing Ameow palette / output
```

The latent silhouette:

- is exactly the real panel bounds and radius;
- is static geometry input, not a travelling source;
- is never a DOM hit target or lifecycle state;
- cannot change native bounds, layout, drag regions, or interaction;
- must not become a visible inset rectangle, outline, frame, blob, or Paper logo.

Current `sourceInfluence` remains a travelling Thermal influence field from a separate hypothesis.
It is not the latent panel silhouette and does not own the Paper processed channels.

## Proposed Outer-Domain Layering

The same `ExpandedPresentationSurface` canvas must see the 228×228 outer domain. A shader-only
change cannot do this because the current panel shell clips all children.

Preferred spike layering:

```text
228×228 viewport root
├─ existing 200×200 shadow backdrop at (14,14)
└─ real 200×200 panel shell at (14,14), interactive authority unchanged
   ├─ existing panel background
   ├─ one ExpandedPresentationSurface canvas
   │    absolute offset (-14,-14), CSS size 228×228, pointer-events:none
   └─ 200×200/r16 content-clip wrapper above the canvas
        existing controls / drag glow / presentation content
```

The panel shell must permit the canvas's non-interactive pixels to overflow while a nested content
wrapper preserves the real 200×200/r16 UI clip. This is a layer-responsibility split, not a new
panel geometry. The same constants must position the canvas and latent mask; no duplicated magic
numbers are permitted.

Alternative viewport-sibling placement is not preferred because a sibling behind the opaque panel
cannot show interior material, while a sibling above it needs more z-order exceptions. The preferred
mount keeps the canvas above the panel background and below clipped UI content.

## Proposed Computational Domain

Use outer-domain coordinates:

```text
outer size     = 228×228 CSS px
panel origin   = (14,14)
panel size     = 200×200 CSS px
corner radius  = 16 CSS px
```

At backing scale `s`, preprocessing uses the corresponding pixel values multiplied by `s`. The
source mask is antialiased at the same effective resolution as the canvas backing store so the
texture edge and DOM panel edge can be compared without a scale mismatch.

Recommended one-texture channels:

| Channel | Meaning |
|---|---|
| R | exact rounded-panel source coverage |
| G | broad processed/blurred field |
| B | narrow processed/blurred field |
| A | contour/edge response derived from the same source |

The shader derives inner response inside R, outer response outside R, and contour emphasis from
these channels. Channel names and equations remain spike-local; they must not become a generic
field or scene framework.

Internal preprocessing may use padding wider than 14px. That can improve convolution accuracy,
but it cannot create visible pixels outside the 228 native surface. If the target halo remains
visibly cut at the window edge, the current output domain is insufficient. A larger native window
would then be required for that target look, but changing native size is outside this task and the
future spike.

## Renderer and Resource Lifecycle

The recommended spike reuses the previously validated renderer-owned preprocessing lifecycle:

1. Default/production path allocates no processed texture.
2. The Lab Paper-mechanics mode lazily builds the exact mask and processed channels.
3. One RGBA texture is uploaded and sampled by the existing program.
4. Context restore recreates it on the next eligible draw.
5. Renderer dispose deletes it.
6. No framebuffer, render-to-texture pass, second program, second draw, second renderer, or second
   canvas is introduced.

An analytic construction may replace the texture only if debug captures prove the same explicit
source → inner/outer/contour causality. Fewer resources alone is not evidence of equivalent
mechanics.

## Paper Mechanics Adaptation

| Paper mechanic | Ameow adaptation |
|---|---|
| Source silhouette | Exact Ameow panel mask; remove Paper logo/diamond/object geometry |
| Inner processed response | Derive only from panel coverage and processed channels; preserve broad material presence |
| Outer processed response | Render into the real gutter and measure the 14px output limit |
| Contour | Derive from the same exact mask; reject visible outline/inset-frame readings |
| Scalar heat composition | Preserve causal relationship, then map through Ameow's accepted palette/material output |
| Blur/preprocessing runtime | Renderer-owned CPU preprocessing + one sampler input, not Paper ShaderMount |
| Paper React sizing/mounting | Do not reuse; existing Ameow component/runtime remains authoritative |
| Paper palette/logo geometry | Do not reuse |

The accepted Thermal + Refraction implementation is the stable fallback. Refraction may consume
the final processed scalar in a later approved experiment, but this mechanics spike must first
prove source/inner/outer/contour geometry without rewriting Refraction.

## Prior Evidence Reuse

Reuse without repeating full Paper research:

- `mr9-literal-reuse-map.md`: Paper source/provenance map, prior processed texture channels,
  renderer lifecycle, and NOTICE delivery requirements.
- `mr9-mechanics-adaptation.md`: prior mechanics mapping, licensing gate, and failed analytic visual
  result.
- `mr9-latent-carrier.md`: one-texture lifecycle/resource evidence and the rejected inset/moving
  carrier morphology.

The prior visual rejection does not automatically falsify this direction because it was built
under the old no-silhouette constraint. It did not test an exact panel-shaped latent source. Its
resource lifecycle is reusable; its carrier geometry is not.

## License and NOTICE Gate

Current Ameow analytic Thermal code does not copy Paper source and has no new Apache-2.0 delivery
obligation.

If a future spike copies or near-verbatim adapts Paper GLSL composition or preprocessing code, it
must add before review:

- the Apache-2.0 license text for the adapted portion;
- Paper's NOTICE attribution;
- a prominent notice describing Ameow's modifications;
- a root `THIRD_PARTY_NOTICES.md` entry and a source-file provenance/modification header;
- no change to Ameow's root MIT license and no trademark endorsement language.

Independently authored code implementing general blur/contour mechanics should document its
provenance decision but does not automatically trigger Paper's license merely because the mechanics
are similar.

## Risks and Stop Conditions

| Risk | Stop condition |
|---|---|
| Halo is clipped by the 228 edge | Target visible halo cannot fit the 14px budget; do not resize native bounds in the spike |
| Canvas layering damages panel UI | Shadow disappears/doubles, content is obscured, or panel clip/hit behavior changes |
| Latent mask becomes visible geometry | Any inset rectangle, detached outline, frame, moving object, logo, or competing silhouette |
| Paper causality collapses | Inner/outer/contour debug channels cannot be distinguished or are secretly driven by travelling `sourceInfluence` |
| Architecture expands | Second canvas/program/draw, framebuffer, generic field framework, or lifecycle state is required |
| Resource leak | Texture survives dispose, fails context restore, or allocates on the fallback path |
| Platform divergence | Windows transparent compositing corrupts gutter pixels or macOS geometry differs from 228/200/14 truth |
| Fallback regression | Paper mode off differs in pixels or resources from the accepted Thermal + Refraction checkpoint |

## Rollback

The future spike must remain Lab-gated and uncommitted until visual and architecture review. Remove
only the Lab/domain/texture candidate diff to return to the accepted Thermal + Refraction checkpoint;
retain task-local research and captures as evidence.
