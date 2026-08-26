# P2-V closure — required repair plan before P2-A

## Status

Planning only. This checklist identifies the bounded work needed to change the P2-V verdict from `REPAIR REQUIRED`. It does not authorize implementation, P2-A, an updater, activation, rollback, GC, or Architecture PASS.

## Repair 1 — one Windows runtime path truth

- [ ] Update the active sidecar runtime contract to make `real/` authoritative for Windows FFmpeg/FFprobe/Deno.
- [ ] Keep runtime resolution, pure Diagnostics inspection, bootstrap/repair, and packaged verification on the same paths.
- [ ] Keep `--ffmpeg-location` and the FFmpeg PATH prepend pointed at the selected `real/` directory.
- [ ] Remove or fail tests that assume root proxy-front binaries unless real packaged evidence justifies restoring them.

## Repair 2 — deterministic JS/EJS runtime set

- [ ] Pass the selected absolute managed Deno path using yt-dlp's explicit runtime-path form.
- [ ] Remove unpinned machine Node/Deno fallback from the baseline execution policy.
- [ ] Package and hash-pin `yt-dlp-ejs` with yt-dlp.
- [ ] Disable baseline remote-component fetch and user plugin directories.
- [ ] Add an offline EJS/Deno eligibility test and a packaged YouTube-path smoke test.

## Repair 3 — complete runtime-set lifecycle gate

- [ ] Add one per-target lifecycle coordinator covering yt-dlp/Python, FFmpeg, FFprobe, and Deno.
- [ ] Make readiness mutation plus resolve/validate/lease acquisition atomic under the same lock.
- [ ] Hold leases for download attempts, advanced probes, and transcodes through process-tree settlement.
- [ ] Route every bootstrap, repair, reinstall, and relocation rebuild through the same mutation gate.
- [ ] Return typed busy/deferred behavior while references exist; never perform a partial replacement.
- [ ] Test simultaneous ensure/attempt, repair/attempt, cancellation, FFmpeg child start, Deno child start, advanced probe, and transcode settlement on Windows and POSIX semantics.

## Validation 4 — reproducible Windows package and persistence

- [ ] Restore a successful normal fresh Windows package path with the declared bundled Python source.
- [ ] Materialize FFmpeg and Deno successfully from that package and exercise version, merge, probe, Deno/EJS, cancel, and no-console behavior.
- [ ] Use a disposable Windows profile to record installed and portable default userData paths.
- [ ] Hash the managed runtime tree before and after a completed NSIS upgrade and portable folder replacement.
- [ ] Record Authenticode as an explicit release-policy fact; do not present SHA-256 as publisher signing.

## Validation 5 — macOS arm64 release gate

- [ ] Extend the existing macOS package verifier to package and verify the approved wheel manifest.
- [ ] Materialize the baseline without network access on `macos-15` arm64.
- [ ] Execute yt-dlp with bundled EJS and the explicit managed Deno path.
- [ ] Prove executable bits, relocation-triggered offline rebuild, cancellation, and FFmpeg integration.
- [ ] Run a fresh-quarantine end-user scenario or explicitly retain it as a documented release acceptance gate.
- [ ] Do not add x64 validation unless public release support returns.

## Gate to re-evaluate

After all five sections have evidence:

- verify no second runtime path or discovery authority remains;
- verify all runtime-set mutations participate in the lifecycle coordinator;
- verify baseline materialization performs no network fetch;
- verify Diagnostics remains read-only;
- rerun P2-V verdict review before creating or starting P2-A.

