# P2-V Runtime Contract Repair

## Goal

Repair the existing yt-dlp runtime so Windows packaging, bootstrap/repair, Diagnostics, and execution share one verifiable Ameow-owned contract. This task removes the repository/runtime inconsistencies identified by P2-V and stops before P2-A.

## Requirements

### One runtime path truth

- Windows FFmpeg, FFprobe, and Deno use the existing target-specific `real/` layout as the only authoritative paths.
- Bootstrap, repair, runtime resolution, readiness, Diagnostics, yt-dlp command construction, FFmpeg lookup, and packaged verification agree on those paths.
- Remove stale proxy-front requirements and tests; do not add forwarding executables.

### App-owned JS/EJS execution

- Bind yt-dlp to the selected managed Deno absolute path using the supported explicit runtime-path form.
- Remove machine Node/Deno discovery and fallback from Ameow's baseline execution policy.
- Remove the `ejs:github` runtime fetch.
- Make the required EJS package/version part of Ameow's managed package-set truth.
- Disable implicit user plugin discovery for baseline execution.

### Bundled Python and packaging

- Restore a reproducible, declared bundled-Python source for a fresh Windows package.
- Keep the packaged manifest, source asset, resolver, bootstrap, and verifier consistent.
- Do not use generated spike artifacts as production source truth without independently verifying provenance and digest.

### Active-process stability

- A runtime mutation must not replace or delete yt-dlp/Python/FFmpeg/FFprobe/Deno identities referenced by an active process tree.
- Use the smallest coordinator/lease or equivalent lifecycle gate that covers every existing mutator and consumer.
- Do not introduce digest-addressed dependency storage, candidate selection, updater infrastructure, or a second runner.

## Acceptance Criteria

- [ ] Fresh Windows package contains and executes the declared bundled Python.
- [ ] Runtime paths, bootstrap/repair, Diagnostics, FFmpeg/FFprobe execution, and tests use one `real/` truth.
- [ ] yt-dlp receives only the explicit Ameow-owned Deno path; machine JS fallback is absent.
- [ ] Baseline command execution performs no `ejs:github` fetch and does not load user plugin directories.
- [ ] The Ameow-owned yt-dlp package set includes the required EJS component with an exact version.
- [ ] FFmpeg merge, FFprobe, EJS+Deno, cancel, retry, and no-console behavior have automated or executable evidence appropriate to the current host.
- [ ] Runtime repair/bootstrap cannot mutate referenced dependencies before process-tree settlement.
- [ ] Type-check, lint, build, and relevant tests pass.
- [ ] Installed/portable persistence is either executable-verified or remains explicitly `NOT VERIFIED` as a release gate.
- [ ] macOS quarantine/Gatekeeper/offline-baseline checks remain P2-A release gates; scope is not expanded here.
- [ ] No managed candidate, selection, activation, rollback, updater, GC, post-pin fallback, or P2-A lifecycle is implemented.
- [ ] Final report says `REPAIR COMPLETE` or `REPAIR INCOMPLETE`, states readiness for P2-A, and does not claim Architecture PASS.

## Out of Scope

- Immutable bundled baseline materialization and its approved release manifest.
- Managed candidate download, staging, selection, activation, rollback, retention, or cleanup.
- Generic backend updater or Repair Center UX.
- Digest-addressed shared dependency storage.
- macOS release-policy expansion or Intel support.
- Architecture PASS.
