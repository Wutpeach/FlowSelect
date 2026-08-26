# P2-V Windows Release / Runtime Evidence

## Verdict recommendation

`BLOCKED BY EXTERNAL ENVIRONMENT`

“不进入 P2-A。” This task made no P2-A, updater, candidate, selection, activation, rollback, GC, or Architecture-PASS claim.

The approved source contract was exercised successfully from a fresh Windows package: app-owned `real/` FFmpeg/FFprobe/Deno paths, bundled Python, managed yt-dlp + EJS, explicit Deno command authority, cancellation settlement, no-console child creation, and NSIS in-place retention all have executable evidence. The remaining portable replacement/fresh-network checks are blocked by host filesystem/network behavior, not repaired in this evidence task.

## Source identity and initial artifacts

- Repository `HEAD`: `fadb22574f4abc2246a09964a9d14a5630abaaad` with the pre-existing P2-V repair worktree state preserved.
- The initial evidence phase changed only task files, reports, and task-local harnesses.
- Lead review then identified one bounded production defect. The final task source changes are only the stream-cleanup hunk in `electron/managedRuntimeBootstrap.mts` and its regression test in `electron/managedRuntimeBootstrap.test.mts`, layered on the pre-existing P2-V dirty work.
- All generated artifacts and profiles are below `D:\Ameow\.p2v-release-evidence`; no real user installation was used.

### Pre-repair artifacts (initial evidence phase)

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `out-local-electron\\win-unpacked\\Ameow.exe` | 222742528 | `C5F0DC9FB91292545630C87830DD863C4C1EF0D33B2B0631BFD5A363ACFA9374` |
| `out-local-electron\\Ameow_0.3.1_windows_x64_installer.exe` | 118033962 | `57B90560C64789F842375CCE51D84891F5B26C1C5510F6CF1831B40F2561B41C` |
| installer blockmap | 123868 | `3CD9556FE4B78A44A7E07001187BF62E1F83FBAAE6514502DC85A79CB522FE0D` |
| `portable\\Ameow_0.3.1_windows_x64_portable.zip` | 172953397 | `207FFA1AA6FE6CAC8A1D1ADF827193C8B7F5D056EAC418FCDC3731E4869A52D1` |

The portable ZIP contains `Ameow_portable\\Ameow.exe`, `.ameow-portable.json`, and the bundled `resources\\app\\desktop-assets\\binaries\\python-x86_64-pc-windows-msvc\\python.exe`.

## Packaging and Builder diagnosis

The normal Builder path was independently reproduced in a short task-owned output and cache:

```powershell
node .\node_modules\electron-builder\cli.js --config .\electron-builder.config.mjs --win nsis --x64 "--config.directories.output=D:\Ameow\.p2v-release-evidence\out" --publish never
```

It failed at the same `EPERM` rename from `win-unpacked.tmp` to `win-unpacked`. The old `dist-release` output only contained the stale `.tmp`; no Ameow/Electron Builder/NSIS/rcedit process was active. Both old and short task-owned outputs granted Administrators FullControl and Authenticated Users Modify. A Node directory-rename probe in the same isolated output passed. SearchIndexer and Defender real-time protection were active, with no contemporaneous Defender detection; `openfiles` could not inspect local handles and `handle.exe` was unavailable.

A fresh package was then built without `--prepackaged`, using the checked-out Electron dependency as the documented Builder `electronDist` input:

```powershell
node .\node_modules\electron-builder\cli.js --config .\electron-builder.config.mjs --win nsis --x64 "--config.directories.output=D:\Ameow\.p2v-release-evidence\out-local-electron" "--config.electronDist=D:\Ameow\node_modules\electron\dist" --publish never
```

Builder reported `using custom unpacked Electron distribution`, copied the unpacked framework, built NSIS, and produced the artifacts above. The portable ZIP was made only from that fresh unpacked tree with the repository script's copy/marker/archive behavior; no spike or `--prepackaged` input was used.

## Installed executable and managed runtime evidence

