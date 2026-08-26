# P2-V Windows packaged-runtime validation

Date: 2026-08-25 (Windows 11 10.0.26200, x64). This is a Windows-only
evidence record. It neither implements P2-A nor grants Architecture PASS.

## Evidence classification

- **Executable/package observed** means a Windows package, its compiled JavaScript,
  or a child executable was actually run in a task-owned location.
- **Source inference** means current source was inspected but cannot be claimed as
  behavior of the 2026-08-23 package artifact.
- **Not verified** is intentionally not converted into an assumption.

## Artifacts and commands

| Artifact | Evidence | Result |
| --- | --- | --- |
| `spike-package-output/win-unpacked` | 2026-08-23 11:07 Windows x64 unpacked app, version `0.3.1` | Contains `resources/app/desktop-assets/binaries/python-x86_64-pc-windows-msvc/python.exe`, `dist-electron/electron/managedRuntimeBootstrap.mjs`, and runtime-path/yt-dlp compiled modules. `Ameow.exe` SHA-256 `C5F0DC9F…ACFA9374`. |
| `dist-release/portable/Ameow_0.3.1_windows_x64_portable.zip` | Existing portable artifact, generated 2026-07-16; ZIP SHA-256 `22CFDE0E…DD39F4EB` | Marker and verification metadata declare `windows-portable`, version `0.3.1`. |
| `dist-release/Ameow_0.3.1_windows_x64_installer.exe` | Built locally on 2026-08-25 with `node .\\node_modules\\electron-builder\\cli.js --config .\\electron-builder.config.mjs --win nsis --x64 --prepackaged .\\spike-package-output\\win-unpacked --publish never` | Succeeded; per-user NSIS x64 installer, SHA-256 `33E9B02A…2032B0FD`. This avoided a source rebuild and packed the inspected 0.3.1 app. |
| `npm run package:win` | Attempted as the normal fresh package command | Failed during `ensure-python-runtime.mjs` with `fetch failed`; the source `desktop-assets/binaries/python-x86_64-pc-windows-msvc/python.exe` was absent despite its manifest entry. No source/config edit was made. |

All **credited** package-launch evidence used a task-owned
`AMEOW_DOCS_SCREENSHOT_USER_DATA` override, the startup-diagnostics switch, and
a hidden child process. Those observed packages wrote `userDataDir`, logs, and
`settings.json` only under
`.trellis/tasks/08-25-managed-ytdlp-p2v-evidence-gates/evidence/`.

## Authoritative Windows path contract

**Observed packaged contract: use `real/`, not proxy-front executables.** The
2026-08-23 compiled resolver and bootstrap both derive these exact paths under
Electron `userData`:

```text
<userData>/runtimes/yt-dlp/x86_64-pc-windows-msvc/venv/Scripts/yt-dlp.exe
<userData>/runtimes/ffmpeg/x86_64-pc-windows-msvc/real/ffmpeg.exe
<userData>/runtimes/ffmpeg/x86_64-pc-windows-msvc/real/ffprobe.exe
<userData>/runtimes/deno/x86_64-pc-windows-msvc/real/deno.exe
```

Direct execution of the compiled package bootstrap materialized the first path
under the isolated `userData` root. The compiled resolver reported the remaining
three `real/` paths as missing after their bootstrap could not complete. It did
not create or resolve root-level proxy-front `ffmpeg.exe`, `ffprobe.exe`, or
`deno.exe`.

This conflicts with
`.trellis/spec/backend/sidecar-runtime-contracts/02-cross-platform-runtime-resolution-for-downloaders.md`
which still requires a Windows proxy front. The current compiled package and
current source agree on `real/`; the specification is stale unless the project
intentionally reintroduces and tests proxy fronts. P2-A must have **one**
contract: retire/correct the proxy-front requirement or implement it everywhere.

### yt-dlp launch evidence

