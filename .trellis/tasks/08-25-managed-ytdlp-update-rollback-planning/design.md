# P2 Managed yt-dlp Update / Rollback — architecture direction

## Status

Planning only. This document does not authorize implementation and does not grant Architecture PASS.

> **P2-V closure (2026-08-25):** `.trellis/tasks/08-25-managed-ytdlp-p2v-evidence-gates/design.md` supersedes this document's earlier assumption that shared FFmpeg/FFprobe/Deno must use digest-addressed storage. Packaged/runtime evidence supports mutable app-owned singletons with one atomic full-runtime-set lifecycle coordinator and leases through process-tree settlement. The current P2-V verdict is `REPAIR REQUIRED`; P2-A remains unopened.

P2 is feasible only after a baseline/identity foundation and platform trust gates. The current repository cannot safely activate or roll back managed yt-dlp releases because it has no immutable bundled yt-dlp candidate, no persisted selection authority, no attempt-level runtime identity, and no protection against in-place replacement of dependencies used by active processes.

## Repository truth

- `electron/main.mts:1380-1386` composes one `AmeowElectronDownloadRuntime` and injects yt-dlp paths into `YtDlpEngineAdapter` once. Current paths are composition-time values, not attempt-time candidate resolution.
- `src/electron-runtime/service.ts:1514-1564` builds the execution context for each engine attempt after runtime readiness and before `engine.execute`; this is the existing boundary at which a complete runtime identity can be resolved and pinned.
- `src/orchestration/download-orchestrator.ts:226-275` reports a real attempt before building its context, executes one attempt per engine plan, and owns visible attempt/fallback reports. It has no same-engine candidate retry today.
- `electron/managedRuntimeBootstrap.mts:901-917` joins concurrent bootstrap calls per tool but then deletes the current tool root before rebuilding it. The join does not coordinate with active downloads or transcodes.
- `src/electron-runtime/runtimePaths.ts:130-158` resolves Windows FFmpeg/FFprobe/Deno under `real/`; this conflicts with the active proxy-front spec. Deno is not added to the yt-dlp child PATH.
- `electron-builder.config.mjs:29-34` packages only target-specific CPython and its manifest. `scripts/verify-macos-python-runtime-package.mjs:360-370` rejects yt-dlp/gallery-dl bundled assets. A bundled yt-dlp fallback does not exist today.
- macOS packages are unsigned and non-notarized (`electron-builder.config.mjs:78-86`). The repository handles executable bits for managed files but contains no managed-file codesign, notarization, stapling, or quarantine policy.

The detailed evidence map, failure matrix, platform matrix, upstream source URLs, and direct answers to all ten planning questions are in `research/repository-grounded-p2-report.md`.

## Authority decisions

### Existing authority remains unchanged

- Feature/domain providers remain the sole owners of URL routing, provider choice, and engine plans.
- `AmeowElectronDownloadRuntime`, `DownloadJobService`, `DownloadOrchestrator`, the engine registry, and the existing yt-dlp runner remain the sole queue, attempt, process, retry, cancel, and terminal authority.
- P2 introduces no second downloader service, registry, process runner, or provider fallback ladder.
- Diagnostics observes P2 facts through a read-only query. It never downloads, stages, activates, rolls back, repairs, deletes, or changes selection.

### P2 candidate authority

One Electron-owned yt-dlp candidate lifecycle module owns:

- the app-approved release manifest and authenticity/integrity policy;
- immutable candidate staging and eligibility probes;
- the only persisted selection record;
- attempt pin leases and lifecycle serialization;
- explicit activation, rollback, and later garbage collection.

It supplies resolved execution bindings to the existing yt-dlp adapter/runtime. It does not execute downloads itself.

### Single source of selection truth

The sole active-selection record is an atomic, schema-versioned file under the yt-dlp runtime root, conceptually:

```text
<userData>/runtimes/yt-dlp/selection.json
```

It contains `selected`, `previous`, monotonically increasing `generation`, timestamps, and the last structured fallback/degradation reason. Only the candidate lifecycle module may write it. `settings.json`, candidate metadata, runtime status, version checks, UI state, and Diagnostics are readers, not competing authorities.

Missing, partial, unsupported-schema, or corrupt selection metadata fails closed to the bundled baseline for new attempts and emits a degraded fact. It never triggers an update or repair implicitly.

## Baseline and candidate model

### Immutable bundled baseline

The canonical baseline is app-packaged content, not the current mutable user-data venv:

- a vetted yt-dlp wheel plus every required Python dependency wheel;
- a target-aware manifest containing version, size, SHA-256, Python compatibility, dependency-set identity, and supported runtime targets;
- the existing target-specific bundled CPython;
- package-time verification for Windows and macOS artifacts.

The universal yt-dlp wheel becomes target-specific as a runnable baseline through the manifest-approved combination of wheel set, bundled Python target/version, and layout version. The canonical payload is immutable for the application release and is never touched by P2.