The NSIS installer was run silently only into `D:\Ameow\.p2v-release-evidence\installed-nsis`:

```powershell
Start-Process <installer> -ArgumentList @('/S', '/D=D:\Ameow\.p2v-release-evidence\installed-nsis') -Wait -PassThru
```

The initial install's wrapper timed out while the task-owned installer continued, but its resulting files were verified. The in-place repeat completed with exit code `0` (PID `12884`).

The installed app was launched from its exact packaged path with `--user-data-dir=D:\Ameow\.p2v-release-evidence\installed-profile\user-data`. Its browser/GPU/renderer children all retained that exact `--user-data-dir`, and runtime storage was therefore outside both `installed-nsis` and the app's `resources\\app` tree.

The packaged bootstrap module was executed with its bundled Python:

```text
D:\Ameow\.p2v-release-evidence\installed-nsis\resources\app\desktop-assets\binaries\python-x86_64-pc-windows-msvc\python.exe --version
Python 3.11.15
```

It downloaded and checksum-verified the pinned assets, then materialized only these Ameow-owned paths:

```text
...\installed-profile\user-data\runtimes\yt-dlp\x86_64-pc-windows-msvc\venv\Scripts\yt-dlp.exe
...\installed-profile\user-data\runtimes\deno\x86_64-pc-windows-msvc\real\deno.exe
...\installed-profile\user-data\runtimes\ffmpeg\x86_64-pc-windows-msvc\real\ffmpeg.exe
...\installed-profile\user-data\runtimes\ffmpeg\x86_64-pc-windows-msvc\real\ffprobe.exe
```

Observed executable results:

- `yt-dlp.exe --version` → `2026.07.04`; venv pip reported `yt-dlp 2026.7.4` and `yt-dlp-ejs 0.8.0` in that same venv.
- `deno.exe --version` → `deno 2.7.1`.
- `ffmpeg.exe -version` and `ffprobe.exe -version` → `8.0.1`.
- App-owned FFmpeg made a video fixture and AAC fixture, merged them with `-c copy`, then transcoded it; app-owned FFprobe reported H.264 + AAC and `duration=3.018005`. The merged file SHA-256 is `B2DAB9FFB1FA3AE86230ED68FB8F5A81CE2198835B76DDAF4FBA27798CB768A0`; the transcoded file SHA-256 is `BB64471C844FE6165E4F7C6C0EF3B13E3B3AA72A8CCFA9186F36B2F7D2E3D97E`.

### yt-dlp / EJS / Deno authority

The packaged command-plan module generated and the packaged process runner executed the actual managed `yt-dlp.exe` path. Its YouTube plan contained:

```text
--ignore-config --no-plugin-dirs
--ffmpeg-location ...\runtimes\ffmpeg\x86_64-pc-windows-msvc\real
--extractor-args youtube:player_js_variant=tv
--js-runtimes deno:D:\Ameow\.p2v-release-evidence\installed-profile\user-data\runtimes\deno\x86_64-pc-windows-msvc\real\deno.exe
```

The generated plan contained no `ejs:github`, bare `deno`, or bare `node`; the exact managed package set includes `yt-dlp-ejs==0.8.0`. A bounded `--simulate --skip-download --socket-timeout 10 --retries 0` invocation reached YouTube with those arguments but returned `Video unavailable` for the controlled public fixture. It proves executable/argument/package authority, but does **not** prove a successful live YouTube EJS challenge handshake.

### Cancel, settlement, retry, and no-console

The packaged `processRunner.js` launched the exact managed FFmpeg process with `windowsHide: true`. During a realtime fixture it observed PID `100460` at the app-owned `real\\ffmpeg.exe` path, with the intended command line and `MainWindowHandle=0`. A coordinator lease was active (`1`); `runMutation` returned `RuntimeSetBusyError`; abort settled the child with exit code `1`; the lease remained active until explicit post-settlement release, then `runMutation` succeeded.

Focused source regression coverage also passed:

