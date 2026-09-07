# P2 Managed yt-dlp Update / Rollback — implementation plan

## Planning gate

Do not start implementation from this parent plan. Create a child task for each phase below, run its own review, and stop at every phase boundary. Production implementation remains unauthorized until the user approves the latest phase plan.

## P2-V — platform and security evidence

- [ ] Build and inspect Windows NSIS and portable artifacts; record actual runtime, userData, proxy-front/`real/`, FFmpeg/FFprobe, and Deno paths.
- [ ] Run packaged Windows yt-dlp version/download/merge/Deno/cancel/concurrency probes and verify hidden child-process behavior.
- [ ] Reconcile the Windows proxy-front spec with one proven implementation direction before touching candidate selection.
- [ ] Run fresh macOS arm64 quarantine/Gatekeeper tests for app launch, bundled wheel materialization, managed wheel staging, yt-dlp execution, FFmpeg merge, cancellation, and relocation.
- [ ] Decide whether macOS x64 remains a release target and verify it if retained.
- [ ] Record Windows Authenticode and macOS codesign/notarization/quarantine policy for P2 artifacts.
- [ ] Freeze the Ameow-owned release-manifest trust model: PyPI/GitHub evidence inputs, host/redirect allowlist, hashes, downgrade policy, and optional PGP trust-root decision.
- [ ] Verify yt-dlp EJS/remote-component behavior and include every required offline package/runtime dependency in the baseline and candidate manifests.

Gate: no P2-A implementation until platform paths/trust, baseline contents, and authenticity policy have explicit evidence-backed decisions.

## P2-A — immutable baseline and attempt identity foundation

- [ ] Add an app-owned bundled-baseline manifest and vetted wheel set with exact version, size, hashes, dependencies, target/Python compatibility, and layout version.
- [ ] Include the baseline payload in Windows/macOS packages and add target-aware package verifiers; package failure must block a release.
- [ ] Materialize the baseline venv offline into a replaceable userData cache and verify/rebuild it without network access.
- [ ] Store app-pinned FFmpeg/FFprobe/Deno objects under immutable digest identities, without adding independent backend update/selection APIs.
- [ ] Add a schema-versioned atomic selection record whose default and corrupt-state fallback are bundled.
- [ ] Resolve and lease a complete `runtimeSetId` at `buildAttemptContext`; pass it to the existing adapter/runner instead of constructor-static paths.
- [ ] Attach candidate/runtimeSet identity to existing attempt diagnostics and release leases only after process-tree settlement.
- [ ] Extend P1 Diagnostics with read-only baseline, selection, eligibility, generation, fallback, and pinned-attempt facts; keep all ensure/update/repair paths unreachable from the query.
- [ ] Test offline baseline rebuild, corrupt selection, stable attempt binding, internal retry reuse, auth/engine re-attempt repinning, cancel settlement, and dependency replacement refusal while leased.

Gate: packaged baseline must be executable on verified Windows/macOS targets; static path injection must be removed for yt-dlp attempts; no network updater or managed activation exists yet.

## P2-B — stage-only managed candidates

- [ ] Add one Ameow-owned yt-dlp release manifest and strict schema validation.
- [ ] Implement explicit check/download-to-temp with existing network policy, bounded redirects, allowed final hosts, size limits, and cancellation.
- [ ] Verify exact hashes before install; install from the staged wheel set with `--only-binary`, `--require-hashes`, `--no-deps`, and no runtime dependency discovery.
- [ ] Publish only complete immutable `versions/<releaseId>` directories; partial or failed staging never enters the availability index.
- [ ] Probe version, Python compatibility, package/dependency set, entrypoint, and required media-tool compatibility without changing selection.
- [ ] Expose staged/eligible/failed integrity and probe facts read-only in Diagnostics.
- [ ] Test network, redirect, hash, disk, install, probe, duplicate-download, concurrent-stage, and cancellation failures; the current working selection must remain byte-for-byte unchanged.

Gate: P2-B ends with observable eligible candidates but no activation command.

## P2-C — explicit activation and rollback

- [ ] Add explicit Repair commands for activate and rollback through the existing Electron command bridge.
- [ ] Serialize stage/activate/rollback/pin/cleanup operations through one lifecycle lock and one selection writer.
- [ ] Atomically update `selected`, `previous`, and generation; selection write failure leaves prior truth intact.
- [ ] Make activation/rollback affect only attempts that have not resolved a binding.
- [ ] Resolve missing/corrupt/ineligible managed selection to bundled before the first attempt and record the reason.
- [ ] Keep active candidate/dependency objects leased through success, failure, cancellation, and process-tree termination.
- [ ] Test active download plus activation/rollback, pending job resolution, concurrent commands, app restart, corrupt metadata, unavailable previous candidate, and final bundled fallback.

Gate: explicit activation/rollback is safe for new attempts; post-pin automatic fallback and GC remain disabled.

## P2-D — visible candidate fallback and retention

- [ ] Define a narrow typed `runtime_candidate_failed` classification limited to candidate defects; exclude network/site/auth/format failures.
- [ ] Add a bounded orchestration/runtime retry hook that creates at most one new same-engine yt-dlp attempt with a fresh bundled binding.
- [ ] Emit visible attempt/fallback diagnostics and preserve exactly one terminal job result.
- [ ] Add explicit retention/GC policy for selected, previous, recent, quarantined, and unreferenced candidates.
- [ ] Remove a GC target from the availability index and verify zero leases under the lifecycle lock before deletion.
- [ ] Verify app-update coexistence, restart recovery from interrupted cleanup, and no baseline deletion path.

Gate: candidate fallback is observable and bounded; cleanup cannot race any active process tree.

## Validation contract for every implementation phase

- Run focused unit/integration tests for changed boundaries first.
- Run `npm run type-check`, `npm run lint`, relevant tests, package verifier/smoke tests, and `git diff --check`.
- For packaging phases, verify real packaged artifacts on the target platform; source-only tests cannot upgrade a platform fact from `NOT VERIFIED`.
- Confirm Diagnostics collection performs no directory creation, network request, process spawn/termination, file mutation, activation, rollback, or cleanup.
- Confirm no new downloader service, registry, runner, Domain routing rule, or generic backend updater was introduced.

## Rollback points

- P2-A can revert to the current managed-only runtime only before any release depends on the new selection schema; once shipped, preserve schema migration and bundled fallback compatibility.
- P2-B is safe to disable by removing update/check command exposure because it cannot activate candidates.
- P2-C rollback must preserve the selection record and resolve bundled; never delete staged versions as part of code rollback.
- P2-D may disable automatic candidate retry/GC policies while retaining all candidates and selection metadata.
