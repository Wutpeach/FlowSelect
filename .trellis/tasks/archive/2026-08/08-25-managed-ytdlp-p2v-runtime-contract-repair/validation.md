# P2-V Runtime Contract Repair validation

Date: 2026-08-25 (Windows x64). This is a repair validation record, not an
Architecture PASS. **不要进入 P2-A。不要实现 updater / activation / rollback。**

## Result

`REPAIR INCOMPLETE` for release/package evidence, while the bounded source
repair and its focused checks are complete. Do not start P2-A from this record.
The remaining blockers are a fresh Windows Electron package and executable
Deno/FFmpeg/FFprobe/merge proof; installed/portable retention remains `NOT
VERIFIED`.

## Changed contract

- Windows FFmpeg, FFprobe, and Deno retain one authoritative `real/` path.
  Bootstrap, resolver, pure Diagnostics inspection, command planning, and the
  active sidecar contract agree; no proxy front is added.
- YouTube command plans use only `--js-runtimes
  deno:<absolute-managed-deno-path>`, no bare `deno`/`node`, no
  `ejs:github`, and `--no-plugin-dirs` in addition to `--ignore-config`.
- Managed `yt-dlp` installs the exact set `yt-dlp==2026.07.04` and
  `yt-dlp-ejs==0.8.0`. Metadata has a package-set identity, so existing venvs
  without EJS rebuild.
- `electron/runtimeSetLifecycle.mts` is the target-scoped coordinator: runtime
  mutations fail busy while leased; yt-dlp attempts, gallery-dl attempts,
  advanced probes, FFprobe analysis, and FFmpeg transcodes release only after
  their runner settles. This preserves the existing runner, cancel, retry and
  terminal ownership; it introduces no candidates, updater, activation,
  rollback, GC, or digest-addressed store.

## PASS evidence

| Check | Command / observation | Result |
| --- | --- | --- |
| Python provenance source | `curl.exe --location ... cpython-3.11.15+20260325...tar.gz`; SHA-256 `EC6D...EF2621`, 25,593,816 bytes, matches `.official-python-runtimes.json` | PASS |
| Bundled Python restore | Extracted verified official archive to `desktop-assets/binaries/python-x86_64-pc-windows-msvc/`; `npm run runtime:ensure:python`; `npm run runtime:smoke:python` | PASS (`Python 3.11.15`) |
| Managed package set | `npm run runtime:smoke:downloaders` | PASS: yt-dlp `2026.07.04`, gallery-dl `1.32.8`, local yt-dlp MP4 and gallery-dl PNG fixture outputs |
| Isolated yt-dlp/EJS | Task-owned `evidence/isolated-userdata`; metadata reports `yt-dlp==2026.07.04;yt-dlp-ejs==0.8.0`; `venv\Scripts\python.exe -m pip show yt-dlp-ejs` reports `0.8.0` | PASS |
| Focused regression | `npm test -- src/electron-runtime/engineManifest.test.ts electron/runtimeSetLifecycle.test.mts electron/managedRuntimeBootstrap.test.mts src/electron-runtime/ytDlpCommandPlan.test.ts src/electron-runtime/ytDlpDownload.test.ts src/electron-runtime/ytDlpMetadata.test.ts src/electron-runtime/service.test.ts` | PASS: 31 files, 669 tests |
| Static quality | `npm run type-check`; `npm run lint`; `npm run electron:build`; direct import of emitted `dist-electron/electron/runtimeSetLifecycle.mjs` | PASS |
| Lease race | `electron/runtimeSetLifecycle.test.mts`: mutation rejects `RuntimeSetBusyError` until every lease is released | PASS |

## Follow-up review evidence

- The target-scoped coordinator records prepared capabilities and per-capability
  active references. Lease acquisition serializes and prepares only its missing
  capabilities: media-tools then yt-dlp prepares only yt-dlp+Deno; gallery-dl
  then yt-dlp prepares yt-dlp+FFmpeg+Deno; yt-dlp then media-tools prepares
  nothing. The same consumer still joins without preparation. Prepared state
  clears after the final lease and after every explicit mutation settles; an
  explicit bootstrap/repair mutation remains `RuntimeSetBusyError`-blocked
  while any capability is leased. No new lifecycle framework or storage layout
  was added.