```text
npm test -- --run electron/runtimeSetLifecycle.test.mts src/electron-runtime/processRunner.test.ts src/electron-runtime/ytDlpCommandPlan.test.ts src/electron-runtime/ytDlpDownload.test.ts
16 files, 240 tests passed
```

This includes the existing one-time retry, command, lease, and cancellation wiring coverage. The npm CLI printed a future-compatibility warning for its argument parsing; Vitest completed successfully.

## Persistence

### NSIS installed form — PASS

Before and after the isolated silent in-place installer run, the runtime tree outside the installation directory was identical:

```text
files=4032
bytes=288145262
sha256=950941BFC7B73570316A357B1BDC3AEA14BC1052C6676D336F294A735495E589
```

This confirms retention across an in-place replacement of the task-owned NSIS target. It does not inspect a real user installation.

### Portable form — partial / blocked

The fresh ZIP extraction launched from `D:\Ameow\.p2v-release-evidence\portable-extracted\Ameow_portable\Ameow.exe`, detected the `.ameow-portable.json` marker, and used the explicit task-owned `--user-data-dir=D:\Ameow\.p2v-release-evidence\portable-profile\user-data` in all observed children. The portable packaged bootstrap successfully materialized its app-owned yt-dlp/EJS and Deno paths, with metadata naming the portable package's own bundled Python path and package set `yt-dlp==2026.07.04;yt-dlp-ejs==0.8.0`.

The same portable bootstrap then stalled while fetching FFmpeg. After the existing 30-second transfer timeout/fallback behavior, the packaged module emitted an unhandled `WriteStream` `AbortError` after about 520 seconds. The portable FFmpeg/FFprobe runtime was therefore not materialized. This is an observed failure-path bug candidate; it was not repaired here because the task is release evidence and the installed-form transfer had already succeeded.

Folder-replacement retention is **NOT VERIFIED**. A task-owned rename/replacement attempt hit persistent `Access to the path ... is denied` locks within `.p2v-release-evidence`; no real portable install was touched. The original full extraction remains preserved at `portable-extracted\\Ameow_portable.before-replacement`; the staging tree remains at `portable-staging\\Ameow_portable`; the partially created replacement root is also task-owned. Do not treat that partial root as a runnable artifact.

An initial environment-only isolation probe was unsafe on this host: Electron resolved its child `--user-data-dir` to `C:\Users\Administrator\AppData\Roaming\ameow` despite task-owned `APPDATA`/`LOCALAPPDATA`. The task-owned root process (PID `101192`) was stopped immediately. The default profile was not inspected, cleaned, or used again; all subsequent launches used explicit `--user-data-dir`. This prevents a claim about unmodified product-default portable userData behavior. Existing source still shows the portable marker is for install/update detection, not a userData redirect.

## Authenticode / trust

- `Ameow.exe`, NSIS installer, bundled Python, yt-dlp, FFmpeg, and FFprobe: `NotSigned`.
- Managed Deno: `Valid`, signer `CN=Deno Land Inc.` with Microsoft timestamping.

The unsigned app and payload executables are Windows release/trust hardening, consistent with the P2-V contract. They matter before a signed public distribution, but are not by themselves a technical blocker to beginning P2-A implementation and do not add P2-A/updater capability.

## Remaining blockers and retained external gates

1. Normal Electron Builder extraction continues to fail with host-specific `EPERM` even in a short isolated output; the local-Electron fresh package workaround is valid evidence but not a replacement for a clean-host normal build.
2. Portable FFmpeg's prior stream-abort failure is repaired and its verified-local-acquisition bootstrap now passes; direct unstable-network repetition remains deliberately distinguished from product behavior.
3. Portable default-userData and folder replacement could not be completed: a safe disposable default-user environment is outside current authority, and the task-root portable folder remains host-locked despite no app process.
4. A successful live YouTube EJS challenge remains unverified; only package membership and exact no-fallback command authority were executed.
5. `git diff --check` is not clean only because of pre-existing CRLF/trailing-whitespace in unrelated `browser-extension/locales/contract.json`; it was not changed.
6. Retained macOS release gates remain fresh-quarantine arm64 validation, offline baseline, and Gatekeeper verification.