The materialized baseline venv under user data is a replaceable cache. It is built offline with `--no-index` and required hashes, verified against the canonical manifest, and may be reconstructed if absent or corrupt. If the canonical payload or bundled Python is missing/corrupt, or offline materialization cannot complete, the runtime gate fails closed and reports a reinstall-style failure. A managed candidate is not silently promoted to the safety baseline.

### Managed candidates

Each managed candidate is staged once into an immutable identity directory:

```text
<userData>/runtimes/yt-dlp/<target>/versions/<releaseId>/
```

`releaseId` is content-addressed by version plus manifest/package-set digest. A directory is never updated in place or reused for different bytes. Staging metadata records source URL, final URL, hashes, size, target, package/Python compatibility, probe result, and timestamps.

The app-owned release manifest is the allowed-set/version authority. Runtime discovery does not decide available releases, and user input cannot supply arbitrary install sources.

### Complete attempt runtime identity

P2 distinguishes the yt-dlp candidate from the complete runtime set pinned by an attempt:

```text
YtDlpCandidateIdentity
  = kind + releaseId + ytDlpVersion + wheel/packageSetId
  + Python version/path + target + candidateRoot

YtDlpRuntimeSetIdentity
  = candidate identity
  + FFmpeg version/path/digest
  + FFprobe version/path/digest
  + Deno version/path/digest
  + runtimeSetId + selectionGeneration
```

FFmpeg/FFprobe/Deno remain app-owned shared dependencies and are not independently updateable or selectable by P2. P2-V evidence selects the current singleton paths plus one per-target lifecycle coordinator as the minimum stable design: every mutator and consumer participates in the same lock; `resolve + validate + acquire lease` is atomic; and replacement is busy/deferred while any relevant process tree holds a lease. The attempt still records the approved version/path/digest identities in `runtimeSetId`.

Digest-addressed dependency storage is a fallback only if implementation review finds a mutator or consumer that cannot participate in that coordinator, cross-process mutation, or a requirement for concurrently selectable media-tool versions. It is not a P2-A requirement on current evidence.

## Attempt pinning and process lifecycle

1. The existing orchestrator begins a real engine attempt.
2. `buildAttemptContext` asks the candidate lifecycle module to resolve selection, baseline/managed eligibility, and the complete runtime set.
3. Under the lifecycle lock, the module acquires leases for the candidate and dependency objects and returns one immutable binding.
4. That binding is attached to the existing attempt diagnostic identity and passed to the existing adapter/runner.
5. yt-dlp's internal retries retain the same binding. Engine-ladder fallback, auth recovery, and any later same-engine candidate fallback each create a new attempt and resolve a new binding.
6. Cancel aborts the existing process tree. Leases release in `finally` only after the runner/process-tree settlement path completes.

Activation and rollback update only `selection.json`; they affect attempts whose binding has not yet been resolved. Queue-pending jobs have no candidate lease and resolve at attempt start. A running attempt never changes executable, venv, FFmpeg/FFprobe, or Deno.

## Update lifecycle and failure boundaries

```text
check manifest
  -> download to temporary file
  -> verify source/final URL, size, SHA-256, allowed version/target/dependencies
  -> stage immutable release directory
  -> run bounded eligibility probe
  -> mark eligible
  -> explicit atomic activation for new attempts
```

- Download, integrity, staging, or probe failure leaves the current selection and all active bindings untouched.
- Verification uses an app-owned manifest with pinned wheel hashes, HTTPS host allowlist, final-redirect validation, `--only-binary`, `--require-hashes`, `--no-deps`, and offline installation from staged wheels.
- PyPI JSON and GitHub release metadata are evidence inputs during Ameow release preparation, not competing runtime truth. The runtime consumes the Ameow-owned manifest.
- GitHub checksum signatures are not an established trust chain by themselves: upstream publishes the verification key through the same repository/channel and no independently anchored fingerprint is currently proven. PGP remains optional until an out-of-band trust root is approved.
- Managed versions may not silently downgrade. An explicit user-directed downgrade may be a future Repair operation with a recorded reason. Falling back to the fixed bundled baseline is classified as fallback, not as a managed-version downgrade.

## Rollback and fallback semantics

### Explicit rollback

Rollback atomically selects `previous` if it is present and eligible, otherwise the bundled baseline. It increments the generation, records the reason, affects new attempts only, and never deletes the candidate being left.

### Pre-pin fail-closed fallback

If selection metadata is invalid, the selected candidate is missing/ineligible, or its pre-execution probe fails, the first attempt binds bundled. No extra attempt or fallback event is fabricated; Diagnostics records why managed selection was bypassed.

### Post-pin managed failure

The current orchestrator cannot represent a second attempt for the same engine. Post-pin fallback therefore is not part of the minimum foundation.