The actual isolated bootstrap import called
`ensureManagedYtDlpRuntimeReady("p2v-isolated-validation", options)` from the
packaged `managedRuntimeBootstrap.mjs`. It completed, yielding the managed
entrypoint above. Direct child probes then returned:

```text
bundled Python: Python 3.11.15
managed yt-dlp: 2026.07.04
```

The compiled package's YouTube plan for that entrypoint included:

```text
--ffmpeg-location <userData>/runtimes/ffmpeg/x86_64-pc-windows-msvc/real
--remote-components ejs:github
--js-runtimes deno
--js-runtimes node
```

The compiled `ytDlpDownload.js` also prepends **only** the FFmpeg `real/`
directory to child `PATH`. It does not add the managed Deno `real/` directory.
Consequently `--js-runtimes deno` cannot discover this managed `deno.exe` by
that child `PATH`. This is an observed repair-required mismatch, independent of
the stale proxy-front specification.

The FFmpeg and Deno package bootstrap was also invoked in the same isolated
root. It did not produce either executable: it reached both "Bootstrapping
managed ffmpeg runtime" and "Bootstrapping managed deno runtime", then the
Node process ended with the packaged downloader's `AbortError` on a
`WriteStream` after its stalled transfer path. Therefore no real FFmpeg merge,
FFprobe probe, Deno-assisted YouTube run, or end-to-end download is claimed.

### Diagnostics and bootstrap/repair agreement

- **Source inference:** current `electron/main.mts` passes
  `inspectRuntimeDependencyStatus()` and `inspectRuntimeBinaryPaths()` into
  `buildDiagnosticsSnapshot()`. Those pure inspection paths use exactly the
  same `real/` locations above. The runtime dependency gate and yt-dlp engine
  readiness both call the same `ensureManaged*RuntimeReady` functions.
- **Not verified in a current executable:** the 2026-08-23 package predates the
  current P1 `electron/diagnostics.mts` module, and the normal fresh package
  command is currently blocked by the missing source Python runtime. Thus a
  current P1 Diagnostics UI snapshot was not falsely treated as package proof.

## Installed versus portable persistence

The prepackaged 0.3.1 NSIS installer installed successfully with `/S` and a
custom task-owned `/D=<task>/evidence/nsis-installed-v031` directory. It created
`Ameow.exe`, `resources/app`, and an uninstaller, with no portable marker.

The portable executable was separately launched with a task-owned user-data
override. Its own startup diagnostics recorded:

```text
execPath:  .../dist-release/portable/Ameow_portable/Ameow.exe
userData:  .../.trellis/tasks/.../evidence/portable-user-data
```

The packaged `resolveWindowsAppInstallMode()` was executed against both real
paths: it returned `portable` for the marker-bearing ZIP extraction and
`installed` for the NSIS extraction. Its only distinction is the update mode;
the compiled main process has no portable-specific `app.setPath("userData", …)`
branch. The current source likewise uses `app.getPath("userData")` for runtime
storage and uses the portable root only for app-update handling.

**Conclusion:** portable mode changes app-update behavior, not the Electron
runtime-storage contract. Managed runtimes belong under `userData`, outside both
the portable extraction and NSIS install root. The default Windows profile path
for each form remains **not independently verified** because package launches
were deliberately isolated rather than allowed to touch a real user profile.

One NSIS launch omitted the required screenshot-target condition, so its
requested user-data override was not active and the process initialized the
current default user-data area. This was a test-setup error. The process was
stopped after the observation window; its result is excluded, and no attempt
was made to inspect, modify, or clean the user's data.

### Upgrade retention

A controlled `0.3.0 -> 0.3.1` NSIS replacement was attempted in a separate
task-owned `evidence/upgrade-app` directory while the isolated managed
yt-dlp metadata remained outside that directory. The 0.3.1 app tree was
present afterwards, but its installer process did not exit within five minutes
and was terminated. NSIS product detection also removed the earlier controlled
`nsis-installed-v031` test tree. No user installation was targeted.

