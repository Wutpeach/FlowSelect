# P2-B Managed yt-dlp Release Stage-only — Design

## Status

Repository-grounded planning is complete and ready for Architecture Review. This is not Architecture PASS and does not authorize implementation.

## Architecture boundary

P2-B adds an Electron-owned candidate acquisition and observation module beside the existing P2-A bundled-baseline module. It is not a downloader runtime, selector, repair service, or updater framework.

- The P2-A bundled baseline remains the only effective candidate.
- Existing attempt binding remains bundled-only and unchanged.
- P2-B has no import or callback path into `buildAttemptContext`, the yt-dlp adapter, runner, or orchestrator.
- Only an explicit stage command can start network or mutation work.
- Diagnostics uses a separate pure inspection function.

## Authorities

### Bundled baseline

`electron/managedPythonPackageManifest.mts` remains the sole author for the bundled baseline pins. The packaged baseline manifest remains a verified generated artifact.

### Managed releases

One packaged Ameow-approved allowlist is the sole runtime authority for managed releases. It contains exact package bytes and all eligibility policy inputs. No managed release version is duplicated in runtime TypeScript constants.

Release tooling may query PyPI/GitHub for evidence, but only an entry committed to the Ameow manifest becomes allowed. Runtime does not query upstream metadata for discovery or approval.

Baseline and managed entries share one canonical package-set schema, normalizer, identity algorithm, execution-policy validator, and probe-contract validator. If a release appears in both domains, a build verifier requires exact equality.

## Data contracts

### Approved release entry

```ts
type ApprovedYtDlpRelease = {
  schemaVersion: 1;
  layoutVersion: 1;
  releaseId: string;
  version: string;
  packageSetId: string;
  packages: Array<{
    name: string;
    version: string;
    filename: string;
    size: number;
    sha256: string;
    provenanceUrl: string;
  }>;
  minPython: readonly [number, number, number];
  runtimeTargets: string[];
  executionPolicy: {
    configIsolation: true;
    pluginDirs: "disabled";
    remoteComponents: "disabled";
    jsRuntime: "managed-deno-absolute-path";
  };
  probe: {
    args: ["--version"];
    expectedVersion: string;
  };
};
```

`releaseId` is derived from the canonical entry rather than accepted as an independent value.

### Staged marker

```ts
type ManagedYtDlpReleaseMarker = {
  schemaVersion: 1;
  materializationLayoutVersion: 1;
  releaseId: string;
  approvedManifestDigest: string;
  packageSetId: string;
  runtimeTarget: string;
  pythonManifestEntryDigest: string;
  packageFiles: Array<{ name: string; version: string; size: number; sha256: string }>;
  installedPackageVersions: Record<string, string>;
  stagedAtMs: number;
};
```

The marker is written last and never changed. Timestamps are observations, not identity inputs.

### Target catalog

```ts
type ManagedYtDlpCandidateRecord = {
  releaseId: string;
  version: string;
  runtimeTarget: string;
  packageSetId: string;
  stage: "committed";
  eligibility: {
    status: "passed" | "failed" | "quarantined";
    reason?: "spawn" | "version" | "package_set" | "python" | "target" | "policy" | "dependency_identity" | "marker_conflict";
    probedAtMs: number;
    ytDlpVersion?: string;
    pythonManifestEntryDigest: string;
    ffmpegIdentityDigest?: string;
    ffprobeIdentityDigest?: string;
    denoIdentityDigest?: string;
  };
};
```

P2-C may consider only `stage === "committed" && eligibility.status === "passed"`. The catalog contains no selection, previous, generation, fallback, activation, or retention fields.

## Target-scoped layout

```text
<userData>/runtimes/yt-dlp/<target>/
  versions/
    <releaseId>/
      venv/
      release.json
    .incomplete-<uuid>/
  managed-candidates.json
```

Temporary network downloads may use a target-scoped `.download-<uuid>` sibling so final materialization stays on the same volume. A temporary or incomplete directory has no identity and is never returned by inspection. A committed directory is never overwritten or repaired in place.

