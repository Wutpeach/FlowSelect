# P2-B Managed yt-dlp Release Stage-only — Future implementation plan

## Gate

Do not start this plan until the latest PRD/design/report receive Architecture Review and the user explicitly authorizes implementation in a later message. Running `task.py start` is not part of this planning turn.

## Ordered work

### 1. Canonical package-set contracts and approved manifest

- Extract/reuse canonical normalization, package-set ID, execution-policy, probe-contract, and digest helpers from the P2-A baseline path without changing baseline pins.
- Add the source-controlled packaged managed-release allowlist and strict parser.
- Add release-prep tooling that accepts an explicitly approved version/package set, reads authoritative PyPI JSON, rejects unexpected wheel tags/hosts/redirects, and records exact URLs, sizes, and hashes.
- Add source and packaged-artifact verifiers; ensure managed versions are not duplicated in runtime constants.
- Add exact Electron Builder resource inclusion.

### 2. Target paths and pure inspection

- Add target-scoped versions, incomplete, download-temp, and catalog path helpers using the existing runtime-root resolver.
- Keep inspect helpers free of `mkdir`, fetch, hashing, readiness, mutation, lease, cleanup, or probe calls.
- Add strict marker/catalog parsers with unsupported-schema and corrupt-file outcomes.

### 3. Approved download boundary

- Reuse the route-aware streaming/stall/progress mechanics beneath a new strict approved-source wrapper.
- Accept only `releaseId`; resolve URLs internally from the packaged manifest.
- Enforce HTTPS, exact host allowlist, redirect rejection, expected size, and SHA-256.
- Clean temporary files on network, policy, size, or hash failure.
- Do not invoke pip against any index and do not reuse legacy managed-network-pip readiness.

### 4. Immutable stage and bounded probe

- Enter one existing `runtimeSetLifecycle.runMutation` only after every package byte is locally verified.
- Fail busy before final state changes when an active lease exists.
- Materialize from the verified local wheel set with hash-locked offline pip and user-site isolation.
- Verify package set, bundled Python identity/compatibility, target, and execution policy.
- Commit `release.json` last; never overwrite a committed directory.
- Run the bounded probe before leaving the same mutation and bind it only to app-owned FFmpeg/FFprobe/Deno paths.
- Atomically write passed/failed/quarantined eligibility facts to the target catalog.
- Make duplicate exact release staging idempotent.

### 5. Commands and Diagnostics

- Add `get_managed_ytdlp_releases` as a pure read-only command.
- Add `stage_managed_ytdlp_release` as an explicit releaseId-only mutation command.
- Add sanitized P1 Diagnostics facts derived only from existing manifest/marker/catalog data.
- Keep effective selection `bundled`; add no automatic trigger or startup check.

### 6. Focused validation

- Approved manifest: schema, canonical digest, exact package set, baseline-overlap equality, packaged inclusion.
- Authority: arbitrary URL/version, GitHub/latest metadata, redirects, bad hosts, and self-update flags are rejected/unreachable.
- Download: timeout/network cleanup, redirect rejection, size mismatch, hash mismatch, and multi-package all-or-nothing behavior.
- Materialization: exact offline pip arguments/environment, no machine/user packages, Python/target mismatch, package mismatch, and policy mismatch.
- Commit points: crash before marker is non-candidate; marker last; catalog atomic write; committed directory never overwritten.
- Probe: expected version, app-owned tool paths/identities, bounded timeout, failure leaves staged-not-eligible, no user download.
- Lifecycle: active lease causes mutation busy before commit; attempts after mutation still obtain the bundled binding; no shared capability readiness pollution.
- Duplicate releases: exact identity is idempotent; same version/different digest is separate.
- Diagnostics: no fetch, hash, mkdir, ensure, mutation, lease, probe, cleanup, or raw path disclosure.
- Regression: existing bundled attempt identity and adapter/runner tests remain unchanged and pass.

## Validation commands to confirm at implementation time

- focused unit tests for the new manifest, candidate module, lifecycle, command bridge, and Diagnostics contracts;
- `npm run type-check`;
- `npm run lint`;
- `npm run build`;
- existing P2-A baseline/package verifiers plus the new managed-release source/package verifier;
- platform/package evidence only where the retained external gates permit it.

Exact test filenames/commands must be finalized from the implementation diff rather than invented during planning.

## Rollback points

- Supply/manifest tooling is one reviewable unit.
- Candidate module and tests are one reviewable unit.
- Command/Diagnostics exposure is one reviewable unit and must not land without the candidate module tests.
- Any change that touches attempt binding, selection, activation, rollback, fallback, GC, or shared dependency storage is scope drift and must be removed rather than folded into P2-B.

## Deferred

Selection/activation, `selection.json`, previous/generation/history, rollback, automatic fallback, runtime-set identity for a managed binding, retention/GC, Repair Center, universal updater, real-site/live EJS qualification, and closure of retained P2-A platform gates.
