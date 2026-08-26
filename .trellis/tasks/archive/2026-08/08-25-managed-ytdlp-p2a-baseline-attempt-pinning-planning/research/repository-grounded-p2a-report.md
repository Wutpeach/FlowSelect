# P2-A Repository-Grounded Report: Immutable Bundled Baseline + Attempt Runtime Pinning

> Research artifact for task `08-25-managed-ytdlp-p2a-baseline-attempt-pinning-planning` (parent: `08-25-managed-ytdlp-update-rollback-planning`; sibling authority: `../08-25-managed-ytdlp-update-rollback-planning/design.md` and P2-V design).
> Evidence read from the current working tree (main @ `d4fe27b` + P2-V repairs already landed in the tree) on 2026-08-25. **No production code, config, spec, packaging script or runtime asset was changed. No Architecture PASS is granted.**
> Evidence classes: **[REPO-CONFIRMED]** file:line in working tree / live userData; **[UPSTREAM-CONFIRMED]** HTTPS source URLs (fetched 2026-08-25); **[NOT VERIFIED (real host)]** external-gate only; **[RECOMMENDATION]** decision input for the Lead.
>
> Frozen-decision compliance: Windows `real/` layout (not reopened); explicit Ameow-owned Deno path (already implemented, verified below); `ejs:github`/machine-JS/plugins forbidden (already implemented); target-scoped runtimeSet lifecycle coordinator with leases as the accepted identity-stability mechanism; no digest-addressed dependency storage recommendation (no new contrary evidence found — instead, the coordinator and pin-time digest *binding* already satisfy the invariant); execution authority boundaries unchanged; **“P2-A 只建立安全基础，不提供用户更新能力”** quoted and enforced throughout — no updater, no candidate download/staging, no activation/rollback/GC, no automatic fallback hook.

---

## 0. Executive summary

**Current-state delta (important):** several P2-V repairs have **already landed** in the working tree since the P2 report was authored:

- **[REPO-CONFIRMED] The target-scoped runtime-set lifecycle coordinator is implemented and wired.** `electron/runtimeSetLifecycle.mts` (leases per capability, `runExclusive` serialization, `RuntimeSetBusyError` on mutation-while-leased, `activeLeaseCount`); wired in `electron/main.mts:246` (instance), `:251-260` (every `ensureManaged*RuntimeReady` runs through `runMutation`), `:1340-1350` (engine binding `ensureReady` via `runMutation`), `:1466-1474` (consumer-wise `acquireLease` with `prepare = ensureRuntimeSetCapabilities`). Consumers: `contracts.ts:35` (`"yt-dlp" | "gallery-dl" | "media-tools"`), capability map `main.mts:1301-1304` (`yt-dlp → [yt-dlp, ffmpeg, deno]`; `gallery-dl → [gallery-dl]`; `media-tools → [ffmpeg]`). Attempt lease acquired inside `buildAttemptContext` (`service.ts:1546-1553`), probe lease `service.ts:893`, transcode leases `service.ts:1152/1200`; lease object rides the execution context (`engineExecutionContext.ts:62-67`) and is released in adapter `finally` after the runner settles (`ytDlpEngineAdapter.ts:54-59`, `galleryDlEngineAdapter.ts:57-60`). Tests: `runtimeSetLifecycle.test.mts`, `engineAdapters.test.ts:71-104`, `service.test.ts:1104-1145` (probe), `:3480-3540` (media tools).
- **[REPO-CONFIRMED] Machine JS fallback and plugin dirs are closed; Deno is bound explicitly.** `engineManifest.ts:182` `configIsolationArgs: ["--ignore-config", "--no-plugin-dirs"]`; `ytDlpCommandPlan.ts:35-49` pushes `--extractor-args youtube:player_js_variant=tv` and `--js-runtimes deno:<absolute managed deno path>` (from `context.binaries.deno`, `ytDlpDownload.ts:265-268`); `--remote-components` no longer appears anywhere in `src/` (tests assert absence: `ytDlpCommandPlan.test.ts:87`, `ytDlpDownload.test.ts:253` etc.). Spec template confirms canonical line: `templates/markdown/spec/backend/electron-runtime-contracts.md:153`.
- **[REPO-CONFIRMED] yt-dlp-ejs is in the pip set.** `electron/managedPythonPackageManifest.mts:13-31`: `installSources: ["yt-dlp==2026.07.04", "yt-dlp-ejs==0.8.0"]`, `packageSetId: "yt-dlp==2026.07.04;yt-dlp-ejs==0.8.0"`; installed by the pip array (`managedRuntimeBootstrap.mts:957`), stored in metadata (`:984`), and is a rebuild trigger (`:481`). Script mirror updated (`scripts/ensure-capability-probe-runtime.mjs:79,131,143`).

**What is still absent (the actual P2-A gap):**

- **[REPO-CONFIRMED] No packaged baseline payload.** `electron-builder.config.mjs:29-37` packages only `python-<target>/**`; `desktop-assets/binaries/` = 3 python dirs + `.official-python-runtimes.json` only; the macOS verifier **rejects** any `yt-dlp*`/`gallery-dl*` entry under binaries (`scripts/verify-macos-python-runtime-package.mjs:340-357`).
- **[REPO-CONFIRMED] No offline/hash-verified materialization.** `managedRuntimeBootstrap.mts:950-960` installs with `pip install --upgrade --disable-pip-version-check --no-cache-dir …installSources` under a route-aware environment (`buildManagedPythonEnv`) — network PyPI, pinned version strings only, **no `--no-index/--find-links/--require-hashes/--only-binary`** (grep across `src/`, `electron/`, `scripts/`: zero hits).
- **[REPO-CONFIRMED] No selection authority.** No `selection.json` anywhere in production code (grep: only unrelated worktrees); `resolveYtDlpStatus` hardcodes `expectedSource: "managed"` and resolves only the managed venv (`runtimePaths.ts:238-252,160-166`); `fallbackSource/fallbackPath` are dead type affordances (`src/types/runtimeDependencies.ts:11-13`).
- **[REPO-CONFIRMED] No per-attempt runtime identity record.** The lease preserves *path stability*, but nothing computes/records versions+digests+runtimeSetId at pin time; adapter binaries are still resolved once at composition (`main.mts:1422-1423`) and splices the same strings into every invocation.
- **[REPO-CONFIRMED] P1 Diagnostics expose no baseline/identity/lease facts.** `src/types/diagnostics.ts` (runtime snapshot fields only) and `electron/diagnostics.mts:52-78` (`runtimeDefinitions` still says `expectedSource: "managed"` for ytDlp; no lease count).

