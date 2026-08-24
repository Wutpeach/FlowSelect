# Boundary-Driven Thermal Source / Edge-Originated Field Hypothesis Spike Plan

This is a future Browser Lab spike plan only. Do not execute it until GPT Architecture Lead approves the planning artifacts and the task is explicitly started.

## Minimal Spike Scope

1. Add source-contract negatives first in `expandedPresentationSurface.test.ts`: prohibit the rejected Directional Exit vocabulary and any half-plane visibility authority, while preserving one canvas/program/draw/runtime, palette/topology, Refraction strength/direction, real boundary, and Reduced Motion contracts.
2. In the existing `heatmapOutput` only, keep `k`, `DIR`, `bendTime`, `heatmapBend`, rounded boundary, palette, 2D temperature topology, grain, and Refraction finite-difference direction. Update tests that currently lock `front = mix(-0.58, 1.6, k)` because that range is reopened.
3. Derive a new source-position range from the conservative window source-space span plus support width. Preserve pinned RM `k = 0.42` but place that phase near source-space center/developed presence.
4. Keep a signed source coordinate for contour/refraction direction and derive one broad finite-support `sourceInfluence` from its magnitude. Remove `behind/body/energy/covered/covered2/bodyFloor` as half-plane/phase visibility authorities in both baseline and Refraction paths.
5. Feed the same influence into accepted material visibility, Refraction envelope, and localized boundary contact. Blend toward the identical stable void output before entry and after exit. Do not add uniforms, target variants, runtime state, controls, or architecture.
6. Start with no visible 2D Gaussian `core` source marker; keep contour warmth bounded and subordinate. Reject the result if either becomes a moving point/blob or narrow strip.
7. Reuse the existing Browser Lab heatmap/refraction mode and pinned-time capture harness. Capture at least: before-entry, boundary-first-contact, mid-ramp/falloff, developed-early, developed-middle, developed-late, near-exit, post-boundary residual, exact-zero, and Reduced Motion.
8. Produce a comparison sheet, pixel/resource log, and direct pre-entry versus post-exit pixel comparison. Directly inspect full-resolution frames before any broad validation.
9. Reject and restore immediately if the result reads as a diagonal fade/wipe, band/object/blob, inset carrier, perimeter effect, global fade, compressed terminal, or requires a second choreography.

## Expected File Boundary

- Product/test candidate diff: `src/presentation/main-window/ExpandedPresentationSurface.tsx`, `src/presentation/main-window/expandedPresentationSurface.test.ts`.
- Evidence-only changes: task-local capture script/output/report. Prefer reusing the archived/current capture harness over adding new Lab UI.
- No expected changes to targets, policy, runtime, lifecycle, native window code, palette, Browser Lab component architecture, public docs, package files, or dependencies.

## Validation and Review Gates

1. Source-contract tests for the surface and renderer reuse.
2. Runtime tests proving Reduced Motion schedules zero continuing frames and moving mode keeps at most one pending frame.
3. Matched visual sequence with explicit entry/developed/exit questions and WebGL resource evidence.
4. `npm run type-check`.
5. `npm run lint -- --quiet`.
6. Focused Vitest for surface/runtime/Lab scenarios/renderer reuse.
7. Full `npm test`, documenting only reproduced pre-existing failures.
8. `git diff --check` and an explicit diff audit confirming no production integration or unrelated file changes.
9. Stop with an uncommitted spike report for Cindy Lead visual review, then GPT Architecture Lead review.

## Rollback Point

The clean pre-spike checkpoint is `eaead65` with accepted product code equivalent to `8a80474`. Restore only the bounded product/test candidate diff; retain task-local research and captures as evidence. Do not commit the spike before Architecture Lead approval.
