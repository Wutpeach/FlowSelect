# MR1 Approved Contract Summary

## Baseline

- Clean implementation worktree: `D:/Ameow/.cindy-worktrees/mr1-dot-field`, branch `mr1/expanded-dot-field`, based at `3429917`.
- This commit contains committed M0-M2, MR0 architecture guards/contracts, and archived MR0 artifacts.
- Paused M3 dirty changes remain isolated in `D:/Ameow/.cindy-worktrees/auto-o3p8cr`; do not copy or depend on them.

## Required frontend contracts

- `lifecycle.ts` is the sole writable compact/full/transition authority; `projections.ts` is read-only.
- `MainWindowPresentationSurface.tsx` owns presentation composition, DOM event wiring, stable viewport refs, and all Pointer Field writes.
- `pointerField.ts` remains the one continuous pointer geometry authority. Dot Field interaction origins are consumer-local discrete snapshots.
- Renderer-local leaves do not import Product/Download, lifecycle/effects, center-overlay policy, desktop/Electron/IPC/native position/bounds paths.
- React publishes coarse baseline/intent inputs only. Canvas/rAF owns per-frame geometry and has zero frames when settled/sleeping/disposed.
- Eligibility is derived from existing projection: full mode with no transition epoch. `collapsePending` remains eligible.
- One latest-replaces intent slot; retarget from current rendered state; settle to latest persistent baseline; no completion escapes locally.
- Sleep invalidates/cancels but remains wakeable; wake rebuilds from current inputs; dispose is permanent and stale generations no-op.
- Reduced motion keeps localized brightness acknowledgement while removing travel/displacement/continuous deformation.
- Visual design is restrained: low-weight deterministic grid, theme tokens, brightness before scale, displacement optional, no bounce/reflection/wrap/radar ring/M3 reveal.
- Use native Canvas 2D only. Do not add dependencies, shared runtime, renderer abstraction, generic scheduler, queue, bus, or DSL.

## Validation

- Real consumer tests: topology/origin/material bounds, boundary absorption, latest baseline, retarget, reduced motion, scheduler lifecycle, stale no-op, click exclusions, context capture.
- Extend existing architecture guards and preserve lifecycle/Pointer Field writer uniqueness.
- Run focused tests, full test, type-check, lint, build, diff check, then Windows manual/performance validation.
