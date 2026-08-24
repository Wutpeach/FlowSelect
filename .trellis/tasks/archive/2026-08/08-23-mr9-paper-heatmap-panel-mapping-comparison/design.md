# Planning Report: Paper Heatmap Panel Mapping Comparison

## Decision Boundary

Plan one dev-only, side-by-side Browser Lab control built on the accepted official Heatmap baseline.
The spike compares two mappings but does not select one:

```text
Scheme A: full-frame computational input -> official Heatmap -> r16 display viewport
Scheme B: r16 computational input -> official Heatmap with transparent colorBack
                                                    + real Ameow panel beneath
```

Both cells use the published React component. Paper keeps its preprocessing, shader, palette,
coordinate transform, timing, motion, morphology, RAF, and WebGL lifecycle. The stable Production
Thermal checkpoint remains outside this task.

## Evidence Behind the Comparison

The accepted baseline's compact 0-second and 12-second evidence shows the same result at two native
phases: the 200×200/r16 input becomes a large black rounded rectangle, while the moving warm band
and blue field collect mainly around its perimeter. That evidence establishes the mapping problem;
it does not authorize parameter tuning.

Upstream 0.0.80 explains why composition matters:

1. `toProcessedHeatmap` fills white before drawing the transparent SVG, converts luminance, and
   emits an opaque RGB data texture. Source alpha is an input-shape convention, not retained output
   alpha.
2. The fragment shader derives morphology from the processed channels and composites the palette
   over `u_colorBack`.
3. Default `colorBack="#000000"` makes the full canvas opaque, so a real panel placed underneath is
   hidden.
4. The official color parser accepts `#RRGGBBAA`; the official shader includes background alpha in
   final alpha. Transparent `colorBack` is therefore the narrowest official API path for Scheme B.

## 1. Scheme A: Make Paper the Panel Interior

### Input

Add one Lab-only full-frame source asset:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <rect x="0" y="0" width="200" height="200" fill="#000"/>
</svg>
```

The source is computational only. It is not a visible black panel, DOM SVG, background, mask, or
hit target. Its purpose is to remove r16 from Paper's input domain, so Paper no longer treats the
rounded panel boundary as the input object's boundary.

### Composition

- Mount the official `Heatmap` at exactly 200×200.
- Pass only `image`, `suspendWhenProcessingImage`, and 200×200 style, as in the accepted baseline.
- Place that mount inside a 200×200 viewport clipped at the repository's
  `MAIN_WINDOW_FULL_PANEL_RADIUS` of 16px.
- Render no Ameow panel background, border, inset, shadow, or overlay under the canvas. Paper's
  Default opaque output is the interior content.

This uses a display crop, not a Paper morphology change. The test is intentionally empirical: the
full-frame input may still expose Paper's fixed image padding, scale, and Apple-oriented moving
shapes. Those behaviors remain visible because the experiment must measure them, not correct them.

### Why not use sizing props

`fit="cover"`, custom `scale`, offsets, or world-size changes could enlarge the accepted r16 field,
but they would change Paper's coordinate behavior and create a tuning exercise. A full-frame image
plus outer display clip is the only input/composition-only Scheme A in the first comparison.

## 2. Scheme B: Real Panel Plus Invisible Computational Silhouette

### Computational semantics

Reuse the accepted source asset exactly:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <rect x="0" y="0" width="200" height="200" rx="16" ry="16" fill="#000"/>
</svg>
```

“Transparent computational silhouette” means:

- the SVG has transparent pixels outside its single black rounded rectangle;
- Ameow passes only its URL to Paper's `image` prop;
- it has no displayed DOM/CSS representation;
- Paper alone rasterizes and transforms it;
- the resulting processed texture is still opaque, exactly as official preprocessing requires.

### Composition

Layer one real black-theme Ameow panel shell underneath the official Heatmap. Reuse
`MAIN_WINDOW_PANEL_SIZE`, `MAIN_WINDOW_FULL_PANEL_RADIUS`, and `getPanelShellStyle(...)`; do not
reconstruct the gradient, border, or shadow with local literals. Clip the Paper overlay to the same
r16 inner panel.

Pass exactly one additional official prop:

