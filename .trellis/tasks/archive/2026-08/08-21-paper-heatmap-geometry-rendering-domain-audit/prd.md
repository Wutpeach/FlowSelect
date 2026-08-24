# Paper Heatmap Geometry and Rendering Domain Audit

## Goal

Establish the current repository truth for Main Window native, panel, canvas, clipping, shadow,
and transparent-gutter geometry, then plan a bounded Paper-derived mechanics adaptation in which
a renderer-owned latent silhouette aligns exactly with Ameow's real panel geometry and never
becomes a competing visible or interactive geometry authority.

## Background Decision

- The real visible and interactive Ameow panel remains the sole UI geometry authority.
- The renderer may own a panel-aligned latent computational silhouette or processed field used
  only to generate visual FX.
- Renderer geometry must not participate in hit testing, layout, native-window lifecycle, or
  interaction.
- The prohibited case is a second visible geometry competing with the panel, not internal
  computational geometry aligned to the panel.
- The accepted Thermal + Refraction checkpoint remains the stable fallback.

## Repository Questions

1. Determine the actual Windows and macOS full-state native/outer bounds, visible panel bounds,
   transparent gutter, and shadow extent. Test the 228×228 = 200×200 + 14px-per-side hypothesis
   from current code rather than prior discussion.
2. Determine the actual size, coordinate origin, positioning, DPR/backing-store behavior, and
   containing blocks of `ExpandedPresentationSurface` and its canvas.
3. Identify every rounded-corner and overflow/clip boundary from BrowserWindow through React/DOM
   layers to the canvas.
4. Identify how the current outer shadow is produced, whether it uses BrowserWindow-transparent
   pixels outside the visible panel, and whether renderer pixels can safely occupy that region.
5. Determine whether a latent source silhouette can exactly match the real 200×200 panel's size,
   position, and rounded corners while processed blur/contour output uses the real outer domain.
6. Distinguish additional computational padding from any need to change native outer bounds. No
   native size change is allowed in this phase.
7. Map Paper Heatmap inner/outer/contour mechanics onto the existing one-canvas, one-program,
   one-renderer authority without ShaderMount, a second canvas, or a second renderer.
8. Reuse prior renderer-owned texture/preprocessing lifecycle and Paper license research wherever
   still applicable; do not repeat full Paper source research.

## Requirements

- Produce file-and-line-grounded geometry tables for Windows and macOS full state.
- Trace outer BrowserWindow → transparent root/gutter → visible 200×200 panel → presentation host
  → canvas/backing store, including coordinate transforms and clipping.
- Separate visible geometry authority, latent source silhouette, processed computational domain,
  and final visible FX output.
- State which Paper mechanics are directly derivative-adaptable, which require Ameow-specific
  changes, and which remain prohibited.
- State whether renderer-owned texture/preprocessing lifecycle is required or merely optional.
- State the license/NOTICE obligations that would reactivate if derivative Paper mechanics/source
  are used.
- Define a minimal Browser Lab spike with explicit falsification criteria.
- Recommend continue or abandon based on repository evidence and identified risks.

## Converged Planning Decisions

- Repository truth is 228×228 on Windows and macOS: a 200×200/radius-16 panel at `(14,14)` plus a 14px transparent gutter on each side.
- The current canvas is 200×200 and clipped by the panel shell. A gutter-capable spike therefore needs a DOM/layer change that exposes the 228×228 domain to the same canvas; it does not need a larger BrowserWindow.
- The proposed latent silhouette is the exact rounded panel coverage in outer-domain coordinates. It is distinct from the current travelling `sourceInfluence` field and owns no layout, hit testing, interaction, lifecycle, or native-window state.
- The hypothesis to test is `panel silhouette → processed inner/outer/contour channels → Paper-derived scalar composition → Ameow palette/output`.
- One renderer-owned processed texture is the recommended minimal carrier. It must be Lab-only, lazily allocated, recreated after context restore, deleted on dispose, and sampled by the existing one program/one draw without a framebuffer.
- The 14px gutter is an available visible-output budget, not a proven guarantee that every shadow or halo blur tail fits. Internal computational padding may be wider, but final pixels outside 228×228 are clipped.
- The accepted Thermal + Refraction checkpoint remains the stable fallback and must be pixel/resource equivalent when the Paper-derived mode is off.
- Any copied or near-verbatim Paper GLSL/preprocessing reactivates Apache-2.0 LICENSE, Paper NOTICE attribution, and prominent modification-notice requirements. An independently authored mechanics adaptation does not automatically trigger those obligations.

## Architecture Constraints

- Keep one `ExpandedPresentationSurface`, one canvas, one WebGL renderer/program authority, and
  renderer-local FX ownership.
- Keep Product, lifecycle, native-window, layout, hit-testing, and interaction authority outside
  the shader.
- Do not mount Paper ShaderMount or its React runtime.
- Do not add a second renderer/canvas, a 180×180 inset rectangle, Paper logo/diamond geometry,
  generic scene/field/choreography architecture, new entry/exit/convergence mechanics, production
  integration, timing tuning, or native window-size changes.
- This task is repository-grounded planning only. Do not modify production or test code and do
  not start a Browser Lab implementation.

## Acceptance Criteria

- [x] AC1: Actual Windows/macOS outer, panel, gutter, canvas, shadow, and clipping geometry is
  documented with current file/line evidence; the 228×228 hypothesis is confirmed or rejected.
- [x] AC2: The report answers whether pixels can be rendered outside the panel while remaining
  inside the current BrowserWindow and exactly which layer would clip them.
- [x] AC3: A proposed Paper-derived computational domain preserves the 200×200 panel as the only
  visible/interactive silhouette and introduces no inset or competing geometry.
- [x] AC4: Paper inner/outer/contour, texture/preprocessing, and license/NOTICE decisions are
  explicit and reuse prior evidence where valid.
- [x] AC5: Computational padding versus native outer-bounds needs are distinguished without
  changing window size.
- [x] AC6: The minimal Browser Lab spike has observable confirm/falsify gates for halo clipping,
  silhouette alignment, inner/outer causality, resource ownership, and fallback safety.
- [x] AC7: The final planning report gives a reasoned continue/abandon recommendation and stops
  before implementation for GPT Architecture Lead Planning Review.

## Out of Scope

- Production integration or product/test-code changes.
- Entry, exit, convergence, or timing design.
- Native window resizing.
- Literal Paper fidelity, Paper logo/diamond geometry, ShaderMount, or Paper React runtime.
- A second renderer, canvas, visible silhouette, or interactive geometry authority.
