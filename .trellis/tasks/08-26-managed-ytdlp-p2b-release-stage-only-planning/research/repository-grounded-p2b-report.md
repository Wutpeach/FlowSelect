# P2-B Managed yt-dlp Release Stage-only — Repository-grounded planning report

## Status and boundary

Planning complete and ready for Architecture Review. This report does not grant Architecture PASS and does not authorize implementation.

P2-B ends with an immutable, observable staged candidate and, after a bounded probe succeeds, an eligible fact. It does not create selection state, does not alter attempt binding, and does not give a managed candidate any path into a real download attempt. The P2-A bundled baseline remains the only effective runtime candidate.

Repository evidence was collected read-only by the Orca `research` Worker and synthesized here by the Lead. The Lead spot-checked the four load-bearing claims: package-manifest consistency, redirect handling, lifecycle isolation, and the P2-A selection boundary.

## Repository facts that constrain the design

- `electron/managedPythonPackageManifest.mts:13-31` is the current sole author of the bundled yt-dlp / yt-dlp-ejs pins, minimum Python, and `packageSetId`.
- `electron/ytDlpBaseline.mts:205-234` mechanically checks the packaged baseline manifest against that app-owned package contract, including exact packages, minimum Python, target, execution policy, and version probe.
- `electron/ytDlpBaseline.mts:355-421` already demonstrates hash-locked offline materialization with `--no-index`, `--require-hashes`, `--only-binary`, `--no-deps`, `PYTHONNOUSERSITE=1`, package-version inspection, a bounded `--version` probe, and a readiness marker written last.
- `electron/ytDlpBaseline.mts:549-605` separates relocation-stable content identity from observed absolute paths and binds the baseline to bundled Python plus app-owned FFmpeg, FFprobe, and Deno facts.
- `electron/runtimeSetLifecycle.mts:75-105` serializes readiness/mutation and rejects mutation while any lease is active. Concurrent leases are allowed when capabilities are already prepared; therefore the safest P2-B design is to run candidate materialization and its bounded probe inside one `runMutation` operation, matching P2-A, rather than teaching the shared `yt-dlp` capability a second readiness meaning.
- `electron/main.mts:1309-1407`, `src/electron-runtime/service.ts:1559-1630`, `src/electron-runtime/engineExecutionContext.ts`, and `src/electron-runtime/ytDlpEngineAdapter.ts:36-50` make the existing bundled binding the only attempt input and release its lease after process-tree settlement. P2-B must not modify this chain.
- `electron/managedRuntimeBootstrap.mts:595-710` provides route-aware streaming, stall timeout, and progress, but accepts `response.ok` without checking redirect/final URL. It is not sufficient as the managed-release trust boundary without a stricter wrapper.
- `scripts/prepare-ytdlp-baseline.mjs:83-118` already has the stronger release-prep pattern: authoritative PyPI JSON, wheel-kind checks, `files.pythonhosted.org` allowlisting, redirect rejection, size, and SHA-256 verification.
- `electron/diagnostics.mts`, `src/types/diagnostics.ts`, and `electron/main.mts:1917-1935` use read-only inspection paths. Candidate observation must preserve that property.
- P2-A deliberately persisted no selection (`.trellis/tasks/archive/2026-08/08-25-managed-ytdlp-p2a-baseline-attempt-pinning-planning/design.md:95-99,151`). Its broad statement that P2-B/C might later introduce `selection.json` is narrowed here: P2-B does not; P2-C owns that decision.

## Lead decisions

1. The managed allowlist is a packaged Ameow-approved manifest. Runtime code never discovers or approves versions online.
2. `managedPythonPackageManifest.mts` remains the bundled-baseline pin authority. The managed allowlist is a separate policy authority for a different candidate set, not a second hard-coded runtime pin table. Both use one shared canonical package-set schema, identity algorithm, and verifier. Managed versions must not also be hard-coded in TypeScript.
3. Candidate catalog and version directories are target-scoped, following the existing runtime root. A cross-target mutable catalog adds coordination with no P2-B consumer.
4. The explicit mutation command is named `stage_managed_ytdlp_release`; `update_*` would imply activation that P2-B does not perform.
5. Network download and byte verification happen in an isolated, non-addressable temporary directory outside the lifecycle mutation. Final materialization, staged commit, and bounded eligibility probe happen inside one existing `runMutation` operation. Existing active leases therefore block the mutation before final state is touched; new attempts wait for the bounded mutation to finish.
6. The immutable directory records stage identity only. Eligibility is a separate atomic catalog fact. A probe failure leaves an immutable staged candidate with a failed eligibility outcome; it never becomes eligible.

