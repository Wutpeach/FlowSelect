# MR0 — Motion / Presentation Baseline Audit

Provenance: all `src/` anchors refer to branch `cindy/auto-o3p8cr` in the paused worktree `D:\Ameow\.cindy-worktrees\auto-o3p8cr` (the only tree containing the M0/M1/M2 presentation work). The `main` branch at `D:\Ameow` has **no** `src/presentation/` and no pointer-field/magnetic/lifecycle code. The two trees share the same repo object store; `electron/main.mts` and `src/App.tsx` are modified (dirty) in the worktree by the paused M3 work.

## Provenance columns (Lead-confirmed baselines)

| Column | Tree / branch | State | What lives there |
| --- | --- | --- | --- |
| Committed M0/M1 | `cindy/auto-o3p8cr` | committed, approved | `src/presentation/main-window/{lifecycle,projections,effectContracts,effectExecutor,reactAdapter,geometry,motionRecipes,pointerField,magnetic,panelHover,presentationCompletion}.ts`, `MainWindowPresentationSurface.tsx`, `electron/mainWindowSurfacePolicy.mts`, preload changes |
| Committed M2 | `cindy/auto-o3p8cr` | committed, approved | Pointer Field + Magnetic + Edge Glow removal (`pointerField.ts`, `magnetic.ts`) |
| Dirty M3 candidate | `cindy/auto-o3p8cr` | uncommitted, paused (task `meta.paused=true`, reason: framework direction revision) | `interactionOrigin.ts`, `downloadIntakePresentation.ts`, `useDownloadIntakePresentation.ts`, `downloadIntakeMotionRecipe.ts`, `DownloadIntakeTransitionSurface.tsx`, `DownloadProgressSurface.tsx` (untracked) + edits to `App.tsx`, `MainWindowPresentationSurface.tsx`, `electron/main.mts` (`queue_observer_bootstrap`), `src/features/download/{client,useDownloadQueue}.ts`, `src/protocol/download/ipcTypes.ts`, `src/types/electronBridge.ts`, `src/utils/centerOverlayState.ts` + 4 spec files |
| Dead reference | `main` | committed | `electron/startupWindowMode.mts` (deleted on `cindy/auto-o3p8cr`), pre-M0 `App.tsx` monolith |

MR0 planning must NOT treat the dirty M3 visuals (radial mask / noise / current Progress materialization / central coexistence) as a visual baseline MR0 must preserve; the Motion/Presentation architecture direction is being revised without creating a framework.

## 1. Main Window lifecycle — single writable authority

- `src/presentation/main-window/lifecycle.ts:3-34` — lock vocabulary (`drag | contextMenu | task | drop | startup | centerOutcome | uiLab | appUpdate`), recipe (`animated | instant`), full-intent reasons (`task | runtimeGate | shortcut | uiLab | foreground`), phase union `compact | expanding | full | collapsePending | collapsing` with epochs.
- `reduceMainWindowPresentation` (`lifecycle.ts:191-372`) is the sole writer of presentation state; every transition returns `{ state, effects }`; epochs are taken via `takeEpoch` (`:88-93`).
- Collapse policy: pointer leave → `beginCollapseDelay` 80 ms (`:161-179`, `:213-237`); `collapseTimerFired` → `beginCollapse` (`:308-318`); collapse blocked by any lock (`:80-82`, `:135-159`).
- Terminal/collapse authority: compact is entered ONLY by the matching `visualTransitionCompleted {target:"compact", epoch}` (`:346-369`), which emits the singular `native.setInteraction mode:"compact-passthrough"` effect. No `nativeSettled` state exists (M0/M1 review.md:46-49).
- Full intents: `requestFull` (`:275-306`); `App.tsx:943-952` requests full with `recipe:"instant"` when `hasOngoingTask`.
- Effects are declarative contracts: `src/presentation/main-window/effectContracts.ts`; executed by `effectExecutor.ts`. Projections are the read-only layer: `src/presentation/main-window/projections.ts:63-154` maps phase → visual/interaction/native projections; `isMainWindowFullContentVisible` (`projections.ts:59-61`) is the "full content visible" fact used by M3 eligibility.

## 2. Product/download facts → projection → Presentation Surface → renderer motion

