# P2-A Immutable Bundled Baseline + Attempt Runtime Pinning

## Status

Repository-grounded planning is complete. The direction below is ready for Architecture Review; it is not Architecture PASS and does not authorize P2-A implementation.

Research evidence is in `research/repository-grounded-p2a-report.md`. This Lead synthesis supersedes that report where the two conflict, specifically on manifest minimization, shared-tool mismatch handling, hot-path hashing, and composition-time runtime paths.

P2-V remains frozen: Windows dependencies use `real/`; yt-dlp receives the absolute Ameow-owned Deno path; machine JS, `ejs:github`, and user plugin discovery remain disabled; runtime mutation is serialized by the target-scoped lifecycle coordinator and blocked while a process tree holds a lease; no digest-addressed dependency storage is introduced.

## Authority and dependency direction

- `AmeowElectronDownloadRuntime`, `DownloadJobService`, `DownloadOrchestrator`, engine adapters, and the existing runner remain the only download, attempt, retry, cancel, process, and terminal authorities.
- One Electron-owned yt-dlp runtime-binding module owns bundled-baseline verification, materialized-cache readiness, bundled-only selection resolution, and complete runtime binding construction. It supplies data and a lease to the existing runtime; it never runs downloads and is not a second registry or service.
- `buildAttemptContext` remains the pin boundary. A yt-dlp attempt asks the Electron port for one acquired binding; the port prepares missing capabilities, acquires the existing target lifecycle lease, validates the complete set while the lease is held, and returns `{lease, binaries, identity}`.
- The yt-dlp adapter consumes the paths from that attempt binding. Production must stop using composition-time yt-dlp binaries as execution truth. The adapter and runner remain execution authorities; this is only dependency injection at attempt scope.
- If binding construction fails after lease acquisition, the lease is released before the error escapes. A successful lease is released in the existing adapter `finally`, after runner/process-tree settlement.
- yt-dlp internal retries reuse the same context and binding. Engine-ladder fallback, auth recovery, and any other existing new attempt call `buildAttemptContext` again and receive a new binding. Queue-pending jobs hold no binding.

## 1. Immutable canonical baseline

### Canonical source of truth

The canonical baseline is immutable application content:

```text
desktop-assets/binaries/ytdlp-baseline/
  .official-ytdlp-baseline.json
  yt_dlp-2026.7.4-py3-none-any.whl
  yt_dlp_ejs-0.8.0-py3-none-any.whl
```

The two universal wheels are shared across targets. A runnable baseline becomes target-specific by binding the verified wheel set to the selected entry in `.official-python-runtimes.json` and the approved target-specific FFmpeg/FFprobe/Deno runtime facts.

The canonical directory is included in packaged resources and verified before packaging and from packaged artifacts. Runtime code may read it but must never overwrite it. Missing or corrupt canonical content is an application-install defect, not a cache miss.

### Manifest and package-set responsibility

`.official-ytdlp-baseline.json` contains only identity and verification facts with P2-A consumers:

- `schemaVersion` and `layoutVersion`;
- `packageSetId`;
- each package's normalized name, version, wheel filename, byte size, SHA-256, and provenance URL;
- minimum Python version and supported runtime targets;
- required execution policy: config isolation, no plugin dirs, no remote components, and explicit managed-Deno binding;
- the bounded eligibility probe and expected yt-dlp version.

It does not contain `appBaseVersion`, `packagedAt`, selection generation, release lifecycle, previous candidate, rollback, retention, or staging fields. Those values either create identity churn or have no P2-A consumer.

`electron/managedPythonPackageManifest.mts` remains the sole source for the approved yt-dlp/EJS pins and `packageSetId`. The packaged manifest is a generated release artifact, not a second independent pin table. Preparation and verification fail unless its package set exactly matches that compiled source.

No canonical `requirements.txt` is needed. Materialization generates a temporary requirements lock from the already parsed and hash-verified manifest, then invokes pip with `--require-hashes`. This keeps one canonical package description.

### Authenticity and integrity boundary

Release preparation obtains wheel metadata over HTTPS from the approved PyPI endpoints, records the exact wheel URLs, sizes, and SHA-256 values in the Ameow-owned manifest, and verifies the downloaded bytes before they enter the repository/package. Package verification rehashes the canonical wheels and checks exact-set membership.

