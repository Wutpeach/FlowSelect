# MR5 Proposed Execution Plan

This is a planning artifact only. Do not run `task.py start` until GPT
Architecture Lead approves the Planning Architecture Report and explicitly
authorizes implementation in a later turn.

## Proposed Work

1. Rebase or create the implementation worktree from authoritative baseline
   `1c9db28445fa937921984999a57d30be1e7f5689`, preserving unrelated root
   worktree changes.
2. Add a failing focused regression at the `DotFieldCanvas` host boundary for
   terminal target replacement across `success`, `failure`, and `cancelled`.
3. Correct the terminal value signature to include status while preserving
   value-level identity churn no-ops and the one-runtime-per-Canvas lifecycle.
4. Narrow the Surface lock prop contract to Application-owned facts; keep
   drag/drop writes at the Surface event boundary and remove the never-set
   startup lock path with focused reducer/composition tests.
5. Remove the unused `compactReachabilityActive` projection output without
   changing compact reachability effects or native policy.
6. Delete the unused desktop `src/components/CatIcon.tsx` and
   `src/assets/mascot.svg`; prove browser-extension mascot assets are unchanged
   and update the frontend directory-structure spec entry.
7. Do not change Dot runtime scheduling, Character runtime, App terminal
   retention, lifecycle, Pointer Field, native policy, or renderer technology.

## Validation Gate

- Focused `DotFieldCanvas` host/composition regression.
- `src/presentation/main-window/dotFieldRuntime.test.ts`.
- `src/presentation/main-window/downloadTerminalProjection.test.ts`.
- `src/presentation/main-window/dotFieldPerfValidation.test.ts`.
- `src/presentation/main-window/characterSurface.test.ts` after legacy asset
  deletion.
- Spec search proving the removed `CatIcon` path is no longer documented as the
  compact icon.
- Lifecycle/projection/Surface tests covering drag/drop lock ownership,
  startup settle, and compact reachability effects after dead field removal.
- `src/architecture/import-guard.test.ts` and Windows risk-path guards.
- `npm run type-check`.
- `npm run lint`.
- `npm run build`.
- Existing full repository test command recorded by the project workflow.
- `git diff --check` and a search proving no remaining desktop `CatIcon` or
  `src/assets/mascot.svg` consumer.

## Rollback Points

- The signature repair is isolated to the Canvas host and its regression.
- The legacy asset deletion is independently revertible.
- If the host regression reveals that status replacement requires new App,
  Download, lifecycle, or retention authority, stop for Architecture Review;
  do not widen the implementation.

## Explicit Non-Work

- No shared production abstraction.
- No Intake Reveal or Folder Confirmation motion.
- No frozen old M3 restoration.
- No optional Reduced Motion outer-fade polish unless separately approved.
- No opportunistic `secondaryWindowPlacement` cleanup.
- No task activation, commit, archive, or later phase in this planning turn.
