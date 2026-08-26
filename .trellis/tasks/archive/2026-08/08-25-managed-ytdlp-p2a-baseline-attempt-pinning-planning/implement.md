# P2-A implementation and validation checklist

This checklist tracks the authorized bundled-baseline and attempt-binding slice. It does not authorize P2-B or Architecture PASS.

## Phase 1 — Canonical baseline supply

- [x] Define the minimal `.official-ytdlp-baseline.json` schema without app-version, timestamp, selection, or lifecycle fields.
- [x] Add the approved `yt-dlp` and `yt-dlp-ejs` wheels under packaged resources.
- [x] Generate the packaged manifest from the existing managed-package pin source and mechanically reject pin/packageSetId drift.
- [ ] Verify exact wheel membership, size, SHA-256, Python compatibility, and execution policy before packaging and from Windows/macOS artifacts. Source verification passes; fresh Windows/macOS package artifacts remain externally blocked/not available.
- [x] Keep all preparation network access in release tooling; runtime baseline preparation has no network path.

## Phase 2 — Offline cache and verified readiness

- [x] Add the Electron-owned bundled-baseline/runtime-binding module inside the existing runtime boundary.
- [x] Materialize `<userData>/runtimes/yt-dlp/<target>/baseline/` offline from verified packaged wheels.
- [x] Generate a temporary hash-locked requirements file from the manifest; use `--no-index --find-links --only-binary --require-hashes --no-deps` and `PIP_NO_INDEX=1`.
- [x] Publish `baseline.json` last and rebuild any absent, partial, corrupt, relocated, or mismatched cache under `runMutation`.
- [x] Add target-scoped FFmpeg/FFprobe/Deno verified-readiness facts, invalidated by runtime mutation; do not add digest-addressed directories.
- [x] Update yt-dlp runtime status/source and the dependency gate so the bundled baseline remains prepared and fail-closed.

## Phase 3 — Attempt-scoped binding

- [x] Make the yt-dlp attempt acquisition port return `{lease, binaries, identity}` after complete validation under the existing lifecycle lease.
- [x] Remove composition-time yt-dlp paths as production execution truth and pass the attempt binding through the existing context/adapter to the unchanged runner.
- [x] Release on binding-construction failure and retain the existing adapter `finally` release after process-tree settlement.
- [x] Keep one binding for yt-dlp internal retries; resolve a new binding for each existing new attempt, including auth recovery and engine-plan transitions.
- [x] Add sanitized `runtimeCandidate: "bundled"` and `runtimeSetId` attempt facts without raw paths.

## Phase 4 — Read-only observation and validation

- [x] Add read-only canonical/cache/shared-readiness/lease facts to P1 Diagnostics using pure inspectors only.
- [x] Test canonical corruption, cache rebuild triggers, offline-only pip arguments, readiness invalidation, dependency mismatch fail-closed, and no network fallback.
- [x] Test attempt ordering, retry reuse, new-attempt re-resolution, cancellation settlement, and mutation blocking.
- [ ] Run focused tests, type-check, lint, build, package verifiers, and relevant Windows/macOS release validation without expanding the retained external gates. Focused checks and source verifier pass; fresh Windows package construction is externally EPERM-blocked and macOS release gates are retained.

## Hard stop

- [x] Do not implement network update, managed candidates, staging, selection persistence, activation, rollback, GC, automatic candidate fallback, Repair Center, universal updater abstractions, or digest-addressed dependency storage.
- [x] Do not claim Architecture PASS from implementation or planning work.
