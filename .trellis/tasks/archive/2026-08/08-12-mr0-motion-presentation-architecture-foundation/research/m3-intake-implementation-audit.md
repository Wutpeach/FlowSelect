# MR0 — M3 Intake Implementation Audit (dirty candidate, paused)

All anchors: `cindy/auto-o3p8cr` worktree, UNCOMMITTED M3 files (untracked or modified). These are reusable-asset candidates for MR0, NOT current production authority (Lead-confirmed). MR0 must name which M3 assets survive the framework-direction revision and which are superseded.

## 1. Discrete origin contract

`src/presentation/main-window/interactionOrigin.ts` (untracked, 118 lines):

- `InteractionOrigin { u, v, source }` (:18-28) — normalized 0..1 in the stable full content surface, source `"drop" | "paste" | "external"`; `ORIGIN_CENTER` (:31).
- `normalizeOriginFromClientPoint` (:48-66) — transient client point vs content rect; invalid/zero-size → center, source preserved.
- `resolvePasteOrigin` (:88-113) — reads M2 Pointer Field ONLY when discrete pointer-inside truth is available; else center. No mirrored refs/timestamps.
- Pure module: no React/Download/lifecycle/native imports (header :5-12).

## 2. Presentation-only intake adapter

`src/presentation/main-window/downloadIntakePresentation.ts` (untracked, 273 lines):

- `DownloadIntakePresentationEvent { epoch, traceId, origin }` (:22-28) — epoch is presentation identity only.
- State (:30-72): latest event, monotonic epoch, pending center fallbacks, baseline set, `seededBaseline` (one-time cut seed per controller lifetime — implement.md addendum refinement), live membership, consumed/rejected trace markers (generation-local, pruned on leave — no numeric eviction).
- `observeDownloadQueueDetail` (:124-191) — suppressed (startup mount / UI Lab) → seed baseline without replay; else seed cut baseline in the SAME deterministic update as live membership, schedule one-frame external fallbacks for fresh traces.
- `acceptLocalDownloadIntake` (:200-223) — one visual event per live generation; late precise origin cannot replay; `acceptDirectForegroundIntake` (:231-242) — no queue bookkeeping; `rejectDownloadIntake` (:245-257) — rejected/no-op never fabricates an event; `expireDownloadIntakeEvent` (:265-273) — epoch-guarded 3 s relevance expiry (`INTAKE_EVENT_RELEVANCE_MS` :75).
- Hook glue: `src/presentation/main-window/useDownloadIntakePresentation.ts` — membership signature commit (:57-74), one-frame fallback consumption (:79-97), relevance expiry (:102-111).

## 3. Ordered queue observation bootstrap (Main-owned)

- `electron/main.mts:2005-2018` (dirty) — `emitQueueObserverBootstrapSnapshot()` emits queue-count + flagged `bootstrap:true` queue-detail on the SAME channel after the renderer signals.
- `electron/main.mts:3052-3057` (dirty) — `queue_observer_bootstrap` command handler.
- `src/features/download/useDownloadQueue.ts:44-79` — `baselineEstablished` / durable `baselineTraceIds` facts; `:248-253` captures membership from the flagged snapshot; `:294-327` exposes via `useSyncExternalStore`.
- `src/protocol/download/ipcTypes.ts` — `VideoQueueDetailPayload.bootstrap` flag; `src/types/electronBridge.ts` — `queue_observer_bootstrap` command; `src/features/download/client.ts` — flag mapping + signal (dirty).
- Contract: single-channel FIFO ⇒ total order; pre-cut events baseline, post-cut mutations live; no timing/content heuristic classifies hydration. Protected: Application task authority, Download domain model/reducer/selectors, lifecycle, Pointer Field, Native Surface. No provenance fields on traces.

## 4. Recipe and transition surface (expressive layer)

- `src/presentation/main-window/downloadIntakeMotionRecipe.ts` (untracked) — durations (:14-19), radial geometry (:26-49), Impact/Noise/Wave targets (:51-78), and epoch bookkeeping (:114-166). Only the epoch/stale-continuation/reduced-final-state lessons are reusable; radial geometry, visual targets, and timing are superseded.
- `src/presentation/main-window/DownloadIntakeTransitionSurface.tsx` (untracked, 318 lines) — composition wrapper: `MaskedRevealLayer` (:64-110) uses `animate()` on a radius MotionValue + `useMotionTemplate` radial-gradient CSS mask (`maskImage` :79); Impact pulse (:247-261), Wave ring (:263-282), inline SVG `feTurbulence` noise (:283-303) — all `pointer-events:none`, aria-hidden; epoch refs + state mirror (:131-137), epoch-guarded completion handlers (:179-212).
- `src/presentation/main-window/DownloadProgressSurface.tsx` (untracked, 135 lines) — extracted central Progress (ring/percent/indeterminate, status+summary, cancel button live immediately) — selector-derived props only; never computes task state.

## 5. App wiring (dirty)

- `src/App.tsx:563-571` — `useDownloadIntakePresentation(downloadQueueTraceIds, intakeObservationSuppressed, baselineTraceIds)`; suppression = `!baselineEstablished || isUiLabPreviewActive` (:558-563).
- `src/App.tsx:598-601` — `intakeMotionEligible = mainWindowFullContentVisible && !locks.drag && !locks.contextMenu && !locks.uiLab`.
- `src/App.tsx:880-887` — `startForegroundProcessing` calls `acceptDirect("foreground:${requestId}", origin)` at the exact `beginTaskProcessing` boundary.
- `src/App.tsx:1077-1084` — `runDownloadEnqueue` calls `acceptLocal(ack.traceId, origin)` only on `ack.accepted === true`, else `reject`.
- `src/App.tsx:3603-3647` — composition: `DownloadIntakeTransitionSurface` wraps `DownloadProgressSurface`; reduced motion + eligible + reveal/wave colors passed; cancel stays live (`:3628-3644`).
- `MainWindowPresentationSurface.tsx:843-872` (dirty) — surface-owned paste resolver + window paste listener moved from App; `:800-838` drop handler forms one normalized snapshot (`onDrop(e, origin)`).

## 6. Reuse verdict (evidence-based)

Reusable after review because they are independent of the visual baseline: `interactionOrigin.ts` (pure discrete contract), the presentation adapter's epoch/generation/stale-continuation discipline, and ordered-bootstrap protocol facts. Logical progress and cancel correctness remain selector/Product-derived and independent of Reveal completion.

Superseded or re-evaluated: `DownloadIntakeTransitionSurface.tsx` radial/noise decoration, current recipe geometry/timing, `DownloadProgressSurface.tsx` visual materialization and central coexistence, intake eligibility/composition details, and shared-presence coupling. Pure recipe helpers are evidence for epoch/disposal techniques only; they are not a required shared API. MR0 defines contracts, not an animation framework. MR3 chooses Progress presentation and MR4 chooses Intake/Confirmation/Terminal Reveal.

Tests present for the dirty assets: `interactionOrigin.test.ts`, `downloadIntakePresentation.test.ts`, `downloadIntakeMotionRecipe.test.ts` (untracked) — M3 implement.md step 8 lists the focused regression command.
