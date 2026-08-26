# P2-V Release Runtime Evidence Plan

## 1. Fresh package

- [x] Diagnose the existing Electron Builder `EPERM` with process/handle/path/permission evidence.
- [x] Build a fresh task-owned package without `--prepackaged` or spike output (normal downloaded-Electron Builder extraction remains host-blocked; local `electronDist` evidence artifact passed).
- [x] Record installer/portable artifact hashes and package contents.

## 2. Packaged execution

- [x] Launch with explicit isolated runtime storage and record resolved executable paths.
- [x] Execute all runtime components in packaged forms: installed form passed; portable yt-dlp/EJS+Deno evidence remains from the first run and repaired portable FFmpeg/FFprobe bootstrap now passes from exact `real/` paths.
- [ ] Prove every online EJS and portable behavior: exact EJS package/Deno authority, repaired portable FFmpeg/FFprobe, merge/transcode, cancel/settlement, retry, and no-console passed where executable; live EJS handshake and portable replacement/default-storage remain unverified.

## 3. Persistence

- [x] Verify installed isolated userData/runtime location and upgrade retention.
- [ ] Verify portable default userData/runtime location and folder-replacement retention (blocked; no default profile inspected).
- [x] Prove controlled runtime storage is outside install/extraction trees.

## 4. Closure

- [x] Run focused lifecycle/adapter/command regression checks and the timeout-stream regression; a bounded bootstrap cleanup repair occurred.
- [x] Write `validation.md` with exact evidence and one allowed verdict.
- [x] Stop before P2-A and do not claim Architecture PASS.
