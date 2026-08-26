# P2-V Runtime Contract Repair Plan

## 1. Align contracts and paths

- [x] Map all FFmpeg/FFprobe/Deno path consumers and update the active sidecar spec to the existing `real/` truth.
- [x] Keep resolver, bootstrap/repair, Diagnostics, execution, and tests on the same path objects.

## 2. Close JS/EJS authority

- [x] Add the exact EJS package to the existing managed yt-dlp package-set manifest.
- [x] Replace bare Node/Deno plus `ejs:github` with one explicit managed-Deno absolute binding.
- [x] Disable user plugin discovery and add command-plan tests proving the forbidden arguments/discovery routes are absent.

## 3. Protect active runtime identities

- [x] Add the minimum target-scoped mutation/lease gate inside the existing Electron runtime boundary.
- [x] Cover yt-dlp execution, FFprobe/advanced probes, FFmpeg/transcode, repair/bootstrap, cancellation, and process-tree settlement.
- [x] Add race-focused tests showing mutation cannot replace a referenced set.

## 4. Repair fresh Windows packaging

- [x] Restore the verified bundled-Python source expected by the target manifest.
- [ ] Build a fresh Windows package without relying on `--prepackaged` output (blocked: Electron Builder `EPERM` renaming `win-unpacked.tmp`).
- [ ] Verify bundled Python and managed yt-dlp/EJS/Deno/FFmpeg paths from an isolated packaged userData root (yt-dlp/EJS passed; Deno/FFmpeg bootstrap timed out on this host).

## 5. Validate and report

- [x] Run focused unit/integration tests for paths, command policy, bootstrap, Diagnostics, leases, cancel, retry, FFprobe, and transcode.
- [ ] Run `npm run type-check`, `npm run lint`, relevant builds, and fresh package verification (type-check/lint/build passed; fresh package blocked as above).
- [x] Attempt installed/portable persistence only if it can be isolated safely; retained as `NOT VERIFIED` because package build did not complete.
- [x] Record exact commands, PASS/FAIL/NOT VERIFIED results, generated ignored artifacts, and remaining external macOS gates in `validation.md`.
- [x] Stop before P2-A and do not claim Architecture PASS.