Runtime materialization trusts only the packaged manifest and packaged wheel bytes after local hash verification. It performs no network request, redirect, release discovery, or signature lookup. PGP is not required because no independently anchored upstream signing root has been established for the wheel path.

## 2. Materialized baseline cache

The materialized baseline lives at:

```text
<userData>/runtimes/yt-dlp/<target>/baseline/
```

It is a replaceable cache, never canonical truth. It contains the venv and an atomic `baseline.json` readiness marker. `baseline.json` records the canonical manifest digest, packageSetId, target Python manifest-entry identity and observed path/version, installed package versions, probe result, and layout/schema versions.

Materialization is deterministic and offline:

1. Verify the packaged manifest and both wheel hashes.
2. Create/recreate the cache under the existing lifecycle `runMutation` boundary.
3. Generate a temporary requirements lock from the manifest.
4. Run pip with `--no-index`, `--find-links <canonical-dir>`, `--only-binary=:all:`, `--require-hashes`, and `--no-deps`; also set `PIP_NO_INDEX=1`.
5. Verify Python compatibility, installed package versions, yt-dlp entrypoint, and the bounded version probe.
6. Write `baseline.json` by temp-file plus rename only after every check succeeds.

The readiness marker is the commit point. A crash may leave a partial cache, but no reader treats it as ready; the next preparation removes/rebuilds it under the mutation lock. Directory-level atomic replacement is not required.

### Failure semantics

| State | Owner and result |
|---|---|
| Canonical manifest or wheel missing/corrupt | Package verifier should reject it; runtime gate fails closed with reinstall-style failure before downloader/media-tool network bootstrap. |
| Bundled Python missing/corrupt/incompatible | Existing bundled-runtime gate fails closed. |
| Cache absent or readiness marker absent/unreadable | Runtime preparation rebuilds it offline under `runMutation`. |
| Cache manifest/package/Python/layout/version mismatch | Runtime preparation discards and rebuilds it offline; stale cache is never executed. |
| Offline materialization or post-install probe fails | Gate/attempt acquisition fails closed; no network substitution, managed promotion, or stale-cache use. |
| Shared FFmpeg/FFprobe/Deno missing or not ready | Existing capability preparation owns repair under the lifecycle coordinator; binding is not returned until readiness is established. |
| Shared dependency identity mismatch | Binding fails before execution. It may be reported as degraded evidence, but an attempt must not execute a partial or mixed runtime set. |

Diagnostics never performs any of these repairs.

## 3. Bundled-only selection foundation

P2-A does not persist `selection.json`. There is one candidate and no state transition, so writing a constant record would add parsing, atomic-write, and corruption states without changing behavior.

The single authority is the yt-dlp runtime-binding module. Its resolver returns only `kind: "bundled"`. P2-B/C may later introduce `<userData>/runtimes/yt-dlp/selection.json`; absence, corruption, or unsupported schema must resolve to bundled plus a read-only degraded fact. P2-A reserves only this default rule and ownership boundary. It does not define or write managed, previous, generation, rollback, retention, or fallback fields.

## 4. Complete attempt runtime identity

The immutable binding returned for a yt-dlp attempt contains:

- candidate kind `bundled`;
- canonical manifest digest, packageSetId, layout version, yt-dlp/EJS versions and wheel hashes;
- runtime target;
- bundled Python version, target, and selected Python-manifest-entry digest;
- FFmpeg, FFprobe, and Deno approved artifact-spec identities, observed executable versions, and observed executable hashes;
- the exact yt-dlp, Python, FFmpeg, FFprobe, and Deno paths used by the attempt;
- `runtimeSetId`, the SHA-256 of a canonical serialization of content facts only.

Absolute paths and timestamps are recorded as observed binding facts but excluded from `runtimeSetId`, so relocation does not change content identity. No P2-B/C fields are present.

### Verified-readiness strategy

Large FFmpeg/Deno executables are not rehashed blindly for every attempt. Capability preparation computes executable hashes and version probes under the lifecycle coordinator and stores an atomic, target-scoped readiness record tied to the app-owned artifact specs. Binding acquisition reuses that verified result while file fingerprints match; a coordinator mutation invalidates it, and changed/missing fingerprints require re-verification before a lease is returned.

