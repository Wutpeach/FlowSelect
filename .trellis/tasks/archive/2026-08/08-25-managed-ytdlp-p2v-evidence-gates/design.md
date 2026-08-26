# P2-V prerequisite evidence closure

## Status and final verdict

**Final verdict: `REPAIR REQUIRED`.**

This is an evidence and architecture-closure decision, not Architecture PASS. P2-A must not start until the named repository/runtime repairs below have their own approved task. P2-V introduced no updater, activation, rollback, GC, post-pin fallback, or production-code change.

The verdict is driven by three confirmed in-repository/runtime gaps:

1. Windows source and packaged code use `real/` paths while the active spec still requires proxy fronts.
2. Ameow downloads a managed Deno binary but yt-dlp receives only the bare runtime name; its directory is absent from the child PATH, so the app-owned Deno is not the runtime yt-dlp resolves.
3. Current bootstrap promises serialize bootstrap calls per component but do not prevent destructive venv/binary mutation while a complete runtime set is referenced by an active attempt.

Windows package reproducibility and clean installed/portable upgrade retention also remain unclosed executable validations. macOS host behavior is a release gate, not the cause of this `REPAIR REQUIRED` verdict.

## Evidence sources

- `research/windows-packaged-runtime-validation.md` — Windows 11 x64 package/executable evidence, isolated userData runs, NSIS/portable inspection, PE replacement test, and honest skips.
- `research/repository-macos-package-set-evidence.md` — repository/upstream evidence for macOS, yt-dlp/EJS/Deno, offline baseline, authenticity, and dependency stability.
- P2 planning baseline: `../08-25-managed-ytdlp-update-rollback-planning/design.md`.

## 1. Windows authoritative runtime contract

P2-V selects the current packaged/source `real/` layout as the authoritative direction. Reintroducing proxy-front executables would add a second unproven path and broader packaging work; no current packaged artifact contains or resolves them.

For `x86_64-pc-windows-msvc`, one target runtime set is:

```text
yt-dlp  = <userData>/runtimes/yt-dlp/<target>/venv/Scripts/yt-dlp.exe
ffmpeg  = <userData>/runtimes/ffmpeg/<target>/real/ffmpeg.exe
ffprobe = <userData>/runtimes/ffmpeg/<target>/real/ffprobe.exe
deno    = <userData>/runtimes/deno/<target>/real/deno.exe
```

The repaired contract must have one truth across all consumers:

- bootstrap/repair materializes only these paths;
- runtime resolution and readiness return these exact paths;
- Diagnostics uses the pure inspector for these exact paths;
- yt-dlp receives `--ffmpeg-location` equal to the directory containing the selected `ffmpeg.exe`/`ffprobe.exe`;
- child `PATH` prepends that FFmpeg directory only for FFmpeg/FFprobe discovery;
- Deno is not discovered implicitly from PATH. yt-dlp receives an explicit app-owned runtime argument equivalent to `--js-runtimes deno:<absolute-managed-deno-path>`;
- machine `node`/`deno` fallbacks are disabled for the immutable baseline unless their exact path/version is deliberately added to runtime identity.

The proxy-front requirement in `.trellis/spec/backend/sidecar-runtime-contracts/02-cross-platform-runtime-resolution-for-downloaders.md` is stale relative to both current source and inspected package. It must be corrected together with tests. Because FFmpeg/Deno asset bootstrap did not finish in this validation environment, the repaired `real/` contract still needs a current packaged end-to-end proof including FFmpeg merge, FFprobe, EJS/Deno use, cancellation, and no console flash.

## 2. Windows persistence and trust

### Storage authority

Installed and portable builds both use Electron `app.getPath("userData")` for runtime storage. Portable detection changes the application-update mode; no portable branch changes `userData` to the extraction directory. Managed runtimes therefore live outside the NSIS installation or portable extraction tree and are intended to survive replacement of app files.

Confirmed:

- a marker-bearing ZIP resolves `portable`; an NSIS extraction resolves `installed`;
- both compiled and source composition derive runtime paths from the Electron userData/config directory;
- task-owned userData overrides successfully isolated packaged runtime materialization.

Not yet executable-confirmed:

- the exact default profile path for both forms on a disposable Windows profile;
- hash-stable runtime retention across a completed NSIS upgrade;
- hash-stable runtime retention across portable folder replacement.

The attempted NSIS upgrade replaced the app tree but did not exit cleanly and cannot be treated as a persistence PASS. A disposable-profile completed upgrade test is required before packaged P2-A acceptance.

### Authenticode