No Architecture PASS occurred.

## Follow-up: portable timeout-path repair (2026-08-25)

### Repair

The portable failure exposed a repository defect in `electron/managedRuntimeBootstrap.mts` rather than an external-only failure: `downloadToFile()` passed the abort error into an already-open `WriteStream` via `destroy(error)`, then threw the normalized timeout. The stream could emit that error after the caller had moved on, producing the unhandled `AbortError` observed in the portable bootstrap.

The bounded repair removes the injected stream error. On the error path it retains the opened stream, waits for its normal `close` after `destroy()`, then preserves the existing timeout normalization and fallback behavior. It does not change runtime paths, asset selection, checksum verification, retry/fallback policy, storage, lifecycle leases, or updater behavior.

`electron/managedRuntimeBootstrap.test.mts` now covers a body that writes a partial chunk, stalls, receives the timeout abort, and proves the promise rejects with the configured timeout while the partial file can be closed/removed normally. The test runner itself would fail on an unhandled stream error.

### Source checks

| Check | Result |
| --- | --- |
| `npm test -- --run electron/managedRuntimeBootstrap.test.mts` | PASS — 5 files, 81 tests |
| `npm run type-check` | PASS |
| `npm run lint` | PASS |
| `npm run electron:build` | PASS |
| `git diff --check` | unrelated existing CRLF/trailing-whitespace failure only in `browser-extension/locales/contract.json`; no repair-hunk finding |

The initially attempted `npm run build:electron` does not exist; the repository's Electron build script is `npm run electron:build`, which passed above.

### Repaired portable package and FFmpeg / FFprobe

A fresh repaired package was built from the same task-owned source state, again without `--prepackaged`, using the checked-out Electron distribution solely to bypass the separately documented host `EPERM` extraction issue:

```powershell
node .\node_modules\electron-builder\cli.js --config .\electron-builder.config.mjs --win nsis --x64 "--config.directories.output=D:\Ameow\.p2v-release-evidence\out-repair-local-electron" "--config.electronDist=D:\Ameow\node_modules\electron\dist" --publish never
```

The packaged bootstrap module at `out-repair-local-electron\\win-unpacked\\resources\\app\\dist-electron\\electron\\managedRuntimeBootstrap.mjs` has SHA-256 `53D8E309E07F5755201F20E737BD55C73CBA9E446B740B2A595D1DB3269B37CF`, contains the close-before-rethrow cleanup, and no longer contains `writable?.destroy(error)`.

### Post-repair artifacts

| Artifact | Exact path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| repaired unpacked app | `out-repair-local-electron\\win-unpacked\\Ameow.exe` | 222742528 | `C5F0DC9FB91292545630C87830DD863C4C1EF0D33B2B0631BFD5A363ACFA9374` |
| repaired NSIS installer | `out-repair-local-electron\\Ameow_0.3.1_windows_x64_installer.exe` | 118034058 | `59DEADB62F0C0216096E1BBE0887F5BED5EC564BF8D5953CCC58916EC4EED5AB` |
| repaired installer blockmap | `out-repair-local-electron\\Ameow_0.3.1_windows_x64_installer.exe.blockmap` | 123780 | `7DABA94D4901A79544BD32CFCEB0092D514CCC32FD789200451A9F74D9C3D2F8` |
| repaired packaged bootstrap module | `out-repair-local-electron\\win-unpacked\\resources\\app\\dist-electron\\electron\\managedRuntimeBootstrap.mjs` | 35337 | `53D8E309E07F5755201F20E737BD55C73CBA9E446B740B2A595D1DB3269B37CF` |
| repaired portable ZIP | `portable-repair\\Ameow_0.3.1_windows_x64_portable_repair.zip` | 172953434 | `C7A74C3BCA542774CCEDF5BB764D588F92C26A92766C9E7631F8B52DD8F79C4D` |

