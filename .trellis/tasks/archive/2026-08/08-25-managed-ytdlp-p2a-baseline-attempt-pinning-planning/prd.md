# P2-A Immutable Bundled Baseline + Attempt Runtime Pinning Planning

## Goal

Produce repository-grounded architecture planning for an app-packaged immutable known-good `yt-dlp + yt-dlp-ejs` baseline and per-attempt complete runtime identity pinning inside the existing Download Runtime authority. P2-A establishes only the safety foundation; it provides no user update capability.

## Fixed P2-V baseline

- Windows FFmpeg/FFprobe/Deno use the authoritative target-specific `real/` paths.
- yt-dlp binds the absolute Ameow-owned Deno path; machine JS fallback, `ejs:github`, and user plugin discovery are forbidden.
- The target-scoped runtimeSet lifecycle coordinator preserves dependency identity through process-tree settlement and blocks conflicting mutation.
- Mutable singleton dependencies remain accepted; digest-addressed dependency storage is not introduced absent new contrary evidence.
- Existing Download Runtime, Orchestrator, engine adapters, runner, feature/domain routing, retry, cancel, and terminal authority remain unchanged.

Do not re-investigate or redesign these decisions.

## Planning scope

### Immutable canonical baseline

- Define how app-approved `yt-dlp` and `yt-dlp-ejs` wheel bytes enter packaged resources and are verified.
- Define the packaged baseline manifest and package-set identity together with target bundled Python and app-owned FFmpeg/FFprobe/Deno facts.
- Separate immutable canonical payload ownership from the replaceable materialized userData cache.
- Define offline materialization, hash verification, corruption/missing behavior, and reinstall-style failure boundaries.

### Minimal selection foundation

- Decide whether P2-A needs a persisted selection record when only bundled baseline is selectable.
- If needed, define the smallest single authority/schema/generation responsibility.
- Defer managed candidate, previous, activation, rollback, retention, and updater lifecycle fields to P2-B/C.

### Attempt runtime identity

- Identify the existing attempt boundary where resolve/validate/lease occurs.
- Define the minimum complete identity across yt-dlp, Python, EJS, FFmpeg, FFprobe, Deno, target, paths, versions/digests, and baseline/package-set facts.
- Align internal retries, engine fallback, auth recovery, cancellation, and process-tree settlement with binding reuse or re-resolution.
- Preserve dependency direction: candidate/baseline resolution supplies existing execution context/adapters; it never becomes another runner or download authority.

### Materialization and Diagnostics

- Assign missing canonical payload, missing cache, cache corruption, hash/version mismatch, and canonical corruption to preparation versus fail-closed handling.
- Define read-only P1 Diagnostics facts for baseline, cache, runtime identity, and attempt binding without granting ensure/repair/update authority.

## Acceptance criteria

- [x] Report identifies the canonical bundled baseline source of truth.
- [x] Report assigns packaged manifest/package-set identity responsibility.
- [x] Report defines materialized baseline-cache lifecycle.
- [x] Report decides whether a persisted P2-A selection record is necessary and limits its responsibility.
- [x] Report defines the minimum complete attempt runtime identity and owner.
- [x] Report defines resolve → validate → lease → execute dependency direction.
- [x] Report defines fail-closed semantics for every missing/corrupt/mismatch state.
- [x] Report limits P1 Diagnostics to read-only observation.
- [x] Report states whether any repository blocker remains for P2-A implementation.
- [x] Report recommends the minimum P2-A implementation scope and explicit deferrals.
- [x] Retained Windows/macOS external release gates remain recorded but do not expand planning.
- [x] No implementation, network updater, managed candidate, activation, rollback, GC, automatic candidate fallback, or Architecture PASS occurs.

## Retained external release gates

- Clean-host normal Electron Builder verification.
- Windows default-userData validation.
- Portable folder-replacement retention.
- Successful live EJS challenge execution.
- macOS arm64 fresh quarantine, offline baseline execution, and Gatekeeper validation.
