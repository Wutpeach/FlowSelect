# MR9 Paper Heatmap Official Component Source-Fidelity Baseline

## Goal

Create one dev-only Browser Lab control scenario that mounts Paper's published React `Heatmap`
component directly and changes only its `image` input from the official demo diamond to Ameow's
exact 200×200, radius-16 rounded-rectangle silhouette. The result lets a reviewer decide whether
Paper's native motion itself is the desired target before any Ameow adaptation is considered.

## User Value

The experiment separates a product decision from an implementation hypothesis: it reveals the
official Paper motion grammar without Ameow Thermal, renderer, lifecycle, palette, timing, or
geometry adaptations confounding the judgment.

## Confirmed Facts

- The authoritative stable line is the clean `motion/mr9-fullscreen-activation-fx` worktree at
  `431114a`; production Thermal is integrated at `0e24a7a` and must remain unchanged.
- The Browser Lab is a dev-only Vite entry (`lab.html`, `src/lab/`, port 1421), has no Electron or
  desktop bridge, and is excluded from the production Vite build.
- The current Lab normally renders through one production `ExpandedPresentationSurface`. This
  control experiment is explicitly allowed to bypass that reuse path in one isolated scenario so
  Paper can own the canvas, WebGL resources, preprocessing, and animation loop exactly as shipped.
- The npm `latest` tag on 2026-08-22 is `@paper-design/shaders-react@0.0.80`, depending exactly on
  `@paper-design/shaders@0.0.80`. React 18/19 is the only runtime peer requirement; Ameow uses
  React 19.1.0.
- Paper's official Default preset and current live demo use the same values documented in
  `research/upstream-paper-heatmap.md`.
- The rejected 2026-08-21 static processed-silhouette spike was an Ameow adaptation. It is
  historical evidence only and is not a baseline for this task.

## Requirements

### R1. Minimal isolated Lab scenario

- Add one clearly labelled `Paper official` Browser Lab scenario.
- In that scenario, render the official `Heatmap` as a sibling alternative to the existing
  production preview path; do not mount `ExpandedPresentationSurface` behind or above it.
- Keep the official mount inside a plain 200×200 host with no Ameow panel background, border,
  shadow, rounded clip, pointer marker, queue/runtime overlay, or second visible geometry.
- Keep all existing production and Lab scenarios unchanged.

### R2. Exact image-only substitution

- Supply a transparent SVG with `viewBox="0 0 200 200"`, intrinsic size 200×200, and one black
  `<rect x="0" y="0" width="200" height="200" rx="16" ry="16">`.
- Pass that SVG URL through the official `image` prop. Do not pre-blur, rasterize, recolor, pad,
  resize, contour, or otherwise preprocess it in Ameow code.
- The SVG is a computational input only. It must not be mounted as an `<img>`, CSS background,
  mask, outline, DOM panel, hit target, or second displayed silhouette.

### R3. Official source behavior

- Import `Heatmap` from `@paper-design/shaders-react`; do not copy, fork, wrap, or clean-room
  reproduce its shader, preprocessing, motion, timing, sizing, or lifecycle.
- Use the official Default preset without Ameow overrides. The baseline may pass only the image,
  the official demo's `suspendWhenProcessingImage` behavior, and host sizing/style needed to make
  the component 200×200.
- Preserve Paper's own `ShaderMount`, WebGL2 canvas, processed texture/mipmaps, resize policy,
  requestAnimationFrame loop, visibility pausing, and disposal behavior.
- Do not impose Ameow Reduced Motion, scheduler, runtime, renderer, palette, or frame control on
  this scenario.

### R4. Dependency and license truth

- Pin `@paper-design/shaders-react` exactly to `0.0.80` as a dev dependency; accept its exact
  transitive `@paper-design/shaders@0.0.80` dependency and add no other library.
- Update `THIRD_PARTY_NOTICES.md` from historical-only wording to active dev-only direct usage,
  retain the Apache-2.0 text and the Paper package NOTICE, and do not claim Ameow modified Paper
  source.

### R5. Visual control experiment

- The Paper scenario must run continuously long enough to observe at least one full native
  Heatmap time cycle (minimum 12 seconds at official `speed=1`).
- Review it side-by-side with <https://shaders.paper.design/heatmap> on the Default preset.
- Capture only tightly cropped canvas evidence or a compact comparison sheet; do not use tall
  full-page screenshots.
- Report source/version/preset proof, settled canvas/resource observations, continuous-motion
  observation, and the reviewer's visual judgment without turning that judgment into Architecture
  PASS.

### R6. Production checkpoint protection

- Implement only in a new branch/worktree based on `431114a`; do not edit or dirty the stable
  `motion/mr9-fullscreen-activation-fx` worktree.
- No production presentation, lifecycle, Product, Application, native-window, extension,
  Download, Thermal, Refraction, boundary, halo, Entry/Exit, or timing file may change.
- Do not integrate, commit to the stable line, or continue to an adaptation round without a later
  GPT Architecture Lead decision.

## Acceptance Criteria

- [ ] AC1: The Browser Lab exposes one isolated Paper official scenario and all existing scenarios
  remain behaviorally unchanged.
- [ ] AC2: The scenario contains one settled Paper-owned canvas and no simultaneous production
  canvas, visible SVG, duplicate panel, overlay, border, shadow, or rounded host clip.
- [ ] AC3: Source tests prove Ameow supplies only the exact 200×200/r16 SVG URL plus official
  suspension and 200×200 host sizing; no Heatmap visual or motion parameter is overridden.
- [ ] AC4: Runtime inspection proves the component is the published 0.0.80 package path, its
  animation frame advances over time, and switching away disposes the Paper canvas without a leak.
- [ ] AC5: The live Lab baseline can be observed for at least 12 seconds and directly compared with
  the official Default demo using the upstream-confirmed preset.
- [ ] AC6: Dependency, lockfile, Apache-2.0, and Paper NOTICE information is accurate; no modified-
  derivative claim is made because Paper source is not copied or changed.
- [ ] AC7: The diff contains only Lab, dependency/lockfile, notice, test, and task-evidence paths;
  the stable production checkpoint and production bundle remain unchanged.
- [ ] AC8: Type-check, lint, focused tests, full tests, and `git diff --check` pass or any reproduced
  pre-existing failure is documented.
- [ ] AC9: The implementation/evidence report stops for GPT Architecture Lead review and does not
  self-award Architecture PASS.

## Out of Scope

- Any Ameow Thermal, Refraction, localized boundary, halo, Entry/Exit, convergence, fast–slow–fast,
  Reduced Motion, palette, composition, or timing addition.
- Reusing the rejected static processed-silhouette implementation or tuning Paper to fit its
  previous perimeter, interaction, gutter, or 14px-output-budget gates.
- Production integration, native-window changes, packaging, public documentation, release work,
  or selection of a final production renderer architecture.
- Sepia, alternative colors, parameter controls, animation replay controls, export-framework work,
  or side-by-side rendering of a second Lab geometry.

## Blocking Open Questions

None. The user has fixed the source, preset policy, input geometry, isolation exception, visual
comparison method, and stop gate.