**Verdict input (not an Architecture PASS):** P2-A is implementable on current repository evidence. The previously identified repository blockers for the *baseline + pinning* slice are gone (lease coordinator exists, Deno/PJS/plugin isolation exists, ejs in set). Only implementation-scope work remains (baseline payload + verifier + offline materialization + identity pin/record + diagnostics + tests). Nothing about P2-A requires network update, candidate download, activation, rollback, GC, or fallback machinery. Retained external release gates (PRD §Retained external release gates) are recorded in §8 and are not expanded.

---

## 1. Canonical packaged baseline payload design (A1, A2)

### 1.1 Source of truth and payload ownership

- **[RECOMMENDATION / mirrors CPython]** The canonical baseline is **app-packaged content**, owned by the app **release process** (repo + CI), exactly like `.official-python-runtimes.json` (desktop-assets) and `electron/managedPythonPackageManifest.mts` (pins). File layout (proposal — the develop worker owns final naming):

```text
desktop-assets/binaries/
  .official-python-runtimes.json           # existing (unchanged)
  python-<target>/                        # existing bundled CPython (unchanged)
  ytdlp-baseline/
    .official-ytdlp-baseline.json         # NEW: canonical baseline manifest
    yt_dlp-2026.7.4-py3-none-any.whl      # NEW: immutable app-approved wheel
    yt_dlp_ejs-0.8.0-py3-none-any.whl     # NEW: immutable app-approved wheel
    requirements.txt                      # NEW: pip -r file with --hash lines for both wheels
```

Rationale: the wheels are **`py3-none-any`** (target-independent; [UPSTREAM-CONFIRMED] `https://pypi.org/pypi/yt-dlp/2026.7.4/json`: `yt_dlp-2026.7.4-py3-none-any.whl`; `https://pypi.org/pypi/yt-dlp-ejs/0.8.0/json`), so **one payload serves all three targets**; target-specificity is achieved by the per-target verification record (bundled `python-<target>` + layout version), not by per-target binaries. This matches the accepted P2 model (design.md “The universal yt-dlp wheel becomes target-specific as a runnable baseline through the manifest-approved combination…”).

### 1.2 Baseline manifest (minimum fields, no P2-B/C fields)

```jsonc
{
  "schemaVersion": 1,
  "appBaseVersion": "0.3.1",                      // informative; a new manifest ships with each app release
  "packagedAt": "2026-08-25T…Z",
  "ytDlp": { "version": "2026.07.04", "wheel": "yt_dlp-2026.7.4-py3-none-any.whl",
             "size": 3184705, "sha256": "f11f2b11…266", "sourceUrl": "https://pypi.org/pypi/yt-dlp/2026.7.4/json" },
  "ytDlpEjs": { "version": "0.8.0", "wheel": "yt_dlp_ejs-0.8.0-py3-none-any.whl",
                "size": <…>, "sha256": <…>, "sourceUrl": "https://pypi.org/pypi/yt-dlp-ejs/0.8.0/json" },
  "packageSetId": "yt-dlp==2026.07.04;yt-dlp-ejs==0.8.0",   // MUST equal managedPythonPackageManifest spec — single source
  "layoutVersion": 1,
  "minPython": [3, 10, 0],
  "pythonCompatibility": { "targets": ["x86_64-pc-windows-msvc", "aarch64-apple-darwin", "x86_64-apple-darwin"],
                            "pythonManifestIdentity": ".official-python-runtimes.json" },
  "executionFlags": { "remoteComponents": "disabled", "pluginDirs": "disabled",
                       "jsRuntime": "managed-deno-absolute-path", "configIsolation": true },
  "probe": { "command": ["--version"], "expectedPrefix": "2026.07.04" }
}
```

- **package-set identity responsibility**: `packageSetId` in **one** app-owned place — `electron/managedPythonPackageManifest.mts` (existing, already the single source read by bootstrap, metadata, rebuild trigger, scripts via `scripts/managed-python-package-manifest.mjs`). The baseline manifest **must not define its own pins**; it references the same spec (or a release-time generator asserts equality). No second version table (P2 rule).
- **EJS wheel hash**: currently we publish only the yt-dlp wheel digest; ejs 0.8.0 wheel digest must be collected at release time from PyPI JSON (`digests.sha256`, `has_sig:false`) — [UPSTREAM-CONFIRMED] availability; exact value recorded at release prep (NOT VERIFIED here, fetched earlier for yt-dlp only; ejs size/hash must be fetched during P2-A release prep — the report states this as an open data point, not a blocker).
- **Python compatibility**: baseline manifest declares `minPython` (⩾3.10 verified: `requires_python >=3.10` [UPSTREAM-CONFIRMED]); per-target actual = `.official-python-runtimes.json` entry (`releaseTag 20260325`, python `3.11.15`, per-target asset URL/sha256/`executableRelativePath` — [REPO-CONFIRMED] desktop-assets). Existing compile-time guard `assertPythonVersionSatisfiesManagedPackage` (`managedRuntimeBootstrap.mts:380-405`) reused, not rewritten.
- **Media-tool facts participate — but not as payload**: FFmpeg/FFprobe/Deno are **not** bundled with the baseline and are **not** pinned by the baseline manifest (their pins are app-release code constants: `selectFfmpegRuntimeArtifactSpec`/`selectDenoRuntimeArtifactSpec`, `managedRuntimeBootstrap.mts:800-885`; versions 8.0.1 / 2.7.1). The P2-A manifest only carries an **observed-facts contract** (§6): the attempt identity records their version/digest/path at pin time. No digest-addressed storage, no copies, no new lifecycle (frozen decision).