This is verification metadata, not digest-addressed storage and not selection state. It preserves the accepted mutable-singleton model while preventing hot-path rehashing and preventing an identity mismatch from proceeding.

`runtimeSetId` and `runtimeCandidate: "bundled"` are attached to the existing sanitized attempt diagnostic summary. Raw paths remain out of downloadable/user-facing diagnostic summaries.

## 5. Read-only Diagnostics

P1 Diagnostics may observe:

- canonical baseline manifest identity and local verification state;
- materialized cache presence, readiness-marker identity match, installed versions, and probe result;
- effective selection `bundled` and yt-dlp `expectedSource: "bundled"`;
- target runtime readiness identities for Python, FFmpeg, FFprobe, and Deno;
- active runtime-set lease count;
- recent attempt `runtimeCandidate` and `runtimeSetId`.

Diagnostics uses pure `inspect*` paths and existing files only. It must not create directories, hash-trigger repair, ensure/materialize, acquire a mutation lease, write selection, start bootstrap, or expose updater commands.

## 6. Repository readiness and retained gates

No repository research blocker remains. P2-V already provides the required execution-path contract, explicit Deno binding, EJS/plugin isolation, and lifecycle coordinator. P2-A implementation must still add the canonical payload, packaging verification, offline cache preparation, verified shared-runtime readiness facts, attempt-scoped binding, gate source adjustment, Diagnostics facts, and tests.

The following remain release-closure gates and do not block P2-A implementation: clean-host normal Electron Builder verification; Windows default-userData validation; portable folder-replacement retention; successful live EJS challenge execution; and macOS arm64 fresh-quarantine, offline-baseline child execution, and Gatekeeper validation.

## 7. Minimum implementation scope

Implement P2-A as one safety slice, with internally reviewable phases:

1. **Canonical supply and package proof** — add the two wheels and minimal manifest, a release-only preparation/verification script, exact packaged-resource inclusion, and Windows/macOS artifact verification. Keep pin consistency with `managedPythonPackageManifest` mechanically checked.
2. **Offline cache and readiness** — add the Electron baseline/runtime-binding module, offline materialization and readiness marker, shared-tool verified-readiness metadata, baseline paths/status, and the small runtime-gate change required when yt-dlp becomes `bundled` rather than `managed`.
3. **Attempt binding and observation** — return `{lease, binaries, identity}` at `buildAttemptContext`, remove production composition-time yt-dlp execution truth, carry the binding through the existing adapter/runner settlement path, and add sanitized attempt/P1 Diagnostics facts.
4. **Contract validation** — focused manifest/hash/offline/failure tests; cache rebuild and mutation-race tests; attempt retry/auth/fallback/cancel binding tests; inspect-side-effect tests; package verifiers; type-check, lint, build, and relevant packaged-runtime validation.

Explicitly deferred: network release discovery or fetch, managed candidate download/staging, activation, rollback, persisted selection, GC, automatic candidate fallback, Repair Center, generic updater abstractions, new process/download authority, and digest-addressed dependency storage.

## Acceptance answers

1. Canonical truth is the app-packaged manifest plus exactly two verified wheels.
2. Compiled managed-package pins are the single authoring source; the packaged manifest is a verified generated identity artifact.
3. The userData baseline is an offline-rebuildable cache committed by `baseline.json` and mutated only under the lifecycle coordinator.
4. P2-A needs no persisted selection record; the bundled-only resolver is the single authority.
5. The binding fields in section 4 are the minimum complete identity, owned by the Electron runtime-binding module.
6. `buildAttemptContext` obtains an Electron-produced `{lease, binaries, identity}`; adapters/runners execute it and release after process settlement.
7. Canonical/Python/materialization failure is fail-closed; cache defects rebuild offline; dependency mismatch never executes.
8. Diagnostics observes existing manifest/cache/readiness/lease/attempt facts only and never repairs.
9. No repository blocker remains; retained external gates are release closure, not planning/implementation blockers.
10. The four internal phases above are the minimum P2-A slice; all update/activation/rollback/GC work remains deferred.

No implementation, updater capability, managed candidate, activation, rollback, GC, automatic candidate fallback, or Architecture PASS is included in this planning task.
