# MR9 Paper Heatmap Panel Mapping Comparison

## Goal

Create one dev-only Browser Lab A/B control that compares two minimal mappings of the published
`@paper-design/shaders-react@0.0.80` Heatmap onto Ameow's 200×200/r16 panel. The comparison must let
the user judge continuous Paper-native motion in both mappings without Paper source changes,
Ameow-authored visual effects, Production integration, or an agent-selected winner.

## User Value

The accepted official baseline proved that a rounded-rectangle input becomes a dominant black
entity with motion concentrated around its perimeter. This comparison isolates the next product
question: should Paper replace the panel interior, or should Paper remain an overlay whose
computational silhouette is invisible while the real Ameow panel stays visible?

## Confirmed Facts

- The accepted baseline lives in the isolated
  `D:/Ameow/.cindy-worktrees/mr9-paper-heatmap-official-baseline` worktree and imports the published
  React `Heatmap` directly. Production Thermal remains on the separate stable checkpoint and is not
  an implementation input for this comparison.
- Live npm metadata checked on 2026-08-23 still reports
  `@paper-design/shaders-react@0.0.80`, exact dependency `@paper-design/shaders@0.0.80`, gitHead
  `60467401863c1917dd02016d0c1ff2f791d0b3c8`, and Apache-2.0.
- Paper preprocessing fills its processing canvas white before drawing the source image. Therefore
  transparent source pixels become white scalar space; the emitted processed PNG is opaque and
  stores contour/broad-blur/inner-blur data in R/G/B.
- Paper's Default `colorBack` is opaque black. With source-over composition, that background hides
  any Ameow panel underneath even when the input SVG itself has transparent pixels.
- The official color parser accepts eight-digit hex and the published fragment shader composes
  `u_colorBack` alpha into final output alpha. `colorBack="#00000000"` is therefore an official
  public-prop path for revealing a panel beneath zero-heat regions without copying Paper source.
- Browser Lab starts with the black Ameow theme, already has exact 200px and r16 geometry constants,
  and exposes the real panel recipe through `getPanelShellStyle(...)`.
- Existing compact evidence at `comparison-00s.png` and `comparison-12s.png` shows that the accepted
  r16 baseline has a large black interior while its warm band and side lobes change over one native
  cycle. Those screenshots are evidence for the question, not a target to tune against.

## Requirements

### R1. One isolated A/B Lab mode

- Add one clearly labelled `Paper panel A/B` Lab category to the accepted baseline worktree.
- In this category, render only the two official Paper comparison cells. Do not render
  `LabOverlayStage`, `ExpandedPresentationSurface`, any Production canvas, existing Thermal, or
  Production inspector/export controls behind or above them.
- Keep all ordinary Lab categories and the Production build unchanged.

### R2. Scheme A: full-interior Paper viewport

- Keep an exact 200×200 Paper canvas inside a display-only r16 clip. The r16 boundary is the panel
  viewport, not an `image` silhouette supplied to Paper.
- Supply one full-frame 200×200 black SVG rectangle as the official `image` input. It has no r16
  corners and is never rendered as DOM or CSS geometry.
- Pass no Paper visual, motion, timing, sizing, or coordinate prop beyond the existing image,
  official suspension path, and 200×200 host sizing. In particular, do not use `fit`, `cover`,
  `scale`, offsets, or palette changes to force coverage.
- Do not render a real Ameow panel background under Scheme A. Paper's Default opaque composition is
  the panel interior.

### R3. Scheme B: real panel plus computational silhouette

- Keep the accepted transparent SVG containing exactly one black 200×200/r16 rectangle as the
  official `image` input. It remains a computational source only and must never become an `<img>`,
  inline SVG, CSS background, mask, outline, hit target, or second visible panel.
- Render one real black-theme Ameow panel shell below the Paper output using the existing 200px/r16
  geometry and `getPanelShellStyle(...)` recipe.
- Pass exactly one additional Paper visual prop, `colorBack="#00000000"`, so zero-heat areas reveal
  the real panel through Paper's official alpha composition. Keep the official palette and every
  motion, morphology, preprocessing, timing, and coordinate prop at Default.
- Clip the overlay to the same r16 panel boundary. Do not use CSS blend modes, opacity tuning,
  filters, extra blur, or a second visible silhouette to make the layers coexist.
- Document explicitly that “transparent computational silhouette” describes the source asset and
  its non-visual role; Paper's processed texture remains opaque by upstream design.

### R4. Comparable source-fidelity conditions

- Mount both cells under one shared Suspense boundary so both processed inputs settle before the
  comparison appears and both official mounts begin in the same React commit.
