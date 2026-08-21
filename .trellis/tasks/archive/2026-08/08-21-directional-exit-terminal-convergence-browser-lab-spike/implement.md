# Directional Exit / Terminal Convergence Implementation Plan

## Preconditions

1. Work only in the clean authoritative MR9 worktree and preserve unrelated worktrees.
2. Read frontend component, design, motion, quality, and type-safety specs.
3. Re-run focused Thermal/Lab tests before product-code edits.

## Implementation (revised after Architecture Decision Delta)

1. In the existing analytic `heatmapOutput`, derive `exitProgress = clamp((k - 0.58) / 0.42, 0.0, 1.0)` and build a transformed material coordinate `qExit`: translate toward the upper-right terminal direction and resample anisotropically about the terminal (scale along DIR > scale across). `qExit` is exactly `q` when `exitProgress == 0`.
2. Feed the SAME `qExit` into the accepted field (`p`, `bend`, `d`, `body`, `warm`, `core`, `alongFront`) and the Refraction block (`grad` finite difference, `d2`, and the `pa/pb/pc` temperature topology), so Thermal and Refraction translate and compress together.
3. Replace the moving half-plane coverage with a broad soft anisotropic elliptical containment (`softContain`) plus the existing terminal-only alpha cleanup.
4. Add source-contract tests for coordinate translation/compression participation, soft-containment residue bounds, absence of the old half-plane, accepted material constants, one renderer/runtime authority, and Reduced Motion invariants.
5. Reuse the existing Browser Lab preset and capture harness; do not add production plumbing or a new Lab lifecycle.

## Validation

1. `npm exec vitest run -- src/presentation/main-window/expandedPresentationSurface.test.ts src/presentation/main-window/expandedPresentationRuntime.test.ts src/lab/scenarios.test.ts src/presentation/main-window/expandedPresentationRendererReuse.test.ts`
2. `npm run type-check`
3. `npm run lint -- --quiet`
4. `npm test`
5. `git diff --check`

## Visual Evidence

Capture the 8-frame acceptance sequence (developed, convergence onset, exit early, exit middle, exit late, upper-right terminal, terminal just-before-zero, zero) from the real Browser Lab WebGL canvas. Inspect individual full-resolution PNGs and a sequence sheet for lower-left clearing, upper-right convergence, material/refraction continuity, and rounded-boundary departure.

## Stop Condition

Stop after prototype, evidence, validation, and report. Do not tune final timing, integrate to production, commit, archive, or begin another visual round before GPT Architecture Lead Review.
