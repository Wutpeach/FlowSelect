# P2-V Evidence Gates: Repository / macOS / Package-Set / Authenticity / Identity-Stability

> Task: `08-25-managed-ytdlp-p2v-evidence-gates`. Scope: close the repository, upstream, macOS-trust, yt-dlp package-set, authenticity-policy and dependency-identity-stability evidence gates for P2-A **without implementing anything**. Research/validation only — no code, spec, packaging config or runtime was mutated.
>
> Evidence tiers:
> - **[REPO-CONFIRMED]** — verified in the current working tree (file:line) or in the live userData runtime on this machine.
> - **[UPSTREAM-CONFIRMED]** — verified against authoritative upstream sources over HTTPS (URL + retrieval time given).
> - **[NOT VERIFIED (real host)]** — requires a real macOS/end-user host result; inference is labeled, never substituted.
> - **[RECOMMENDATION]** — decision input for the Lead (not an Architecture PASS).
>
> Tooling note: shell execution is unavailable in this session; searches used repository grep/read tools (the `fff` MCP tools are not installed in this workspace — fallback per project instructions). Upstream facts were fetched live via HTTPS at 2026-08-25 (amendment re-fetch); URLs/timestamps cited inline. Working-tree state validated by file reads only.

---

## 1. macOS execution chain: wheel / venv / bundled Python (current working tree)

### 1.1 Layout and path derivation — [REPO-CONFIRMED]

| Concern | Evidence |
|---|---|
| Bundled Python root resolution | `resolveBundledPythonRootCandidates` tries `repoRoot/desktop-assets/binaries/python-<target>`, then `resourceDir/binaries/...`, `resourceDir/app/desktop-assets/binaries/...`, `executableDir/binaries/...` (`src/electron-runtime/runtimePaths.ts:25-50`); `resolveBundledPythonRuntime` picks the first existing root (`:52-69`). Packaged wiring asserted by script: `resourceDir = app.isPackaged ? process.resourcesPath : null` (`scripts/verify-macos-python-runtime-package.mjs`, `hasPackagedResourceDirWiring`). |
| Python executable name | `bin/python3` on darwin (`platform.ts:39` `pythonBinaryNameFor`; manifest `executableRelativePath: "bin/python3"`, `desktop-assets/binaries/.official-python-runtimes.json`). |
| Managed yt-dlp paths | `<configDir>/runtimes/yt-dlp/<target>/venv/bin/{python,yt-dlp}` + `metadata.json` (`electron/managedRuntimeBootstrap.mts:170-181`, `runtimePaths.ts:180-205`; `configDir` = userData, `main.mts:265-280`). |
| venv creation | `python -m venv <venvDir>` — **no `--copies`, no `--symlinks`, no `--clear`** (`managedRuntimeBootstrap.mts:372-376`, called at `:918`). CPython venv defaults: symlinks on POSIX / copies on Windows (upstream CPython docs, `https://docs.python.org/3/library/venv.html`); POSIX default not re-verified on a mac host (see §2). |
| Entrypoint | pip console script `bin/yt-dlp` (shebang = venv `bin/python`), produced by the pip install below. |
| Permissions | `chmod(entrypoint, 0o755)` + `chmod(python, 0o755)` on **non-win32** after install (`managedRuntimeBootstrap.mts:957-961`); deno/ffmpeg temp files `chmod 0o755` before `replaceFile` (`:1040-1050`, `:1101-1123`); zip extraction on darwin via `/usr/bin/ditto -x -k` (`:585-591`, ditto preserves zip permissions). Confirmed on this Windows machine: `venv\Scripts\python.exe` + `yt-dlp.exe` exist (live userData, §3.1). |

### 1.2 In-place mutability / rebuild / relocation — [REPO-CONFIRMED]