### 1.3 Bundle-time verification (who proves what)

- **NEW `scripts/verify-ytdlp-baseline-assets.mjs`** (platform-agnostic): given a `binaries` dir, assert (a) manifest parses + schemaVersion/layoutVersion supported; (b) both wheels exist, sizes and sha256 match the manifest (reuse `sha256Hex`-style hashing already used at `managedRuntimeBootstrap.mts:250-254`); (c) `packageSetId` equals the compiled `managedPythonPackageManifest` spec; (d) `requirements.txt` hash lines match the manifest hashes; (e) `--no-index --find-links` install would resolve: wheel filenames present, no other wheels needed (`--no-deps` + empty base `requires_dist` — [UPSTREAM-CONFIRMED] base deps empty for both).
- **Extend `scripts/verify-macos-python-runtime-package.mjs:340-357`**: replace the blanket `yt-dlp*`/`gallery-dl*` rejection with “allow exactly the baseline asset set”: expected entries = `python-<target>` + `ytdlp-baseline/` (+ the two json manifests), then run the new verifier against the packaged `binariesDir` — fail the package if absent/mismatched. **Windows analog**: the new verifier script is platform-agnostic and should run in release CI on the Windows artifact too (or against the electron-builder output dir); the commit must add the CI step at `release.yml` alongside the existing macOS step (`release.yml:125-127`; note the macOS step already runs `require-execution require-downloader-bootstrap require-relocation-rebuild` — those stay, unchanged).
- **`electron-builder.config.mjs:29-37`**: add the baseline dir to `packagedBinaryPatterns` (e.g. `desktop-assets/binaries/ytdlp-baseline/**/*`), so resources carry wheels + manifest + requirements.txt. `asar: false` already in use for binaries (python ships unpacked — [REPO-CONFIRMED] pattern); wheels must also land on disk (pip needs real files).
- **Authenticity anchor** (unchanged from P2): PyPI JSON digest → manifest pin baked at release time → bundle-time sha256 verification. No PGP (wheels `has_sig:false`; trust root NOT VERIFIED — P2 report §10.5). No runtime network trust for the baseline at all.

---

## 2. Canonical immutable payload vs userData materialized baseline cache (A3, A7)

### 2.1 Split

| | Canonical (immutable) | Materialized (replaceable cache) |
|---|---|---|
| Location | packaged resources: `<resources>/app/desktop-assets/binaries/ytdlp-baseline/` (app content) | `<configDir>/runtimes/yt-dlp/<target>/baseline/` (`runtimeRootPathFor` pattern `runtimePaths.ts:94-103`; `configDir` = userData, `main.mts` `getUserDataDir()`)
| Content | wheels + manifest + requirements.txt | venv (`python -m venv`, no `--copies` per existing `managedPythonVirtualenvArgs` `managedRuntimeBootstrap.mts:372-376`), entrypoint `bin/yt-dlp`/`Scripts/yt-dlp.exe`, `baseline.json` identity record |
| Identity | manifest sha256 + wheel digests (app-owned, immutable) | `baseline.json`: `{schemaVersion, layoutVersion, packageSetId, manifestDigest, ytDlpVersion, ejsVersion, python {version, target, path}, probeVersion, materializedAtMs}` |
| Lifecycle | app release only; never touched by any runtime path | rebuildable offline; never touched by P2 updater; GC never touches baseline dirs |
| Known-good | defined by (wheel digests + bundled Python version/target + layoutVersion), **not** by cache existence | same identity facts, re-derived at materialization |

### 2.2 Offline materialization (exact flags)

```text
<python> -m venv <cache>/venv
<cache>/venv/bin/python -m pip install --no-index --only-binary=:all: --require-hashes --no-deps -r <resources>/ytdlp-baseline/requirements.txt
```

- `--no-index` + `--find-links <resources>/ytdlp-baseline` (via `-r` file or explicit `--find-links`) + `--require-hashes` (requirements.txt carries `yt-dlp==2026.07.04 --hash=sha256:f11f2b…` and `yt-dlp-ejs==0.8.0 --hash=sha256:…`) + `--only-binary=:all:` + `--no-deps` (base `requires_dist` empty — [UPSTREAM-CONFIRMED]). Also set `PIP_NO_INDEX=1` in env (defense in depth) and **never pass `fetch`/route/network options** — this path is network-free by construction, unlike today’s `buildManagedPythonEnv(paths, context.network)` pip spawn (`managedRuntimeBootstrap.mts:950-960`).
- **Runs through the lifecycle coordinator as a mutation**: offline materialization replaces the current “ensure+build” step; it must be wrapped in `runMutation` (same as `main.mts:251-260`) so a repair/rebuild never races an active attempted/transcode — this is the existing accepted mechanism (frozen decision), and the baseline cache build is exactly a mutation of the yt-dlp capability.
- **Atomic publish/readiness**: build into `baseline/.staging-<n>/`, then (a) write `baseline.json` last, after entrypoint existence + `readCommandVersion` probe (reuse `readCommandVersion`, `managedRuntimeBootstrap.mts:969`) + `assertPythonVersionSatisfiesManagedPackage`, (b) rename staging dir → `baseline/` (or publish `baseline.json` via temp+rename as the readiness marker). `baseline.json` **is the readiness record**: presence + matching identity ⇒ ready; anything else ⇒ not ready (never partially-ready).

### 2.3 Rebuild triggers (cache only)

`shouldRebuildYtDlpBaseline(cache, manifest, python)` returns true when any of: entrypoint missing; `baseline.json` missing/unparseable; `schemaVersion`/`layoutVersion` mismatch; `packageSetId` mismatch (pin/version change); `manifestDigest` mismatch (app-update payload change); `python.version`/`python.path` mismatch (bundled python changed/relocated — same relocation sensitivity as today’s `shouldRebuildManagedPythonRuntime`, `managedRuntimeBootstrap.mts:447-500`, incl. `bundledPythonPath` rebuild trigger); probe version mismatch vs `probe.expectedPrefix`. Rebuild is **always offline** and always under `runMutation`.