## Answers to the required planning questions

### 1. Release discovery / approval single source of truth

The runtime single source of truth is a packaged, repository-owned `ytdlp-managed-releases.json`. It contains the complete approved entries and exact package bytes. Runtime-visible releases are exactly its entries; there is no runtime latest-version lookup.

Upstream PyPI/GitHub queries may be used by release tooling to propose evidence. Ameow approval occurs only when an exact entry is reviewed and committed into the packaged manifest. The generated/package verifier must fail the build if schema, canonical digest, package set, provenance policy, or packaged inclusion is invalid.

The baseline remains separately authored by `managedPythonPackageManifest.mts`. Shared code must canonicalize both baseline and managed package sets. If the same release is ever represented in both places, package names, versions, sizes, hashes, policy, and probe must match mechanically; preferably the managed allowlist omits the bundled baseline entirely.

### 2. How an upstream release becomes allowed

An allowed release must satisfy all of the following before runtime:

1. An Ameow release process explicitly selects the version and full package set.
2. Release tooling reads authoritative PyPI project/version JSON over HTTPS.
3. Every approved artifact is a compatible wheel with an approved filename/tag and final host.
4. The manifest records exact name, version, filename, byte size, SHA-256, and provenance URL for every app-approved dependency.
5. The committed manifest entry receives an Ameow canonical digest and passes package-time verification.

At runtime, `stage_managed_ytdlp_release` accepts only a `releaseId` already present in that packaged manifest. It downloads only the recorded final HTTPS URLs, rejects redirects in the minimum design, enforces the host allowlist, and rechecks size and SHA-256. Arbitrary URLs, machine pip, `yt-dlp -U`, `--update-to`, remote components, runtime PyPI/GitHub metadata, and unapproved mirrors have no authority.

PyPI JSON is discovery/provenance evidence that can be baked into Ameow truth. GitHub latest/tag APIs, GitHub assets, yt-dlp update channels, checksums/signatures without an independently anchored key, and online "latest" values remain evidence only. P2-B provides integrity plus Ameow-owned provenance approval; it does not claim an independently verified upstream PGP authenticity root.

### 3. Minimum immutable candidate identity

The approved release identity is a canonical digest over:

- schema/layout version;
- yt-dlp release version;
- complete ordered package set: normalized name, version, filename, size, SHA-256, and approved provenance URL;
- `packageSetId` derived from that package set;
- minimum Python and supported target list;
- execution policy: config isolation, plugin dirs disabled, remote components disabled, managed Deno absolute-path binding;
- bounded probe contract and expected version.

`releaseId` is `<version>-<approved-entry-digest-prefix>`. A staged candidate identity is the tuple `{releaseId, runtimeTarget, pythonManifestEntryDigest, materializationLayoutVersion}`. The target and bundled-Python entry are required because the staged venv is target-specific even when wheels are universal.

Absolute paths, timestamps, stage/probe status, and mutable observed facts do not enter this identity. Different approved bytes or a different derivation input necessarily produce a different identity. Once `release.json` commits a directory, that directory is never updated or repaired in place.

### 4. Eligibility inputs

Eligibility requires all of these checks in the bounded mutation:

- every downloaded wheel matches the approved size and SHA-256;
- offline pip uses only the staged wheel set with `--no-index`, `--find-links`, `--only-binary=:all:`, `--require-hashes`, `--no-deps`, `PIP_NO_INDEX=1`, and `PYTHONNOUSERSITE=1`;
- each app-approved Python distribution reports the exact expected version, with no unapproved runtime dependency source;
- bundled Python satisfies `minPython`, current target is approved, and its app-owned manifest entry digest matches the candidate identity;
- yt-dlp starts with config/plugin/remote-component isolation and returns the expected version;
- yt-dlp-ejs is part of the approved package set; `ejs:github`, machine JS fallback, and user plugins remain absent;
- FFmpeg, FFprobe, and Deno are the app-owned paths and match their approved/observed identity checks.

