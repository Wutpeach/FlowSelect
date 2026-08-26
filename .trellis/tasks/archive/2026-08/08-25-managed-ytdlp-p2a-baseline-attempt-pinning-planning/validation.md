# P2-A implementation validation

## Scope and verdict input

“本阶段只建立 bundled known-good baseline 与 attempt-scoped runtime binding，不提供 backend 更新能力。”

**Verdict input: BLOCKED BY EXTERNAL ENVIRONMENT.** The P2-A source contract, offline materialization, attempt binding, focused regressions, source baseline verifier, type-check, lint, and full build pass. Fresh Windows package construction is still blocked before app assembly by a reproducible host `EPERM` during Electron extraction; therefore no fresh packaged-resource, installed/portable persistence, live EJS challenge, or macOS release proof is claimed. This is not Architecture PASS.

No P2-B updater, release discovery, managed candidate, persisted selection, staging, activation, rollback, GC, automatic fallback, Repair Center, or digest-addressed storage was added.

## Implemented contract

- Canonical packaged source is `desktop-assets/binaries/ytdlp-baseline/` with exactly `.official-ytdlp-baseline.json`, `yt_dlp-2026.7.4-py3-none-any.whl`, and `yt_dlp_ejs-0.8.0-py3-none-any.whl`. `.gitignore` now deliberately exposes this immutable source payload.
- `electron/managedPythonPackageManifest.mts` remains the sole pin author. `scripts/prepare-ytdlp-baseline.mjs` derives and verifies the generated manifest and exact wheel set; `scripts/run-electron-package.mjs` invokes it before packaging and invokes `scripts/verify-ytdlp-baseline-package.mjs` after successful app assembly.
- `electron/ytDlpBaseline.mts` verifies canonical hashes, builds the baseline cache offline with hash-locked pip, writes `baseline.json` only after verification, and constructs the complete bundled attempt identity. It records actual PEP 440 installed version `2026.7.4` while retaining the canonical package pin/version `2026.07.04` in the manifest and `runtimeSetId` content facts.
- A Windows runtime validation exposed that directory rename is not required by the design and is host-EPERM-prone. The final implementation copies the verified staging venv into the replaceable cache and writes the readiness marker last; a failed copy leaves no readiness marker and is rebuilt on the next mutation.
- The existing target-scoped lifecycle coordinator supplies the binding lease. Production composition no longer supplies yt-dlp execution paths; `buildAttemptContext` / advanced-quality probing receive the attempt binding, the adapter uses its binaries, and runner settlement releases the lease. Internal runner retry reuses the same context; the existing auth-recovery new attempt resolves another binding.
- Runtime status/gate now treats yt-dlp as bundled baseline cache. Diagnostics observes canonical/cache/selection, active lease count, and sanitized recent `{ runtimeCandidate, runtimeSetId }` facts only; it does not create or repair anything.
- Relevant backend specs and generated template now describe the immutable baseline, explicit managed Deno, no remote EJS/plugin/machine fallback, and attempt binding.

## Canonical source evidence

`npm run runtime:verify:ytdlp-baseline` passed after reading the generated set:

| Asset | Bytes | SHA-256 |
|---|---:|---|
| `yt_dlp-2026.7.4-py3-none-any.whl` | 3,184,705 | `f11f2b11d5a8ac4059f9bdf29fa4407dc7c6bb00c5097e95ca22a7a9db518266` |
| `yt_dlp_ejs-0.8.0-py3-none-any.whl` | 53,443 | `79300e5fca7f937a1eeede11f0456862c1b41107ce1d726871e0207424f4bdb4` |

The generated manifest has package set `yt-dlp==2026.07.04;yt-dlp-ejs==0.8.0`, explicit Deno policy, disabled plugins/remote components, and the canonical manifest digest `b74cd32c1d9f1e3beaa3bde0d420e45383a8c548ed8cb0eacecdcdf6b23607c8`.

## Isolated Windows offline cache evidence

Task-owned path (not default Electron data):

```text
.trellis/tasks/08-25-managed-ytdlp-p2a-baseline-attempt-pinning-planning/evidence/runtime-userdata-repair-2/
```

Command imported the compiled Electron module and called `ensureBundledYtDlpBaselineReady(...)` with:

```text
configDir=<task-owned path>
platform=win32 arch=x64
baselineRoot=D:/Ameow/desktop-assets/binaries/ytdlp-baseline
bundledPythonPath=D:/Ameow/desktop-assets/binaries/python-x86_64-pc-windows-msvc/python.exe
```