```tsx
<Heatmap
  image={roundedSilhouetteUrl}
  suspendWhenProcessingImage
  colorBack="#00000000"
  style={{ width: 200, height: 200 }}
/>
```

Changing `colorBack` alpha removes only Paper's opaque zero-heat backing. Heat palette colors,
preprocessing, contour/inner/outer morphology, timing, and coordinate behavior remain official.
The real panel is then visible where Paper produces transparent or partially transparent output.

### Why not use blending

`mix-blend-mode: screen`, opacity reduction, CSS filters, or post-canvas masking would change the
entire palette/composition after Paper renders. Transparent `colorBack` uses Paper's own public
color parser and fragment alpha path, so it is narrower and easier to audit.

## 3. Exact Deviations From Official Default and the Accepted Baseline

| Dimension | Official live demo | Accepted r16 baseline | Scheme A | Scheme B |
| --- | --- | --- | --- | --- |
| Published component | Heatmap 0.0.80 behavior | same | same | same |
| `image` | black diamond SVG | black 200×200/r16 SVG | black full-frame 200×200 SVG | accepted black 200×200/r16 SVG |
| Paper visual props | Default preset | Default preset | Default preset | Default except transparent `colorBack` |
| Paper motion/timing | Default | unchanged | unchanged | unchanged |
| Paper preprocessing/morphology | official | unchanged | unchanged | unchanged |
| Outer composition | demo page | plain 200×200 square host | external 200×200/r16 clip; no real panel | real Ameow panel below; external r16 clip |
| Visible input geometry | diamond reads as black entity | r16 reads as black entity | none: r16 is viewport only | none: r16 source is computational; real panel is the only visible panel geometry |
| Canvas count in comparison mode | one on demo page | one in baseline mode | one A canvas | one B canvas |

The comparison's two unavoidable fidelity deviations are explicit:

- Scheme A changes the `image` again and adds a display-only r16 crop.
- Scheme B retains the accepted `image`, changes Default background alpha, and adds a real panel
  composition layer.

Neither deviation touches Paper source or its locked motion/morphology behavior. Scheme B is not a
strict Default-preset rendering because `colorBack` changes; the report must never label it as such.

## 4. Official-API Feasibility Before Source Modification

Both schemes are feasible using only the official React component, image input, documented color
format, and ordinary DOM composition:

- Scheme A: `image` substitution plus an outer clip. No Paper visual prop change.
- Scheme B: accepted `image` plus official `colorBack` alpha and a panel layer underneath.

There is no source-level justification for copying or patching Paper in this round. If Scheme B's
official alpha path proves visually unsuitable, that is a visual result, not permission to add a
blend mode or shader patch inside the same spike. Any derivative route requires a later task and
Architecture review.

## 5. Minimal Browser Lab A/B Spike

### Repository shape

Extend only the accepted baseline's dev-only Lab path:

```text
lab.html
  -> lab-main.tsx (black ThemeProvider)
  -> PresentationLab
      ordinary category -> existing production-preview path
      Paper panel A/B   -> PaperHeatmapPanelComparison
                            -> Scheme A official Heatmap
                            -> Scheme B panel + official Heatmap
```

The A/B branch is mutually exclusive with the Production preview. It may create two Paper-owned
canvases because simultaneous continuous comparison is the purpose of this isolated control.

### Layout

- Reserve equal comparison cells with the same outer measurement box.
- Center one 200×200/r16 inner panel in each cell. Labels and fidelity notes sit outside, never on
  top of the visual geometry.
- Scheme A's inner layer is only a clipped Paper viewport.
- Scheme B's inner stack contains the real panel shell and one clipped Paper overlay.
- Use no controls, sliders, theme switching, readouts, hover effects, or animation around the cells.

### Start and observation contract

Wrap both Heatmaps in one shared `Suspense fallback={null}`. Their two official preprocessing
results must settle before the comparison appears; both mounts then start in the same React commit.
They still own independent RAF clocks, so the report may say “approximately aligned start” but not
“phase synchronized.” Do not pass `frame`, call `setCurrentFrame`, or reach into Paper internals to
align them.

After settling:

1. verify two Paper mounts/canvases and zero Production canvases;
2. sample both public mount frame values at the start;
3. watch both cells continuously for at least 12 seconds;
4. sample both frame values again and confirm independent advancement;
5. capture tightly cropped cell elements at start and after at least 12 seconds;
6. switch away and verify both canvases are disposed;
7. assemble one compact labelled two-up sheet.

