# P2 execution context summary

Use the full `repository-grounded-p2-report.md` when reviewing evidence. This compact file is the implementation/check context injection entry.

## Non-negotiable boundaries

- Existing feature/domain routing and `AmeowElectronDownloadRuntime` remain the only download authority.
- P2 is yt-dlp-specific: no second downloader service/registry/runner and no generic backend updater.
- Diagnostics reads P2 facts but never triggers ensure, update, staging, activation, rollback, repair, or cleanup.
- One atomic selection record is the sole persisted active-selection truth.
- Every engine attempt pins one complete immutable runtimeSet through process-tree settlement. Activation/rollback affect only later attempts.

## Confirmed blockers

- No bundled yt-dlp exists; packages contain target-specific CPython only and the macOS verifier rejects yt-dlp assets.
- yt-dlp paths are injected into the adapter once at composition; `buildAttemptContext` is the per-attempt insertion point.
- Current venv bootstrap deletes/rebuilds one mutable root and its concurrency maps do not coordinate with active processes.
- Windows proxy-front spec conflicts with actual `real/` paths; managed Deno is not put on the yt-dlp child PATH.
- macOS app/runtime trust for downloaded managed content is not verified; arm64 is the only currently proven release CI target.

## Architecture direction

- Canonical bundled baseline = app-packaged, hash-pinned wheel/dependency set + target-specific bundled Python + target-aware manifest/verifier. UserData baseline venv is an offline-rebuildable cache, not content truth.
- Managed candidates = immutable `versions/<releaseId>` directories created only after download, source/final-URL, size, SHA-256, package, target, and dependency verification.
- Complete runtimeSet = yt-dlp candidate/Python identity + app-owned FFmpeg/FFprobe/Deno identities + target + selection generation. P2-V evidence selects mutable shared singletons protected by one atomic resolve/lease/mutation coordinator; digest-addressed shared-tool storage is only a fallback if the coordinator cannot cover every mutator/consumer.
- Shared media tools remain app-owned dependencies and are not independently updateable/selectable by P2.
- Selection missing/corrupt or candidate ineligible before pin resolves bundled for the first attempt and records a degraded reason.
- A post-pin managed defect never switches in place. A later bounded orchestration hook may create exactly one visible new same-engine bundled attempt for typed candidate defects only.
- Candidate leases acquire during attempt-context construction and release only after execution/cancellation process-tree settlement.
- GC is explicit, uses the same lifecycle lock, and deletes only unselected/unretained/unleased candidates; baseline is never GC'd.

## Delivery gates

1. P2-V: reconcile Windows path/Deno behavior, verify Windows installed/portable storage and signing policy, verify macOS quarantine/signing/target behavior, freeze trust/downgrade/EJS policy.
2. P2-A: after P2-V repairs, immutable bundled baseline, selection default bundled, full-runtime-set lifecycle leases, attempt-level pinning, read-only diagnostics. No updater.
3. P2-B: check/download/verify/stage/probe only. No activation.
4. P2-C: explicit activation/rollback and leases. No automatic post-pin fallback.
5. P2-D: bounded visible candidate fallback attempt plus retention/GC and app-update coexistence.

Each phase requires separate planning/review. Do not collapse P2-A through P2-D.
