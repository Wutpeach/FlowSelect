# P2 Repository-Grounded Report: Managed yt-dlp Update / Rollback

> **Lead synthesis status:** this file is the repository/upstream evidence record produced by the Orca `research` Worker. The final architecture authority for this task is `../design.md`. Where a research recommendation and the Lead synthesis differ, `design.md` governs—most notably, the final plan uses digest-addressed immutable shared dependency objects rather than mutable singleton dependency paths guarded only by references, and keeps candidate-fallback policy in the existing application/runtime orchestration boundary rather than adding it to Domain `EnginePlan`.

> Research artifact for task `08-25-managed-ytdlp-update-rollback-planning` (parent: `08-25-diagnostics-backend-managed-ytdlp-planning`).
> Evidence read from `main` @ `d4fe27b` + working tree on 2026-08-25. **No production code, packaging script, or runtime asset was changed. No Architecture PASS is granted.**
> Evidence classes: **[CONFIRMED]** directly present in repo/upstream data; **[RECOMMENDED]** derived from task invariants and observed boundaries; **[NOT VERIFIED]** intentionally not inferred.

---

## 1. Executive conclusion and feasibility gate

**Feasibility: conditionally feasible — NOT implementable as specified today, and the prerequisite baseline is genuinely absent.**

- **[CONFIRMED]** There is **no immutable, target-specific bundled yt-dlp candidate** in the repository today. Packaged resources contain only `python-<target>` + `.official-python-runtimes.json` (`electron-builder.config.mjs:29-38`; `desktop-assets/binaries/` contains only `python-aarch64-apple-darwin/`, `python-x86_64-apple-darwin/`, `python-x86_64-pc-windows-msvc/`), and the macOS package verifier **actively rejects** any `yt-dlp*` / `gallery-dl*` entry under the bundled binaries dir (`scripts/verify-macos-python-runtime-package.mjs:340-375`). Current `ytDlp.expectedSource = "managed"` is hardcoded (`src/electron-runtime/runtimePaths.ts:238-250`).
- **[CONFIRMED]** Current yt-dlp is a **mutable, in-place venv** at `<userData>/runtimes/yt-dlp/<target>/venv/...` rebuilt by deleting the whole tool root (`electron/managedRuntimeBootstrap.mts:456-460`, `917`) — the opposite of the immutable, never-replaced candidate model P2 requires.
- **[CONFIRMED]** Per-attempt runtime identity does not exist: binary paths are resolved **once at composition** and injected into adapters (`electron/main.mts:1385-1386`), and shared media tools are resolved once per task (`src/electron-runtime/service.ts:1403`).
- **[CONFIRMED]** Windows "proxy-front" runtime contract is **not implemented** (spec says proxy-front binaries at managed root; code writes/uses only `real/`, and managed deno is never put on child `PATH`).
- **[NOT VERIFIED]** macOS managed-executable trust (Gatekeeper/quarantine/codesign) and Windows Authenticode have **no repository evidence** — both are pre-implementation blockers.

**Gate:** P2 may proceed to *planning approval* only after (a) a real bundled baseline candidate + packaging/verifier changes are accepted, (b) the Windows proxy-front contract is reconciled (either implemented or formally removed from spec with hidden-spawn re-verified), and (c) macOS/Win trust probes are executed on real packaged builds. Until then, implementable scope is **phase 0 only** (Section 7).

---

## 2. Current-state evidence map

### 2.1 Authority / ownership (what exists today)

| Responsibility | Owner | Anchor |
|---|---|---|
| Composition root (one runtime, one registry, one adapter set) | `electron/main.mts` | `main.mts:1375-1412` (createElectronDownloadRuntime, engines array, `assertCoversEngineIds` at `1412`) |
| Download execution/queue/attempt authority | `AmeowElectronDownloadRuntime` (service) + `DownloadJobService` + `DownloadOrchestrator` + `EngineRegistry` | `service.ts:295-318` (maxConcurrent=3 default), `service.ts:489-524` (queue), `src/application/download-job-service.ts` (Job lifecycle), `src/orchestration/download-orchestrator.ts:104-166` (engine ladder, `buildContext` before `engine.execute` at `152-158`) |
| yt-dlp CLI execution, retries, cancellation | `runYtDlpDownload` + `processRunner` | `src/electron-runtime/ytDlpDownload.ts:157-179` (internal retries), `processRunner.ts:76-101` (taskkill tree), `104-117` (`windowsHide: true` spawn) |
| Managed runtime install/rebuild | `electron/managedRuntimeBootstrap.mts` | whole module; venv rebuild `886-999`; ffmpeg `1066-1136`; deno `1000-1064` |
| Package pin (single source of truth) | `electron/managedPythonPackageManifest.mts` | `yt-dlp: installSource "yt-dlp==2026.07.04", minPython [3,10,0], packageVersion "2026.07.04", staleDirectories ["real"]`; scripts read compiled manifest only (`scripts/managed-python-package-manifest.mjs:55-69`) |
| Installed identity metadata | `<root>/metadata.json` | written `managedRuntimeBootstrap.mts:962-987` (`layoutVersion:1, packageVersion, packageSource, entrypoint, pythonVersion, pythonPath, bundledPythonPath, bundledPythonVersion, runtimeTarget, version, timestamps`) |
| Gate state / bootstrap order | `electron/runtimeDependencyGate.mts` | `MANAGED_RUNTIME_BOOTSTRAP_ORDER = [ytDlp, galleryDl, ffmpeg, deno]` `:60-64`; `ensureMissingManagedRuntimesReady` `:244-276` |
| Version probe (informational) | `electron/downloaderVersionInfo.mts` + `main.mts:1954-1979` | compares *installed* vs *pinned* (`updateAvailable`), never queries upstream |
| Failure classification | `engineErrorClassifier.ts` + `ytDlpErrorSummary.ts` | stable codes/classifications for terminal events |
| P1 Diagnostics (read-only) | `electron/diagnostics.mts` + `main.mts:1823-1845` | snapshot of runtimes/gate/output/bridge/downloads; **no candidate/selection facts** |
| Support export allowlist | `electron/supportLogSnapshot.mts` | `fallbackSource/fallbackPath` are **type affordances only** (`src/types/runtimeDependencies.ts:5-13`) — nothing populates them |

### 2.2 Bundled baseline audit (special audit #1 — PROVEN)

- Bundled prerequisite today is **CPython only**: manifest `desktop-assets/binaries/.official-python-runtimes.json` (per-target: releaseTag `20260325`, python `3.11.15`, assetName, URL, sha256, size, executableRelativePath), prepared via `scripts/python-runtime.mjs:141-169` + `scripts/ensure-python-runtime.mjs`, packaged via `electron-builder.config.mjs:29-38`, verified by `scripts/verify-macos-python-runtime-package.mjs:340-375`.
- Runtime resolves it through 4 candidate roots: repo dev → `resourceDir/binaries` → `resourceDir/app/desktop-assets/binaries` → exeDir fallback (`runtimePaths.ts:44-62`), executable `python.exe` / `bin/python3` (`:69-76`).
- **No yt-dlp asset is shipped** (Section 1). `RuntimeDependencySource = "bundled" | "managed"` exists as a type (`src/types/runtimeDependencies.ts:3`), and `fallbackSource`/`fallbackPath` fields exist on the entry (`:5-13`) but `resolveYtDlpStatus` never sets them (`runtimePaths.ts:238-250`).
- **[RECOMMENDED]** Baseline ownership should mirror the CPython pattern: a repo-owned manifest (e.g. `.official-ytdlp-baseline.json`), packaged immutable wheel(s) under `desktop-assets/binaries/`, verified by the macOS package verifier (extending the current "reject legacy downloaders" check into an "allow exactly the baseline asset" check), and a *baseline venv* derived into `<userData>/runtimes/yt-dlp/<target>/baseline/` by a dedicated baseline-ensure function. Baseline lifecycle = **app release lifecycle only**; P2 update/rollback/GC never touches it.

### 2.3 Composition-time path injection audit (special audit #2 — PROVEN limits)

