# Implement P1 read-only diagnostics

## Goal

Implement a real, user-accessible Ameow runtime self-check that reports only facts the current application can safely prove, without mutating filesystem, configuration, runtime state, download lifecycle, or Browser Bridge state.

This P1 implementation follows the repository-grounded parent planning in `08-25-diagnostics-backend-managed-ytdlp-planning` and stops before any Repair or backend updater lifecycle.

## Requirements

### Strict read-only behavior

- A complete Diagnostics query must not download, install, bootstrap, repair, update, delete, create directories, write metadata, modify config, change runtime selection, cancel work, enqueue work, retry work, or emit download terminal events.
- Missing runtime directories must remain missing after Diagnostics.
- Current status/path helpers that create directories must not be invoked as the read-only fact path unless they are first separated into a pure no-create query.
- Version/executable probes may spawn bounded read-only commands, but must not invoke bootstrap or mutate runtime contents.

### Authority and contracts

- Reuse existing owners for runtime dependency facts, gate/bootstrap state, platform/package environment, output configuration, Browser Bridge, queue state, recent sanitized failures, and support/export diagnostics.
- Expose Diagnostics through the existing Electron main -> preload -> typed application/renderer boundary.
- Do not create a second runtime resolver, queue, downloader, process authority, Browser Bridge state store, support-log authority, or config source of truth.
- Support/export output must preserve existing allowlists, path redaction, bounded evidence, and sanitization behavior.

### Fact semantics

- Separate evidence origin (`configured`, `observed`, `probed`) from conclusion (`available`, `degraded`, `unavailable`, `unknown`, `not_verified`).
- File existence is an observed fact only; it is not sufficient to claim executable health, version correctness, or dependency compatibility.
- Probe failures must be returned as bounded/sanitized diagnostic facts rather than converted to success or generic health.
- Facts that cannot be proven safely must be reported as `unknown` or `not_verified`.

### P1 report surface

The report must cover, where safely provable:

- Ameow version, OS, architecture, packaged/development mode, and supported runtime target.
- Current yt-dlp availability, expected/current source, executable or installed-package version, and version-probe outcome.
- FFmpeg, FFprobe, gallery-dl, Deno, and bundled Python facts supported by the current architecture.
- Runtime dependency gate phase/activity/failure state without triggering bootstrap.
- Configured output directory existence and read-only writability/accessibility facts without creating it.
- Browser Bridge listener/connectivity facts already owned by the loopback bridge.
- Active/pending queue counts and bounded recent sanitized failure/diagnostic facts suitable for self-check display.

### Minimal product entry

- Add the smallest Diagnostics entry and report display that fits the existing Settings/support/runtime surfaces.
- Use existing theme tokens, shared surface primitives, typed desktop bridge, accessibility semantics, and concise i18n copy.
- Do not design or imply a Repair Center, update action, rollback action, managed candidate selector, or automatic remediation.
- Update relevant Chinese and English public docs for the new read-only Diagnostics behavior.

## Acceptance Criteria

- [x] One typed Diagnostics snapshot crosses Electron main, preload, renderer bridge, and the minimal product surface.
- [x] Reported facts distinguish evidence origin from availability/degradation/unknown state.
- [x] yt-dlp, key runtime dependencies, gate state, output directory, Browser Bridge, queue, and sanitized recent diagnostic facts are represented when available.
- [x] Unprovable facts are `unknown` or `not_verified`; file presence alone is never labelled healthy.
- [x] Full Diagnostics leaves filesystem/config/runtime/job state unchanged in mutation-proof tests.
- [x] Missing runtime roots remain absent and bootstrap/install callbacks are not called.
- [x] Active download/cancellation/terminal semantics remain unchanged and no new queue/runtime authority exists.
- [x] Support/export remains allowlisted, bounded, and sanitized.
- [x] Minimal UI is accessible, theme-consistent, and contains no Repair/P2 affordance.
- [x] Relevant tests, type-check, lint, build, docs build, and diff checks pass.
- [x] Implementation stops without P2 updater/fallback/rollback work or Architecture PASS.

## Out of Scope

- yt-dlp or other backend download/update/installation/repair.
- Bundled yt-dlp fallback, rollback, runtime selection, managed candidates, activation generations, release identities, or garbage collection.
- Universal updater abstractions.
- Full Repair Center information architecture or UI.
- Changes to feature/domain download routing or runtime execution authority.
