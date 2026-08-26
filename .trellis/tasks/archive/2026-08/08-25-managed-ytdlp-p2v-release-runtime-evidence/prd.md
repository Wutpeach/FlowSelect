# P2-V Release Runtime Evidence

## Goal

Close the remaining Windows release/runtime evidence gates after the approved P2-V source repair. Produce exactly one final verdict: `READY FOR P2-A`, `REPAIR REQUIRED`, or `BLOCKED BY EXTERNAL ENVIRONMENT`.

## Requirements

- Produce a genuinely fresh Windows packaged artifact. Diagnose Electron Builder `EPERM` first; repair repository/config only when evidence proves it is the cause, otherwise move validation to a clean task-owned environment.
- From isolated runtime storage, execute bundled Python, managed yt-dlp plus yt-dlp-ejs, managed Deno, FFmpeg, and FFprobe using Ameow-owned absolute paths.
- Prove EJS+Deno, FFprobe, FFmpeg merge/transcode, cancellation/process-tree settlement, existing retry behavior, and hidden/no-console execution.
- Validate installed and portable default userData/runtime locations and runtime retention across application upgrade/replacement. Preserve the current product contract; do not make portable runtime storage extraction-relative.
- Record exact artifacts, hashes, commands, paths, PASS/FAIL/NOT VERIFIED evidence, and any minimal repair.

## Fixed Architecture

- Windows uses only `real/` managed paths.
- yt-dlp binds the app-owned Deno absolute path; no machine JS fallback, `ejs:github`, or user plugin directories.
- The existing target-scoped lifecycle coordinator and active-lease mutation block remain unchanged.
- Download Runtime/Orchestrator authority remains unchanged; no digest-addressed storage.

## Acceptance Criteria

- [ ] Fresh Windows artifact is built and identified by path, size, and SHA-256.
- [ ] Packaged bundled Python and all managed runtime components execute from recorded Ameow-owned paths.
- [ ] EJS+Deno, FFprobe, merge/transcode, cancel/settlement, retry, and hidden/no-console behavior have executable evidence.
- [ ] Installed and portable default storage and upgrade/replacement persistence have executable evidence.
- [ ] Any repository repair is minimal and backed by a reproduced repository/config failure.
- [ ] Remaining macOS gates are recorded without implementation.
- [ ] No P2-A/updater/candidate/selection/activation/rollback/GC capability is introduced.
- [ ] Final report returns exactly one allowed verdict and identifies every remaining Windows blocker.

## Out of Scope

- Re-designing approved P2-V source architecture.
- P2-A immutable baseline work or any updater lifecycle.
- macOS implementation or Intel support.
- Unrelated full-suite baseline failures.
- Architecture PASS.