The fresh NSIS installer, `Ameow.exe`, bundled Python, and materialized `yt-dlp.exe` were all `NotSigned`. This is not a new technical blocker for P2-A because the current Windows product already runs the same unsigned app/Python trust model and the isolated venv materialized successfully. Authenticode remains a release reputation/trust-hardening decision; checksums must not be described as publisher signatures.

## 3. macOS trust gate

### Repository-confirmed facts

- Current public release support is arm64 only. x64 paths/specs remain development affordances and do not create a release gate.
- macOS packages are intentionally unsigned and non-notarized; first-run/quarantine handling is documented for users.
- Bundled Python is packaged per target. The managed venv is created with plain `python -m venv`; non-Windows Python and yt-dlp entrypoints receive mode `0755`.
- Moving the bundled Python path invalidates metadata and triggers a complete venv rebuild.
- Current release CI runs the macOS package verifier on `macos-15` arm64 with execution, downloader bootstrap, and relocation-rebuild requirements.

### Not verified on a real end-user host

- quarantine propagation from a freshly downloaded unsigned DMG to app-created baseline/managed runtime files;
- whether the offline materialized baseline child processes create prompts beyond the accepted app-level first-run flow;
- the first P2-A offline-baseline verifier result on arm64.

P2-A implementation is not blocked solely by the absence of these results: it extends an existing real-macOS CI enforcement point. P2-A cannot be considered release-complete or receive Architecture Review closure until the arm64 verifier is extended to build the baseline offline, execute it, exercise EJS with the managed Deno path, and prove relocation rebuild. Fresh-quarantine end-user behavior remains an explicit release gate, not a repository inference.

There is no x64 validation requirement unless product/release documentation later reintroduces Intel support.

## 4. yt-dlp offline package-set contract

### Current runtime truth

- Ameow installs only `yt-dlp==2026.07.04`; the base distribution has no required dependencies.
- `yt-dlp-ejs` is not installed.
- YouTube command construction enables `ejs:github`, permitting a GitHub component fetch and subsequent local JavaScript execution.
- Windows passes bare `deno` and `node` runtime names; the app-owned managed Deno path is not supplied.
- `--ignore-config` prevents user config from adding self-update/runtime arguments, and no `-U` path is present.
- User plugin directories are not disabled, so plugin code remains outside Ameow's package/runtime identity.

### Offline baseline feasibility

A genuinely offline materialization is feasible and requires this closed package/runtime set:

- pinned `yt-dlp` wheel;
- pinned `yt-dlp-ejs` wheel, which is self-contained for its Python/JS package dependencies;
- target-specific bundled Python;
- app-owned managed Deno with an explicit absolute runtime path;
- FFmpeg and FFprobe identities required by the execution plan;
- remote components disabled for the baseline;
- user plugin directories disabled for deterministic Ameow-owned execution;
- installation solely from packaged resources with `--no-index`, `--find-links`, `--only-binary`, `--require-hashes`, and `--no-deps`.

Network access to the requested media sites remains inherent and is not part of baseline materialization. Runtime GitHub component fetch, PyPI installation, self-update, machine JS runtime discovery, and user plugin loading are not part of the immutable baseline contract.

P2-A must add this offline capability; it does not exist today.

## 5. Minimum dependency-identity stability design

P2-V does **not** require digest-addressed FFmpeg/FFprobe/Deno storage.

The minimum sufficient mechanism for Ameow's current single-main-process model is one per-target runtime-set lifecycle coordinator:

1. Every mutator of the yt-dlp venv, FFmpeg/FFprobe, or Deno—bootstrap, missing-file ensure, repair, relocation rebuild, reinstall—uses the same exclusive lifecycle lock.
2. `resolve + validate + acquire lease` is one atomic operation under that lock. It returns the complete runtime-set identity and increments its reference count before the lock is released; there is no gap between readiness, selection, and reference acquisition.
3. The lease covers yt-dlp/Python, FFmpeg, FFprobe, Deno, package-set identity, selected paths, and expected app-owned versions/digests.
4. Download attempts, advanced-quality probes, and follow-up transcodes that consume the shared tools all hold a lease through their process-tree settlement.
5. Release happens in `finally` only after `engine.execute`, probe, transcode, or cancellation/kill settlement has completed.
6. A mutator observing any relevant active reference returns a typed busy/deferred result or waits through an explicitly bounded Repair lifecycle; it never replaces part of a referenced runtime set.

Installed artifact hashes and metadata establish the expected bytes. At acquisition, a changed path/size/metadata identity must be reverified or fail closed before a lease is granted. The coordinator protects Ameow-owned mutations; it is not presented as an adversarial filesystem security boundary.

