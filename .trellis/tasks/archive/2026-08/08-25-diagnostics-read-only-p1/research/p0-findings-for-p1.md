# P0 findings required for P1 implementation

- Current main has one download authority: `electron/main.mts` composes one runtime, one engine registry, and the existing yt-dlp/gallery-dl adapters; `src/electron-runtime` owns queue, process, retry, cancellation, and failure classification.
- yt-dlp/gallery-dl are managed pinned Python venvs backed by bundled CPython. FFmpeg/FFprobe and Deno are managed per-target binaries. P1 reports this current truth only.
- `src/electron-runtime/runtimePaths.ts` currently creates runtime roots through `runtimeRootFor()` during status/path resolution. P1 must add or split a no-create inspection path; Diagnostics cannot invoke mutation-producing status logic.
- Existing status mainly proves expected source and path presence. Actual version probes are separate. File presence must remain an observed fact, never be upgraded to executable health.
- Existing reusable owners include runtime gate/status, downloader version probes, queue/attempt/failure diagnostics, support-log allowlisting/redaction, config/output path, platform/package environment, and Browser Bridge internal connection state.
- Missing P1 facts include safe no-create output-path health, explicit unknown/not-verified states, dependency version/probe results, and a read-only Browser Bridge snapshot.
- P2 concepts are excluded: no managed candidate, activation generation, release identity, fallback selection, bundled yt-dlp fallback, update, rollback, or generic updater.
- Platform/security gaps that cannot be safely proved remain `not_verified`; P1 does not repair them.

Full evidence with file:line anchors remains in the parent report:
`.trellis/tasks/08-25-diagnostics-backend-managed-ytdlp-planning/research/repository-grounded-planning-report.md`.