Shared media tools remain singletons and are not copied into candidate directories. Their probe evidence is recorded separately and will later contribute to a P2-C runtime-set identity, not to the P2-B staged-directory identity.

### 5. Temporary and final commit points

The lifecycle has three distinct boundaries:

```text
approved manifest entry
  -> isolated temp download
  -> URL/host/size/hash verification
  -> runMutation: materialize final-path directory without marker
  -> write release.json last                       [staged commit]
  -> bounded eligibility probe in the same mutation
  -> atomic target catalog write with passed proof [eligible commit]
```

The temporary directory is never addressable as a candidate. To avoid the Windows directory-rename failure already encountered by P2-A, P2-B should populate the final content-addressed directory while it is uncommitted and write `release.json` by temp-file plus rename only after all stage checks pass. A directory without a valid marker is incomplete, not a candidate.

`release.json` is immutable identity/readiness data. Probe outcome lives in the target catalog, so changing eligibility facts never mutates the candidate directory.

### 6. Failure and persistence semantics

| Condition | Result | Persistent candidate state |
|---|---|---|
| network/stall/proxy failure | typed stage failure; temp removed | none |
| redirect or non-allowlisted host | policy rejection before commit | none |
| size/hash/provenance mismatch | integrity rejection; temp removed | none |
| unsupported target/Python/policy | fail before download when possible | none |
| pip/package-set/materialization failure | uncommitted directory removed | none |
| crash/partial directory without `release.json` | incomplete, never observable as candidate; next explicit stage may remove it under `runMutation` | none |
| stage commit succeeds, probe fails | retain immutable staged directory; atomically record bounded `eligibility: failed` reason | staged, not eligible |
| committed marker/identity conflict | never overwrite; record/return quarantined conflict | staged but quarantined, never eligible |
| same `releaseId` and exact marker already staged/eligible | idempotent return; no redownload or rewrite | unchanged |
| same human version with different bytes/policy | different digest and `releaseId` | separate immutable candidate |

P2-B does not persist rejected download bytes or a quarantine directory because that would immediately require retention and GC policy. It may persist only bounded catalog facts about an already committed candidate. Raw errors, URLs with credentials, and absolute paths are excluded.

### 7. What the eligibility probe proves

It proves that the exact approved wheels were used, the target-specific venv can start under bundled Python, declared package versions match, yt-dlp returns the approved version under the required isolation flags, and the candidate can resolve the app-owned FFmpeg/FFprobe/Deno identities while the lifecycle mutation keeps those dependencies stable.

It does not prove real-site behavior, successful media download, live EJS challenge behavior, long-term extractor compatibility, performance, upstream signing authenticity, Gatekeeper/quarantine behavior, or that the candidate is "known good". `eligible` means mechanically eligible for a future activation decision, not selected, active, healthy in production, or equivalent to the bundled baseline.

### 8. Dependency direction

The dependency direction is one-way:

```text
app-approved manifest + app-owned runtime assets
  -> P2-B staged candidate + eligibility facts
  -> (future P2-C only) selection/binding resolution

P2-A bundled binding -> buildAttemptContext -> adapter/runner
```

P2-B must not add a reverse or side connection from the candidate catalog into `acquireBundledYtDlpRuntimeBinding`, `buildAttemptContext`, `YtDlpAttemptRuntimeBinding`, runtime paths used by production attempts, or the orchestrator. Downloading temp bytes is outside the coordinator because they are non-addressable. Materialization and probe use `runMutation`; an existing process-tree lease prevents mutation before any final state is touched.

### 9. Safe P1 Diagnostics facts

Diagnostics may read, without recomputing or repairing:

- packaged managed-manifest presence/schema and declared approved release IDs;
- current-target catalog presence/schema;
- per candidate: releaseId, version, target, packageSetId, stage committed flag, declared manifest digest, staged timestamp;
- persisted eligibility outcome, bounded failure category, probe timestamp, and app-owned dependency identity digests captured by the probe;
- effective selection remains `bundled`.

Diagnostics must not expose raw absolute paths, credential-bearing URLs, or mutable command authority. It must not call `ensure*`, `runMutation`, `acquireLease`, fetch, hash candidate files, download, materialize, probe, clean, or create directories. "Integrity verified" and "eligible" are persisted observations from the staging operation, not work performed during the query.

### 10. Minimum P2-C contract and deferred concepts

P2-B leaves P2-C only these stable inputs:

- target-scoped immutable layout and committed `release.json` schema;
- canonical `releaseId` / candidate identity rules;
- target catalog schema with stage and eligibility facts;
- packaged allowlist schema and approval semantics;
- bounded probe evidence schema;
- the invariant that only an exact committed candidate with `eligibility: passed` may be considered by P2-C.

P2-C must still design and own selection persistence, activation transaction, attempt binding for managed candidates, runtime-set identity combining candidate and current shared tools, previous/generation/history, rollback, automatic fallback, retention/GC, and corruption recovery. P2-B creates none of those fields or files and does not pre-create `selection.json`.

### 11. Repository blocker assessment

There is no source-architecture blocker to implementing the stage-only slice. Existing manifest verification, offline materialization, target paths, lifecycle coordinator, and Diagnostics inspection patterns are sufficient.

The following are implementation gaps, not blockers:

- the existing network helper needs a strict approved-source/final-URL policy;
- the managed allowlist/catalog schemas and candidate module do not yet exist;
- existing `yt-dlp` lifecycle capability cannot safely be given a second prepare meaning, so P2-B must use the existing P2-A `runMutation` pattern for materialization/probe;
- legacy network-pip verification scripts must not be reused;
- a real live staging proof requires a separately Ameow-approved manifest entry, but schema/module implementation can proceed with deterministic fixtures.

P2-A external environment/release gates remain open and unchanged. They do not block source implementation, but packaged/live completion claims remain subject to them.

### 12. Recommended minimum P2-B implementation scope

1. Add one packaged managed-release allowlist schema/file and release-prep/package verification tooling; reuse canonical package-set parsing and identity code rather than adding runtime version pins.
2. Add one Electron-owned candidate module with pure manifest/catalog inspection plus explicit `stageManagedYtDlpRelease(releaseId)` orchestration.
3. Reuse route-aware streaming only beneath a new strict HTTPS/host/redirect/size/hash boundary; never call network pip.
4. Use target-scoped temp/incomplete/final paths, `release.json` as staged commit, and one atomic target catalog for eligibility facts.
5. Run materialization and the bounded probe in one `runtimeSetLifecycle.runMutation`; do not modify the attempt lease/binding path.
6. Add only `get_managed_ytdlp_releases` and `stage_managed_ytdlp_release` command contracts. No automatic/startup/Diagnostics trigger.
7. Extend Diagnostics with persisted read-only candidate facts and no side effects.
8. Add focused tests for authority, redirects, hashes, exact package set, Python/target/policy, commit crash points, duplicate releases, probe failure, lifecycle busy behavior, and Diagnostics purity.

Explicitly unchanged: `runtimeDependencyGate`, effective bundled selection, `acquireBundledYtDlpRuntimeBinding`, `buildAttemptContext`, `YtDlpAttemptRuntimeBinding`, adapters/runners, automatic fallback, rollback, GC, Repair Center, and universal updater abstractions.

## Retained release gates

The following P2-A gates remain open without re-investigation: clean-host Windows Electron Builder; Windows default-userData; portable replacement retention; successful live EJS challenge; macOS arm64 fresh quarantine, offline baseline, and Gatekeeper. P2-B uses the same userData runtime-root semantics, so it inherits but does not expand those risks.

## Planning conclusion

P2-B is repository-ready as a bounded stage-only implementation after Architecture Review and explicit later approval. The design has no path by which a managed candidate can become active. No Architecture PASS is asserted here.