### 2.4 Distinct failure semantics (fail-closed matrix)

| State | Classification | Behavior | Boundary |
|---|---|---|---|
| Canonical payload missing/corrupt (packaged resources) | **app-install defect** | Gate `failed` with reinstall-style error **before any downloader bootstrap** (matching existing gate ordering: python fails first — `runtimeDependencyGate.mts` `bundledFailureErrorFrom`/`startBootstrap` python check, and `src/electron-runtime/runtimeDependencyGate.ts:110-124` equivalent logic) | package verifier should have caught at build; runtime fails closed, no download, no network, no promotion |
| Bundled Python missing/corrupt | existing gate `failed` (unchanged) | same as above (`resolvePythonStatus` `runtimePaths.ts:269-283`) | unchanged |
| Cache missing | **automatic prep** (not failure) | offline rebuild from canonical | baseline-ensure function (a mutation), startup gate or first attempt (via lease `prepare`) |
| Cache corrupt / partial / unreadable `baseline.json` | automatic prep (rebuild); if rebuild fails ⇒ **fail-closed** (`failed`, reinstall-style reason) | rebuild offline; never fall back to managed (managed does not exist in P2-A anyway; the rule is recorded for P2-B/C) | baseline-ensure only |
| Version/hash mismatch (cache vs manifest) | automatic prep (rebuild); mismatch persists ⇒ failed | rebuild offline; identity record updated only on success | baseline-ensure only |
| Bundled Python mismatch (version/path vs manifest record) | automatic prep (rebuild against current python); python unavailable ⇒ gate `failed` | relocation rebuild is deterministic offline | baseline-ensure only |
| Shared dependency (ffmpeg/ffprobe/deno) mismatch at pin time | **degraded fact + no mixing** | pin-time observed digest vs approved digest differs ⇒ attempt **may still bind baseline yt-dlp** but records `degraded` and the resolver treats the shared set as not-eligible (never mixes tool versions); a *missing* shared tool is a `prepare` concern (ensure installs it, offline-binary path unchanged — downloads from `dl.deno.land`/GitHub via existing artifact specs; NOT P2-A’s job to change) | pin-time identity module; no mutation |
| Materialization cannot complete (wheel missing from resources, pip fails) | **fail-closed** — gate `failed`, new attempts fail before `engine.execute` | never silently use an outdated/mismatched cache; no promotion of anything | baseline-ensure; Diagnostics only observes |

- **Automatic preparation vs fail-closed reinstall-style failure**: “automatic prep” = missing/corrupt/mismatch cache ⇒ rebuild offline during gate bootstrap or first lease acquire (same UX as today’s first-run bootstrap, minus network). “Fail-closed reinstall-style” = canonical/python unavailable or rebuild failed ⇒ gate `failed` phase with `lastError`; downloads do not start; **no implicit retry loop** (user can trigger `start_runtime_dependency_bootstrap` again — existing recovery path, `runtimeDependencyGate.mts:317-322` `startBootstrap`). Managed candidate is never promoted (rule recorded, has no effect in P2-A since no managed candidate exists).

---

## 3. Selection authority: does P2-A need a persisted `selection.json`? (A4)

**Decision: NO persisted selection record in P2-A. The P2-A “selection” is a compile-time constant** (`kind: "bundled"`), and the *authority* is established as a **module boundary**, not a file.

### 3.1 Reasoning

1. There is exactly **one** selectable candidate; the resolver’s answer cannot vary. A file that only ever stores one constant adds: a sole-writer discipline (new), an atomic-write path (new), read/parse/validation failure states (new) — all of which resolve to “use bundled” anyway, i.e. **zero functional delta** vs returning `bundled` unconditionally. Extra failure surface with no reachable state.
2. The single-authority invariant P2 wants is about **who may change the answer**, not about persistence. P2-A establishes that boundary: a new **baseline/selection module** (Electron-owned, e.g. `electron/ytDlpSelection.mts` or a function in the bootstrap-adjacent layer) is the sole resolver (`resolveYtDlpCandidate()` ⇒ `{kind:"bundled", baselineRoot, identity}`) and the future sole writer. Adapters, Diagnostics, status, UI remain readers.
3. “Selection” facts belong to the **attempt pin + Diagnostics**, which exist in P2-A (identity record per attempt, read-only facts), so observability of “what was selected” does not require a file.
4. Deferral is cheaper than migration: P2-B/C adds the file **with default semantics already defined by P2-A** = “absent/any parse failure ⇒ bundled + degraded fact” — which is exactly the runtime behavior of every P2-A install (no file exists). No migration ambiguity: schema lives in one module with one default rule.

### 3.2 Alternatives compared

| Option | What it adds | Verdict |
|---|---|---|
| (i) No file (chosen) | module + resolver constant + schema doc placeholder | smallest defensible; no failure surface |
| (ii) Write-once `selection.json {schemaVersion:1, selected:{kind:"bundled"}}` at first bootstrap | write path + failure handling identical to (i) outcome | rejects: value == (i), cost > 0; first-run write is exactly where P2-A has no other mutation need |
| (iii) Full P2 schema now (`selected/previous/generation/...`) | forbidden | PRD explicitly defers managed/previous/rollback/activation fields |

### 3.3 Forward contract for P2-B/C (no migration ambiguity)

- Fixed path **reserved now** and documented in the module: `<configDir>/runtimes/yt-dlp/selection.json`; `schemaVersion: 1`; atomic temp+rename; **sole writer = the same baseline/selection module**; readers = resolver/status/Diagnostics/UI.
- Default rule fixed now: absent OR corrupt OR unsupported schema ⇒ `selected = {kind:"bundled"}` + degraded fact; never implicit update/repair.
- P2-B adds `selected` enum value `{kind:"managed", releaseId}` and pending/eligibility facts; P2-C adds `previous`, `generation`, `updatedAtMs`, `lastFallback` — all additive under `schemaVersion` bump rules; schema evolution is the module’s explicit responsibility.
- Because P2-A never writes the file, an upgrade from P2-A → P2-B is identical to first-run P2-B: absence ⇒ bundled ⇒ correct. **No migration path is needed.**