A later bounded orchestration hook may allow exactly one new yt-dlp attempt on a typed `runtime_candidate_failed` classification (spawn/interpreter/import/executable-identity failures only). The retry policy is owned by the existing application/runtime execution boundary, not Domain `EnginePlan` and not the adapter. It reports a failed managed attempt, a runtime-candidate fallback transition, and a new bundled attempt with a new binding. Network, site, authentication, format, and ordinary download errors do not trigger candidate fallback. `DownloadJobService` still emits one terminal job result.

## Retention and cleanup

- Never delete the bundled source payload or baseline cache through managed-candidate GC.
- Retain `selected`, `previous`, every policy-retained recent candidate, and every candidate/dependency object leased by an in-flight attempt/process tree.
- Acquire a lease after resolution under the lifecycle lock and before execution; release only after settlement.
- Pending jobs do not retain candidates because they have not resolved one.
- GC is explicit Repair lifecycle work. Under the same lock it removes an eligible deletion target from the availability index, verifies zero leases, then deletes it. It may delete unreferenced candidates while other candidates are active; global download quiescence is unnecessary when lease accounting is trusted.
- Partial/temp/quarantined staging directories may be cleaned under a separate bounded policy only when they are not addressable by selection and have no lease.

## Platform gates

### Windows

Before implementation activation:

- decide and verify the proxy-front contract versus the current `real/` layout; align runtimePaths, bootstrap, yt-dlp `--ffmpeg-location`, PATH, Diagnostics, tests, and spec;
- prove managed Deno is actually discoverable by yt-dlp and reconcile its PATH/`--js-runtimes` contract;
- build NSIS and portable artifacts and verify target files, writable/stable userData storage, upgrade persistence, no console flash, real download/merge/Deno paths, cancel, retry, and concurrent attempts;
- decide whether Authenticode is required for downloaded or bundled Windows artifacts; repository evidence currently proves no signing policy.

### macOS

Before managed activation:

- test fresh arm64 packaged artifacts under real quarantine/Gatekeeper conditions, including an app-downloaded wheel, baseline/managed venv creation, version probe, download, FFmpeg merge, cancel, and relocation;
- decide codesign/notarization/stapling expectations for app-downloaded executables or confirm the wheel-plus-bundled-Python path avoids an independent executable trust boundary;
- verify x64 only if x64 remains a supported release target; current release CI proves arm64 only;
- preserve executable bits and the existing symlink-based venv relocation/rebuild contract.

## P1 Diagnostics observations

P1 may read, without mutation:

- bundled baseline manifest identity, materialization state, and probe result;
- selected/previous candidate, selection generation, eligibility, and degradation/fallback reason;
- staged/eligible/active/failed candidate states and integrity/probe outcomes;
- per-attempt pinned runtimeSetId and candidate kind/version;
- referenced and evictable candidate identities;
- platform trust state as `verified`, `failed`, or `not_verified`.

Diagnostics must not call baseline ensure, candidate update, activation, rollback, repair, cleanup, or any path resolver that creates directories.

## Recommended delivery decomposition

### P2-V — prerequisite evidence gates

Resolve the Windows proxy-front/Deno contract, packaged storage truth, macOS trust/quarantine behavior, and the Ameow-owned authenticity/downgrade policy. This is evidence and architecture work; it does not activate an updater.

### P2-A — minimum safe foundation

After the P2-V repairs are accepted, ship the immutable bundled baseline and package verifiers; materialize it offline; introduce one selection authority defaulting to bundled; introduce the full-runtime-set lifecycle coordinator; resolve/pin one complete runtimeSet per attempt; expose read-only Diagnostics facts. No network updater, managed activation, rollback command, GC, or automatic post-pin fallback.

### P2-B — stage-only managed release

Add manifest check, bounded download, integrity/authenticity verification, immutable staging, and eligibility probe. An eligible candidate is observable but cannot become active.

### P2-C — explicit activation and rollback

Add atomic selection transitions, candidate/dependency leases, explicit Repair commands, new-attempt-only behavior, and corrupt-selection/pre-pin fallback tests. No automatic post-pin retry yet.

### P2-D — bounded fallback and retention

Add the visible, one-time same-engine candidate fallback attempt for typed candidate defects; then add explicit retention/GC and app-update coexistence hardening. Repair Center UX remains separate.

Each phase requires its own Planning/Implementation/Architecture Review. P2-A is the minimum safe deliverable; P2-B through P2-D must not be collapsed into one first implementation.

## P2-V closure and remaining gates

P2-V selected the Windows `real/` layout, confirmed the managed-Deno discovery defect, established arm64-only macOS release scope, proved the offline `yt-dlp` + `yt-dlp-ejs` package-set direction, and found no independently anchored PGP trust root requirement. Its final verdict is `REPAIR REQUIRED`; use the P2-V design as the authority for those decisions.

Remaining executable gates are a reproducible repaired Windows package, clean installed/portable upgrade retention, packaged FFmpeg/Deno/EJS execution, the arm64 offline-baseline verifier, and a fresh-quarantine macOS release scenario. Dependency hash-verification performance may be measured during P2-A, but it does not reinstate digest-addressed storage as an architecture requirement.