- `service.test.ts` covers the production data flow: the service acquires the
  yt-dlp lease before an advanced-quality probe and releases it only after a
  cancellation settles the probe runner; it acquires distinct media-tools
  leases before FFprobe preparation and FFmpeg transcode, holding the latter
  until the transcode runner resolves. `engineAdapters.test.ts` proves both
  real engine adapters release their passed lease only after their runner
  resolves or rejects after cancellation.
- The generated Electron runtime-contract template now matches active source:
  no remote `ejs:github`, exactly one managed-Deno absolute binding, and
  `--ignore-config --no-plugin-dirs`. One in-scope source/spec/template search
  found no stale proxy-front or machine-JS execution contract; policy text
  explicitly forbidding `ejs:github` remains intentionally present.
- `desktop-assets/binaries/.official-python-runtimes.json` has its prior
  Windows `preparedAt` restored. The manifest plus `runtime:ensure:python`
  flow was already repository source truth; this task only materialized and
  verified the ignored local prerequisite. A truly fresh-cache Windows package
  remains unproven and environment-dependent after the recorded Electron
  Builder `EPERM` failure.

| Follow-up check | Command / observation | Result |
| --- | --- | --- |
| Lifecycle, service, adapter and command regressions | `npm test -- electron/runtimeSetLifecycle.test.mts src/electron-runtime/engineAdapters.test.ts src/electron-runtime/service.test.ts src/electron-runtime/ytDlpCommandPlan.test.ts src/electron-runtime/engineManifest.test.ts` | PASS: 17 files, 411 tests |
| Static quality after follow-up | `npm run type-check`; `npm run lint` | PASS |
| Diff whitespace | `git diff --check` | PASS |

## Honest failures and unverified gates

| Gate | Result | Detail |
| --- | --- | --- |
| Fresh normal Windows package | FAIL / environment-blocked | `npm run package:win` reaches official Python validation, renderer build and Electron compile, then Electron Builder fails `EPERM` renaming `dist-release/win-unpacked.tmp` to `win-unpacked`. Direct builder output redirected to task evidence fails at the same framework extraction rename. No prepackaged/spike artifact was used. |
| Isolated Deno + FFmpeg/FFprobe bootstrap | NOT VERIFIED | A task-owned bootstrap successfully created yt-dlp/EJS but remained stalled while fetching Deno/FFmpeg and was terminated at the command timeout. No `real/deno.exe`, `real/ffmpeg.exe`, or `real/ffprobe.exe` was materialized; do not claim EJS+Deno, merge, FFprobe, or no-console executable PASS. |
| Installed/portable persistence and upgrade retention | NOT VERIFIED | Fresh package did not complete; no real installation or default userData was touched. |
| Full repository test | FAIL, unrelated baseline | `npm test` ran 993 pass / 5 fail: three `.cindy-worktrees/**/browser-extension/architecture-guard.test.js` failures, missing OneWorks task artifact in `src/lab/oneworksAmeowCandidate.test.ts`, and the now-fixed manifest expectation. Re-running the scoped repair suite passed. |
| macOS quarantine/offline/Gatekeeper | External P2-A release gate | Not expanded or tested on this Windows task. |

## Generated, ignored evidence

- `evidence/cpython-3.11.15+20260325-x86_64-pc-windows-msvc-install_only_stripped.tar.gz` — independently fetched and digest-verified official archive.
- `evidence/isolated-userdata/` — isolated managed yt-dlp/EJS venv only.
- `evidence/fresh-package-output-direct/` — incomplete Electron Builder temp output after `EPERM`; evidence only.

## Lead verdict inputs

Source contract repair is ready for review, but the honest recommendation is
**REPAIR INCOMPLETE / NOT READY FOR P2-A** until a fresh Windows package and
isolated executable Deno+FFmpeg/FFprobe/merge/cancel/retry/no-console proof
pass, and installed/portable persistence is verified. No P2-A capability,
updater, activation, rollback, or Architecture PASS is claimed.