---

## 4. Attempt boundary and dependency direction (A5, A6)

### 4.1 Existing attempt boundary — [REPO-CONFIRMED]

```text
DownloadOrchestrator.executePrepared (download-orchestrator.ts:104-166; attempt_started recorded before buildContext)
  → DownloadJobService attempt loop → runtime.buildAttemptContext (service.ts:1514-1567)
      → acquireRuntimeSetLease(enginePlan.engine === "gallery-dl" ? "gallery-dl" : "yt-dlp", `runtime_execute_${traceId}_${enginePlan.engine}`)  (service.ts:1546-1553)
          → main.acquireRuntimeSetLease (main.mts:1466-1474) → runtimeSetLifecycle.acquireLease(caps, ensureRuntimeSetCapabilities)
              → prepare = ensureManagedYtDlpRuntimeReady / ensureManagedFfmpegRuntimeReady / ensureManagedDenoRuntimeReady (main.mts:1306-1322)
          → context.runtimeSetLease = lease (engineExecutionContext.ts:62-67)
      → engine.execute (adapter) → runYtDlpDownload(binaries: static, context) → finally { runtimeSetLease.release() }  (ytDlpEngineAdapter.ts:45-59)
```

### 4.2 Where resolve + validate + acquire lease occurs in P2-A

- **Resolve** (what): the baseline/selection module returns the immutable binding for this attempt: `{ kind:"bundled", ytDlpEntrypoint, pythonPath, ffmpegPath, ffprobePath, denoPath, identity }` — all derived from the same single layout the existing `resolveYtDlpRuntimeDependencies` already returns (`runtimePaths.ts:316-326`), but sourced from the **baseline** cache instead of the managed venv. Paths are target-constant (no per-attempt variation), so the existing static-injection `main.mts:1422-1423` remains valid *if* it is switched to baseline paths at composition; **safest**: composition-time switch + pin-time identity computation (the identity is what varies across attempts, not the path).
- **Validate** (identity): after `acquireRuntimeSetLease` succeeds (which guarantees prep + no mutation-in-flight) and before `engine.execute`, compute the **runtime-set identity** = observed digests/versions of the bound paths, compare against (a) baseline manifest + (b) approved media-tool artifact specs (`managedRuntimeBootstrap.mts:800-885`). Mismatch ⇒ attempt records `degraded` with reason; download may proceed (digest mismatch is evidence, not a refusal — P2-A ships no alternative) but must never silently mix (it never does: one path set per lease).
- **Lease**: already exactly at this point; **no new lease, no new lock** — P2-A only adds the identity computation under the existing lease (already serialized: pin/validate/identity all inside `runExclusive` of `acquireLease` via `prepare`, and the lease is held through settlement, so a later mutation cannot change the paths).
- **Who owns the complete immutable binding**: the baseline/selection module computes it; the **service** attaches it (a) to the attempt as a sanitized diagnostic fact and (b) passes *paths* through the existing `binaries` channel — **no adapter/runner signature change** (dependency direction preserved: candidate module supplies resolution; it is not a runner/registry/orchestrator; execution authority remains `AmeowElectronDownloadRuntime` + adapters + `runYtDlpDownload`).

### 4.3 Reuse across the different attempt shapes

| Shape | Binding | Evidence |
|---|---|---|
| yt-dlp **internal retries** (transient/format) | **same binding** — same `execute()` call, one lease, same paths | `ytDlpDownload.ts:157-179` retry loop inside one run |
| **engine-ladder fallback** (yt-dlp → gallery-dl) | **new attempt → new lease** (consumer `gallery-dl` — capability disjointness) → new identity | `download-orchestrator.ts:104-166`; `service.ts:1548`; disjoint-capability lease test `runtimeSetLifecycle.test.mts` |
| **auth recovery** | new `executeAttempts()` → new `buildAttemptContext` → new pin | `download-job-service.ts:154-187` |
| **cancellation** | abort controller aborts; `runStreamingCommand` awaits `close`; `killChild` settles tree (`processRunner.ts:47-140`); adapter `finally` releases | `engineAdapters.test.ts:90-104` (cancelled runner ⇒ release) |
| **same-engine candidate fallback (managed→bundled)** | **NOT in P2-A** (deferred to P2-D per design.md; no automatic post-pin fallback) | design.md “Post-pin managed failure … not part of the minimum foundation” |
| **queue-pending** | no lease/pin until attempt start | pin occurs at `buildAttemptContext` (only) |

### 4.4 Lease release guarantee

- Release happens in `finally` inside the adapter after `runYtDlpDownload`/`runGalleryDlDownload` settle **or throw** — settlement includes process-tree termination (`processRunner.ts:76-101` `killChild`: taskkill `/T` on win32 `:82-86`, SIGTERM→SIGKILL `:100`; `close` awaited at `:139`; stdout/stderr drained). Verified by `engineAdapters.test.ts:71-104`, `service.test.ts:1104-1145,3480-3540`, `runtimeSetLifecycle.test.mts`. **No change needed.**

---

## 5. Minimum complete runtime identity fields (A5)

### 5.1 Content identity vs observed paths (the key distinction)

- **Content identity** (what the bytes are) — stable across relocation, computed from manifest + artifact specs: `manifestDigest`, `packageSetId`, wheel versions/sha256s, python version/target, media-tool versions/sha256s, `layoutVersion`, `runtimeTarget`.
- **Observed path/readiness** (where it is + is it executable): `ytDlpEntrypoint`, `pythonPath`, `ffmpegPath/ffprobePath/denoPath`, plus `probeVersion`. Paths **must not** feed `runtimeSetId` — the venv is relocation-sensitive (symlinks into bundled python; `bundledPythonPath` is a rebuild trigger today, `managedRuntimeBootstrap.mts:489-497`); the same content at a moved path must keep the same identity.
- **(Frozen decision) No digest-addressed dependency storage**: nothing here introduces per-digest dirs; identity is **bound by digest at pin time** (observed-digest check vs app-owned specs), which already covers the accepted lifecycle invariant (mutation blocked by lease; drift detected, never mixed).