- **yt-dlp venv is rebuilt destructively in place**: `cleanupManagedPythonRuntimeRoot(root)` → `python -m venv` → `pip install --upgrade --disable-pip-version-check --no-cache-dir yt-dlp==2026.07.04` (`managedRuntimeBootstrap.mts:917-954`); metadata written after (`:968-988`) with `layoutVersion`, `packageVersion`, `packageSource`, `entrypoint`, `pythonVersion`, `pythonPath`, `bundledPythonPath`, `bundledPythonVersion`, `runtimeTarget`, timestamps, and the probed `version` (`yt-dlp --version` output, `:969`).
- **Rebuild triggers** (`shouldRebuildManagedPythonRuntime`, `:447-500`): entrypoint missing; metadata missing; `layoutVersion !== 1`; `packageSource !== spec.installSource`; `packageVersion !== spec.packageVersion`; `bundledPythonVersion` changed; `bundledPythonPath` changed; `staleDirectories` present. **No content hash of the installed venv is recorded** — identity today = pin/version metadata only.
- **Relocation behavior**: `bundledPythonPath` is metadata + rebuild trigger, so moving the app/bundled python root ⇒ mismatch ⇒ **full rebuild via network pip**. The macOS verifier proves the mechanism (not end-user UX): `smokePackagedDownloaderRelocationRebuild` copies the packaged python root, re-ensures with the moved path, asserts `metadata.bundledPythonPath` changed and entrypoints exist (`scripts/verify-macos-python-runtime-package.mjs` relocation section). It rebuilds at the new location; it does not reuse an old venv.
- **Deno/ffmpeg are mutable singletons** at `<configDir>/runtimes/{deno,ffmpeg}/<target>/(real/)?<binary>` (`managedRuntimeBootstrap.mts:145-158`; `runtimePaths.ts:137-158`; darwin has no `real/` subdir). Install = temp extract → `copyFile` → `chmod` → `replaceFile` (`:1006-1052`, `:1069-1123`); `replaceFile` = unlink → rename, fallback copyFile (`:738-746`). **No lock, no reference count, no versioned directory.**

### 1.3 Package signing / notarization / quarantine — [REPO-CONFIRMED, with real-host NOT VERIFIED parts]

- **App is unsigned and not notarized by design**: `mac.identity: null`, `hardenedRuntime: false`, `gatekeeperAssess: false` (`electron-builder.config.mjs:83-85`); `CSC_IDENTITY_AUTO_DISCOVERY: "false"` (`.github/workflows/release.yml:9`); release notes + docs: "The macOS DMG is an unsigned open-source build…" (`docs/releases/index.md:112`; `docs/troubleshooting/macos-first-run.md:6`).
- **Gatekeeper handling is docs-only**: install guide gives `xattr -dr com.apple.quarantine "/Applications/Ameow.app"` + right-click-Open / Privacy-&-Security flows (`distribution/macos/install-guide.txt`; `docs/troubleshooting/macos-first-run.md`). **No repo code touches `com.apple.quarantine` or xattrs** [REPO-CONFIRMED by absence in `electron/`, `src/`, `scripts/`].
- **[NOT VERIFIED (real host)]**: whether the download-time quarantine attribute propagates to nested managed binaries / the runtime-created venv, and whether end-user first launch with runtime-created child processes (python/deno/ffmpeg) can surface additional prompts beyond the documented app flow.
- **Trust-boundary conclusion**: wheel/venv materialization does **not** create a new trust boundary. All artifacts (bundled python, downloaded deno/ffmpeg, pip-installed yt-dlp, future baseline wheel) are produced/owned by the same unsigned app process; nothing is individually signed. The boundary is the app, unchanged. The one genuine *weakening* today is that yt-dlp content is fetched from PyPI at runtime with only a version pin (§3); P2-A replacing that with an app-owned pinned wheel is a strengthening, not a new boundary.

### 1.4 arm64 release truth and the x64 question — [REPO-CONFIRMED]

- Release matrix = **macOS arm64 only**: `matrix.include: runner macos-15 / arch aarch64 / artifact_arch arm64` (`.github/workflows/release.yml:73-80`); artifacts `Ameow_*_macos_arm64.*` (`:122-124`, `:133-139`).
- Docs: macOS row = `Ameow_<version>_macos_arm64_installer.dmg` = "M 系列 Mac"/"M-series Mac"; "The current macOS build targets Apple Silicon, meaning M-series Macs" (`docs/downloads.mdx:22,58`; `en/docs/downloads.mdx:22,58`; `docs/faq.mdx:16`).
- Release notes explicitly dropped Intel: "macOS 只发布 arm64 安装包与 ZIP，不再产出 Intel 安装包" (`docs/releases/index.md:290`); "macOS 仅发布 Apple Silicon 安装包" (`:284`).
- **x64 is NOT promised**: no x64 artifacts, matrix or docs. x64 *specs* exist for dev/other-host support only — python `x86_64-apple-darwin` (`desktop-assets/binaries/.official-python-runtimes.json`), deno `x86_64-apple-darwin` (`managedRuntimeBootstrap.mts:829-842`), ffmpeg `x86_64-apple-darwin` (`:875-887`), `resolveRuntimeTarget("darwin","x64")` (`platform.ts:20-23`), verifier `normalizeArch` x64 path (`scripts/verify-macos-python-runtime-package.mjs`). Conclusion: **x64 = dev/unofficial; the release contract is arm64-only**, so x64 host validation is **not** a release gate.

