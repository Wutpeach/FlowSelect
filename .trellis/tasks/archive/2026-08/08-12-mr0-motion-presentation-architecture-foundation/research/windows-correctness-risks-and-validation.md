# MR0 — Windows Correctness Risks & Validation Strategy

Lead directive: judge the two Windows correctness risks by whether the specific call chain is still REACHABLE in the current tree — never claim they disappear merely because the UI is replaced.

## Risk A — Electron native argument conversion on the current compact/reachability path

### Reported reachable chain (primary risk)

`src/App.tsx:377-403` calls the desktop runtime at `src/desktop/runtime.ts:69-76`, which crosses `electron/preload.mts:95-102` and `electron/main.mts:3417-3473` into `electron/mainWindowSurfacePolicy.mts:192-250`. This bridge/native path remains reachable on the committed M0–M2 architecture and is independent of M3 Reveal/Progress visuals. Replacing those visuals therefore does not remove the Windows native argument conversion failure. It remains a focused bridge/native-test and packaged-Windows manual repair dependency.

The startup argv and dead channel findings below are secondary audit evidence; they do not replace the reported risk.

### Secondary startup-argv archaeology (not the reported failure)

Removed on `cindy/auto-o3p8cr` (committed M0/M1):

- `git diff main..cindy/auto-o3p8cr -- electron/startupWindowMode.mts` — module deleted (`MAIN_WINDOW_FULL_SIZE=200`, `MAIN_WINDOW_COMPACT_STARTUP_SIZE=80`, `STARTUP_WINDOW_MODE_ARGUMENT_PREFIX="--ameow-startup-window-mode="`, `parseStartupWindowModeArgument(argv)`).
- `electron/preload.mts` diff — `parseStartupWindowModeArgument(process.argv)` import+call removed; `startupWindowMode()` bridge method removed.
- `electron/main.mts` diff — `buildStartupWindowModeArgument(startupWindowMode)` into `webPreferences.additionalArguments` removed (was `main` branch `main.mts:726`); `resolveMainWindowStartupMode` / `resolveMainWindowInitialSize` / `getMainWindowOuterSize` replaced by `getMainWindowFullOuterSize` (`worktree main.mts:2250,2257-2258,2330-2342,2387-2388`).

Still alive on `main` (reference only): full round-trip exists but `resolveMainWindowStartupMode` always returns `"full"` (both platform and hasShownMainWindowOnce are voided), so the conversion is dead plumbing even there.

### Remaining live argv conversions (reachable on `cindy/auto-o3p8cr`)

- `electron/windowVisibility.mts:70-84` — `shouldUsePackagedWindowsOpaqueWindow({platform,isPackaged,argv,env})`: `argv.includes("--ameow-force-opaque-window")` + env flag; consumed at `main.mts:260-266` (`forceOpaquePackagedWindow`) → `resolveWindowAppearance` (`main.mts:635-660`) → transparent/opaque background + `useOpaquePackagedWindow`.
- `electron/windowVisibility.mts:109-123` — `shouldEnablePackagedStartupDiagnostics` same argv/env pattern; consumed at `main.mts:270-278` → startup diagnostics file write (`main.mts:3750-3759`).
- `src/utils/...` no other argv parsing; `electron/preload.mts:15` on `main` was the only preload argv read and is gone on the worktree branch.

### Reachability verdict for a UI replacement

MR0 renderer-side replacement does not touch these chains: both are main-process startup-only (packaged Windows), orthogonal to presentation. Replacing the presentation layer cannot eliminate them; they are eliminated only if MR0's scope includes main-process startup policy, which is NOT in the presentation foundation scope. Report honestly: "still reachable, unaffected by renderer replacement".

Also reachable-but-dead: `set_window_size` / `set_window_position` commands (`worktree main.mts:3081-3093`) — `Number(payload.width ?? 200)` conversion, typed in `src/types/electronBridge.ts:52-53`, no renderer callers, not exposed via preload. Record as optional cleanup evidence only; it is not the reported failure and is not required MR0 foundation work.

## Risk B — terminal-not-compact

### Exact current location (evidence)

No `terminal` window phase exists in the renderer lifecycle (`lifecycle.ts:22-27` phases: compact/expanding/full/collapsePending/collapsing) and no "terminal size" concept in `mainWindowSurfacePolicy.mts` (position-only reachability; sizes never change — `main.mts:2250,2387-2388` always `getMainWindowFullOuterSize`; morphing is renderer-visual over a stable native viewport per M0/M1 review.md:65-71).

Reachable call chains where a task's terminal outcome and the window's compact/full state interact:

1. `src/App.tsx:943-952` — `hasOngoingTask` → `requestFullIntent("task","instant")`: while any task is active the window is held full via the `task` lock (`App.tsx:570-592` presentationLocks). When the LAST task reaches terminal, `hasOngoingTask` flips false, the `task` lock drops, and the lifecycle schedules collapse via the normal pointer-leave/lock-release path (`lifecycle.ts:251-263` `setLock` false → `beginCollapseDelay`).
2. `src/App.tsx:1366-1398` — `onDownloadTerminal` outcome handling calls `showForegroundTaskOutcome` (`App.tsx:796-842`); request-id/timer state is held in `centerOverlayState.ts:7-56,84-111`; the derived presentation lock is at `App.tsx:577-594`, and lock release/collapse runs through `lifecycle.ts:251-258,161-178`.
3. `native.setInteraction` compact-passthrough at `lifecycle.ts:362-368` — entered only on the matching collapse completion.

Risk shape to validate: after a terminal outcome, collapse must proceed through the lock-release + collapse-pending path exactly once, and passthrough must be entered only by the matching epoch — no state where the window remains full (or partially sized) after the terminal business state. The M0/M1 "single acknowledgement" contract and `presentationCompletion.test.ts` cover the collapse side; the terminal→collapse handoff (lock drop at terminal while pointer is outside) is the Windows-manual validation item.

### Reachability verdict for a UI replacement

If MR0 replaces only the motion/presentation layer, the terminal→lock→collapse chain above remains the same call chain — replacement does not change its behavior. If MR0 also re-owns the "task lock" or the outcome lock semantics, the chain must be preserved byte-for-byte or re-validated. The M3 dirty candidate does not alter this chain (it only adds intake visuals and the bootstrap snapshot).

## Validation strategy (per requested invariant)

| Invariant | Automated evidence (current) | Command |
| --- | --- | --- |
| Lifecycle single-authority, epochs, collapse/expand interruption | `src/presentation/main-window/lifecycle.test.ts`, `presentationCompletion.test.ts` | `npm test -- src/presentation/main-window/lifecycle.test.ts src/presentation/main-window/presentationCompletion.test.ts` |
| Projection authority (read-only, no writes) | `projections.test.ts` | `npm test -- src/presentation/main-window/projections.test.ts` |
| Pointer Field authority, center reset, no native coords | `pointerField.test.ts`, `magnetic.test.ts` | `npm test -- src/presentation/main-window/pointerField.test.ts src/presentation/main-window/magnetic.test.ts` |
| Origin normalization, paste pointer/center fallback, no screen coords | `interactionOrigin.test.ts` (dirty M3) | `npm test -- src/presentation/main-window/interactionOrigin.test.ts` |
| Intake adapter: accepted/precise, external/center, late-replace, reject no-op, generation pruning | `downloadIntakePresentation.test.ts` (dirty M3) | `npm test -- src/presentation/main-window/downloadIntakePresentation.test.ts` |
| Ordered bootstrap total order, baseline re-seed, no hydration replay | `useDownloadQueue.test.ts`, `client.test.ts` (dirty M3) | `npm test -- src/features/download/useDownloadQueue.test.ts src/features/download/client.test.ts` |
| Progress product-derived, cancel live independent of reveal | `DownloadProgressSurface` prop-driven; `centerOverlayState.test.ts`; `selectors.test.ts` | `npm test -- src/utils/centerOverlayState.test.ts src/features/download/selectors.test.ts` |
| Recipe final states: reduced/interrupted → final, no completion gates | `downloadIntakeMotionRecipe.test.ts` (dirty M3) | `npm test -- src/presentation/main-window/downloadIntakeMotionRecipe.test.ts` |
| Native surface policy: reachability position-only, destroyed-window, reduced-motion jump | `electron/mainWindowSurfacePolicy.test.mts` | `npm test -- electron/mainWindowSurfacePolicy.test.mts` |
| Preload/renderer bridge parity | `electron/preloadBridgeContract.test.mts` | `npm test -- electron/preloadBridgeContract.test.mts` |
| M0/M1/M2 regression protection | Full suite (182 files / ~1,500 tests) + type-check + lint + build | `npm test && npm run type-check && npm run lint && npm run build && git diff --check` |
| Windows manual matrix | Required per M2 review (macOS NOT VERIFIED, never inferred) | Manual: drop at corner/edge/center, paste with/without pointer, extension intake, repeated intake, terminal→collapse handoff, passthrough after collapse, reduced motion toggle |
| Architecture guards (no Electron/native imports in presentation runtime modules) | `src/architecture/import-guard.test.ts` (dirty M3) | `npm test -- src/architecture/import-guard.test.ts` |
