# Final Lead Architecture Review

Date: 2026-08-11

## Final disposition

- Architecture Review: **PASS**
- Windows manual validation: **PASS**
- macOS manual validation: **NOT VERIFIED**
- Task disposition: approved for completion and archive
- Product-code follow-up in this phase: none

macOS must not be represented as verified by this task. Its transparent-window,
shadow/overshoot, icon-centering, focusability, and non-Windows hotspot behavior
remain a later platform verification obligation.

## Accepted architecture

- `src/presentation/main-window/lifecycle.ts` is the sole writable authority for
  full, compact, and transition lifecycle state.
- Visual, interaction, native-policy, and full-content values are read-only
  projections of lifecycle state rather than parallel React state or mirrored
  refs.
- Presentation responsibilities are separated across lifecycle, projections,
  effect contracts/execution, a thin React adapter, geometry, Motion recipes,
  continuous Motion runtime compatibility, and the presentation surface.
- Geometry owns spatial policy only. Motion recipes own renderer choreography
  only. Native surface policy owns OS placement, visibility, focus,
  hit-testing/passthrough, dragging, and platform correction only.
- High-frequency pointer coordinates no longer live in React application state.
  Edge Glow retains only a minimal Motion-value compatibility adapter pending the
  M2 Pointer Field design.
- UI Lab uses the normal presentation lifecycle through its lock and explicit
  full intent. The previous visual override and ignored-completion bypass are
  removed.

## Compact completion and native interaction semantics

- A compact transition has one acknowledgement: the matching Renderer Motion
  collapse completion for the active epoch.
- The native interaction mode remains `interactive` throughout collapse.
- Only the matching completion enters `compact` and emits the singular
  `compact-passthrough` effect.
- Native compact reachability correction runs independently. It does not
  complete or block lifecycle state and does not gate passthrough.
- No `nativeSettled` state or event was introduced.
- No pointer-boundary transition token was introduced because consolidated
  lifecycle gating and subscription-generation cleanup passed the focused race
  coverage without evidence of stale native events.

## Removed competing and dead paths

- Removed App-owned minimized, shell-phase, transition-mode, pointer-coordinate,
  completion, collapse-timer, drag, hotspot, pointer-boundary, geometry, and
  Motion orchestration state.
- Removed mirrored lifecycle refs and the write-only
  `compactNativeSettledRef` path.
- Removed superseded shell-machine, geometry, Motion-baseline, native-bounds
  orchestrator, transition-token, compact-bounds, and main-window-mode helpers.
- Removed the dormant compact native startup mode and its renderer propagation.
- Removed arbitrary renderer-controlled native bounds animation.

## Renderer/native boundary

Normal full-to-compact and compact-to-full morphing is renderer-visual-only over
a stable native Main Window viewport. The renderer-facing generic
`animateBounds` capability was replaced by semantic native operations:

- `ensureMainWindowCompactReachable`
- `cancelCompactReachability`

The renderer cannot provide arbitrary width, height, bounds, easing, or duration
for native window animation.

## Validation evidence

Lead verification completed after the implementation and correction passes:

- Focused presentation/native/bridge tests: 13 files, 103 tests passed.
- Full test suite: 182 files, 1,488 tests passed, 0 failures.
- `npm run type-check`: passed.
- `npm run lint`: passed with zero warnings.
- `npm run build`: passed.
- `git diff --check`: passed.
- Preload/renderer method parity is guarded by
  `electron/preloadBridgeContract.test.mts`.
- Focused coverage includes lifecycle epochs and interruption, projection
  authority, effect dependency freshness and timer behavior, single compact
  completion semantics, passthrough timing, independent/cancellable native
  reachability correction, destroyed-window handling, geometry/Motion boundary,
  and unified DOM/native/hotspot/drop hover semantics.

Windows manual validation passed for this M0/M1 phase, including the approved
Main Window presentation behavior matrix. macOS manual validation was not run.

## Accepted non-blocking issue

During collapse, the Cat ICON can show a minor flicker. Lead review accepts this
for M0/M1; it does not block completion or archive. Re-evaluate it in M2 or a
later Main Window Motion polish task. No visual fix is included in this phase.

## Stop conditions and deviations

No architecture stop condition remained open at final review. The approved
single-acknowledgement compact contract held, no reproducible stale
pointer-boundary event required extra synchronization, and no active behavior
required restoring arbitrary native bounds animation. No further product-code
cleanup or visual changes are authorized as part of this archive pass.