---

## 2. Facts needing a real macOS host: release gates vs P2-A blockers

### 2.1 Real-host facts (all are **release gates**, not P2-A implementation gates)

1. End-user Gatekeeper/quarantine behavior for the unsigned app + runtime-created child executables — [NOT VERIFIED (real host)]; documented assumption only.
2. `python -m venv` default symlink layout actually produced/executable on a clean arm64 macOS, plus relocation rebuild with *offline* sources (P2-A extension of the existing verifier).
3. Packaged `python-<target>/bin/python3 --version`, `import sqlite3, ssl`, venv creation, downloader bootstrap — **already enforced on a real arm64 host at release**: `release.yml:127` runs `npm run runtime:verify:macos-package -- <arch> require-execution require-downloader-bootstrap require-relocation-rebuild` on `macos-15` (aarch64), uploading the JSON result as an artifact ([REPO-CONFIRMED] the pipeline step; a specific run's *pass* record is in CI artifacts, not in the repo → last-run state [NOT VERIFIED in repo], but the enforcement mechanism is confirmed and blocks release on failure).
4. Gatekeeper behavior with a P2-A offline-materialized baseline venv (same class as #2; must be added to the verifier).

### 2.2 What does NOT block P2-A baseline implementation

- The macOS chain blocks nothing about writing P2-A baseline code (packaging patterns, manifest, offline materialization, verifier extensions, tests) — it uses the same abstractions already exercised by `smokePackagedDownloaderBootstrap` / `smokePackagedDownloaderRelocationRebuild` and the release pipeline.
- The existing pipeline already hard-gates mac host validation at release; P2-A only has to extend `verify-macos-python-runtime-package.mjs` with offline-baseline checks and keep the `require-*` flags. Honest verdict: mac real-host validation = **release gate with an existing enforcement mechanism; a P2-A host gate (offline baseline on arm64) must be ADDED to that mechanism and is only fully closed at the first release that runs it**.

---

## 3. Actual yt-dlp package/runtime set used by Ameow

### 3.1 Installed set — [REPO-CONFIRMED + live-runtime evidence on this machine]

- **Manifest pin**: `ytDlp.installSource = "yt-dlp==2026.07.04"`, **no extras** (`electron/managedPythonPackageManifest.mts:21-28`); pip cmd = `--upgrade --disable-pip-version-check --no-cache-dir` + that install source (`managedRuntimeBootstrap.mts:945-954`).
- **Live userData metadata** (`C:\Users\Administrator\AppData\Roaming\Ameow\runtimes\yt-dlp\x86_64-pc-windows-msvc\metadata.json`): `packageVersion: "2026.07.04"`, `packageSource: "yt-dlp==2026.07.04"`, `layoutVersion: 1`, `version: "2026.07.04"`, `entrypoint: ...\\venv\\Scripts\\yt-dlp.exe`, `pythonPath: ...\\venv\\Scripts\\python.exe`, `bundledPythonVersion: "3.11.9"`, `bundledPythonPath: ...\\python-3.11.9`, `runtimeTarget: "x86_64-pc-windows-msvc"`, `createdAtMs/updatedAtMs`. (`ytdlp-latest.json` under userData root is an orphan artifact with no writer in the repo — no code reads/writes it; not relevant.)
- **Installed pip set [live]**: `venv\Scripts` contains `yt-dlp.exe` + `python.exe` only (pip `--upgrade` with `--no-deps` not passed, but yt-dlp's base dist requires nothing). PyPI JSON for 2026.07.04 ([UPSTREAM-CONFIRMED], `https://pypi.org/pypi/yt-dlp/2026.7.4/json`): every `requires_dist` entry is extra-conditional ⇒ base deps **empty**; `requires_python >=3.10`; `provides_extra = [default, pin, deno, curl-cffi, pin-curl-cffi, pin-deno, pin-secretstorage, secretstorage]`; wheel `yt_dlp-2026.7.4-py3-none-any.whl` (3,184,705 B; sha256 `f11f2b11d5a8ac4059f9bdf29fa4407dc7c6bb00c5097e95ca22a7a9db518266`; `has_sig: false`); sdist sha256 `b094813404f87a9dd2186f00815231df32e5fd8a5403be0f807b3bb2d21a4432` (`has_sig: false`). **Installed set = yt_dlp only; no yt-dlp-ejs, no requests/certifi** (extras not requested).

### 3.2 Embedded JS solver (ejs) is NOT installed — [REPO-CONFIRMED + UPSTREAM-CONFIRMED]

- Only YouTube enables EJS: `youtube:player_js_variant=tv` + `--remote-components` (`engineManifest.ts:196-200`; YouTube is the only site with these args).
- Upstream ([UPSTREAM-CONFIRMED], `https://pypi.org/pypi/yt-dlp-ejs/0.8.0/json`, retrieved 2026-08-25): yt-dlp-ejs **0.8.0** wheel 1,325,968 B, `requires_python >=3.10`, base deps empty, `has_sig: false`; it **bundles meriyah + astring** JS inside the wheel ⇒ self-contained, no JS download needed for the solver itself. yt-dlp `default` extra pins `yt-dlp-ejs>=0.8.0` (PyPI metadata).
- **Current runtime behavior**: since ejs is absent, yt-dlp treats it as a *remote component* and fetches `yt_dlp_ejs` from **GitHub** on demand (when the extractor requires it). This is the only place where yt-dlp performs a runtime network fetch besides the video sites themselves, and the fetched JS is **executed by the JS runtime** — a remote-code-execution surface that exists today (opt-in per site config).

### 3.3 JS runtime discovery — [REPO-CONFIRMED defect]

- Managed deno is downloaded to `<configDir>/runtimes/deno/<target>/real/deno(.exe)` (`managedRuntimeBootstrap.mts:145-149`, `:1006-1052`).
- **Managed deno is NEVER placed on the child PATH**: `ytDlpDownload.ts:301-303` prepends only `dirname(binaries.ffmpeg)` to PATH; deno is not included (same in `advancedQualityProbe.ts`).
- `--js-runtimes deno` is passed **bare** (no path) (`ytDlpCommandPlan.ts:53-56`); upstream option semantics `RUNTIME[:PATH]` with PATH optional (README `#release-files`/options; bare names resolved from the environment) — implementation detail of path resolution [NOT VERIFIED in source], but the effective fact is repository-provable: **the value used is machine-dependent** (whatever `deno`/`node` the user's PATH finds), **not the app-owned managed deno**. `hasDeno` only *gates* whether `--js-runtimes` is enabled at all (`ytDlpDownload.ts:253`); from upstream docs, `--js-runtimes` also enables `node` as fallback (deno → node → quickjs → bun priority per README), so a machine with `node` but no `deno` still uses a non-app-owned runtime.

### 3.4 Self-update and config isolation — [REPO-CONFIRMED]

- No `-U/--update/--no-update` in any command plan; base args `--newline --no-warnings`, `configIsolationArgs: ["--ignore-config"]` (`engineManifest.ts:182-187`). Upstream defaults to `--no-update` (README `#release-files`: `--update` / `--update-to` only apply to standalone binaries; pip users “simply re-run the same command that was used to install”). So no self-update path exists, and `--ignore-config` blocks a user `yt-dlp.conf` from injecting `-U`/`--js-runtimes`/`--proxy`.
- **Not yet isolated**: `--no-plugin-dirs` is **not** passed. Upstream loads user plugins from standard config/plugin dirs and explicitly documents that plugin code is executed with no checks (README “there are no checks performed on plugin code”; plugins are run with the same permissions as yt-dlp). A user plugin directory is therefore outside app identity control today — relevant for baseline determinism (see §4/§5).
- Runtime-created child env: proxies are scrubbed by the network-application wrapper (`engineNetworkAdapters` scrub route + ambient proxy keys) before the child starts (network app path used by `ytDlpDownload`/`advancedQualityProbe`), so the download subprocess does not inherit ambient proxy env; the same scrubbing is applied to the pip install (`buildManagedPythonEnv` options).

### 3.5 Network fetches at yt-dlp runtime — inventory

| When | What | Today | Offline-baseline goal |
|---|---|---|---|
| Video download | the target site(s) | inherent | inherent (unchanged) |
| YouTube only, when ejs required/missing | `--remote-components ejs:github` fetch (GitHub JS) then **local JS execution** | enabled (`engineManifest.ts:197-201`) | eliminate the fetch; run solver from bundled ejs wheel; still local JS execution (inherent to EJS) |
| Startup | update check | default off (no `-U`, `--ignore-config`) | unchanged |
| Materialization | `pip install` from PyPI, unpinned transitively, over network | current | **eliminate**: `--no-index --find-links <app resources> --require-hashes` |
| Probes | `--version` only | local | unchanged |

### 3.6 Fully-offline baseline — feasibility conclusion

- **Feasible — [UPSTREAM-CONFIRMED]** components: yt-dlp base has zero required deps; yt-dlp-ejs wheel is self-contained (meriyah+astring bundled, zero deps, `requires_python >=3.10`); a JS runtime needs only a local binary (managed deno path passed as `deno:<path>`); `--no-remote-components` (or simply not enabling `ejs:github`) prevents any component fetch; `--ignore-config` already blocks conf-driven network/update args. Required additions: `--no-plugin-dirs` for full determinism, pinned ejs wheel in the baseline, and a JS-runtime policy (either always pass the managed deno path — cross-platform, one binary — or explicitly pin `deno`/`node` discovery).
- **Not yet in repo** — [REPO-CONFIRMED by absence]: no `--no-index`, `--find-links`, `--require-hashes`, `--only-binary`, or hash-file usage anywhere in `src/`, `electron/`, `scripts/` (searched). Today's materialization is a plain network `pip install --upgrade` of a bare version pin; **nothing verifies the wheel bytes or transitives**.
- Therefore: P2-A's “offline immutable baseline with app-owned pinned wheels” is a **new capability** (manifest + verify + materialize), not a re-wiring of an existing offline path. The baseline should remain a **cache** derived from **immutable bundled artifacts** (repo-owned `.json` manifest + wheels inside the app resources, verified at bundle/CI time), materialized on demand and rebuilt offline — and it must include `yt-dlp-ejs` + the JS-runtime policy to be genuinely offline-capable (else `--remote-components` still fetches at runtime).

---

## 4. Minimum Ameow-owned approved manifest + responsibility boundary

### 4.1 Minimal manifest fields (P2-A baseline scope)

```jsonc
{
  "schemaVersion": 1,
  "baseline": {                       // immutable, app-release-owned
    "tools": [
      { "name": "yt-dlp", "version": "2026.07.04", "wheel": "yt_dlp-2026.7.4-py3-none-any.whl",
        "sha256": "f11f2b11...266", "size": 3184705 },
      { "name": "yt-dlp-ejs", "version": "0.8.0", "wheel": "...” }
    ],
    "python": { "target": "<resolveRuntimeTarget()>", "version": "<bundled>", "executableRelativePath": "bin/python3" },
    "jsRuntime": { "provider": "managedDeno", "pathArgs": ["deno:<managed path>"] },
    "flags": { "remoteComponents": "off", "pluginDirs": "off" },
    "install": { "onlyBinary": true, "noDeps": true, "hashes": true, "index": "offline-app-resources" }
  },
  "probe": { "command": ["--version"], "requiredPrefix": "2026.07.04" }
}
```

(Below is a decision input, not a spec — the develop worker will own exact schema/module placement.)

### 4.2 Responsibility boundary (who owns which guarantee)

| Guarantee | Owner | Mechanism |
|---|---|---|
| Manifest content correctness (versions, hashes) | **App release process** (repo-owned, code-reviewed; same authority as `.official-python-runtimes.json`) | manifest committed with wheels; CI verifies wheel sha256/size against `files.pythonhosted.org` at bundle time |
| Wheel download for **baseline** | **No runtime download** — wheels are packaged inside app resources | `extraResources`/`files` in `electron-builder.config.mjs` (extended `packagedBinaryPatterns`, `:29-37`); no fetch at runtime for baseline |
| Online update path (P2-B/C) | Managed-downloader update pipeline (separate P2 story; NOT `pip` at runtime) | host allowlist `pypi.org`/`files.pythonhosted.org` + redirect check, sha256 from manifest; downloads are **verification+stage only**, never activate |
| Python/target compatibility | `resolveRuntimeTarget()` + existing `pythonVersionSatisfiesManagedPackage` assert (`managedRuntimeBootstrap.mts:390-405`) — supports **≥3.10** (yt-dlp upstream `requires_python` [UPSTREAM-CONFIRMED]) | assert at materialization; per-target manifest record |
| Integrity at materialization | verifier script (`scripts/verify-macos-python-runtime-package.mjs` extended) + CI | `--only-binary=:all: --require-hashes --no-deps --no-index --find-links <resources>` |
| Probe evidence | same as today: `readCommandVersion(target)` outcome stored in `metadata.json` (`:969`) | `--version` output prefix match |
| Downgrade policy | activation layer (P2-B) — baseline is never “downgraded”; update only selects ≥ currently-selected version | selection pin rules; explicit downgrade command (P2-C) |

Note: the above deliberately **reuses** the existing download-authority ownership (`AmeowElectronDownloadRuntime`) and does not add a second downloader service/registry — it only adds an offline materialization path for the baseline and (later) a verify-then-stage update path within the same module. No runtime fetching for baseline means the baseline cannot pull anything: the “authenticity policy” for baseline is **repository authorship + bundle-time verification + storage immutability**, not network trust.

---

## 5. Authenticity / PGP / signature trust facts

### 5.1 Facts — [UPSTREAM-CONFIRMED] (fetched 2026-08-25)

- PyPI: yt-dlp 2026.7.4 wheel + sdist **`has_sig: false`** (no `.asc` on PyPI); yt-dlp-ejs 0.8.0 wheel `has_sig: false`. `ownership.organization: "yt-dlp"` on the PyPI project (`https://pypi.org/pypi/yt-dlp/2026.7.4/json`).
- GitHub release `2026.07.04` (`https://api.github.com/repos/yt-dlp/yt-dlp/releases/tags/2026.07.04`, `id 349050911`, `published_at 2026-07-04T22:41:44Z`, immutable) assets include `SHA2-256SUMS` (GNU-style sums), `SHA2-256SUMS.sig` (GPG signature, `application/pgp-signature`, 566 B) and `SHA2-512SUMS(.sig)` — for the **standalone binaries** (`yt-dlp.exe`, `yt-dlp_macos`, zips), not for wheels/sdist.
- Verification recipe (README `#release-files`): `curl -L https://github.com/yt-dlp/yt-dlp/raw/master/public.key | gpg --import` then `gpg --verify SHA2-256SUMS.sig SHA2-256SUMS`.
- **PGP trust-root status — [NOT VERIFIED / not an established chain]**: the published signing key has UID `Simon Sawicki (yt-dlp signing key) <contact@grub4k.xyz>` and is published **in the same repository/channel** as assets+sigs (`https://github.com/yt-dlp/yt-dlp/blob/master/public.key`), with **no published key fingerprint**, no rotation/retirement statement, no out-of-band anchor. The documented recipe is therefore trust-on-first-use of `github.com` itself: a compromised repo/account would replace key + sums + sig + assets together. `.sig` presence must **not** be treated as an established verification chain. (Whether the published `.sig` actually verifies under `public.key` was NOT run — `gpg` unavailable; presence/type/size and recipe were verified only.)

### 5.2 Conclusion for the authenticity policy

- **[RECOMMENDATION]** Python-wheel format remains the right choice: PyPI JSON digests + app-owned manifest pinning + bundle-time/CI verification of length+sha256 (vs mirror `files.pythonhosted.org`) is the strongest *practical* anchor available, **without** depending on the GitHub PGP chain. PGP is unnecessary here and its trust root is not independently verifiable; do **not** add `.sig` verification as a requirement for the wheel path.
- If a standalone-binary update format is ever chosen (P2-B+), PGP must be revisited: Ameow would have to pin a key identity from an **independent** channel (out-of-band fingerprint) — an explicit future decision, **not** part of a P2-A gate. (Mark [NOT VERIFIED]: per-arch coverage of the single published `yt-dlp_macos` asset — one universal macOS binary in the release; per-arch validation not verifiable.)
- Manifest records should cite source URLs (PyPI JSON + files.pythonhosted.org mirror) and retrieval notes, mirroring the P2-R report §10.5 provenance block.

---

## 6. Dependency-identity stability (yt-dlp + every exec-time dependency)

### 6.1 Current mechanism — [REPO-CONFIRMED]

- **Composition is static at app start**: `main.mts:1385-1386` `new YtDlpEngineAdapter({ binaries: resolveYtDlpRuntimeDependencies(environment) })`; adapter splices `{binaries}` into every invocation (`ytDlpEngineAdapter.ts:36-43`). Per-task, shared media tools are passed once (`service.ts:1403` `resolveSharedMediaToolsRuntime`); advanced-quality probe gets its own toolset per probe call (`service.ts:851-852` / `advancedQualityProbe.ts`).
- **Per-attempt readiness**: `buildAttemptContext` (`service.ts:1514-1522`) awaits `ensureEngineRuntimeReady` (idempotent, returns early if metadata+entrypoint exist and rebuild triggers are clean) before `engine.execute`; the same guard runs for the probe path (`:851-852`). Orchestrator ladder calls `buildContext` before `engine.execute` (`download-orchestrator.ts:104-166`).
- **Singletons**: yt-dlp venv (rebuild = rm root + venv + pip; `managedRuntimeBootstrap.mts:456-460,917-954`); deno/ffmpeg `real/<binary>` (replaceFile; `:738-746`). In-flight joins guard bootstrap concurrency only (`:122-123`, `:901-905`, `:991-996`, `:1011-1013`) — a second waiter joins the running bootstrap rather than racing it, but there is **no reference count, no lease, and no lifecycle lock** guarding mutations against active attempts.
- **Settlement semantics**: `runStreamingCommand` resolves on child `close` and drains stdout/stderr (`processRunner.ts:127-140`); `killChild` uses `taskkill /PID /T /F` on win32 and SIGTERM→SIGKILL elsewhere (`:47-101`), so by the time `engine.execute` settles, the process tree has settled.

### 6.2 Invariant required for P2-A/P2-B

> For the whole lifetime of one engine attempt (pin → execute → tree settled), the yt-dlp interpreter/entrypoint and every exec-time dependency (bundled python, ffmpeg, ffprobe, deno, JS runtime binary) must resolve to the **same bytes/paths** the attempt was pinned with.

### 6.3 Failure modes (current code)

| # | Scenario | Today's behavior | Violates invariant? |
|---|---|---|---|
| F1 | deno/ffmpeg `replaceFile` during an active attempt (repair/reinstall after partial write; `:1069-1123`,`:738-746`) | rename→unlink race: on Windows the active spawn may hold the file open and the replace fails partway (typed error surfaced to bootstrap); POSIX rename generally succeeds while the running image is unaffected. No wait/ref gate. | Yes (POSIX image-safe but path/handles can break mid-attempt; Windows may strand old binary) |
| F2 | yt-dlp venv **rm -rf + reinstall** during an active attempt (`:917-954`, e.g. `packageVersion` bump after app update, relocation rebuild) | Windows: rm of an in-use venv fails (typed error, bootstrap aborts); POSIX: rm succeeds, the running process keeps its inode; but **a second attempt starts after rm and before venv creation → spawn ENOENT**. | Yes (F2 a = mid-spawn ENOENT; F2 b = legacy venv already replaced) |
| F3 | app update triggers rebuild + user has active downloads | `will-quit` cancels all active tasks (`main.mts:3524-3535`) → new process → first attempt re-pins. Safe. | No |
| F4 | JS runtime discovery via PATH (`--js-runtimes deno` bare, `ytDlpCommandPlan.ts:53-56`; `ytDlpDownload.ts:301-303` never puts managed deno on PATH) | runtime = machine-dependent; can be swapped mid-attempt by user/dev-tooling; **not app-owned**. | **Yes — identity is uncontrolled today** |
| F5 | pip materialization during an attempt (ensure on a **stale** metadata → rebuild triggered by a concurrent task) | same as F2 without the window being deterministic | Yes |

### 6.4 Options

- **(A — minimum) Lock + reference count on the existing singletons**: a single lifecycle lock held only by **mutators** (venv rebuild, replaceFile, relocation rebuild, staged GC); each attempt acquires a **reference** immediately after its pin resolves (in `buildAttemptContext`, after `ensureEngineRuntimeReady` returns) and releases it in `finally` after `engine.execute` settles (which implies tree-settled via `runStreamingCommand`/`killChild`). Mutations with `refs > 0` are deferred (retry after) or fail-typed — never proceed under an active attempt. Refcounting must be *global* across yt-dlp/ffmpeg/deno (they can be torn together by F2-style rebuild); a single shared lock object per runtime target is sufficient. This preserves the existing static-composition architecture and keeps identity unchanged (same singletons), with **zero additional duplication** (vs 120 MB/attempt copy) and no new downloader authority.
- **(B — not required) per-digest versioned dirs for media tools/deno**: rejected previously for the generic-updater drift reasons; ALSO not required to satisfy this invariant (mutations are serialized by (A)). P2-B/C already plans digest-addressed **yt-dlp candidate** dirs; media tools should stay singletons with (A).
- **(C — informational) pin the JS runtime too**: pass `--js-runtimes deno:<managed path>` (single cross-platform binary; keep `node` fallback off for determinism) so F4 disappears; if that is deemed too restrictive, at minimum record the **discovered** runtime (name+version+path) in the pin record and accept [NOT VERIFIED] identity for the JS runtime. **Recommend: (C) yes** — it is a small, high-value change and the managed deno already exists for that purpose; without it the identity story has a hole that (A) cannot close.
- plus **config/plugin isolation** (`--no-plugin-dirs`): user plugins execute arbitrary code in-process and are outside the identity guarantee; plugins are not part of the package set. [RECOMMENDATION] add `--no-plugin-dirs` (documents a supported-plugin story later if wanted).

### 6.5 Recommendation summary

> **(A) + (C) + `--no-plugin-dirs`** = min cost, closes F1–F4, no architecture change, no second downloader. All still consistent with the P2 plan's two-tier identity (packageSetId / runtimeSetId incl. media-tool+python digests) and with the baseline being a mutable **cache** of immutable bundled artifacts. No Architecture PASS is claimed; this is a validation input to the Lead.

---

## 7. Proposed verdict inputs for the Lead

### 7.1 Evidence gates status

| Gate | Status | Note |
|---|---|---|
| Repository execution chain (macOS) | **CONFIRMED** (§1) | paths, permissions, venv, relocation triggers, unsigned-by-design, arm64-only release contract |
| macOS real-host trust | **RELEASE GATE** (not a P2-A implementation blocker) | Gatekeeper/quarantine/notarization = docs-only today (unsigned app, accepted); pipeline already hard-gates `require-execution/require-downloader-bootstrap/require-relocation-rebuild` on arm64 (`release.yml:125-127`); P2-A must extend it for offline baseline |
| x64 macOS | **NOT A GATE** | not a release target; x64 = dev specs only (§1.4) |
| yt-dlp package set | **CONFIRMED — one gap** | installed set = yt_dlp only; ejs absent → runtime GitHub fetch + local JS execution (YouTube only); managed deno **never** reachable by yt-dlp (§3.2-3.3) |
| Offline-baseline feasibility | **FEASIBLE, requires new capability** | no offline/hash-pinning code in repo today; upstream components allow it (§3.5-3.6) |
| Authenticity | **CONFIRMED — no PGP needed; trust root NOT VERIFIED** | PyPI JSON digest + app manifest pin + bundle-time verification is the anchor; `.sig` chain not an established trust chain (§5) |
| Identity stability | **CONFIRMED GAP** | F4 (uncontrolled JS runtime) is real today; F1/F2/F5 are mutation-race windows with no ref/lock (§6.3) |

### 7.2 Proposed verdict (input, not final)

> **READY FOR P2-A BASELINE with prerequisites accepted**: (1) lifecycle refcount + single mutator lock over the shared singletons (A); (2) JS-runtime policy — pass managed deno path (C) or explicitly record discovered runtime; (3) `--no-plugin-dirs` + manifest-driven `--no-remote-components` policy so the baseline is deterministic; (4) Ameow-owned baseline manifest (yt-dlp + yt-dlp-ejs wheels, sha256, source URLs) materialized **offline** from packaged resources (`--no-index --find-links --require-hashes --only-binary=:all: --no-deps`), verified again at bundle/CI time; (5) extend `verify-macos-python-runtime-package.mjs` with offline-baseline checks (release gate). macOS end-user Gatekeeper/notarization real-host results and any PGP cross-check are **explicitly NOT P2-A gates** — they remain release-hardening items already accepted by the project (unsigned DMG is documented policy).
>
> Blockers to re-raise with the Lead before P2-A: none from this evidence set for the *baseline*; the two items that would change the verdict are (a) refusal to accept refcounting of the existing singletons (then baseline must stage candidates + keep them out of `resolve*` path, which is a bigger change), and (b) refusal to pin the JS runtime (then identity has a documented uncontrolled component — still acceptable to record, but must be labeled).

---
*End of report. No production code, spec, packaging config or runtime was changed. Research-only deliverable for `08-25-managed-ytdlp-p2v-evidence-gates`; upstream evidence fetched 2026-08-25 over HTTPS; references use working-tree file:line anchors (main @ d4fe27b, working tree dirty with unrelated changes untouched).*
