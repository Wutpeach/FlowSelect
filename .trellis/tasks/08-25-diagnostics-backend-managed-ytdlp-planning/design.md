# Diagnostics backend lifecycle and managed yt-dlp — architecture direction

## Status and conclusion

Planning only. This document does not authorize implementation or grant Architecture PASS.

- **P1 read-only Diagnostics: feasible.** Existing owners already expose most required facts, but the query path must avoid current helpers that create directories while resolving status.
- **P2 managed yt-dlp update / rollback: conditionally feasible.** Current yt-dlp is already a managed Python package in a per-tool user-data venv backed by bundled CPython. The repository does **not** currently ship an immutable bundled yt-dlp candidate, so safe bundled fallback is a prerequisite rather than current behavior.

## Current repository truth

### Ownership and authority

- `electron/main.mts` is the composition root. It creates one `AmeowElectronDownloadRuntime`, one engine registry, and one yt-dlp/gallery-dl adapter set.
- `src/electron-runtime/service.ts` owns queueing, attempt orchestration, cancellation, retry handoff, and terminal lifecycle.
- `src/electron-runtime/ytDlpDownload.ts` and `processRunner.ts` own yt-dlp command execution, bounded retries, evidence capture, and child-process termination.
- Feature/domain providers continue to decide routing and downloader-owned URLs. Runtime candidate selection must not alter those decisions.
- `electron/managedRuntimeBootstrap.mts` owns current mutable runtime installation: per-tool Python venvs for yt-dlp/gallery-dl plus managed FFmpeg/FFprobe and Deno artifacts.

### Runtime layout

- Bundled immutable resource: target-specific CPython under packaged resources.
- Managed mutable runtime: `<userData>/runtimes/...` for yt-dlp/gallery-dl venvs, FFmpeg/FFprobe, and Deno.
- yt-dlp/gallery-dl package identity is pinned in `electron/managedPythonPackageManifest.mts`; current status expects `source="managed"`.
- FFmpeg/FFprobe are passed explicitly to yt-dlp and their directory is prepended to the child `PATH`.
- Current runtime status proves mostly path presence and expected source. Only separate version commands provide executable version facts.

## Architecture invariants

1. Diagnostics is read-only by default and never downloads, installs, repairs, activates, deletes, creates directories, changes config, cancels jobs, or mutates selection.
2. Repair/update is an explicit and separately authorized lifecycle.
3. A real target-specific yt-dlp baseline must be shipped as immutable, verified application content before P2 can promise bundled fallback.
4. Application update and backend update lifecycles remain independent.
5. Existing feature/domain routing and `AmeowElectronDownloadRuntime` remain the only download authority.
6. A managed yt-dlp release is only a candidate resolved inside the existing attempt execution boundary.
7. Each attempt pins one complete runtime identity: yt-dlp, Python/venv, FFmpeg, FFprobe, Deno, target, version, and activation generation.
8. Activation and rollback affect new attempts only. No executable or dependency tree is replaced in place while referenced.
9. P2 remains yt-dlp-specific; it does not introduce a universal backend updater.

## P1 responsibility boundary

Add one application-owned, read-only diagnostics query through the existing Electron/preload command boundary. It composes facts from their current owners and reports configured, observed, probed, degraded, unavailable, and not-verified states separately.

Reusable facts:

- runtime dependency paths, expected sources, presence state, gate phase, and bootstrap activity;
- yt-dlp/gallery-dl version probes and bundled Python metadata;
- active/pending queue, trace/attempt history, cancellation state, sanitized error categories, and bounded runtime logs;
- Browser Bridge listener/client/pending-request facts if exposed by its current loopback owner;
- configured output directory and platform/package environment;
- existing support-export allowlist and path-redaction conventions.

Missing facts P1 must add without new authority:

- selected candidate identity, activation generation, fallback reason, and dependency-set identity;
- FFmpeg/FFprobe/Deno versions, architecture, executable permission, and compatibility probes;
- output-directory existence/writability/free-space without creating it;
- Browser Bridge protocol/last-error/timeout snapshot;
- managed executable signing/quarantine facts where a platform probe is available;
- explicit `unknown` / `not verified` states instead of treating file presence as health.

The current `runtimeRootFor()` creates directories during path/status resolution. P1 must use a non-creating resolver or split pure path derivation from mutation before claiming read-only behavior.

## P2 responsibility boundary and candidate model

P2 owns only yt-dlp release metadata, authenticity/integrity policy, download-to-temporary, immutable staging, eligibility probing, selection, activation, rollback, reference retention, and later garbage collection. It feeds the selected candidate to the existing engine adapter/runtime.

```text
immutable bundled baseline -----------------------------+
                                                        |
managed release -> download -> verify -> stage -> probe |
                                          |             |
                                          +-> eligible  |
                                                        v
new attempt -> existing application/runtime authority -> resolve one candidate
                                                     -> pin complete identity
                                                     -> existing yt-dlp runner
                                                     -> complete/cancel/retry
```

Recommended selection rules:

1. Persist managed releases in immutable version directories under application-owned user data; never under `process.resourcesPath` and never replace a version directory in place.
2. Keep a small atomic selection record containing active identity and generation.
3. Resolve managed only when its release and dependency set are eligible; otherwise fail closed to the bundled baseline and preserve a structured degraded/fallback reason.
4. Missing or corrupt selection metadata resolves bundled for new attempts.
5. A running attempt retains its pinned version and dependencies until its process tree has settled.
6. Rollback switches selection for new attempts. Referenced releases are not deleted.
7. A managed execution failure remains visible through existing typed failure/attempt diagnostics. Any automatic retry on bundled must be a deliberately specified new attempt, never an executable swap beneath a running attempt.

## Platform and packaging constraints

### Windows

- Current release outputs x64 NSIS and portable ZIP forms; installer is per-user and allows a custom installation directory.
- Managed runtime storage should stay under Electron `userData`, not beside the executable or inside installed resources.
- Child tools use hidden process launch and Windows process-tree cancellation.
- The active spec expects proxy-front FFmpeg/FFprobe/Deno executables, while current resolver/bootstrap paths point at `real/`; packaged behavior must be reconciled before P2.
- Authenticode/signing policy and exact installed-versus-portable `userData` persistence are not proven by repository configuration.

### macOS

- Current release is unsigned/non-notarized, disables hardened runtime, and documents manual Gatekeeper/quarantine recovery for the app bundle.
- Managed tools receive executable bits after installation, but repository evidence does not prove that post-install downloaded executables will pass quarantine/Gatekeeper behavior.
- Release CI currently proves arm64 only; x64 code paths exist but release verification is not established.
- Signing, notarization, stapling, managed-binary quarantine handling, and both-architecture execution remain pre-implementation validation gates.

## Rejected architecture shapes

- A Diagnostics command that calls bootstrap/update/repair implicitly.
- A second managed-yt-dlp downloader service, engine registry, process runner, or feature-routing path.
- In-place replacement of the current venv or dependency directory during active work.
- Treating file existence as version, executability, compatibility, or health.
- Reusing the application updater as a backend updater authority.
- Generalizing P2 into an updater for every backend before yt-dlp lifecycle proof exists.

## Key risks

- Required bundled fallback does not exist today.
- Current status resolution is not purely read-only.
- Static binary paths are injected at composition time; candidate identity is not pinned per attempt.
- Current bootstrap concurrency guards installation calls but not replacement versus active processes.
- Candidate authenticity/downgrade policy is undefined.
- Windows proxy-front implementation and macOS managed-executable trust are unverified.
- Browser Bridge and output-directory health facts are not currently exposed as safe read-only DTOs.