- `main.mts:1385-1386`: `new YtDlpEngineAdapter({ binaries: resolveYtDlpRuntimeDependencies(environment) })` — paths resolved **once** when `getElectronDownloadRuntime()` first runs.
- `YtDlpEngineAdapter.execute` splices those static binaries into every invocation (`src/electron-runtime/ytDlpEngineAdapter.ts:36-43`), so every attempt of every job uses the same path strings.
- `service.ts:1403`: transcode-facing shared media tools resolved per task; `service.ts:715`: advanced-quality probe resolves binaries **per probe call** (still same mutable path).
- `createYtdlpCommandPlan` derives `ffmpegDir = dirname(binaries.ffmpeg)` (`ytDlpCommandPlan.ts:201`), used for `--ffmpeg-location` (`ytDlpCommandPlan.ts:236`) and PATH prepend (`ytDlpDownload.ts:301-303`).
- **Limits this imposes on attempt-time resolution:** P2 cannot mutate adapter-constructor static paths mid-flight, and cannot rely on "same path, new file content" (a venv rebuild at the same path is exactly the hazard). The clean insertion point is `DownloadJobService.options.buildAttemptContext` (`service.ts:1514-1567` → `download-orchestrator.ts:154-158`): resolve + pin one complete identity **per engine attempt, before `engine.execute`**, and deliver it to the adapter through an **invocation input** (like today's `EngineInvocationContext.binaries`) rather than static construction — i.e., change the adapter dependency from `{ binaries }` to a `resolveCandidate()` port (or have the runtime pass per-attempt binaries in the context; the latter must preserve the "Electron-neutral context carries no binary paths" contract comment in `engineExecutionContext.ts:1-16`, so the adapter-port form is cleaner).

### 2.4 Bootstrap/install concurrency vs active downloads (special audit #3 — PROVEN mechanics)

- In-flight join protects **bootstrap concurrency only**: `managedPythonBootstrapPromises` per tool (`managedRuntimeBootstrap.mts:122`, `901-905`, `991-996`); `managedBinaryBootstrapPromises` per component+target (`:123`, `1011-1013`, `1076-1078`). Nothing ties them to **active download processes** — there is no refcount/lease on any runtime root or binary.
- Python rebuild deletes the whole tool root (`:456-460`, `917`) **before** recreating (`ensureManagedPythonVirtualenvReady` `:349-358` → `rm(venvDir)` + `python -m venv`). If an attempt is mid-flight with `venv/Scripts/yt-dlp.exe` pinned, a rebuild (triggered by a *concurrent* attempt's `ensureEngineRuntimeReady`, `service.ts:1520-1524`) can race it: on **Windows** unlinking a running `yt-dlp.exe`/`python.exe` typically fails (`replaceFile` `:738-746` → unlink fails → copyFile fails → error surfaces); on **POSIX** unlink succeeds and lazy module imports inside a running yt-dlp can then fail (`ImportError`) because the venv tree was removed underneath it. **[CONFIRMED mechanism, NOT VERIFIED frequency]** — no test currently exercises rebuild-during-active-execution.
- FFmpeg/Deno reinstall replaces `real/ffmpeg(.exe)`/`deno(.exe)` **in place** (`replaceFile`, `:1047-1051`, `:1113-1122`) — same hazard class for a running ffmpeg/deno child (Windows: rename-over-running-exe fails; POSIX: executable image replacement still unsafe). Bootstrap only runs when files are missing (`:1006-1009`, `:1071-1074`), so today the risk exists on pin bumps/force-reinstall only — but P2 activation must not rely on that accident.
- **[RECOMMENDED]** P2: (1) immutable version dirs (`versions/<releaseId>/venv`) — never rewrite a dir an attempt references; (2) explicit **reference counting**: acquire at pin (per engine attempt), release at attempt terminal (attempt_succeeded/attempt_failed + cancelled), with process-tree settlement confirmed by `runStreamingCommand` (awaits `close`; `killChild` waits for exit, `processRunner.ts:47-101`); (3) activation = atomically swap a tiny selection record only; (4) GC = explicit lifecycle op that re-checks references under the same lock and never runs while `active.size > 0` for this engine (queue facts already exist: `service.ts:376-417`).

### 2.5 Windows proxy-front reconciliation (special audit #4 — CONFIRMED mismatch)

- **Spec says**: Windows managed ffmpeg root must expose proxy-front `ffmpeg.exe`/`ffprobe.exe` and `deno.exe`, real console binaries under `real/`; `--ffmpeg-location` and PATH prepends must point at the proxy-front dir so children stay hidden (`.trellis/spec/backend/sidecar-runtime-contracts/02-cross-platform-runtime-resolution-for-downloaders.md:80-100`).
- **Code says**: `runtimePaths.ts:137-146` (`realRoot = root/real` on win32), `:155-157`; `managedRuntimeBootstrap.mts:144-158`; extraction writes into the `real/` subdir (`:1040-1048`, `:1096-1122`). **No proxy-front file is created anywhere** (grep over `electron/` + `src/electron-runtime/` for proxy-front/deno wiring: only spec references).
- **Concrete consequences**:
  - `--ffmpeg-location` receives `dirname(binaries.ffmpeg)` = the `real/` dir (`ytDlpCommandPlan.ts:201`), and PATH prepend uses the same dir (`ytDlpDownload.ts:301-303`) — *opposite* of the spec.
  - Managed **deno is never placed on child PATH at all**: `hasDeno` only gates `--js-runtimes deno` (`ytDlpDownload.ts:253`, `ytDlpCommandPlan.ts:48-57`); no `denoDir` PATH prepend exists (only ffmpegDir is prepended). On a host without `deno` on PATH, `--js-runtimes deno` silently falls back to `node` or none — the managed Deno 2.7.1 artifact is effectively unused for downloads today. **[CONFIRMED gap; functional impact NOT VERIFIED on packaged builds]**
- **[RECOMMENDED]** Resolve **before** any P2 updater ships: either implement the proxy-front layout (a `proxy/` dir with shims — or revisit whether shims are needed at all given `windowsHide:true` Node spawn already avoids consoles) **and** then update the spec; otherwise amend the spec to current `real/` reality and keep `--js-runtimes` behavior consistent. P1 Diagnostics already reports `runtimePaths` (which point at `real/`), so a layout change must keep `inspectRuntimeBinaryPaths` and bootstrap in sync (contract requirement, `07-electron-managed-runtime-bootstrap-module-contract.md:38-46`).

### 2.6 macOS trust audit (special audit #5 — mostly NOT VERIFIED)

- Packaged app: unsigned/not notarized (`identity: null, hardenedRuntime: false, gatekeeperAssess: false`, `electron-builder.config.mjs:78-86`); release CI disables identity discovery (`release.yml` env `CSC_IDENTITY_AUTO_DISCOVERY: "false"`); manual repair documented for the **app bundle only** (`distribution/macos/install-guide.txt:11`: `xattr -dr com.apple.quarantine "/Applications/Ameow.app"`).
- Managed binaries: `chmod 0o755` after install (`managedRuntimeBootstrap.mts:959-960`, `1044-1048`, `1113-1120`) — **executable-bit handled [CONFIRMED]**. No codesign/notarization/stapling/quarantine-clearing of managed files anywhere in the repo (grep: only the install-guide line).
- venv: created with default symlink layout, no `--copies` (`managedPythonVirtualenvArgs` `:349-352`; spec `02-...:45-52`), so `venv/bin/yt-dlp` **symlinks into the app-bundle bundled Python tree** — meaning baseline/managed venvs are *relocation-sensitive*: `shouldRebuildManagedPythonRuntime` deliberately rebuilds when `bundledPythonPath` changes (`:489-497`) i.e. on app update/relocation. **[CONFIRMED]**
- **NOT VERIFIED (blocking)**: whether a post-launch-downloaded unsigned binary executes after Gatekeeper/quarantine evaluation (how the quarantine xattr interacts when the *writing app* itself was launched from a quarantined unsigned bundle; whether TCC/AMFI applies); codesign/notarization of managed executables; both-arch behavior — release matrix builds **arm64 only** (`release.yml:76-83`) while `x86_64-apple-darwin` paths exist (`platform.ts:7-10`).

### 2.7 P1 Diagnostics observability map (special audit #6)

P1 already landed (`git log`: `feat(diagnostics): add read-only self-check`) and exposes only: environment, `runtimes[]` (id, expectedSource, currentSource, executablePresent, version) for `python/ytDlp/galleryDl/ffmpeg/ffprobe/deno`, `runtimeGate`, outputDirectory, browserBridge, downloads counts (`electron/diagnostics.mts:69-88`, `180-320`; `src/types/diagnostics.ts`). **It does not observe** (and must *not* authorize): candidate identity, releaseId, dependency-set identity, activation generation, selection source, fallback reason, retention state, or per-attempt pinned identity. **[RECOMMENDED]** P2 facts to surface read-only (via new `DiagnosticFact` fields, no new command authority): `selectedCandidate {kind, releaseId, generation, eligible, reason}`, `managedRelease {version, state: staged|eligible|active|failed, integrityVerified, probeOutcome}`, `bundledBaseline {version, available}`, `attemptCountWithManaged`, `lastFallbackReason`, `retention {referencedReleaseIds, evictableCandidates}`. Everything stays **observed/probed facts**; the updater command (`update_managed_ytdlp`, `rollback_managed_ytdlp`) is a separate explicit command — `get_read_only_diagnostics` must never invoke it (same pattern as today: `get_runtime_dependency_status` vs `start_runtime_dependency_bootstrap`, `electron/videoDownloadCommands.mts:31-95`).

### 2.8 Attempt lifecycle semantics and the pin point (special audit #7)

- Queue → pending → active (`pumpQueue` `service.ts:1371-1385`, maxConcurrent=3); each task gets an `AbortController` (`:1378-1385`); `cancelDownload` aborts active or splices pending + emits terminal (`:526-598`); `will-quit` cancels all active (`main.mts:3524-3535`).
- Attempt ladder: `prepare` once → `createJobContext` once → per engine attempt `buildAttemptContext` → `engine.execute` (`download-orchestrator.ts:104-166`); **fallback** moves to next engine candidate on `shouldContinueEngineChain` (`:13-22`); auth recovery re-runs `executeAttempts()` at most once (`download-job-service.ts:154-187`); yt-dlp internal retries (transient network; YouTube section-format) happen **inside one `execute`** (`ytDlpDownload.ts:157-179`); artifacts cleaned between retries; no retry after abort.
- **Pin point (exact):** `service.ts:1514-1567` `buildAttemptContext`, i.e. after `ensureEngineRuntimeReady` (currently at `:1520-1524`) and before the context is handed to `engine.execute`. One resolved identity per engine attempt covers: that attempt + all internal yt-dlp retries + (auth recovery) a *new* engine attempt, which gets its own pin. **[RECOMMENDED]** do not pin earlier (job level): a job may legitimately fall back to gallery-dl (different dependency set) or retry after auth.
- **Terminal semantics preserved:** exactly one terminal outcome per job (`download-job-service.ts:56-95`), cancellation distinct (`classifyFailure` → `cancelled`), settlement hook before diagnostic terminal (`:198-216`; `service.ts:1574-1650`).
---

## 3. Proposed authority and data contracts

### 3.1 Ownership (who owns what — P2)

| Concern | Owner (recommended) | NOT owner |
|---|---|---|
| yt-dlp release identity/version/dependency pins (allowed set) | app-owned `electron/managedPythonPackageManifest.mts` (+ new release manifest consumed by updater) — repo release process | runtime auto-discovery; user |
| Authenticity/integrity policy (allowlist hosts, required digests, PGP sums, downgrade rule) | app code (security-reviewed; main.mts composition) | Diagnostics |
| Candidate eligibility probe | runtime candidate module (engine-adjacent, same boundary as bootstrap) | Diagnostics |
| **Active selection — single source of truth** | `<userData>/runtimes/yt-dlp/selection.json`, written atomically only by the candidate/selection module | `settings.json`, `metadata.json`, `checkYtdlpVersion` (reads only), UI (displays only) |
| Download execution authority | `AmeowElectronDownloadRuntime` + engine registry + `runYtDlpDownload` (unchanged) | updater module |
| Update/rollback/GC commands | explicit `update_managed_ytdlp` / `rollback_managed_ytdlp` / `gc_managed_ytdlp` through the existing Electron command bridge pattern | `start_runtime_dependency_bootstrap` (stays ensure-only), Diagnostics |
| Bundled baseline | repo packaging layer (manifest+asset+verifier) + baseline-ensure in runtime | P2 updater |

### 3.2 Candidate identity (data contract)

```ts
type YtDlpCandidateIdentity = {
  kind: "bundled" | "managed";
  releaseId: string;            // managed: `<version>-<sha256prefix>`; bundled: `bundled-<version>`
  ytDlpVersion: string;
  installSource: string;        // e.g. "yt-dlp==2026.8.19" (or wheel-file install)
  packageSetId: string;         // hash over the *pip-installed* set (name==ver, wheel sha256)
  runtimeSetId: string;         // hash over {packageSetId, mediaTools, bundledPythonVersion, target} — the identity an attempt pins
  dependencies: Array<{name, version, sha256}>; // pip deps; today: [] (base install, see §6)
  pythonMin: [number, number, number];
  target: string;               // resolveRuntimeTarget(platform, arch)
  activationGeneration: number;
  stagedRoot: string;           // <userData>/runtimes/yt-dlp/<target>/versions/<releaseId>/
  mediaTools: {                 // SHARED singletons — bound by digest, NOT copied (§10.1)
    ffmpeg:    { version: "8.0.1", sha256: "29f9…", path: string },
    ffprobe:   { version: "8.0.1", sha256: "29f9…", path: string },
    deno:      { version: "2.7.1", sha256: "94d7…", path: string },
  };
};
```

- **Two-tier identity:** `packageSetId` = yt-dlp package(s) only; `runtimeSetId` = the complete attempted runtime incl. shared media tools + bundled Python version + target. Q4 pin records **runtimeSetId**; cleanup/retention/rollback keys on `releaseId`; `runtimeSetId` is regenerated at pin time from observed tool paths + app-owned digests, and must match the recorded identity for the same releaseId (mismatch ⇒ degraded, never silent).
- **`mediaTools` ownership:** the digest constants are already app-owned and code-pinned (`selectFfmpegRuntimeArtifactSpec`/`selectDenoRuntimeArtifactSpec` `managedRuntimeBootstrap.mts:800-885`); no new version table, no separate updater, no user input. They are *referenced* by the yt-dlp candidate, not owned by it.
- **Shared-dependency decision (see §10.1):** option (b) copy-into-candidate is **rejected** (≈120 MB duplicated per candidate ×3 targets; transcode path would diverge from `resolveSharedMediaRuntimeTools`). Option (a) full per-digest versioned media-tool dirs is **not required** for P2. Chosen: **(c) digest-bound shared singletons + reference-gated reinstall** — media tools stay at the current single `real/` location, their identity is bound by digest at pin time, and any reinstall (`replaceFile` path, only ever caused by an app pin bump / force-reinstall / missing file) is gated on zero active media-tool references under a shared lifecycle lock (see §10.1).

- Immutable storage: `versions/<releaseId>/venv` + `release.json` (identity + digests + installedAt). Never rewritten; no update writes into an existing `releaseId` dir.
- Selection record: `{ schemaVersion, selected: CandidateRef|null, previous: CandidateRef|null, generation, updatedAtMs, lastFallback: {reason, atMs} | null }`. Missing/corrupt/partial → resolver returns `kind:"bundled"` and diagnostics report `degraded/managed_unavailable` (fail-closed path, no exception at spawn).
- `RuntimeDependencyStatusEntry.expectedSource` must be **derived** from the selection record (today hardcoded `"managed"`, `runtimePaths.ts:238-250`) — and `fallbackSource`/`fallbackPath` become live fields (they exist but are dead type affordances, `src/types/runtimeDependencies.ts:5-13`).

### 3.3 Lifecycle state machine

```text
[repo release]  release manifest + verified assets (wheel digests, SHA2-256SUMS.sig)
        │
        ▼
check/new → download(temp) → verify(size+sha256+sums+pinned digest) → stage(immutable versions/<id>)
        │                                                    │
        │                                                    ▼
        │                                        eligible probe (--version, python compat,
        │                                        deps present, ffmpeg/ffprobe/deno ready)
        │                                                    │
        │                                          eligible? ── no → quarantine(staged) + keep previous
        ▼                                                    │ yes
   activate: selection.json {selected: id, generation++}   │
        │                                                    ▼
        ▼                                            (new attempts only)
  attempt → resolve candidate (selection) → pin identity (incl. mediaTools digests) → ensure candidate ready (never rebuild others)
        → runYtDlpDownload → attempt terminal → release reference
        ▲                                                  │
        └── execution failure: no in-flight swap ──────────┘
            pre-pin  fail-closed: resolver returns bundled BEFORE attempt #1 (no fallback event at all)
            post-pin managed failure: ONE same-engine re-attempt (new pin → bundled) only when the
            orchestrator candidate-fallback hook is enabled (deferred to Phase 2; §10.3); never a hidden retry

rollback: selection.json {selected: previous|bundled, generation++}  (never deletes referenced dirs)
GC: explicit op; skip selected/previous/attempt-referenced/retained; delete only unreferenced candidates
    under the shared lifecycle lock (global idleness NOT required; §10.4)
```

Rules: **verify before stage; probe before activate; activation only affects new attempts; a running attempt never switches executable or dependency set; any automatic fallback that runs another executable is a new attempt through existing retry/terminal authority.**

---

## 4. Explicit failure matrix

| Stage | Failure | Behavior | Boundary |
|---|---|---|---|
| download | network/proxy/redirect off-allowlist | abort; no stage; previous selection untouched | updater only; temp cleaned |
| verify | size/sha256/sums mismatch | reject artifact; keep previous; fail update (no activation) | existing pattern `verifyDownloadedRuntimeAsset` `managedRuntimeBootstrap.mts:256-274` |
| stage | disk full / partial | quarantine dir; no selection change | immutable staging |
| probe | `--version` fails / python too old / deps missing / ffmpeg/deno not ready | candidate not eligible → NOT activated; previous or bundled stays | probe is read-only; never mutates selection |
| activate | selection write fails | selection record unchanged (atomic temp+rename); attempt resolves previous/bundled | single writer; atomic write |
| attempt | managed executable fails **post-pin** (spawn ENOENT/EACCES, interpreter/import failure, `--version` mismatch) | typed failure w/ new stable classification `runtime_candidate_failed` (candidate-defect only; network/availability failures keep current classification); **no in-flight switch**; one same-engine re-attempt to bundled only if the orchestrator candidate-fallback hook is enabled (deferred to Phase 2, §10.3) | yt-dlp runner/classifier emits; orchestrator decides re-attempt; `DownloadJobService` remains single-terminal |
| attempt | managed execution fails for *content* reasons (site/route/format) | current behavior exactly (no candidate fallback, no retry beyond existing internal retries) | unchanged |
| selection corrupt/missing | resolver fails closed to bundled; diagnostics show `degraded` + reason | no exception at spawn; no rebuild of content |
| managed candidate missing after activation | resolver falls back to bundled for new attempts; update state = `unavailable` + reason | no auto-reinstall during attempt |
| startup failure (bundled python missing) | existing gate `failed` before downloader bootstrap (`runtimeDependencyGate.mts:110-124`); unchanged | P2 must not weaken |
| baseline materialization missing/corrupt | baseline-ensure rebuilds the derived venv **offline** from the bundled wheel (deterministic; no network); rebuild failure or missing bundled Python ⇒ gate fails closed (existing `failed` phase before downloader bootstrap, `runtimeDependencyGate.mts:110-124`); managed is **not** promoted as fallback (managed ≠ known-good) | baseline-ensure only; never Diagnostics/updater (§10.2) |
| rollback | previous dir missing/corrupt | fall back to bundled; record reason | never blocks new attempts |
| GC | candidate referenced by an active attempt or by the selection/retention set | skip; retry later (explicit op) | per-candidate skip under shared lifecycle lock; no global wait (§10.4) |
| app update in flight | pending app update while staged/active | no implicit backend activation; keep managed state durable; GC waits for app exit | app/backend lifecycles independent (`appUpdateController.mts:115-235`) |

---

## 5. Platform blocker matrix

| Platform | Blocker | Repo evidence | Verdict |
|---|---|---|---|
| Win | proxy-front contract vs actual `real/` layout | spec `02-...:80-100` vs `runtimePaths.ts:137-157`, `managedRuntimeBootstrap.mts:144-158` | **[CONFIRMED]** must reconcile before updater |
| Win | managed deno never on PATH; only used as boolean flag | `ytDlpDownload.ts:253,301-303`; `ytDlpCommandPlan.ts:48-57` | **[CONFIRMED]** fix or spec-write-off |
| Win | Authenticode/signing of managed exes (and app) | no signing config in `electron-builder.config.mjs:45-77`; `release.yml` disables identity discovery | **[NOT VERIFIED]** probe on packaged build |
| Win | in-place rebuild of venv/binary while running | `managedRuntimeBootstrap.mts:456-460,917`; `replaceFile:738-746` | **[NOT VERIFIED]** for active-use race; P2 must eliminate by design |
| Win | exact `userData` for installed vs portable | `main.mts:280` (`app.getPath("userData")`); portable marker only for app updates (`portableAppUpdate.mts:87-90`); no portable `setPath` | **[NOT VERIFIED]** exact folder identity; same source [CONFIRMED] |
| macOS | Gatekeeper/quarantine for post-install downloaded managed binaries | no handling anywhere; app itself unsigned (`electron-builder.config.mjs:78-86`), manual xattr only for app (`distribution/macos/install-guide.txt:11`) | **[NOT VERIFIED]** blocking |
| macOS | codesign/notarization/stapling of managed executables | absent | **[NOT VERIFIED]** blocking |
| macOS | executable bit | chmod 0755 `managedRuntimeBootstrap.mts:959-960,1044-1048,1113-1120` | **[CONFIRMED]** OK |
| macOS | venv symlinks into bundled python (relocation-sensitive) | `managedPythonVirtualenvArgs:349-352`; `shouldRebuild...:489-497` | **[CONFIRMED]** per-attempt pin must record `bundledPythonPath`/generation |
| macOS | x64 release verification | `release.yml:76-83` arm64 matrix only; `platform.ts:7-10` supports x64 | **[NOT VERIFIED]** |

---

## 6. Upstream authenticity/integrity/downgrade evidence (authoritative, fetched 2026-08-25)

**Authoritative source URLs and retrieval notes (evidence provenance):**

- PyPI release metadata (pinned version): `https://pypi.org/pypi/yt-dlp/2026.7.4/json` — confirmed `info.requires_python`, `info.requires_dist` (every entry is `extra == …`-conditional ⇒ base set empty), `info.provides_extra` (`default`, `pin`, `deno`, `curl-cffi`, `pin-curl-cffi`, `pin-deno`, `pin-secretstorage`, `secretstorage`), and `urls[]` (wheel/sdist `size`, `digests.sha256`, `upload_time_iso_8601`, `has_sig`).
- PyPI file mirror (the wheel itself): `https://files.pythonhosted.org/packages/f9/8a/…/yt_dlp-2026.7.4-py3-none-any.whl` (URL as published in the JSON `urls[0].url`).
- GitHub release by tag (API): `https://api.github.com/repos/yt-dlp/yt-dlp/releases/tags/2026.07.04` — confirmed release `id 349050911`, `tag_name`, `published_at 2026-07-04T22:41:44Z`, `immutable: true`, uploader `github-actions[bot]`, and the full `assets[]` list (each with `name`, `size`, `digest` (sha256), `content_type`, `browser_download_url`).
- GitHub release page (human): `https://github.com/yt-dlp/yt-dlp/releases/tag/2026.07.04` (also `…/releases` for the list).
- yt-dlp update/signing documentation: `https://github.com/yt-dlp/yt-dlp#release-files` (README.md; the same text is embedded in the PyPI JSON `info.description`) — this is the canonical doc used for the signing claims; it documents the file table, `SHA2-256SUMS.sig` = "GPG signature file for SHA256 sums", the verification recipe, and the UPDATE section (channels `stable`/`nightly`/`master`, `--update-to`) which applies to standalone binaries only.
- The signing key itself (as referenced by the README): `https://github.com/yt-dlp/yt-dlp/blob/master/public.key` (raw: `https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/public.key`).
- Latest-version endpoints: `https://pypi.org/pypi/yt-dlp/json` and `https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest`.

*Retrieval note: all of the above were fetched live over HTTPS during the research session (2026-08-25) and re-confirmed against the same endpoints at amendment time; no cache/proxy was involved, and no values below were taken from memory or third-hand sources. See §10.5 for the PGP trust-root status (NOT VERIFIED) and the signing-key provenance.*

**[UPSTREAM CONFIRMED]** (sources above):
- PyPI `yt-dlp==2026.7.4` (the pinned `2026.07.04`): pure-Python wheel `yt_dlp-2026.7.4-py3-none-any.whl` (3,184,705 B, sha256 `f11f2b11d5a8ac4059f9bdf29fa4407dc7c6bb00c5097e95ca22a7a9db518266`) + sdist; `requires_python >=3.10` (matches app `minPython [3,10,0]`; bundled Python 3.11.15 satisfies). **Base `requires_dist` is EMPTY** — `pip install yt-dlp==...` installs zero extra packages; all functionality deps (brotli, certifi, mutagen, pycryptodomex, requests, urllib3, websockets, `yt-dlp-ejs==0.8.0`) live in the `default` extra; exact pins are available via the `pin` extra; a `deno` extra exists (`deno>=2.6.6`) — a *Python* deno package, separate from the app's managed Deno binary.
- PyPI publishes per-file `digests.sha256` + `upload_time_iso_8601` in `.../pypi/yt-dlp/2026.7.4/json` (integrity evidence), and **both wheel and sdist carry `has_sig: false`** — PyPI files are *not* code-signed; the PyPI-side authenticity for the wheel path is TLS + the PyPI account (`ownership.organization: "yt-dlp"`, maintainer `bashonly` per the JSON), NOT a signature.
- GitHub release `2026.07.04` (API: `.../releases/tags/2026.07.04`; page: `.../releases/tag/2026.07.04`) publishes `SHA2-256SUMS` (line format `sha256  filename`; asset digest `sha256:eca42575…c64`) **and** `SHA2-256SUMS.sig` (binary PGP detached signature, `content_type: application/pgp-signature`, 566 B, asset digest `sha256:3fb88fc2…09c6`), plus `SHA2-512SUMS(.sig)`, `_update_spec` (yt-dlp's self-update spec for standalone binaries) and per-target binaries (`yt-dlp.exe`, `yt-dlp_win.zip`, `yt-dlp_win_arm64.zip`, `yt-dlp_macos`, `yt-dlp_macos.zip`, …). macOS assets exist but the release list has **one** `yt-dlp_macos` asset (+ `yt-dlp_macos.zip`) = universal build per README ("Universal MacOS (10.15+)"); per-arch coverage is therefore **NOT VERIFIED** as a separate-artifact claim (irrelevant to the chosen wheel path).
- **Signing documentation (upstream):** README `#release-files` states `SHA2-256SUMS` = "GNU-style SHA256 sums", `SHA2-256SUMS.sig` = "GPG signature file for SHA256 sums", gives `curl -L https://github.com/yt-dlp/yt-dlp/raw/master/public.key | gpg --import` + `gpg --verify SHA2-256SUMS.sig SHA2-256SUMS`, and points to `public.key` as "the public key that can be used to verify the GPG signatures". The README's UPDATE section (channels/`--update-to`) applies only to release binaries; the pip/wheel install path is updated by re-running pip, matching the P2 wheel-based plan.
- Current upstream latest at research time: **2026.8.19** (wheel `yt_dlp-2026.8.19-py3-none-any.whl`, sha256 `1d57897e94c6665a0a6f9bc54b34e584284e32c034ffab3a7df25d8f7b24eedf`; `yt-dlp-ejs==0.8.0` already required by `default`) — confirmed live via `https://pypi.org/pypi/yt-dlp/json` (latest) and `https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest`. The repo pin `2026.07.04` is therefore behind; `checkYtdlpVersion` does **not** know this (it compares against the pin only, `downloaderVersionInfo.mts:105-149`).

**[RECOMMENDED] authenticity/integrity policy for P2:** keep the Python-package format (matches current runtime; single `py3-none-any` wheel = one dependency-set identity across all three targets). Chain: (1) HTTPS + host allowlist (`pypi.org`, `files.pythonhosted.org`; reject cross-host redirects by checking `response.url`); (2) pinned wheel `sha256` from the app-owned manifest (generated from PyPI JSON `digests.sha256` at release time — not resolved at runtime); (3) `pip install --only-binary=:all: --require-hashes --no-deps` + explicit hash file; (4) if the standalone-binary format is ever chosen, optionally cross-check `SHA2-256SUMS` (+ PGP `.sig` verification against the yt-dlp signing key in `public.key`) — **but the PGP trust-root policy is [NOT VERIFIED] (see §10.5)**: upstream publishes its public key in the *same* repo/channel as the assets with **no published key fingerprint**, so verifying with that key is trust-on-first-use of one channel and is **not** an established verification chain; it adds no strength against repo compromise unless Ameow pins a verified fingerprint from an independent source. The Ameow repo carries no pinned key today **[CONFIRMED ABSENT]**; (5) **downgrade rule:** a managed release may only be activated if `newVersion >= selectedVersion` (loose compare via existing `compareLooseVersions`, `main.mts`), unless an explicit user-directed downgrade records a reason; fallback to bundled baseline is *not* a downgrade — it is a known-good constant and must be logged as `fallback`, separate from downgrade.

---

## 7. Implementation phase split and minimum safe slice

- **Phase 0 (minimum safe deliverable, no updater):**
  1. Ship immutable bundled baseline: wheel asset + `.official-ytdlp-baseline.json` (sha256/size/version) + `electron-builder.config.mjs` patterns + macOS verifier update to allow exactly the baseline asset (replacing the blanket rejection at `verify-macos-python-runtime-package.mjs:340-375`). Baseline materializes **offline** from bundled wheels (no network), so it is a true known-good candidate (§10.2).
  2. Baseline-ensure → `<userData>/runtimes/yt-dlp/<target>/baseline/` (derived **cache**, never content truth; rebuildable offline from bundled wheel; never touched by updater).
  3. Selection record (`selection.json`) with default `{selected: bundled}`; resolver (`resolve candidate per attempt`) and per-attempt identity pinning at `buildAttemptContext` recording **runtimeSetId** (incl. ffmpeg/ffprobe/deno digest identities); adapters take a `resolveCandidate()` port instead of static binaries.
  4. **Shared-tools binding:** promote ffmpeg/deno digest constants to an app-owned manifest; pin-time probe records observed tool digests; reinstall path (`replaceFile` for media tools) is gated on zero references under the **shared lifecycle lock** (no copies into candidates; §10.1).
  5. Diagnostics: add read-only candidate/selection/fallback facts (no new authority).
  6. Tests: pin identity in attempt diagnostics; fallback-on-corrupt-selection; offline baseline rebuild; media-tool reinstall blocked while an attempt holds a reference; no behavior change vs today (single candidate = bundled), macOS/Win package verification with new baseline.
  *Automatic post-execution same-engine fallback is NOT in Phase 0 (only bundled exists; the orchestrator hook is scaffolded disabled — §10.3).*
- **Phase 1:** release manifest (app-owned), check → download-temp → verify (wheel hash + host allowlist + redirect check) → stage immutable `versions/<id>` → eligibility probe; no activation.
- **Phase 2:** activation/rollback (selection record transitions, generation), reference counting (acquire/release with attempt terminals), Diagnostics observability of lifecycle state, explicit `update_managed_ytdlp`/`rollback_managed_ytdlp` commands.
- **Phase 3:** retention/GC, app-update coexistence hardening, repair UX (separate scope), platform trust probes (Win Authenticode, macOS quarantine) on real packaged artifacts.
- **Gate before Phase 1/2:** Windows proxy-front decision + macOS trust probes + security review of the authenticity chain + lifecycle review of one-selector/one-authority invariant.

---

## 8. Unresolved evidence gates

1. Packaged Windows layout: build NSIS + portable, verify exact `real/` vs proxy-front files, userData location, and hidden-child behavior (no console flash) with a real yt-dlp+ffmpeg+deno run.
2. Windows active-use race: reproduce ensure/rebuild while a download is active (venv + ffmpeg/deno) to size the risk before P2.
3. macOS: packaged app + post-install managed binary execution after quarantine (fresh download from a quarantined context) — arm64 at least; x64 if the release matrix expands.
4. Authenticode/notarization feasibility for managed executables (or explicit decision that unsigned is accepted with digest-only integrity).
5. Upstream: exact arch coverage of the `yt-dlp_macos` asset and whether PyPI JSON API is acceptable as the release truth (vs a repo-vendored manifest with hashes pre-baked at release time — **recommended**).
6. Whether `--remote-components ejs:github` fetches EJS from GitHub at runtime independent of `yt-dlp-ejs` (dependency-set interplay) — affects identity and offline behavior.
7. P1/P2 coexistence: confirm `get_read_only_diagnostics` remains side-effect-free after adding P2 facts (no `runtimeRootFor`-style mkdir — current diagnostics already uses `inspectRuntimeBinaryPaths`/`inspectRuntimeDependencyStatus` which are pure, `runtimePaths.ts:289-366`; the *execution-side* `resolveRuntimeBinaryPaths` still mkdirs, `:124-126`, `:302-314` — keep P2 reading the inspect variants).
8. `checkYtdlpVersion` must move to the selection record (today it reads `status.ytDlp.path`, i.e. the mutable current root) — define what "current" means per candidate.

---

## 9. Direct answers to the ten planning questions

**Q1 — Bundled baseline ownership/lifecycle.**
*Answer:* Today **none** for yt-dlp — only CPython is a bundled immutable prerequisite (manifest `desktop-assets/binaries/.official-python-runtimes.json`, packaged by `electron-builder.config.mjs:29-38`, verified by `scripts/verify-macos-python-runtime-package.mjs:340-375`, resolved by `runtimePaths.ts:44-77`; yt-dlp is hard-expected `managed`, `runtimePaths.ts:238-250`). *Recommended:* baseline = repo-owned immutable wheel + manifest (same pattern as Python), packaged resources; derived baseline venv in userData owned by a baseline-ensure function; lifecycle = app release only; P2 never writes/updates/deletes it; rebuild-from-bundle on corruption is allowed (source is immutable). **Immutability refinement (§10.2):** the *immutable* part is the packaged wheel + manifest (app content, canonical); the userData venv is a **replaceable, rebuildable cache** — identity/known-good is defined by (wheel digest + bundled Python version + target), not by the venv's continued existence.

**Q2 — Candidate identity/version/dependency set/eligibility owner.**
*Answer:* Today identity = `ManagedPythonPackageSpec` (manifest file, single source of truth; scripts read the compiled copy via `scripts/managed-python-package-manifest.mjs`) + `<root>/metadata.json` (layoutVersion 1, `managedRuntimeBootstrap.mts:962-987`). *Recommended:* candidate identity = `{releaseId, version, installSource, packageSetId, runtimeSetId (incl. mediaTools digests + bundled Python + target), pythonMin, target, activationGeneration}` (§3.2); allowed-set owner = app-owned manifest (release process); eligibility = runtime candidate module (probe `--version`, python compat via existing `assertPythonVersionSatisfiesManagedPackage` `:395-405`, deps/ffmpeg/deno presence); user-facing "update available" = Diagnostics/`checkYtdlpVersion` read-only; **never** a second version table, never user-supplied versions, never Diagnostics-triggered.

**Q3 — Active selection single source of truth.**
*Answer:* None exists today (`fallbackSource/fallbackPath` are dead affordances; `expectedSource="managed"` is hardcoded in status). *Recommended:* one `selection.json` under `<userData>/runtimes/yt-dlp/` written only by the selection module (atomic temp+rename, same pattern as `replaceFile`); fields `{selected, previous, generation, updatedAtMs, lastFallback}`; status/probe/Diagnostics/UI all read it; nothing else persists candidate selection; `settings.json` carries only user preference (e.g. auto-update enabled), never the active identity.

**Q4 — Attempt-level pinning alignment.**
*Answer:* Pin once per engine attempt inside `buildAttemptContext` (`service.ts:1514-1567`), after `ensureEngineRuntimeReady` and before `engine.execute`; **complete identity** = {ytDlp version+entrypoint+wheel digest, venv Python identity + bundledPythonPath, **ffmpeg/ffprobe version+digest+path, deno version+digest+path**, target, packageSetId, runtimeSetId, generation} — plus a pin-time **observed-digest check** of the shared media tools so a mismatch is reported (degraded), never silently mixed. Decision for the shared FFmpeg/Deno mutability: **do not copy them per candidate; bind by digest** (shared singletons + reference-gated reinstall; §10.1). Covers yt-dlp internal retries (same invocation), engine fallback (new attempt → new pin), auth recovery (new attempt → new pin), cancellation (reference released on attempt terminal after process-tree settlement). Aligns with existing per-attempt `attemptIndex/attemptId` (`src/application/download-diagnostics.ts:22-30`) — attach candidate facts to the same attempt record; no new tracker.

**Q5 — Update→verify→stage→probe→activate authority/failure boundaries.**
*Answer:* All five steps belong to **one** app-owned lifecycle command (`update_managed_ytdlp`), outside Diagnostics and outside `start_runtime_dependency_bootstrap`/`ensureEngineRuntimeReady` (those remain missing-runtime ensure). Boundaries: download→temp (no selection change; temp cleaned on failure); verify (digest/host/redirect fail → abort update, previous intact); stage (immutable `versions/<id>`; failure → quarantine dir, no selection change); probe (`--version`+compat+dep presence; failure → candidate ineligible, NOT activated); activate (atomic selection-record swap for **new attempts only**; write failure → record unchanged → attempts resolve previous/bundled). No step may touch the baseline or the currently-referenced candidate.

**Q6 — Rollback/fallback incl. corrupt metadata/unavailable candidate.**
*Answer:* Rollback = explicit command swapping selection to `previous` (or baseline) for new attempts; never deletes a referenced dir; keeps reason. **Pre-pin fail-closed:** resolver returns bundled *before* the first attempt when (a) selection record missing/corrupt/partial, (b) selected managed candidate missing/ineligible, (c) managed probe/startup failure — no fallback event is emitted at all (bundled was the intended first candidate). **Post-pin managed failure:** never switch in mid-attempt; the failure is typed as `runtime_candidate_failed` (candidate-defect only) and — only when the orchestrator candidate-fallback hook is enabled (deferred to Phase 2, §10.3) — one **new same-engine attempt** is created with a fresh pin (resolver now returns bundled); it is a real attempt (own `attempt_started`/`attempt_failed`, own pin/ref) through the existing orchestrator/runtime/terminal authority, never a hidden retry. Baseline final fallback is always available once Phase 0 ships; before that, "fallback to bundled" is **not possible** (P0 finding) and must be recorded as NOT VERIFIED/blocked.

**Q7 — Retention/cleanup vs active references.**
*Answer:* Keep immutable `versions/<id>` dirs for: selected, previous, every candidate **referenced by an in-flight attempt** (see below — **not** queue-pending: pending jobs have not pinned a candidate), plus a retention window (e.g. last N releases) for rollback. **Exact ref points:** acquire immediately after the pin is resolved inside `buildAttemptContext` (before `engine.execute`); release in a `finally` after `engine.execute` settles (attempt succeeded/failed/cancelled — process tree already settled by `runStreamingCommand`/`killChild`); auth-recovery and engine-ladder re-attempts each acquire/release their own. Cancellation releases after the kill/settlement path completes. **GC:** explicit lifecycle op; may delete **only unreferenced** candidates (not selected/previous/within retention), under a single shared lifecycle lock (candidate ops: pin/activate/rollback/stage/GC) after removing the candidate from the availability index first; **global wait for all yt-dlp activity is NOT required** — per-candidate reference checks under the lock are sufficient and avoid blocking on long downloads (safe because a pending attempt re-resolves at start and acquires its ref before GC can act under the same lock). Baseline dirs (including derived baseline venv) are never GC'd.

**Q8 — Authenticity/integrity/downgrade evidence.**
*Answer:* Repo today: binary assets (Deno 2.7.1, FFmpeg 8.0.1) pin size+SHA-256 in code (`managedRuntimeBootstrap.mts:800-885`) with `verifyDownloadedRuntimeAsset` (`:256-274`); yt-dlp install pins only a PyPI version string (no hash), from a single index URL (`:529`, `:951`); no signature, no redirect allowlist, no downgrade rule (existing `compareLooseVersions` is informational only). Upstream: PyPI JSON gives per-file `digests.sha256` + upload timestamps; GitHub releases give `SHA2-256SUMS` + PGP `SHA2-256SUMS.sig` + `_update_spec`; repo carries **no** yt-dlp maintainer PGP key. *Recommended:* pin wheel digest in the app-owned manifest (baked at release time), `--require-hashes --only-binary=:all: --no-deps`, HTTPS host allowlist + redirect check, explicit no-silent-downgrade rule (managed only ≥ selected; baseline fallback logged separately as fallback). **[CONFIRMED ABSENT]** any proof that a PyPI version string alone is sufficient — it is not.

**Q9 — Windows/macOS blockers before implementation.**
*Answer:* **Windows**: (1) proxy-front vs `real/` mismatch (confirmed) incl. `--ffmpeg-location`/PATH direction; (2) managed deno never on PATH; (3) Authenticode/signing unverified; (4) in-place rebuild vs active processes; (5) exact userData path semantics for installed vs portable unverified. **macOS**: (1) Gatekeeper/quarantine behavior for post-install downloaded managed binaries unverified; (2) codesign/notarization/stapling absent; (3) x64 release verification absent (arm64-only matrix); executable-bit and symlink-layout facts are confirmed-OK but relocation sensitivity must be pinned per attempt.

**Q10 — Recommended phases and minimum safe delivery.**
*Answer:* Phase 0 = bundled baseline (immutable packaged wheel + manifest; **offline materialization** into a replaceable userData cache) + **shared-tools digest binding & reinstall gate** + selection record + per-attempt identity pinning (complete runtimeSetId) + read-only Diagnostics facts + tests (no updater, no user-visible change) — **this is the minimum safely deliverable slice**; it also fixes the P0 baseline contradiction. *Automatic post-execution same-engine fallback to bundled is **deferred** (Phase 2); Phase 0 contains only the pre-pin fail-closed path (bundled chosen before attempt #1), so no new retry semantics are introduced.* Phase 1 = release manifest + check/download/verify/stage/probe (no activation). Phase 2 = activation/rollback + refcounting + orchestrator candidate-fallback hook (post-pin, one re-attempt) + explicit commands. Phase 3 = GC + app-update coexistence + repair UX + real-platform trust probes. Everything beyond Phase 0 is gated on the proxy-front reconciliation, macOS trust probes, and security review of the authenticity chain.

---

## 10. Lead-review amendment (2026-08-25)

> Narrow, Lead-review-driven amendments. These **supersede** the corresponding earlier statements where they conflict; everything else in the report stands. No re-investigation, no implementation, no worker dispatch. Architecture decisions changed: **shared-tool binding model (§10.1), baseline canonical-vs-cache split (§10.2), same-engine fallback as an explicit orchestrator hook deferred to Phase 2 (§10.3), per-candidate ref-based GC (§10.4)**; evidence-provenance tightening: **upstream source URLs/retrieval notes and the PGP trust-root status (§10.5)**.

### 10.1 Complete runtime identity vs shared mutable dependencies — DECISION: (c) digest-bound shared singletons + reference-gated reinstall

- **Problem restated:** the Q4 pin includes ffmpeg/ffprobe/deno, but their roots (`<userData>/runtimes/ffmpeg/<target>/real/ffmpeg`, `.../deno/<target>/real/deno`) are in-place mutable (`replaceFile` unlink→rename→copy, `managedRuntimeBootstrap.mts:738-746`, `1047-1051`, `1113-1122`); `resolveSharedMediaToolsRuntime` uses the same paths for the transcode path (`service.ts:1403`), so per-candidate copies would diverge.
- **(b) copy into each candidate — REJECTED.** ~120 MB per candidate (ffmpeg 72 MB + deno 47 MB) × N candidates × 1 target; disk blowup; the transcode/media-tool path would stop using the same file identity as the download attempt; and it duplicates the exact immutability problem instead of solving it.
- **(a) full per-digest versioned media-tool dirs — NOT REQUIRED.** It would put ffmpeg/deno on a version-dir lifecycle, which is the beginning of a generic backend updater; P2 must stay yt-dlp-specific, and ffmpeg/deno are **not updateable by P2** (their pins are app-release code constants, `managedRuntimeBootstrap.mts:800-885`).
- **Chosen (c):**
  1. Media tools remain **shared singletons** at today's single locations (no copies, no second layout).
  2. Their **identity is bound by digest at pin time**: `mediaTools` (§3.2) records `{version, sha256, path}` from the app-owned artifact specs + a pin-time **observed digest check** of the actual files (reuse existing `sha256Hex`, `managedRuntimeBootstrap.mts:250-254`). Mismatch ⇒ the attempt reports `degraded` and the resolver treats the shared tool set as not-eligible-but-baseline-capable; it never mixes.
  3. **Reference-gated reinstall:** any path that would replace `real/ffmpeg(.exe)`/`deno(.exe)` (app pin bump, `forceReinstall`, or missing-file repair) must first acquire the shared lifecycle lock and verify **zero active references** against both media tools (download attempts + transcode tasks). Because P2's own update path never touches ffmpeg/deno, the only triggers are app-release boundaries, where reference-gating is cheap and correct. This closes the active-use race without versioning the tools.
  4. **Ownership:** `dependencies`/`packageSetId` = pip packages (owned by `electron/managedPythonPackageManifest.mts`; today exactly `[yt-dlp==2026.07.04]` with an empty base dep set per §6); `mediaTools` digests = code-pinned artifact specs (same file as today, promoted to an app-owned shared-tools manifest for diagnostics/identity); bundled Python version = `.official-python-runtimes.json`; all app-owned, none user/Diagnostics-owned. `runtimeSetId = sha256(canonical({packageSetId, mediaTools digests, bundledPythonVersion, target}))` — **this is the single value an attempt pins and a GC/rollback never re-derives differently.**
- **Phase 0 safety revision:** Phase 0 as previously written was *mostly* safe but **incomplete**: without (c), the attempt identity could still silently span a media-tool binary swap, and Phase 0's "no behavior change" claim would be false for the transcode path. With (c) — digest binding + reference check + reinstall gate — Phase 0 is safe as the minimum slice. The reinstall gate is small and testable (one call site in `ensureManagedFfmpegRuntimeReady/DenoRuntimeReady` + a refcount shared with yt-dlp attempts).

### 10.2 Bundled baseline: immutable source vs derived cache

- **Immutable source payload (canonical):** packaged wheel asset (e.g. `desktop-assets/binaries/ytdlp-baseline/yt_dlp-<ver>-py3-none-any.whl`; the wheel is target-independent) + `.official-ytdlp-baseline.json` (wheel sha256/size/version, declared compatible dep hashes, min Python) + bundle-time verification (extend `verify-macos-python-runtime-package.mjs`, add Windows analog). This is app content: read-only, versioned with the app, never written by any runtime/updater path.
- **Target-specific known-good:** target-specificity comes from the **target-specific verification record**, not from a per-target binary: for each target, the verifier asserts the bundled Python (`python-<target>`, 3.11.15) + the universal wheel + declared dep set all exist and checksum-match. The per-target venv is then *derived* deterministically.
- **Derived materialization = replaceable cache, NOT canonical:** `<userData>/runtimes/yt-dlp/<target>/baseline/` is a cache. It can be deleted/corrupted; its identity/known-good is defined by `(wheel digest + bundledPythonVersion + target + layoutVersion)`, recorded in `baseline.json`, not by its continued existence. Rebuild = deterministic, **offline** (`python -m venv` + `pip install --no-index --find-links <bundled wheels>` + `--require-hashes`), so rebuild never depends on network/upstream availability — this is what makes "baseline always available" a real guarantee once Phase 0 ships.
- **Behavior when missing/corrupt / cannot rebuild:**
  - missing/corrupt cache ⇒ baseline-ensure rebuilds offline from the bundled wheel (part of the gate/bootstrap ensure path; **never** Diagnostics, never the updater).
  - rebuild impossible (bundled Python missing/corrupt — gate already fails early, `runtimeDependencyGate.mts:110-124`; or wheel/deps missing ⇒ package verification should have failed at install time) ⇒ the runtime gate goes `failed` with a reinstall-style error before any downloader bootstrap, and **new attempts fail closed** — baseline is the safety net, so if it cannot materialize, the engine is genuinely degraded and is reported as such. **Managed is NOT promoted to fallback** in this state (managed ≠ known-good; silently flipping to managed would transfer authority and hide the failure).

### 10.3 Same-engine fallback as a NEW attempt (smallest architecture change) — DEFERRED to Phase 2

- **Current truth:** `DownloadOrchestrator.executePrepared` reports `attempt_started` **before** `buildContext` (i.e., before pinning) and creates exactly **one** execution per `enginePlan` (`download-orchestrator.ts:145-158`); there is no second candidate attempt for the same yt-dlp engine id, and provider plans list yt-dlp once.
- **Smallest change (one module, invariant-preserving):** add a per-engine-plan **candidate-fallback slot** inside `executePrepared` only:
  1. First attempt executes normally (pin → execute → report).
  2. If it **throws** a typed error with the new stable classification `runtime_candidate_failed` (produced only by the yt-dlp runner/adapter for candidate-defect evidence: spawn ENOENT/EACCES, interpreter/import failure, `--version` mismatch — **not** network/site/availability errors) and the engine plan's `runtimeFallbackAllowed === true` (new optional flag, default true for yt-dlp): report `attempt_failed`, report a new `fallback` (kind `runtime_candidate`, from==to==engine id, attempt-indexed), then **execute again** with a fresh `buildContext` (new pin; resolver now returns bundled because the selection is marked degraded/failed for this generation) and report `attempt_started` for it. Bounded to **one** retry per engine plan.
  3. Terminal semantics unchanged: `DownloadJobService` still sees exactly one terminal; the diagnostic recorder already supports monotonic `attemptIndex/attemptId`, so the two attempts are visible; no new runner, no new registry, no plan/routing change, no provider-plan mutation.
- **Pre-pin vs post-pin (explicit):**
  - **Pre-pin selection fail-closed:** resolver returns bundled **before attempt #1**; no fallback event, no extra attempt — bundled *was* the intended first candidate. Covers missing/corrupt selection, ineligible/missing managed candidate, shared-tool mismatch.
  - **Post-pin managed failure:** attempt #1 pinned managed and failed as candidate-defect ⇒ *no in-attempt switch*; the orchestrator hook (above), when enabled, creates attempt #2 with bundled. Without the hook, it is just a typed terminal failure.
- **Scope statement:** automatic post-execution fallback is **DEFERRED — it is NOT part of the minimum safe slice.** Phase 0 ships only the pre-pin fail-closed path (bundled-first), so no new retry semantics exist. Phase 1 (stage/probe, no activation) also does not need it. Phase 2 adds the hook **behind a policy flag, visible in diagnostics**, and it must be covered by tests for exactly-one-retry and no-fallback-on-network-errors. No hidden retry is invented at any phase: the only automatic same-engine retries remain (i) yt-dlp's existing internal transient/section-format retries (unchanged) and (ii) this one explicit candidate-fallback attempt when Phase 2 lands.

### 10.4 Retention and ref accounting (corrections)

- **Correction:** queue-**pending** jobs have **not pinned a candidate** (pin happens at `buildAttemptContext`, i.e., when the attempt actually starts). Previously written "active/pending" reference wording is wrong; references belong only to **in-flight attempts / process trees**.
- **Exact acquire/release points:** acquire the candidate reference immediately after the pin resolves inside `buildAttemptContext` (before `engine.execute`); release in `finally` after `engine.execute` settles (attempt succeeded / failed / cancelled) — `runStreamingCommand` awaits child `close` and `killChild` waits for tree exit (`processRunner.ts:47-101`), so the process tree is settled before release. Engine-ladder fallback, auth-recovery retry, and candidate-fallback re-attempt each acquire/release their own reference; yt-dlp's *internal* retries are covered by the single acquire of their one `execute()` call.
- **GC under lock — no global quiescence required:** a single shared lifecycle lock serializes candidate lifecycle ops (pin, activate, rollback, stage, GC). GC may delete **only** candidates that are (a) not `selected`, (b) not `previous`, (c) outside the retention window, and (d) **not referenced** by any in-flight attempt — checked under the lock after the candidate is removed from the availability index. This is safe because a pending attempt re-resolves at its start (under the same lock) and acquires its reference before any delete can be ordered against it. Global "wait for all yt-dlp activity to stop" is **explicitly NOT required** and would wrongly block GC behind long downloads; it is retained only as a conservative fallback if per-candidate reference tracking is ever deemed untrusted. GC never runs during activation/rollback (same lock) and never touches baseline dirs.

### 10.5 Upstream evidence provenance: authoritative source URLs + PGP trust-root status

> Lead-review addition: every upstream authenticity claim in §6 now carries an explicit authoritative source URL and a retrieval note, and the PGP trust-root policy is explicitly classified **NOT VERIFIED** rather than treated as an established verification chain. Nothing here changes the §7 gates or the phase plan; it tightens the evidence standard.

**Source endpoints (all fetched live over HTTPS; no cache/proxy):**

| Claim | Authoritative URL(s) | What was confirmed |
|---|---|---|
| Pinned-release package metadata | `https://pypi.org/pypi/yt-dlp/2026.7.4/json` | `requires_python >=3.10`; every `requires_dist` entry is `extra == …`-conditional ⇒ **base requires_dist empty**; `provides_extra = [default, pin, deno, curl-cffi, pin-curl-cffi, pin-deno, pin-secretstorage, secretstorage]`; `urls[0]` wheel `yt_dlp-2026.7.4-py3-none-any.whl`: size 3,184,705 B, `digests.sha256 = f11f2b11…266`, `has_sig = false`, `upload_time_iso_8601 = 2026-07-04T22:42:12.989494Z`; `urls[1]` sdist sha256 `b0948134…4432`, `has_sig = false`; `ownership.organization = "yt-dlp"` |
| Wheel download | `https://files.pythonhosted.org/packages/f9/8a/…/yt_dlp-2026.7.4-py3-none-any.whl` | URL taken verbatim from the JSON above (mirror of record); no signature (`has_sig = false`) |
| GitHub release (by tag) | `https://api.github.com/repos/yt-dlp/yt-dlp/releases/tags/2026.07.04` | release `id 349050911`, `tag_name 2026.07.04`, `published_at 2026-07-04T22:41:44Z`, `immutable: true`, uploader `github-actions[bot]`; assets incl. `SHA2-256SUMS` (1,595 B, asset `digest sha256:eca42575…48c64`), `SHA2-256SUMS.sig` (`content_type application/pgp-signature`, 566 B, digest `sha256:3fb88fc2…09c6`), `SHA2-512SUMS(.sig)`, `_update_spec` (2,191 B), `yt-dlp.exe`, `yt-dlp_win.zip`, `yt-dlp_win_arm64.zip`, `yt-dlp_macos`, `yt-dlp_macos.zip`, … — each with `browser_download_url` under `https://github.com/yt-dlp/yt-dlp/releases/download/2026.07.04/…` |
| Release page (human-readable) | `https://github.com/yt-dlp/yt-dlp/releases/tag/2026.07.04` | rendered notes; body states "A description of the various files is in the README" |
| Update/signing documentation | `https://github.com/yt-dlp/yt-dlp#release-files` (README.md; also embedded verbatim in the PyPI JSON `info.description`) | `SHA2-256SUMS.sig` = "GPG signature file for SHA256 sums"; verification recipe `curl -L https://github.com/yt-dlp/yt-dlp/raw/master/public.key | gpg --import` + `gpg --verify SHA2-256SUMS.sig SHA2-256SUMS`; UPDATE section documents channels `stable`/`nightly`/`master` + `--update-to` (standalone binaries only; pip users "simply re-run the same command that was used to install") |
| Signing key (referenced by README) | `https://github.com/yt-dlp/yt-dlp/blob/master/public.key` (raw: `https://raw.githubusercontent.com/yt-dlp/yt-dlp/master/public.key`) | exists; ASCII-armored OpenPGP public key; UID `Simon Sawicki (yt-dlp signing key) <contact@grub4k.xyz>`; the README publishes **no key fingerprint** — it provides only this key URL |

**Verdicts (explicit):**

- **[UPSTREAM CONFIRMED]** — existence and documented purpose of `SHA2-256SUMS` + detached PGP `.sig`; README-documented verification recipe and public-key URL; PyPI per-file sha256/`upload_time_iso_8601`; PyPI files are **not** signed (`has_sig = false`); release assets carry GitHub `digest` values (sha256 as stored on GitHub).
- **[NOT VERIFIED] — PGP trust-root policy.** The signing key is published in the **same repository/channel** as the release assets and signatures (`github.com/yt-dlp/yt-dlp/blob/master/public.key` fetched over GitHub's TLS). Upstream publishes **no key fingerprint, no key-rotation/retirement statement, and no out-of-band anchor** (the README offers only the key URL); the documented recipe is exactly trust-on-first-use of `github.com`. Therefore: *the mere presence of `SHA2-256SUMS.sig` must NOT be treated as an established verification chain* — a compromise of the yt-dlp GitHub repo/account would replace key + sums + sig + assets together, and GitHub TLS alone does not separate them. PGP would only add cross-channel value if Ameow pins a verified key identity via an **independent** channel (e.g., a fingerprint confirmed out-of-band from a second authoritative source or by maintainer correspondence), which requires running `gpg --with-fingerprint` on a fetched key and recording the fingerprint in the app repo — an explicit future decision, **not** part of Phase 0/1, and not currently established.
- **[NOT VERIFIED]** — that the published `.sig` actually verifies against `public.key`: this research verified presence, content-type, size and the README recipe; it did **not** run `gpg --verify` or obtain an out-of-band key. Any P2 claim "sig is valid" must be generated by running verification with the pinned key, not inferred.
- **Consequence for the P2 chain (unchanged):** the wheel path's authenticity does **not** depend on PGP. Anchor = app-owned manifest pinning the PyPI-published `digests.sha256` at release time (one-time build-time trust of `pypi.org`/`files.pythonhosted.org` over TLS) + `pip install --only-binary=:all: --require-hashes --no-deps` + host allowlist with redirect check. PGP/GitHub-sums remain an optional extra only for a hypothetical standalone-binary format, gated on the trust-root question above.