### 5.2 The P2-A identity record (minimal, every field has a P2-A consumer)

```ts
type BundledRuntimeSetIdentity = {
  kind: "bundled";                    // consumer: attempt diagnostics + debug
  runtimeSetId: string;               // sha256(canonical(content-only facts)) -> attempt diagnostics; single value
  manifestDigest: string;             // sha256(canonical baseline manifest bytes); detects app-update payload change
  packageSetId: string;               // == managedPythonPackageManifest spec (single source; rebuild trigger already)
  ytDlp: { version: string; wheelSha256: string; wheelSize: number };
  ytDlpEjs: { version: string; wheelSha256: string; wheelSize: number };
  python: { version: string; target: string; bundledManifestIdentity: string };  // NOT absolute path
  mediaTools: {                        // approved identity from artifact specs (managedRuntimeBootstrap.mts:800-885)
    ffmpeg: { version: string; sha256: string };   // observed digest checked at pin
    ffprobe: { version: string; sha256: string };
    deno: { version: string; sha256: string };
  };
  runtimeTarget: string;              // resolveRuntimeTarget(platform, arch)
  layoutVersion: number;
  // observed (non-content) facts, recorded alongside, excluded from runtimeSetId:
  observed: {
    ytDlpEntrypoint: string; pythonPath: string;
    ffmpegPath: string; ffprobePath: string; denoPath: string;
    probeVersion: string | null;
    mediaToolsDigestsObserved: { ffmpeg: string | null; ffprobe: string | null; deno: string | null };
  };
};
```

### 5.3 Fields deliberately NOT in P2-A (no consumer yet)

`releaseId`, `stagedRoot`, `activationGeneration`, `selected/previous`, `retention`, `fallbackReason`, `installSource` (the pin string — replaced by wheel identity), `eligible/state` lifecycle — all deferred to P2-B/C/D per design.md and the PRD. `baseline.json` cache record keeps only §2.1 fields (schemaVersion/layoutVersion/packageSetId/manifestDigest/python/probeVersion/materializedAtMs) — no generation counters needed since P2-A never transitions state.

### 5.4 Identity owner & production boundaries

- Baseline manifest identity (digests, versions) = release process (unchanged CPython pattern).
- `runtimeSetId` computation = baseline/selection module, called per attempt under the lease (a **pure function** of manifest + artifact specs + observed files; no IO besides hashing the observed binaries — bounded, same cost class as the existing `verifyDownloadedRuntimeAsset` `managedRuntimeBootstrap.mts:256-274`).
- Media-tool digests come from the **same app-owned artifact specs** (code-pinned, `:800-885`) — no second version table, no user input, not Diagnostics-owned.
- The identity reaches: (a) attempt diagnostics — extend `AttemptDiagnosticSummary` (`src/application/download-diagnostics.ts:30-46`) with `runtimeCandidate: "bundled"` and `runtimeSetId: string` (sanitized; no paths — the existing type comment requires no raw paths); (b) read-only Diagnostics facts (§6); (c) optionally the pin-time mismatch diagnostic. **Adapters/runners receive no new fields** (minimal delta; the executed paths remain the same `binaries` channel).

---

## 6. Read-only P1 Diagnostics facts and query boundaries (A8)

### 6.1 New facts (all `DiagnosticFact<T>`, no new command authority)

| Fact | Type | Origin | Reader safety |
|---|---|---|---|
| `ytdlpBaseline.manifest` | `DiagnosticFact<{version, ejsVersion, packageSetId, manifestDigest, verification: "verified"|"not_verified"}>` | configured (from manifest) + probed (bundle-time artifact check at first read) | reads packaged manifest + wheels sha256 (via inspect variants; no mkdir) |
| `ytdlpBaseline.cache` | `DiagnosticFact<{path, materialized, identityMatches, probeVersion}>` | observed | uses `inspectRuntimeBinaryPaths`-style pure derivation; **never** `resolveRuntimeBinaryPaths` (which mkdirs — `runtimePaths.ts:124-132` `ensureManagedRuntimeRoot`/`mkdirSync`; inspect variants are pure `:289-300,346+`) |
| `ytdlpBaseline.selection` | `DiagnosticFact<"bundled">` | configured | constant; no file read |
| `runtimes[ytDlp].expectedSource` | `DiagnosticFact<"bundled">` (was “managed” — update `electron/diagnostics.mts:62-67` + `runtimePaths.ts:238-252`) | configured | read-only |
| `runtimeSetLease` | `DiagnosticFact<{activeLeaseCount}>` | observed | `runtimeSetLifecycle.activeLeaseCount()` (exists; add read-only accessor for per-capability counts only if needed — P2-A: count is enough) |
| `downloads.recentDiagnostics[].attempt` | `DiagnosticFact<{runtimeCandidate, runtimeSetId}>` | observed | carried on existing attempt summaries (sanitized) |

### 6.2 Boundaries (must never)