Why this is minimal and sufficient:

- the Windows PE test proves same-path replacement is rejected while an image is executing but allowed after exit;
- POSIX may allow replacement while an image runs, so the application-level gate is still necessary cross-platform;
- all relevant mutations and executions are owned by one Electron main process;
- no per-candidate media-tool copies or universal updater are needed;
- the mechanism closes the current destructive-venv and `replaceFile` races if every mutator and consumer participates.

Digest-addressed/versioned dependency objects become necessary only if implementation review finds an uncoordinated mutator/consumer, cross-process mutation, or a requirement to keep several media-tool versions concurrently selectable. That evidence does not exist today.

## 6. Minimum authenticity and integrity policy

### Ameow-owned approved manifest

For each target/baseline release, the committed manifest must contain:

- schema/layout version and baseline identity;
- supported runtime target and minimum/exact bundled Python compatibility;
- each packaged wheel's normalized package name, version, filename, source metadata URL, expected final file URL/host, byte size, and SHA-256;
- the package-set identity (`yt-dlp` + `yt-dlp-ejs` for the current contract);
- app-owned Deno, FFmpeg, and FFprobe version/digest identifiers used by the runtime set;
- execution policy: explicit managed Deno, remote components off, plugin dirs off, no self-update;
- offline installer policy and required eligibility probes.

### Responsibility boundaries

- The Ameow release process approves versions and obtains metadata from authoritative PyPI JSON endpoints.
- Release preparation/download permits HTTPS only, allowlists the metadata and final file hosts, validates the final redirected URL, size, and SHA-256, and stores the approved facts in the reviewed manifest.
- P2-A runtime trusts only packaged application resources plus the committed manifest. It performs no baseline network fetch and installs only hash-approved wheels offline.
- Package-time verifiers recompute resource hashes and execute target-specific baseline probes. Runtime materialization verifies the same set before publishing the cache as ready.
- P2-B may later download only bytes already authorized by an Ameow-owned manifest; online discovery is evidence input, not runtime truth.
- Baseline fallback is a fixed application release asset. Managed downgrade policy belongs to later activation work and is not an updater concern in P2-A.

PyPI wheels are not independently signed. GitHub checksum signatures cover standalone release assets, and the published signing key is delivered through the same repository/channel without an independently anchored fingerprint. No independent signature trust root is required for P2-A/P2-B's wheel model. PGP remains optional future hardening rather than a gate.

## 7. Repairs and validations required before P2-A

1. Replace the stale proxy-front specification with the selected `real/` contract, or produce contrary packaged evidence and consistently implement proxy fronts. The recommended minimum is to standardize on `real/`.
2. Pass the absolute managed Deno path to yt-dlp; remove unpinned machine runtime fallback from the baseline contract.
3. Define baseline EJS/plugin isolation: package `yt-dlp-ejs`, disable `ejs:github` remote fetch for baseline, and disable user plugin directories.
4. Introduce the full-runtime-set lifecycle coordinator contract and tests described above before relying on mutable singletons.
5. Restore/prove a reproducible current Windows package path with bundled Python, FFmpeg, and Deno available; run the repaired packaged end-to-end path.
6. Complete disposable-profile installed and portable upgrade-retention validation.
7. Extend the arm64 macOS package verifier for offline baseline materialization, explicit managed Deno/EJS execution, and relocation rebuild; retain a fresh-quarantine release gate.

These are bounded P2-A prerequisites. They do not authorize an updater, activation, rollback, GC, or post-pin fallback.

## 8. Acceptance mapping

1. Windows authoritative path/proxy-front/Deno contract — selected `real/` contract, explicit managed Deno path; repair required.
2. P2-A path/package inconsistency — stale spec, Deno discovery, incomplete packaged FFmpeg/Deno proof, and fresh-package reproducibility require repair/validation.
3. Windows persistence/trust — shared userData contract confirmed; clean upgrade retention not yet passed; Authenticode is later hardening.
4. macOS — arm64 repo/CI facts confirmed; offline-baseline and fresh-quarantine host results are release gates, not x64 or PGP gates.
5. Offline immutable package set — feasible with packaged `yt-dlp` + `yt-dlp-ejs`, explicit Deno, remote components/plugins off, and hash-enforced offline install.
6. Dependency stability — per-target full-set coordinator with atomic lease is the minimum; digest-addressed shared tools are not presently required.
7. Authenticity — Ameow manifest + HTTPS/redirect/size/SHA-256 + packaged offline install; no independent signature root required.
8. Final decision — **`REPAIR REQUIRED`**.

