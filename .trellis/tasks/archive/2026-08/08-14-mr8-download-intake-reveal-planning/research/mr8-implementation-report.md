# MR8 Download Intake Reveal — Implementation Report

Status: implementation complete; GPT Architecture Lead approved on 2026-08-15;
awaiting closure commit and archive.
Baseline: `motion/presentation-integration@48987f7` in
`D:/Ameow/.cindy-worktrees/motion-integration`.

## Delivered boundary

1. `AmeowElectronDownloadRuntime` synchronously freezes queue count and detail
   before the first asynchronous emission, then attaches transient
   `acceptedTraceId` only to
   the existing `video-queue-detail` emission immediately caused by normal new
   membership or new advanced-quality membership. Existing-trace selection,
   advanced dedupe, ordinary snapshots, promotion, removal, and hydration stay
   unmarked.
2. The typed protocol normalizer preserves a nonblank marker only when it names
   a normalized task. `DownloadQueueController` captures pre-membership,
   performs its usual synchronous reduction, verifies post-membership, and
   publishes the narrow Intake transition with the exact post-reduction state.
   Queue acknowledgement remains a tombstone/generation reset only.
3. `downloadIntakePresentation` is a Download-specific latest-only owner. It
   stores one opportunity identity, trace, start-primary identity, and a 1200ms
   deadline. It rejects stale expiry, clears for removal/unrelated primary,
   foreground terminal, reset/controller replacement, and unmount; graphics
   eligibility and renderer callbacks have no lifetime role.
4. `resolveExpandedPresentationTarget` is the pure policy boundary: existing
   MR4 current-primary suppression first, then Terminal, Intake, current MR3
   Progress, then idle. Intake carries current Progress only as a renderer-local
   baseline, so expiry resolves from current facts rather than restoring a
   snapshot.
5. MR7 retains one `ExpandedPresentationSurface` and one WebGL2 canvas. The
   sole new renderer mode is typed Intake (`uMode = 6`). Normal motion permits
   its local transient frames; Reduced Motion keeps the Intake distinction with
   no continuous frame work.
6. The Chinese and English Download pages and the frontend/backend Presentation
   contracts record the user-visible behavior and ownership rules.

Explicitly unchanged: Download reducer/model state, local-command meaning,
Main Window lifecycle reducer/locks/full-intent/native requests, center-overlay
authority, central Progress/cancel DOM, MR3/MR4 semantics, Compact Character,
Folder/Transcode flows, and the single-host/backend boundary.

## Files changed

- Runtime/protocol/controller: `src/electron-runtime/service.ts`,
  `src/protocol/download/ipcTypes.ts`, `src/utils/downloadViewHelpers.ts`,
  `src/features/download/client.ts`, `src/features/download/useDownloadQueue.ts`
  and their focused tests.
- Presentation: `src/presentation/main-window/downloadIntakePresentation.ts`,
  `expandedPresentationPolicy.ts`, `expandedPresentationTargets.ts`,
  `expandedPresentationRuntime.ts`, `ExpandedPresentationSurface.tsx`,
  `MainWindowPresentationSurface.tsx`, `src/App.tsx`, and focused tests.
- Documentation/specification: both public Download locales plus frontend
  motion/state and Electron command-bridge contracts.
- Evidence: [Windows Electron validation](./mr8-windows-electron-validation.md)
  and its executable validation script/screenshot.

## Validation

| Command / check | Result |
| --- | --- |
| 14 focused MR8/regression suites | 14 files, 231 tests passed |
| `npm run type-check` | passed |
| `npm run lint` | passed |
| `npm run docs:build` | passed |
| `npm run build` | passed |
| `git diff --check` | passed; only repository CRLF conversion warnings |
| Windows Electron | passed with real renderer and extension queue paths, atomic mode-6 reads, bounded Progress recovery, foreground Terminal priority, and a 160ms Reduced Motion static sample; see linked report |
| `npm test` | 1639/1640 passed; the one failure is pre-existing `browser-extension/architecture-guard.test.js:277`, a CRLF-sensitive source-text assertion. MR8 has no browser-extension diff. |

## Cindy Lead evidence review

Verdict: **PASS for implementation-architecture handoff.**

The diff maintains the reviewed authority chain, keeps Intake causal metadata
transient, avoids snapshot/timing inference, and has no new Download field,
lifecycle lock/phase, native request, renderer semantic callback, second host,
backend fallback, or generic Reveal queue/scheduler/scene/layer API. Focused
and Windows evidence also preserve MR3/MR4 priority and the accessible DOM
separation.

Known non-blocking validation debt is the existing CRLF-sensitive browser
extension architecture assertion noted above. Windows used its local missing
sidecar as a fast foreground-Terminal priority proof; it is not macOS evidence.

## GPT Architecture Lead review

Verdict on 2026-08-15: **PASS**. The retained validation debt is macOS not
verified and the pre-existing browser-extension CRLF-sensitive full-suite
failure. Neither debt reopens MR8.

## Closure boundary

Commit and archive MR8 on `motion/presentation-integration`, then stop. Do not
begin Folder Confirmation Reveal or another MR.
