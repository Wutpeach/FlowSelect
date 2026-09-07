# OneWorks Mascot Production Adoption Implementation Plan

## Entry Gate

Do not run this plan while the current `@oneworks/avatar-react@1.0.0-rc.6` root entry is the only renderer path. First obtain and verify an upstream renderer-only runtime and CSS export, or receive an explicit user decision changing the no-Editor production constraint. Re-run mechanism-equivalence evidence against the exact adopted pin before editing production.

## Phase 1 — Prove the Dependency Boundary

- Install the candidate renderer-only upstream pin in an isolated branch/worktree; do not touch unrelated dirty runtime files.
- Prove the installed package/export contains renderer code and renderer CSS only.
- Build an Avatar-only fixture with the repository Vite toolchain and scan emitted JS/CSS for Editor components, editor UI strings/locales, persistence keys, `localStorage` editor paths, authoring controls, and editor selectors.
- Record raw/minified/gzip JS and CSS deltas, license, peer dependencies, browser APIs, and exact export map.
- Repeat the pinned OneWorks mechanism-equivalence check for cone geometry, shared pose/depth, `occludedByFace`, and public Avatar API.
- Stop if any Editor/authoring payload remains or the required renderer mechanisms are missing. Do not start Route B/C in this task.

## Phase 2 — Add Production-Owned Pure Leaves

- Add one production definition module containing the verbatim canonical candidate and provenance/checksum constants.
- Add checksum, parser round-trip, and tamper tests. The expected checksum remains `fnv1a32:eb514f72`.
- Add one pure attention-to-pose projection using the reviewed normal envelope `±0.28 rad` yaw / `±0.16 rad` pitch.
- Add one production-owned OneWorks action library for `surprised`, `curious-short`, and `playful-short` using the approved public clips.
- Add one Compact-local pure frame/action runtime that preserves the 18–32 second quiet window, no-repeat rule, one rAF, pause/resume, static Reduced Motion, and stale-generation disposal.
- Keep the current diamond renderer active during this additive step; no runtime switch or feature flag is added.

## Phase 3 — Rewire the Existing Host

- Replace only `CompactMascot.tsx` internals with the controlled renderer-only Avatar entry.
- Preserve the existing prop contract, Surface mount location, pointer read-only contract, `aria-hidden`, `pointerEvents: none`, document visibility cleanup, and Compact presence/remount behavior.
- Set `interactive={false}`; do not wire definition-change callbacks; disable upstream autoplay/playback handles.
- Compose pointer pose and action frames through the Ameow-owned runtime and feed one controlled definition to the renderer.
- Fill the unchanged 56 px holder; keep the 60 px shell and native geometry untouched.
- Change stale Kirby-specific diagnostic markers only where needed to describe the OneWorks mascot truth; update tests in the same change.

## Phase 4 — Update Lab and Architecture Guards

- Make Lab import the production canonical definition; remove the independently generated candidate authority while retaining Inspector-only controls and evidence tooling.
- Extend architecture guards so only the Compact host may import the renderer package/CSS, pure leaves may import only the core helper package, and all production imports of Editor/Lab/authoring APIs are forbidden.
- Preserve guards for the sole Pointer Field writer, no Product/lifecycle/native/desktop imports, no IPC side channel, no timers/queues, and no per-frame React state.
- Update `.trellis/spec/frontend/character-motion.md` from the old Kirby/avatar-core mechanism to the accepted OneWorks contract without weakening lifecycle and motion invariants.

## Phase 5 — Visual, Lifecycle, Build, and Native Gates

- Capture tightly cropped evidence at the actual 56 px production holder and magnified scale for neutral, conservative yaw/pitch, each action, and Reduced Motion; compare to the approved 60 px candidate without changing its definition.
- Instrument rAF/timeouts/intervals across normal playback, Reduced Motion, hidden/visible, unmount/remount, and Compact→Full→Compact. All OneWorks/Ameow-owned work must return to baseline after stop/teardown.
- Profile pointer movement and action playback against the current renderer. No dropped-frame regression or uncontrolled React per-frame state is acceptable.
- Run production build and scan emitted assets for Lab and Editor payloads.
- Record exact before/after raw and gzip renderer assets and packaged application size.
- Build and launch a Windows packaged directory/portable app through `file://`; verify render, pointer pose, actions, Reduced Motion, native visibility, and Compact/Full transitions with no console errors.
- Run the equivalent macOS package/runtime smoke on macOS hardware or CI. If unavailable, record `NOT VERIFIED`; do not claim cross-platform closure.

## Phase 6 — Atomic Diamond Retirement

- After all available replacement gates pass, delete the old diamond definition, avatar-core behavior runtime, and obsolete definition/runtime tests.
- Rewrite architecture/surface tests for the new host rather than deleting their ownership assertions.
- Remove `@bible-strong/avatar-core` and its lockfile graph only after zero production references remain.
- Add/update third-party notices for the adopted MIT OneWorks packages and remove obsolete avatar-core bookkeeping.
- Run the full validation matrix again after deletion. Implementation is incomplete until exactly one renderer and one definition authority remain.

## Validation Commands and Evidence

```powershell
npx vitest run src/presentation/main-window src/lab/oneworksMascot.test.ts src/lab/oneworksAmeowCandidate.test.ts src/lab/OneWorksMascotInspector.test.ts src/lab/rendererReuse.test.ts
npx vitest run src/architecture/import-guard.test.ts
npm run type-check
npm run lint
npm run build
npx vite build --config vite.lab.config.ts --outDir .trellis/tasks/08-25-oneworks-mascot-production-adoption-planning/lab-build
npm run package:win:dir
npm test
```

Additional scripted assertions must scan emitted JS/CSS for forbidden Editor/Lab identifiers and record asset sizes. macOS validation uses the repository macOS packaging command on macOS.

## Review and Rollback Gates

- Gate A: renderer-only upstream artifact proven; otherwise stop before production edits.
- Gate B: pure definition/pose/action/runtime tests pass; otherwise old production remains authoritative.
- Gate C: rewired host passes browser/lifecycle/build/package checks; otherwise revert the rewire commit.
- Gate D: after diamond deletion and dependency cleanup, rerun the entire matrix; otherwise revert the retirement commit or the whole adoption branch.
- No gate may be bypassed with a production dual-renderer flag.

## Files and Worktree Boundaries

- Expected adoption scope: `src/presentation/main-window/`, focused `src/lab/` fixtures/tests, `src/architecture/import-guard.test.ts`, `package.json`, `package-lock.json`, `.trellis/spec/frontend/character-motion.md`, and `THIRD_PARTY_NOTICES.md`.
- Do not modify or revert the unrelated managed-runtime/yt-dlp changes. `electron/main.mts` is currently dirty; run Electron packaging after that work settles or in a clean worktree/CI.
- Electron main, preload, window routing, lifecycle reducer, projections, effect executor, Pointer Field writers, and native geometry are validation surfaces, not expected implementation edit targets.

## Stop Point

This implementation plan is ready for review but not activation. Do not run `task.py start`, dispatch implementation, or claim Architecture PASS from this planning checkpoint.