- create directories (use only `inspect*` path derivations; `execution-side` `resolve*` mkdirs are forbidden to Diagnostics — the split already exists: `inspectRuntimeBinaryPaths`/`inspectRuntimeDependencyStatus` (`runtimePaths.ts:289-366`) vs `resolveRuntimeBinaryPaths`/`resolveYtDlpRuntimeDependencies` (`:160-176,302-326`).
- materialize/repair/ensure (no `ensure*` calls; no `runMutation`/`acquireLease`), select/mutate (no writes), invoke updater or bootstrap commands (same pattern as today: `get_read_only_diagnostics` vs `start_runtime_dependency_bootstrap` separation — `electron/videoDownloadCommands.mts`; P1 already side-effect-free — `electron/diagnostics.mts` uses `inspectRuntimeDependencyStatus` + `probeVersion` on existing paths only).
- The gate/baseline-ensure remains the only automatic preparation path; Diagnostics may read the gate state (`runtimeGate` fact already exists).

---

## 7. Repository blockers vs external release gates; minimum implementation recommendation (A9, A10)

### 7.1 Remaining repository blockers for P2-A implementation

| # | Blocker | Evidence | Verdict |
|---|---|---|---|
| R1 | No packaged baseline payload (wheels + manifest) | `electron-builder.config.mjs:29-37`; `desktop-assets/binaries/` contents | **Implementation scope** (not a blocker to plan; P2-A ships it) |
| R2 | Verifier rejects yt-dlp assets | `scripts/verify-macos-python-runtime-package.mjs:340-357` | **Implementation scope** (replace rejection with exact-set allow + checksum verify); Windows analog needed at release |
| R3 | No offline materialization code | `managedRuntimeBootstrap.mts:950-960` (network pip) | **Implementation scope** (new offline baseline-ensure under `runMutation`) |
| R4 | No per-attempt identity | `main.mts:1422-1423` static; no runtimeSetId anywhere | **Implementation scope** (identity computation + attempt fact) |
| R5 | `expectedSource` hardcoded “managed” + status paths point at managed venv | `runtimePaths.ts:238-252,160-166`; `electron/diagnostics.mts:62-67` | **Implementation scope** (switch to baseline path/source; gate logic `ensureMissingManagedRuntimesReady`/`collectMissingManagedRuntimeComponents` at `electron/runtimeDependencyGate.mts:244-262` uses `expectedSource === "managed"` — must keep treating yt-dlp as gated when its source is now `bundled`; a small gate adjustment is REQUIRED, flagged here) |
| R6 | No read-only accessor for lease count in Diagnostics | `runtimeSetLifecycle.activeLeaseCount()` exists but not surfaced | Implementation-scope, one line |
| R7 | Wired `--js-runtimes deno:<path>` depends on `binaries.deno` being the managed path | `main.mts:1422` + `runtimePaths.ts:316-326` | Already satisfied; after baseline switch the deno path stays the shared managed deno (unchanged) — **no blocker** |
| R8 | Probe/transcode consumers use media-tools/yt-dlp consumers; baseline path swap must not move ffmpeg/deno paths away from shared singletons | `service.ts:893,1152,1200`; `runtimePaths.ts:137-157` | **Design constraint** (frozen): ffmpeg/ffprobe/deno remain shared singletons; only yt-dlp entrypoint/python path change |

### 7.2 Retained external release gates (recorded, NOT expanded)

- Clean-host normal Electron Builder verification; Windows default-userData validation; portable folder-replacement retention; successful live EJS challenge execution; macOS arm64 fresh quarantine, offline baseline execution, Gatekeeper validation. All stay as release gates; P2-A implementation must **not** add new external validation beyond what the PRD records (e.g., no new x64 gates, no real-host probe work here). [NOT VERIFIED (real host)] statuses from P2-V remain recorded, unchanged.

### 7.3 Recommended minimum implementation scope (files/tests, smallest slice)

**Implementation files (Electron):**
1. `desktop-assets/binaries/ytdlp-baseline/` — wheels + `.official-ytdlp-baseline.json` + `requirements.txt` (release-time; generated by a new `scripts/prepare-ytdlp-baseline.mjs` that downloads pinned wheels from `files.pythonhosted.org` and verifies against PyPI JSON digests — release-tooling only, no runtime fetch).
2. `electron/ytDlpBaseline.mts` (new) — canonical manifest decode/verify, cache paths, `ensureManagedYtDlpBaselineReady` (offline pip, `runMutation`-wrapped), identity computation `computeBundledRuntimeSetIdentity` (pure + observed digests).
3. `electron/managedRuntimeBootstrap.mts` — baseline-aware ensure/reuse (leave gallery-dl untouched); keep `sha256Hex`/`verifyDownloadedRuntimeAsset` reuse.
4. `electron/main.mts` — wire baseline module into `ensureRuntimeSetCapabilities` (yt-dlp capability → baseline ensure), switch adapter binaries to baseline paths (`:1422`), expose identity to `DownloadDiagnosticSink` mapping (attempt fact), keep lease wiring untouched.
5. `src/electron-runtime/runtimePaths.ts` — `resolveYtDlpRuntimeDependencies`/status switch to baseline path + `expectedSource: "bundled"`; `inspect*` variants updated; **never** mkdir in inspect paths.
6. `src/electron-runtime/service.ts` — after lease acquire (only for yt-dlp consumer) compute identity and attach sanitized fact to the attempt (no execution change).
7. `electron/runtimeDependencyGate.mts` — adjust `collectMissingManagedRuntimeComponents`/`ensureMissingManagedRuntimesReady` to gate on baseline state (yt-dlp now `bundled` source) — the ONLY behavioral gate change; bootstrap order preserved.
8. `src/application/download-diagnostics.ts` — extend `AttemptDiagnosticSummary` with `runtimeCandidate?: "bundled"`, `runtimeSetId?: string` (sanitized).
9. `electron/diagnostics.mts` + `src/types/diagnostics.ts` — facts from §6.
10. `scripts/verify-ytdlp-baseline-assets.mjs` + extend `scripts/verify-macos-python-runtime-package.mjs` (exact-set) + `release.yml` Windows/macOS verify steps + `scripts/managed-python-package-manifest.mjs`/`ensure-capability-probe-runtime.mjs` consistency check (assert `packageSetId` equality — no parallel pins).

**Tests (minimal set):** `electron/ytDlpBaseline.test.mts` (manifest verify: size/sha mismatch fail; offline install args exact: `--no-index --require-hashes --only-binary=:all: --no-deps --find-links`; rebuild triggers; atomic baseline.json readiness; fail-closed when canonical missing; never network: injected fetch must not be called), `electron/runtimeSetLifecycle.test.mts` additions (baseline mutation blocked while yt-dlp lease held), `src/electron-runtime/service.test.ts` additions (attempt fact carries runtimeSetId; identity computed after lease, before execute), `runtimePaths.test.ts` (status now bundles; inspect pure), `managedRuntimeBootstrap.test.mts` (if touched), `scripts/verify-ytdlp-baseline-assets.test.mjs` (optional; the script itself is the artifact test).

**Explicit P2-B/C/D deferrals (no premature abstractions):** no release manifest *fetch*, no download/staging, no eligibility probe beyond `--version`, no activation/rollback commands, no `selection.json` write, no refcount beyond the existing lease, no GC, no candidate-fallback hook, no Repair Center, no generic updater framework, no per-digest dirs, no new commands in the command bridge (`update_*`/`rollback_*`/`gc_*` are explicitly out).

---

## 8. Direct answers to the ten acceptance questions

**A1 — Canonical bundled baseline source of truth.** The **app-packaged payload** (`desktop-assets/binaries/ytdlp-baseline/`: `.official-ytdlp-baseline.json` + two pinned wheels + `requirements.txt` with hashes), owned by the app release process; identity = wheel digests + bundled Python version/target + `layoutVersion`. Runtime never fetches it; bundle-time verification proves it (new platform-agnostic verifier + extended macOS verifier + CI steps). Target-specificity comes from the per-target verification record, not per-target binaries. [REPO-CONFIRMED current absence; RECOMMENDATION design; UPSTREAM-CONFIRMED wheel universality/digests.]

**A2 — Packaged manifest/package-set identity responsibility.** Single app-owned pin source: `electron/managedPythonPackageManifest.mts` (`installSources`/`packageSetId`, already read by bootstrap/rebuild/scripts). Baseline manifest carries only identity facts and **must equal** that spec (`packageSetId` equality asserted by verifier + a scripts-side consistency check). No second version table; EJS wheel digest recorded at release prep from PyPI JSON (yt-dlp wheel digest `f11f2b11…266` [UPSTREAM-CONFIRMED]; ejs digest to be recorded during release prep — open data point, not a blocker).

**A3 — Materialized baseline-cache lifecycle.** `<configDir>/runtimes/yt-dlp/<target>/baseline/` = replaceable cache + `baseline.json` readiness record; deterministic **offline** build (`--no-index --only-binary=:all: --require-hashes --no-deps --find-links <resources>`); rebuild triggers enumerated (§2.3); lifetime = app release; GC/updater never touch it; all builds are `runMutation`-gated (accepted lease mechanism).

**A4 — Persisted selection record in P2-A.** **NOT needed** — one candidate, compile-time constant, no reachable state. Authority is the **module boundary** (single resolver; future sole writer); forward contract fixed: reserved path `selection.json` + absent/corrupt ⇒ bundled default, P2-B/C add fields additively — no migration ambiguity because P2-A never writes the file (§3).

**A5 — Minimum complete attempt runtime identity and owner.** `BundledRuntimeSetIdentity` (§5.2): runtimeSetId over content-only facts (manifestDigest/packageSetId/ytDlp+EJS version+sha256/python version+target/media-tool version+sha256/runtimeTarget/layoutVersion) + observed paths/probe recorded separately (excluded from the hash; relocation-stable). Owner: baseline/selection module (pure computation under the existing lease); manifest/media-tool digests owned by release process/code constants. Deferrals explicit.

**A6 — resolve → validate → lease → execute dependency direction.** Exactly the existing boundary: `buildAttemptContext` (service.ts:1546-1553) acquires the lease (prepare = baseline/managed/file readiness) → identity computed under lease → context carries lease → adapter `execute` (unchanged `binaries` channel) → runner/process tree → `finally` release. P2-A inserts only the **identity computation + sanitized attempt fact**; no new runner/service/registry/fallback ladder; internal retries reuse one binding; engine-ladder/auth-recovery/cancel all re-resolve or release per existing semantics (§4.3-4.4).

**A7 — Fail-closed semantics for every missing/corrupt/mismatch state.** §2.4 matrix: canonical missing/corrupt → gate `failed` (reinstall-style, before bootstrap, no download/promotion); cache missing/corrupt/version/hash/python mismatch → automatic **offline** rebuild; rebuild impossible/persists → gate `failed`; shared-tool mismatch → degraded fact, never mixed (no promotion); nothing silently falls back, nothing auto-repairs on a hot path, no implicit retry loop (existing `start_runtime_dependency_bootstrap` remains the only user-recoverable path).

**A8 — P1 Diagnostics read-only.** Facts in §6.1 (manifest/cache/selection/expectedSource/lease count/attempt identity), all `DiagnosticFact` with configured/observed/probed origins; boundaries: `inspect*` only (never `resolve*` mkdir), no ensure/repair/materialize/select/mutate, no lever to trigger bootstrap/update — same separation as `get_read_only_diagnostics` vs `start_runtime_dependency_bootstrap` today.

**A9 — Repository blocker remaining for P2-A implementation.** **None beyond implementation scope.** The P2-V repairs (lease coordinator, Deno path binding, plugin isolation, ejs in package set) are already in the working tree [REPO-CONFIRMED]; P2-A work items are enumerated (§7.1 R1–R6/R8; R5 gate adjustment is the only non-trivial behavioral one). External release gates (PRD list + P2-V remnants) are retained, not expanded (§7.2).

**A10 — Recommended minimum implementation scope + explicit deferrals.** §7.3: 10 file groups + minimal test set; boundaries (implementation): no network updater, no managed candidate download/staging, no activation/rollback, no GC, no automatic post-pin fallback, no selection.json write, no generic updater, no Repair Center, no new command-bridge actions, no digest-addressed dependency storage. Phases: P2-A only; P2-B (stage-only), P2-C (explicit activation/rollback), P2-D (bounded fallback + retention) are separate tasks per design.md.

**Compliance with PRD bullets 11-12:** Retained external Windows/macOS release gates are recorded (PRD §Retained external release gates restated in §7.2) and not expanded; **no implementation occurred** — this report is research only; no production code/config/spec/packaging/runtime file was modified; no other worker was dispatched; no Architecture PASS is granted.

---

*End of report. Evidence read from working tree 2026-08-25 (main @ d4fe27b + landed P2-V repairs); upstream facts cited to authoritative HTTPS endpoints fetched 2026-08-25; references use file:line anchors. Unrelated dirty work untouched.*