- Download authority: `src/features/download/model.ts:70-80` (state), `reducer.ts:76-187` (single renderer transition owner), `selectors.ts:10-60` (counts/primary/progress derived; `selectPrimaryDownloadProgress` includes synthetic preparing view), `client.ts:137-176,181-187`.
- `src/App.tsx:478-540` composes `primaryTask` / `hasOngoingTask`; `src/utils/centerOverlayState.ts:174-225` gives `centerOverlayVisual` (`task-progress` precedence, request-id-guarded direct processing/outcome).
- `MainWindowPresentationSurface.tsx:484-...` receives projections; `App.tsx:3603-3647` composes the M3 `DownloadIntakeTransitionSurface` + `DownloadProgressSurface` from selector-derived facts. Flow: business facts → selector projection → surface props → renderer-local motion (M3 recipe).
- Motion stack (installed, no new deps): `motion@^12.35.2` (`package.json`), React 19, Tailwind 4. Shared tokens `src/components/ui/motion.ts:1-43` (`MOTION_EASE`, `MOTION_DURATION`, `compactCssTransition`, `COMPACT_POPOVER_PRESENCE`, `CENTER_OVERLAY_PRESENCE_MOTION` at :38-43 — unconditional 0.2 s fade; NOT a correctness gate).
- Shell/compact choreography: `src/presentation/main-window/motionRecipes.ts:8-44+` (compact size 60, minimized icon 38, ease tuple, instant/reduced variants). Surface applies recipes at `MainWindowPresentationSurface.tsx:940-1153`; shell retains epoch-matched completion (`onAnimationComplete` → `visualTransitionCompleted`).

## 3. M2 Pointer Field — ownership, runtime, mount, retarget, dispose, sleep, reduced motion

- `src/presentation/main-window/pointerField.ts:14-33` — type: two viewport-local `MotionValue<number>` (x/y), stable-root-relative pixels; pure center fallback (`resolvePointerFieldCenterPoint` :20-33), finite validation + clamping (`resolvePointerFieldPoint` :48-69), reset-to-center on semantic leave (`resetPointerFieldToCenter` :88-99).
- `useMainWindowPointerField` (:38-47) — `useMotionValue` + memoized pair; mounted in `MainWindowPresentationSurface.tsx:575`; created per surface instance with `panelViewportSize` (stable 200×200 content surface — see `geometry.ts`); centered at mount so Magnetic starts at zero displacement.
- Writers: panel `onMouseEnter`/`onMouseMove` sync (`MainWindowPresentationSurface.tsx:711-...`), semantic leave/drop cleanup resets (`:767-783`, `:985-996`). One discrete read at paste time only (`MainWindowPresentationSurface.tsx:843-849` in the M3 dirty candidate).
- Consumers: Magnetic only (`magnetic.ts`). `useMainWindowMagnetic` (:60+) — spring-smoothing; eligibility fact `enabled` (`MainWindowPresentationSurface.tsx:599-605`: full content visible, not reduced motion, not drag, not collapsing/expanding?) — non-eligible jumps to zero (no spring settle). `resolveMagneticTarget` (:26-44) pure bounded radial target (radius 80, max 8 px).
- "Sleep" semantics in current code: there is no explicit sleep; the equivalent is the field being continuously updated at low frequency by mouse-move listeners that are active only while the surface is mounted, and reset-to-center on leave. Any MR0 "sleep" concept must be mapped onto these existing mechanisms (mounted-always, center-reset, no per-frame React state).
- Reduced motion: `App.tsx:354` reads preference; magnetic disabled → zero (`MainWindowPresentationSurface.tsx:587-596`, `magnetic.ts`); recipes have reduced variants (`motionRecipes.ts:40`); lifecycle/native policy independent.
- Dispose: field lives and dies with the surface component (MotionValue lifecycle); no global store, no IPC, no native coordinates ever (`pointerField.ts` header comment).

## 4. Presentation Surface composition and stale-continuation behavior