This is enough to show the app replacement scope is distinct from the managed
runtime root, but it is **not** a clean automated upgrade-retention PASS. The
next release-validation run should use a disposable Windows user/profile and
assert the same `userData/runtimes/*` hashes before and after a completed NSIS
upgrade; repeat for a portable folder replacement. Until then, retention is
supported by the storage contract, not fully executable-confirmed.

## Windows executable trust

`Get-AuthenticodeSignature` observed `NotSigned` with no signer for:

| Executable | SHA-256 |
| --- | --- |
| Fresh 0.3.1 NSIS installer | `33E9B02A…2032B0FD` |
| 0.3.1 installed `Ameow.exe` | `C5F0DC9F…ACFA9374` |
| Packaged bundled `python.exe` | `D2EC5B94…FDAA21A1` |
| Isolated materialized `yt-dlp.exe` | `E0BFBF43…CD968934` |

This is not a technical blocker to P2-A's bundled-wheel/materialized-venv
foundation: the current app and bundled Python already establish an unsigned
baseline, and materializing the current venv succeeds on this host. It is a
release/trust-hardening gate: a future promise of Authenticode reputation or
downloaded-runtime publisher trust needs an explicit signing policy and real
release validation. It must not be implied by the existing size/SHA checks.

## Active-attempt identity and Windows replacement semantics

An isolated PE test copied `C:\\Windows\\System32\\cmd.exe` to the task
directory, ran it for roughly 15 seconds, and attempted
`[System.IO.File]::Move(replacement, running, $true)`:

```text
while running: Access to the path is denied
after exit:    success
```

The current bootstrap's `replaceFile()` first tries unlink/rename, then
copy/unlink fallback. Windows therefore rejects normal same-path replacement
of an executing image, but that lock alone is insufficient: yt-dlp can spawn
FFmpeg or Deno later in an already-started attempt.

Mutable shared `real/` paths can preserve attempt identity **without
digest-addressed storage** only with a lifecycle/replacement gate that:

1. selects one complete dependency set before the attempt starts;
2. blocks every bootstrap, repair, and replacement of all selected runtime
   paths until the yt-dlp process tree has settled; and
3. only then permits replacement and makes the replacement visible to a new
   attempt.

The current per-component bootstrap promises do not provide that gate. P2-A
needs it. Digest-addressed dependency storage is not required by observed
Windows file semantics if this full-set gate is implemented and tested; it
becomes necessary only if the project cannot make selection and replacement
mutually exclusive for the whole attempt lifetime.

## Proposed verdict inputs for Lead

**Windows input: `REPAIR REQUIRED`.** Do not interpret this as Architecture
PASS.

Required before treating the Windows half as ready for P2-A:

1. Reconcile the stale proxy-front specification with the observed `real/`
   contract, then exercise the resulting current package.
2. Repair managed Deno discovery for the actual yt-dlp child (either make its
   directory available to the child or use a tested explicit runtime path),
   and prove an EJS/Deno-assisted YouTube invocation.
3. Add the complete attempt-set lifecycle/replacement gate and its
   process-tree-settlement tests.
4. Restore a reproducible fresh Windows package path: the current source
   package preflight cannot acquire its declared bundled Python asset here.
5. Complete a disposable-profile NSIS and portable upgrade retention test;
   do not convert the current storage inference into a release claim.

Authenticode is a later release/trust hardening gate, not by itself a P2-A
foundation blocker. The failed FFmpeg/Deno asset bootstrap and the lack of a
current packaged P1 Diagnostics UI remain explicit executable-validation gaps.

## Generated artifacts

- `dist-release/Ameow_0.3.1_windows_x64_installer.exe` and `.blockmap`
  (ignored local package output).
- Task-owned isolated startup, managed yt-dlp venv, portable startup, NSIS,
  upgrade, and PE-replacement evidence under
  `.trellis/tasks/08-25-managed-ytdlp-p2v-evidence-gates/evidence/`.
- No production source, specification, configuration, updater, activation,
  rollback, garbage-collection, or fallback capability was edited.