The B screenshot must target the composed cell element rather than the Paper canvas alone, because
the canvas intentionally contains transparency and would omit the real panel.

### Visual review questions

The Implementation Report records observations, not a decision:

- Does Scheme A read as heat moving inside the panel, or as a clipped oversized object?
- Does Scheme B reveal enough of the real panel to preserve Ameow's surface identity?
- In each scheme, where do warm bands travel over a full cycle?
- Are the outer blue field or warm lobes visibly clipped at r16?
- Does either mapping still produce a dominant static black region?
- Does either mapping create the illusion of a second visible panel or halo outside the panel?

The user owns PASS/REJECT and the eventual mapping choice.

## 6. Fidelity-Breaking Changes to Forbid

The following end the comparison's source-fidelity claim and must not be added “for polish”:

- copying, importing, or editing Paper fragment source, preprocessing, `toProcessedHeatmap`, or
  `ShaderMount` directly;
- changing speed, frame, contour, angle, noise, innerGlow, outerGlow, palette, scale, fit, rotation,
  offsets, origins, or world dimensions;
- driving Paper with Ameow's scheduler, Reduced Motion, frame clock, progress state, pointer origin,
  or lifecycle authority;
- CSS filters, opacity tuning, blend modes, post-canvas color correction, extra blur, output masks,
  or clipping derived from the rendered field;
- displaying the SVG input, creating a second r16 outline, or using a hidden DOM panel as a visual
  duplicate rather than a computational URL;
- adding Ameow Thermal, Refraction, localized Boundary, Halo, Entry, Exit, fast-slow-fast, or
  interaction motion;
- adapting either cell to Production single-renderer, export, uniform readback, native-window, or
  228px renderer-domain contracts;
- selecting a winner, tuning the weaker cell, or adding a third hybrid during implementation.

## Temporarily Inapplicable Production Constraints

| Existing constraint | A/B control treatment |
| --- | --- |
| One renderer/canvas per Production surface | Not evaluated; the Lab control intentionally needs two simultaneous official canvases. |
| Browser Lab reuses `ExpandedPresentationSurface` | Waived only in the A/B category; ordinary categories retain it. |
| Ameow owns scheduling and Reduced Motion | Not applicable; Paper-native motion is the measured variable. |
| Production preview export/readback targets one canvas | Not applicable; hide those controls rather than adapting them. |
| Production 228px outer renderer domain and native shadow gutter | Not an input to Paper. Equal Lab measurement boxes may reserve visual breathing room only. |
| Production target/policy/lifecycle state | Not applicable; neither cell has Product or Presentation semantics. |

Still applicable: dev-only build isolation, browser-only imports, exact package/license truth, no
Production file changes, no visible duplicate silhouette, disposal on category switch, and the
stable Thermal checkpoint remaining clean.

## Risks and Containment

| Risk | Containment |
| --- | --- |
| Scheme A still looks like a black body | Preserve it as evidence; do not tune. The spike exists to learn this. |
| Transparent `colorBack` changes more alpha than expected | Capture the composed B element, inspect transparent/zero-heat regions, and report the result without postprocessing. |
| Shared Suspense is mistaken for exact phase sync | Record independent frame samples and use only “approximately aligned start.” |
| Panel styling leaks into Scheme A | Source tests prohibit `getPanelShellStyle` and panel layers in the A cell. |
| B displays two panel geometries | DOM/source checks allow one real shell and reject any visible SVG, second outline, background image, or mask. |
| Review drifts into tuning | Prop allowlists and forbidden-token tests fail on any locked prop, filter, blend, or Ameow effect. |
| Comparison leaks into Production | Keep changes under Lab/test/task paths and verify the Production build input/bundle remains Paper-free. |

Rollback is Lab-local: remove the A/B category/component, the full-frame input asset, comparison
tests/locales, and evidence. The accepted official baseline and stable Production Thermal line do
not require rollback.

## Review Gate

Planning is complete but not Architecture-approved. Do not implement, tune, start the Trellis task,
integrate Production, or select A/B until GPT Architecture Lead Planning Review explicitly approves
this report.