- `MainWindowPresentationSurface.tsx` structure: `useMainWindowPanelDrag` (:141), `MainWindowPresentationSurface` (:484), pointer field (:575), magnetic (:605), drag/drop hover state (:796-838), paste listener (M3: :843-872), shadow/backdrop layer (:900-921), shell morph node with `onAnimationComplete` (:1026-1056), compact icon overlay (:1058-1101), `AnimatePresence` blocks (:1093, :1111).
- Old surface persists during Progress entry: shell + App children stay mounted; central branch mounts inside `AnimatePresence mode="sync"` (`App.tsx:3562-3702`); no stored "old UI snapshot".
- Replacement/stale rules (M3 dirty): epoch-keyed bookkeeping — `downloadIntakePresentation.ts:265-273` (epoch-guarded expiry), `DownloadIntakeTransitionSurface.tsx:179-212` (epoch-guarded completion; stale callbacks are no-ops), `downloadIntakeMotionRecipe.ts:114-150` (pure epoch reaction: reduced-motion → settle+clear; eligibility loss → started decoration settles, unplayed stays; fresh eligible epoch → decoration; mask only when Progress materializes NOW).
- Compact/expand interplay: during non-full phases the M3 eligibility fact is false (`App.tsx:598-601`), so intake visuals settle/clear; Progress product facts remain correct regardless (M3 design requirement).

## 5. Evidence for persistent + transient + terminal composition

- Lifecycle state, Download Feature state/selectors, and Pointer Field are separate authorities/runtime concerns; they are not themselves a persistent Presentation Material layer.
- A persistent presentation baseline is projected from current authoritative facts (logical progress is the concrete future example). Existing selectors and `centerOverlayVisual` provide the fact/projection direction, but the current M3 Progress materialization is not a required baseline.
- Transient evidence: `CenterOverlayState` (`centerOverlayState.ts:7-56`) uses request identity; the M3 intake event uses a bounded latest event and 3 s relevance (`INTAKE_EVENT_RELEVANCE_MS` at `downloadIntakePresentation.ts:75`). These demonstrate stale-work guards, not a universal scheduler.
- Terminal evidence: download terminal results flow through existing reducer/selector projections (`App.tsx:1366-1398`; `selectors.ts`); no animation completion creates/alters a terminal fact.
- The required MR0 contract adds the missing composition invariant: transient response must reconverge to the latest persistent target, terminal presentation has visual priority, and consumer-local concurrency is bounded.
- No global framework: no XState/Zustand/store/bus/DSL; composition is hook-local state + Motion presence + keyed epochs. `src/presentation/main-window/` is a flat focused-module directory (29 files incl. tests).
- Integration points: `App.tsx` composition boundary (:3603), surface event wiring (:800-872), Download Feature client/useDownloadQueue (ordered bootstrap), lifecycle `requestFull` (business→full intent), effect contracts (native projection).

## 6. Heterogeneous execution evidence (Dot Field vs Character, info-bearing vs expressive)

- Current repo has ONE continuous renderer-local runtime (Pointer Field) and ONE shell morph chain (Motion recipes + epoch completion) plus the M3 intake recipe (Impact/mask/Noise/Wave) — three different execution cadences (continuous pointer updates; one-shot keyframe animations; one-shot mount-time `animate()` mask) with different correctness couplings (Magnetic never affects correctness; shell completion IS lifecycle acknowledgement; intake completion settles presentation only).
- The shell epoch-matched completion is a lifecycle-owned shell acknowledgement, not a general information-bearing feature-motion mechanism.
- Information-bearing feature interpolation: future visual progress may lag logical progress but must remain monotonic and never exceed the authoritative value.
- Expressive interpolation: Magnetic displacement, intake impact/noise/wave, drop glow — decorative only; no correctness dependency.
- Any MR0 "Dot Field" / "Character" concepts must map onto this split: renderer-local continuous runtime vs one-shot expressive actor, and must not blur the info-bearing (completion/epoch) vs expressive boundary that M0/M1 established.

## 7. Validation/regression surface (current)

- `lifecycle.test.ts`, `projections.test.ts`, `effectExecutor.test.ts`, `geometry.test.ts`, `pointerField.test.ts`, `magnetic.test.ts`, `motionRecipes.test.ts`, `panelHover.test.ts`, `presentationCompletion.test.ts` (worktree src/presentation/main-window).
- Electron: `mainWindowSurfacePolicy.test.mts`, `mainWindowPointerBoundary.test.mts`, `preloadBridgeContract.test.mts` (preload/renderer method parity), `windowVisibility.test.mts`.
- Download: `reducer.test.ts`, `selectors.test.ts`, `useDownloadQueue.test.ts`, `client.test.ts`, `centerOverlayState.test.ts`, `electron/downloadIpcAdapter.test.mts`, `downloadWsAdapter.test.mts`.
- Full gate: `npm test` (182 files / ~1,500 tests), `npm run type-check`, `npm run lint`, `npm run build`, `git diff --check` (per M0/M1 and M2 reviews).
