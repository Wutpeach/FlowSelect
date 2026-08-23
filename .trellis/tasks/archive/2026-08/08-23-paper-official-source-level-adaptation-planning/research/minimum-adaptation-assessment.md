# Research: Minimum Source-Level Adaptation Assessment

- Query: Is one local Paper derivative sufficient to test panel-interior dynamic heat?
- Scope: upstream and repository synthesis
- Date: 2026-08-23

## Decision

**Bounded GO for one isolated Browser Lab prototype, subject to GPT Architecture Lead Planning Review.**

The conceptual adaptation is exactly one domain-selector inversion in the official 0.0.80 fragment source:

```glsl
float outerBlur = 1. - mix(1., img[1], 1. - shape);
```

This is a Paper derivative because the implementation retains Paper's source pipeline and changes one expression inside it. It is not a clean-room motion rewrite.

## Must Remain Source-Faithful

- exact `@paper-design/shaders*` 0.0.80 authority and pinned gitHead;
- accepted black 200×200/r16 computational SVG and Scheme B real-panel composition;
- official `toProcessedHeatmap` white prefill, luminance, padding, blur radii/passes, RGB packing, and alpha;
- official vertex/sizing transforms, fixed `imgUV` transform, angle, origin, offsets, fit, and scale defaults;
- `shadowShape`, all three phase offsets, `t=.1*u_time-.3`, and outer `animatedMask`;
- `inner`, contour, `outerGlow`, noise, heat sum, palette stops, palette interpolation, and transparent-background composition;
- official `ShaderMount`, one WebGL2 canvas, textures/mipmaps, observers, RAF/frame clock, pausing, and disposal;
- no Ameow Thermal, Refraction, entry/exit/traversal carrier, Production scheduler, or Production renderer integration.

## Minimum Repository Boundary

After approval, use only the existing isolated Paper Browser Lab worktree. The prototype may add:

1. one Lab-local upstream-derived Heatmap fragment module, carrying provenance and the one allowed expression change;
2. the minimum Lab adapter needed to feed that fragment through official exported preprocessing, defaults/uniform grammar, and `ShaderMount`;
3. one mutually exclusive Lab comparison route plus focused source-fidelity/license/runtime tests and compact evidence artifacts.

Do not vendor or modify `ShaderMount`, preprocessing, sizing, palette, or Production source. Do not introduce a general shader-fork abstraction or patching framework.

## Validation Matrix

| Gate | Evidence | PASS | STOP / NO-GO |
| --- | --- | --- | --- |
| Source delta | Upstream-vs-local normalized diff | Only provenance/import routing plus the selector inversion | Any second heat, timing, morphology, preprocessing, coordinate, palette, or lifecycle change |
| Interior occupancy | Tight 200×200 element crops at 0/3/6/9/12s | Colored Paper field visibly occupies and changes in a central interior region | Remains perimeter-only, static, or becomes merely a thin inset frame |
| Paper identity | Side-by-side official baseline and derivative | Native palette, timing, band morphology, and motion grammar remain recognizable | New carrier, unrelated blobs, custom sweep, or Ameow Thermal look |
| Runtime | Machine-readable Browser Lab probe | One Paper canvas per candidate, native frame advancement, disposal/remount, zero Production canvas | Extra canvas/RAF/scheduler, leak, or Production preview overlap |
| Geometry/composition | DOM/runtime assertions | One real 200×200/r16 panel, no visible input SVG, no second panel/mask/filter/blend | Duplicate geometry or postprocessing required to make the result work |
| Build isolation | Renderer build/source audit | No derived Paper module in Production artifact and stable checkpoint remains clean | Production import or stable-line change |
| License | Header/notices check | Apache text, Paper NOTICE, modified-file notice, pinned provenance | Missing or ambiguous derivative attribution |

Primary motion evidence uses native `speed=1` and no frame override. Optional deterministic fixed-frame captures may be used only to compare morphology at equal phases; they are validation controls, not a new runtime mode.

## Risks

- The mirrored branch may saturate or read as a simple scrolling band inside a full-panel object. That is a falsification result, not permission to tune amplitude, blur, palette, or timing.
- The local adapter could accidentally broaden the derivative surface. Lock its imports and source diff so official preprocessing and mount remain authoritative.
- Independent Paper mounts are not exactly phase-synchronized. Do not claim pixel equality at matching wall-clock labels.
- A visually successful Lab result says nothing about Production lifecycle, reduced motion, export/readback, or native-window integration; those gates remain closed.

## Stop Rule

Run only this selector-inversion candidate. If it fails any visual/source-fidelity gate, report NO-GO for the minimum adaptation and stop. Do not pivot to a custom motion system, another source formula, prop sweep, Thermal hybrid, or Production design.