Observed activity was only `checking`, `installing`, then `verifying`; materialization completed at the app-owned cache entrypoint. The committed `baseline.json` records bundled Python `3.11.15`, probe `2026.07.04`, and installed package versions `{ "yt-dlp": "2026.7.4", "yt-dlp-ejs": "0.8.0" }`. Materialized `yt-dlp.exe` SHA-256 is `86DDE6D93D567AF2480374FE43CE4A7BF65974241463830AA5571BC81373DBFF`.

A second call returned the same entrypoint with `activity: []`; read-only inspection reported verified canonical manifest, `materialized: true`, `identityMatches: true`, and `selection: "bundled"`. No runtime network acquisition occurred.

## Automated validation

Passed:

- `npx vitest run electron/ytDlpBaseline.test.mts electron/diagnostics.test.mts electron/runtimeDependencyGate.test.mts electron/runtimeSetLifecycle.test.mts src/electron-runtime/runtimePaths.test.ts src/electron-runtime/service.test.ts src/electron-runtime/engineAdapters.test.ts src/electron-runtime/ytDlpCommandPlan.test.ts src/electron-runtime/ytDlpDownload.test.ts src/electron-runtime/ytDlpMetadata.test.ts` — 34 files, 669 tests.
- `npm run type-check`
- `npm run lint`
- `npm run build`
- `npm run runtime:verify:ytdlp-baseline`
- owned-file `git diff --check`

Focused coverage includes canonical corruption, absent marker rebuild, offline `pip` arguments and no fetch, pure baseline inspection, bundled status/gate facts, dynamic adapter paths, binding release after settlement, advanced probe binding, auth-recovery re-resolution, lifecycle mixed consumers, and mutation blocking.

## 2026-08-26 targeted acceptance follow-up

- `baseline.json` is now only verification metadata: an apparently current cache is reused only after its materialized `yt-dlp --version` probe and Python `importlib.metadata` package query match the canonical probe and exact `yt-dlp`/`yt-dlp-ejs` versions. `ensureBundledYtDlpBaselineReady(...)` rebuilds a failed cache through the existing offline preparation path; `createBundledYtDlpRuntimeBinding(...)` fails closed before any binding or execution. This does not add cache-tree hashing, a second authority, or Diagnostics mutation.
- `YtDlpBaselineOptions` no longer carries `fetch`; the shared FFmpeg/Deno path helpers now accept only their actual path inputs. The baseline remains offline-only.
- `scripts/verify-ytdlp-baseline-package.mjs` now rejects packaged artifacts unless their complete manifest matches the compiled pin source: schema/layout, `packageSetId`, ordered pins, `minPython`, ordered target set, execution policy, probe, exact filenames, sizes, and SHA-256 values.

Passed without a package rebuild or network/runtime installation:

- `npx vitest run electron/ytDlpBaseline.test.mts scripts/verify-ytdlp-baseline-package.test.mts` — 2 files, 6 tests. Regressions cover partial marker-backed cache rebuild, corrupt entrypoint/package-state rebuild, corrupt-cache binding rejection, and packaged `minPython`, target-set, and probe contract drift.
- `npm run type-check`
- `npm run lint`
- `npm run runtime:verify:ytdlp-baseline`
- `node --check scripts/verify-ytdlp-baseline-package.mjs`
- In-scope `git diff --check` (including the untracked baseline module/tests and package-verifier test)

**Verdict remains: BLOCKED BY EXTERNAL ENVIRONMENT.** This follow-up found and repaired source-level acceptance gaps but did not re-run the retained clean-host packaging, default-userData, portable replacement, live EJS, or macOS release gates.

## Fresh package result and retained gates

Both of these stopped before fresh app assembly at the identical Electron Builder extraction operation:

1. `npm run package:win:dir`:
   `EPERM: rename D:\Ameow\dist-release\win-unpacked.tmp -> ...\win-unpacked`.
2. Fresh task-owned output:
   `node .\node_modules\electron-builder\cli.js --config .\electron-builder.config.mjs --win --x64 --dir --publish never -c.directories.output=D:\Ameow\.trellis\tasks\08-25-managed-ytdlp-p2a-baseline-attempt-pinning-planning\evidence\package-win-clean`
   stopped at the same `win-unpacked.tmp -> win-unpacked` `EPERM` inside that fresh output.

Before the first failure, bundled Python verification, baseline source verification, renderer build, and Electron TypeScript build all completed. No package artifact was reconstructed from prior spike output, and the partially extracted task/default staging trees were preserved.

Therefore these remain external/not verified: fresh Windows packaged resource inclusion, NSIS/portable install persistence and replacement retention, default Windows userData behavior, live EJS challenge, and all retained macOS arm64 quarantine/offline/Gatekeeper checks.