The catalog is per target. Universal wheels do not justify cross-target mutable state because the venv, bundled Python entry, and eligibility evidence are target-specific.

## Lifecycle

### Preflight and download

1. Resolve `releaseId` only from the packaged allowlist.
2. Validate target, policy, filenames, and URLs before network access.
3. Download every package to an isolated temporary directory with route-aware fetch, bounded stall timeout, HTTPS-only URLs, final-host allowlist, and redirects rejected.
4. Verify byte size and SHA-256 before any runtime-tree commit.

This phase is outside `runMutation` because the bytes are non-addressable and network latency must not hold the runtime mutation boundary.

### Materialize, stage, and probe

After every byte is verified, enter one `runtimeSetLifecycle.runMutation` operation:

1. Recheck that no exact committed candidate already exists.
2. Resolve and verify bundled Python plus app-owned FFmpeg/FFprobe/Deno through existing low-level readiness functions, without assigning a new meaning to the shared lifecycle `yt-dlp` capability.
3. Create an uncommitted candidate directory and venv.
4. Generate a hash-locked requirements file and install offline with no dependency resolution or machine/user site access.
5. Verify installed app package versions, Python compatibility, current target, and execution policy.
6. Write `release.json` last. This is the staged commit point.
7. Run the bounded probe while the same mutation remains held, so no existing lease can be active and no dependency path can change before the child exits.
8. Atomically write the target catalog with `passed`, `failed`, or `quarantined` eligibility evidence.

If an active attempt already holds a lease, `runMutation` fails busy before final state is touched. Attempts arriving after the mutation begins wait for the bounded operation and continue with the unchanged bundled binding afterward.

## Network and provenance policy

- Runtime accepts no caller-provided URL or version.
- Runtime uses only the exact package URL in the approved manifest.
- Minimum policy rejects all redirects. If redirects are later required, every hop and the final URL require an explicit separately reviewed allowlist contract.
- Metadata hosts and file hosts are distinct policy sets; only final approved file hosts are used at runtime.
- Size and SHA-256 are mandatory.
- PyPI JSON evidence is gathered during release preparation, not runtime.
- GitHub release APIs/assets/checksum signatures and yt-dlp self-update channels are not installation authority.
- PGP authenticity is deferred until Ameow has an independently anchored key policy.

## Failure model

- Pre-stage failures return typed outcomes and remove temporary bytes.
- Uncommitted directories may be removed by the same explicit stage operation under `runMutation`; they are not candidates.
- A committed candidate with a failed probe remains staged and is recorded as not eligible.
- A committed identity conflict is quarantined logically and never overwritten.
- Duplicate exact releases are idempotent.
- No failure changes bundled readiness, active selection, attempt binding, or active process trees.
- No persistent rejected-byte quarantine is introduced; retention/GC remains deferred.

## Diagnostics

`inspectManagedYtDlpCandidates` reads only the packaged manifest declaration, current-target catalog, and committed markers already present. It does not fetch, ensure, hash candidate payloads, probe, acquire a lease, enter a mutation, clean, or create directories.

Diagnostics exposes sanitized identity and persisted outcome facts only. Effective selection remains explicitly `bundled`.

## Command boundary

- `get_managed_ytdlp_releases`: read-only inventory/observation; no side effects.
- `stage_managed_ytdlp_release`: explicit releaseId-only mutation; no URL parameter, no activation flag, no automatic trigger.

P2-B adds no command named activate, select, rollback, repair, update-all, or cleanup.

## P2-C handoff

P2-C receives only the approved entry, immutable marker, target catalog, and passed probe evidence. P2-C must separately design selection authority, activation transaction, attempt binding, current dependency revalidation, runtime-set identity, rollback/history, fallback, and retention. It must not infer that a P2-B eligible candidate is active or known-good.

## Explicit non-changes

Do not modify production attempt selection/binding, runtime adapter/runner authority, baseline identity, `runtimeDependencyGate`, automatic fallback, existing download retry/cancel semantics, or P1 Diagnostics command authority. Do not add digest-addressed shared media-tool storage.