A fresh portable ZIP was then made from that new unpacked tree (repository portable copy/marker/archive behavior), extracted fresh, and launched from:

```text
D:\Ameow\.p2v-release-evidence\portable-repair-extracted\Ameow_portable\Ameow.exe
```

The package launch used an explicit task-owned `--user-data-dir`; all observed GPU/network/renderer children retained it. This is isolated executable evidence only, **not** a default-userData claim.

For stable portable FFmpeg verification, the expected upstream archive was acquired once into `D:\Ameow\.p2v-release-evidence\verified-assets\\ffmpeg-windows-x64-8.0.1.zip` from the declared FFmpegBin URL. Its exact size and SHA-256 matched the source manifest (`72093901`, `29F9F067E8FFAD75D5C0E96EC142E665228CB12CDB05FD5CC39EEB9C68962A40`). A task-local fetch adapter served only that verified archive URL to the **packaged** bootstrap module; the product verifier still streamed, size-checked, SHA-256-checked, extracted, and wrote the final runtime. This acquisition workaround is evidence-only, not product network behavior.

The repaired portable bootstrap then completed with no unhandled exception and materialized these exact portable app-owned paths:

```text
D:\Ameow\.p2v-release-evidence\portable-repair-profile\user-data\runtimes\ffmpeg\x86_64-pc-windows-msvc\real\ffmpeg.exe
D:\Ameow\.p2v-release-evidence\portable-repair-profile\user-data\runtimes\ffmpeg\x86_64-pc-windows-msvc\real\ffprobe.exe
```

- Both report version `8.0.1`.
- `ffmpeg.exe`: SHA-256 `D01705F26A85F400609BF84AE4FEE5007D9097BE4FC3405CFCD548188396D96F`.
- `ffprobe.exe`: SHA-256 `D26825DDD775565B92E1145B80006FE40D88F5BC8119DF148256ACC4E07D0201`.
- Both remain `NotSigned`, consistent with the prior Windows trust finding.

The repaired **packaged** module was also given a partial response body that stalled after opening its `WriteStream`. It returned `portable package timeout normalized`, waited for cleanup, and completed the harness with `PACKAGED_TIMEOUT_PROBE normalized rejection with no uncaught stream error`.

### Portable replacement retry

Portable folder-replacement retention remains **NOT VERIFIED / externally blocked**. After the repaired portable app had exited, no task-owned `Ameow.exe` process remained. Restart Manager found no process for either exact `Ameow.exe` path, while its directory probes returned `RmGetList=5` (access denied); `openfiles /query` reported that local object tracking is disabled. The portable extraction and staging ACLs retain Authenticated Users Modify, and a new sibling task-owned directory rename succeeded. Nevertheless, `Rename-Item` on the exact extracted `Ameow_portable` directory still returned `Access to the path ... is denied` before any replacement move occurred.

The retry preserved both complete task-owned trees unchanged:

```text
portable-repair-extracted\\Ameow_portable
portable-repair-staging\\Ameow_portable
```

No product storage behavior was changed to work around that host lock. Default installed/portable userData remains **NOT VERIFIED** because safely obtaining an independent disposable user token/environment is outside this task's authority; explicit `--user-data-dir` cannot prove the default contract. The earlier bounded public YouTube/EJS attempt remains `Video unavailable`, so only EJS package/argument authority—not a live challenge handshake—is proven.

### Reassessed verdict

`BLOCKED BY EXTERNAL ENVIRONMENT`

The proven repository failure-path defect is repaired and regression-covered. This verdict rests on the unmet Windows evidence: normal Builder host `EPERM`, safe default-userData evidence, portable folder replacement retention, and live EJS challenge execution. Unsigned Windows payloads remain later release-trust hardening, not a P2-A technical blocker. Retained macOS quarantine/offline/Gatekeeper gates remain external. No P2-A/updater/Architecture PASS occurred.