- Allow each official component to own its own canvas, WebGL resources, RAF, visibility pausing,
  and disposal in this dev-only control. Do not claim exact shader-phase synchronization and do not
  pass `frame` to manufacture it.
- Use the same 200×200 inner geometry, r16 clip, outer comparison cell dimensions, page background,
  labels outside the panels, and observation interval for A and B.
- No controls, parameter readouts, Reduced Motion override, playback control, or interactive tuning
  may appear in the A/B category.

### R5. Source-fidelity guardrails

- Import only the published `Heatmap`; do not call `toProcessedHeatmap`, `ShaderMount`, shader
  sources, or core renderer APIs directly.
- Do not copy, fork, patch, postprocess, or clean-room reproduce Paper GLSL, preprocessing,
  morphology, timing, coordinate behavior, lifecycle, or palette composition.
- Do not change `speed`, `frame`, `contour`, `angle`, `noise`, `innerGlow`, `outerGlow`, `colors`,
  `scale`, `fit`, `rotation`, offsets, origins, or world size in either cell.
- Do not add Ameow Thermal, Refraction, Boundary, Halo, Entry, Exit, fast-slow-fast, or any other
  adaptation.

### R6. Visual comparison and evidence

- Observe both cells continuously for at least 12 seconds after both mounts settle, covering one
  complete Paper-native cycle at Default speed.
- Record frame advancement independently for both official mounts while keeping visual judgment
  separate from runtime checks.
- Capture tightly cropped A and B panel elements at a shared wall-clock start and after at least 12
  seconds, plus one compact two-up sheet. A B-cell capture must include the real panel composition,
  not only the transparent Paper canvas.
- Compare coverage, black-area dominance, motion readability, panel legibility, edge clipping, and
  whether the moving warm/cool regions read as panel content or an exterior halo.
- The Implementation Report must describe factual A/B differences and leave visual PASS/REJECT and
  final scheme selection to the user.

### R7. Production checkpoint protection

- Continue only from the accepted official-baseline isolation; do not edit, cherry-pick, or
  integrate into the stable Production Thermal worktree.
- No Production presentation, renderer, lifecycle, Product, Application, native-window, extension,
  Download, Thermal, Refraction, Boundary, Halo, or timing file may change.
- Stop after implementation and evidence for GPT Architecture Lead Review. Do not self-award
  Architecture PASS or begin derivative adaptation.

## Acceptance Criteria

- [ ] AC1: One Browser Lab category shows Scheme A and Scheme B side by side and no Production
  preview/canvas is mounted in that category.
- [ ] AC2: Scheme A has one official Heatmap canvas clipped to a 200×200/r16 viewport, uses a
  full-frame black image input, and has no visible Ameow panel layer or r16 computational input.
- [ ] AC3: Scheme B has one real Ameow panel shell plus one official Heatmap overlay, uses the
  accepted r16 computational input without displaying it, and passes only transparent
  `colorBack` beyond the shared baseline prop allowlist.
- [ ] AC4: Source checks prove both cells use unmodified published 0.0.80 components and prohibit
  every locked Paper prop, Paper internal import, Ameow effect, CSS filter/blend/mask, and duplicate
  visible geometry.
- [ ] AC5: Runtime inspection finds exactly two settled Paper canvases and zero Production canvases,
  shows both native frame values advance for at least 12 seconds, and confirms both mounts dispose
  when leaving the category.
- [ ] AC6: Tight 0-second and 12-second A/B captures plus a compact two-up sheet make the moving
  coverage and real-panel differences directly reviewable.
- [ ] AC7: The report names every deviation from the accepted baseline and official Default, does
  not treat tests as visual approval, and does not choose A or B.
- [ ] AC8: Focused tests, type-check, lint, production build isolation, full tests, and diff hygiene
  pass or any reproduced pre-existing failure is documented.
- [ ] AC9: The stable Production Thermal checkpoint remains clean and unchanged; implementation
  stops for GPT Architecture Lead Review without integration or Architecture PASS.

## Out of Scope

- Selecting a winning scheme or tuning either scheme after looking at the result.
- Production renderer/lifecycle compatibility, single-renderer enforcement, native-window geometry,
  packaging, performance optimization, public documentation, or release work.
- Paper source modification, derivative GLSL/preprocessing, custom masks, palette work, coordinate
  remapping, timing changes, or a third hybrid mapping.
- Reintroducing any Ameow-authored Thermal, Refraction, localized Boundary, Halo, Entry, Exit, or
  interaction behavior.

## Blocking Open Questions

None. The user fixed the two mappings, official package, locked behaviors, Lab-only scope, visual
comparison method, decision ownership, and stop gate.
