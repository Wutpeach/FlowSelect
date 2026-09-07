# Plan managed yt-dlp update and rollback

## Goal

Produce repository-grounded P2 planning for an independently updateable, safely selectable, and rollback-capable managed yt-dlp runtime without changing the existing Download Runtime authority. Planning must stop before implementation and Architecture PASS.

## Confirmed Repository Facts

- Ameow has one Electron download execution authority and one engine registry; yt-dlp execution paths are injected into the adapter at composition time.
- The current yt-dlp runtime is a mutable user-data venv backed by bundled CPython. Rebuild deletes the current tool root; bootstrap concurrency joining does not coordinate with active download processes.
- No immutable bundled yt-dlp candidate exists. Packaging includes target-specific CPython only, and the current macOS verifier rejects bundled yt-dlp/gallery-dl assets.
- `buildAttemptContext` is the existing per-engine-attempt boundary immediately before adapter execution and is the recommended candidate-resolution/pin point.
- Windows runtime paths use `real/` rather than the active proxy-front contract, and managed Deno is not placed on the yt-dlp child PATH.
- macOS managed files receive executable bits, but packaged app signing/notarization and post-install managed-file quarantine/Gatekeeper behavior are not verified.

## Requirements

### Authority and scope

- `AmeowElectronDownloadRuntime` and existing feature/domain routing remain the sole download execution authority.
- Managed yt-dlp is only a runtime candidate resolved inside the existing execution boundary; do not introduce another downloader service, registry, runner, or generic backend-updater framework.
- P2 is yt-dlp-specific. Full Repair Center design and updates for other backends are out of scope.
- Update, activation, rollback, and cleanup are explicit Repair lifecycle operations. P1 Diagnostics may observe their facts but must not trigger or own them.
- Active selection has one authoritative persisted source; configuration, runtime, and updater must not become competing truths.

### Baseline and candidate lifecycle

- Define a genuinely immutable, target-specific bundled yt-dlp baseline shipped with the app and never overwritten by backend updates.
- Define managed candidate identity, version, target, dependency-set identity, integrity/authenticity evidence, eligibility, activation generation, and lifecycle state.
- Managed releases and their dependency trees are stored immutably by identity. No update replaces a directory that an attempt can still reference.
- Specify update → verify → stage → eligibility probe → activate failure boundaries so a failed update cannot damage the currently working backend.
- Define explicit rollback and automatic safety fallback, including missing/corrupt selection metadata, unavailable managed candidates, failed startup, and final fallback to bundled baseline.
- Define candidate retention and cleanup rules that preserve every candidate referenced by an active attempt or process tree.

### Attempt lifecycle

- Every new download attempt resolves and pins one complete runtime identity before execution and uses it until that attempt and process tree terminate.
- Activation and rollback affect only new attempts.
- Retry, cancel, fallback, and terminal behavior must preserve current attempt semantics. A running attempt must never switch executable or dependency set underneath its process.
- Any automatic fallback that runs another executable must be represented as a new attempt through existing retry/terminal authority.

### Evidence and platform gates

- Verify the P0 finding that no immutable bundled yt-dlp candidate exists today.
- Determine whether current composition-time runtime path injection can support attempt-time candidate resolution.
- Determine whether current bootstrap/install concurrency primitives are sufficient for activation, rollback, and cleanup relative to active downloads.
- Reconcile Windows proxy-front requirements with the actual managed runtime path/layout before implementation.
- Identify required evidence for upstream release authenticity, integrity, redirect/source policy, downgrade rules, and dependency compatibility.
- Identify Windows path, permissions, Authenticode, portable/installed storage, and process execution blockers.
- Identify macOS target, executable-bit, symlink, codesign/notarization, quarantine, Gatekeeper, and managed Python-package runtime blockers.

## Acceptance Criteria

- [x] Planning answers bundled baseline ownership and lifecycle in current packaging/runtime architecture.
- [x] Planning assigns candidate identity, version, dependency-set, eligibility, and active-selection authority to existing responsibility boundaries.
- [x] Planning aligns attempt-level runtime pinning with queue, retry, cancellation, process-tree, and terminal lifecycle.
- [x] Planning specifies update, verification, staging, probing, activation, rollback, fallback, retention, and cleanup semantics with explicit failure boundaries.
- [x] Planning records required upstream/repository evidence for authenticity, integrity, compatibility, and downgrade policy.
- [x] Planning enumerates Windows and macOS blockers that must be verified before implementation.
- [x] Planning recommends implementation phases and identifies the minimum safely deliverable slice.
- [x] Planning records the P2 lifecycle facts P1 Diagnostics may observe without granting Diagnostics updater authority.
- [x] All conclusions are anchored in current repository evidence and distinguish confirmed facts, recommendations, and not-yet-verified blockers.
- [x] No production code, updater framework, implementation activation, or Architecture PASS is produced.

## Out of Scope

- Production implementation or mutation of packaged/user runtime assets.
- Diagnostics UI, Repair Center UX, or a generic backend updater.
- Changing feature/domain routing or replacing `AmeowElectronDownloadRuntime` authority.
- Updating FFmpeg, FFprobe, Deno, gallery-dl, or arbitrary future engines independently.
- Granting Architecture PASS or starting Phase 2 implementation.
