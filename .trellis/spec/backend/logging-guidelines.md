# Logging Guidelines

> How logging is done in Ameow backend.

---

## Overview

Ameow uses runtime-owned logging with a consistent `>>>` prefix for human-facing terminal output.

- Electron main/runtime paths use `console.log/info/warn/error`, but the emitted message should still follow the `>>> [Scope] ...` shape when it is meant for terminal diagnostics.
- Every main-process console line and selected renderer/startup line is captured into the session runtime log and scrubbed with the shared sanitizer at ingest.
- Support-log export must include bounded, chronological runtime evidence in addition to safe static snapshots.

---

## Log Format

**Standard format:**
```ts
console.log(`>>> [Scope] ${action}: ${details}`);
```

**Examples from codebase:**
```ts
console.log(">>> [WS] Server listening on 127.0.0.1:39527");
console.warn(">>> [PastedVideo] Extension-assisted selection failed, falling back to direct queue:", error);
console.error(">>> [Electron] Failed to load desktop bootstrap config during renderer startup:", error);
```

Electron main example:

```ts
console.log(`>>> [Electron] ${message}`);
console.error(">>> [WS] Server error:", error);
```

---

## Runtime Log Sources (actual)

- Electron main `console.log/info/warn/error` (captured and scrubbed per line: `electron/runtimeLog.mts`).
- Renderer `webContents.on("console-message", ...)` appended via the startup-diagnostics controller (`electron/startupDiagnostics.mts`).
- Selected producer timing/phase lines that are already safe and bounded (for example `>>> [yt-dlp timing] ...`).

Do **not** log to the runtime log:

- raw child-process stdout/stderr for `yt-dlp`, `gallery-dl`, or `ffmpeg` (raw output is Infrastructure evidence only, consumed for typed classification/progress; never a second semantics source);
- every progress marker line from `__AMEOW_PROGRESS__=...`;
- repeated queue/UI chatter already represented by structured events;
- sensitive payloads such as raw cookies, tokens, passwords, proxy credentials, cookie file paths, or command arguments that may carry them.

---

## Shared Privacy Boundary

The canonical pre-egress privacy policy is `src/core/diagnostics/safe-diagnostic.ts`:

- `sanitizeDiagnosticText` — bounded text scrub: URL origin reduction (including scheme-less host-like URLs), cookie/authorization/bearer/basic redaction, secret-like key/value redaction, Windows/UNC/POSIX/macOS/home path redaction.
- `sanitizeDiagnosticValue` — recursive final safety net over already-projected values: bounds strings, arrays, and nesting; omits non-serializable leaves.

Rules:

- Allowlist-first projection is mandatory. Unknown/open config or context keys must be omitted before sanitization, never carried as key-name-scrubbed bags.
- The final sanitization call happens immediately before `clipboard.writeText(...)` (Quick Copy) and `writeFile(...)` (Support Export) in the Electron main process. Producer-side redaction and runtime-log ingest scrubbing remain defense in depth only.
- Diagnostics is read-only: it never parses raw engine output to reconstruct Product semantics, never mutates Download/Transcode/runtime/lifecycle/config state, and never egresses site-session cookies.

---

## Quick Copy Diagnostic Contract

- Command name: `copy_error_diagnostics`.
- Scope: one terminal incident only. The report is readable sectioned plain text (v2) with typed facts first: summary, incident, ordered attempt summaries, terminal facts, and (only for Transcode/legacy failures without typed attempts) one bounded sanitized evidence line.
- Quick Copy must **not** read or include the session runtime log, and must not include open context bags or unbounded/raw engine-output dumps. The single explicitly allowed bounded sanitized Transcode/legacy evidence line is the only raw engine-output content that may egress.
- Chronology and meaning: attempt index, engine, cycle, outcome, fallback, auth recovery, retries, and repeated failures remain visible. No generic dedupe or collapse in the first version.

---

## Support Log Export Contract

Source of truth:
- `electron/main.mts` (composition)
- renderer trigger: `src/pages/SettingsPage.tsx`
- command name: `export_support_log`
- builder: `electron/supportLogExport.mts`
- safe projections: `electron/supportLogSnapshot.mts`

Required exported sections (unchanged names, plus a format-version header):

```text
Ameow Support Log
formatVersion=2
privacy=allowlist projection with recursive sanitization at egress

[environment]
[settings]
[runtime]
[recent-runtime-log]
```

Rules:

- `export_support_log` must write the support file into `getLogsDir()` and return the path (string). Settings keeps opening the containing folder.
- `[environment]` keeps `appVersion`, `platform`, `arch`, `isPackaged`, and compatibility path keys (`configPath`, `logDir`, `runtimeLogPath`) with redacted/presence values — never raw paths.
- `[settings]` is an explicit allowlist projection of diagnostics-relevant safe facts. Raw config object, proxy endpoint, and output/AE executable paths never egress (presence booleans only).
- `[runtime]` projects component state/source/expected/fallback and path-presence facts; executable paths never egress; error text is sanitized and bounded.
- `[recent-runtime-log]` contains the newest bounded chronological runtime evidence (≤ 800 lines), re-sanitized at egress. Attempt, retry, fallback, auth recovery, repeated failure, and terminal lines must remain visible.
- If no runtime lines are available, write a clear placeholder such as `<no runtime log lines captured>`.
- No general deduplication. If a focused noise collapse is ever added, it must be exact adjacent collapse restricted to producer-tagged progress/UI-noise records and must never collapse across trace IDs, attempt IDs, cycle changes, retry/fallback/auth-recovery markers, warnings/errors, or terminal events.

---

## What to Log

- Function entry with parameters
- Safe target paths and directories (scrubbed at egress)
- Download URLs (origin-reduced at egress)
- File save locations (scrubbed at egress)
- Important state changes

---

## What NOT to Log

- Sensitive data (passwords, tokens, cookies, credentials)
- Full file contents
- High-frequency events (mouse moves)
- Internal loop iterations
- Repetitive UI positioning chatter such as `set_window_position(...)`
- Queue count/detail chatter on every progress tick when the same state is already represented by structured events

## High-Frequency CLI Progress

For streaming sidecar tools such as `yt-dlp` and `ffmpeg`, do not emit every progress tick as its own terminal line.

Why:
- CLI download/transcode progress can update dozens of times per second.
- Per-line logging makes PowerShell/CMD scroll aggressively and hides actual warnings/errors.

Preferred pattern:

```rust
if is_terminal_progress_output_line(line) {
    render_terminal_progress_line(">>> [yt-dlp] ...");
} else {
    finish_terminal_progress_line();
    println!(">>> [yt-dlp] {}", line);
}
```

Rules:
- Use single-line carriage-return refresh for progress-only output.
- Call `finish_terminal_progress_line()` before printing a normal log line or returning from the loop.
- Keep the runtime log/event pipeline as the durable source of truth; terminal single-line progress is only a developer-facing convenience.
- For known transient retry diagnostics from sidecars, prefer suppressing duplicate raw terminal warnings when the backend already records them in buffers/runtime logs and handles them through a structured retry path.

## Follow-up debt (not first-line scope)

- Runtime-log file rotation within a very long session.
- Cleanup/retention policy for generated `support-*.txt` files.
- Rotation/cleanup for typed telemetry JSONL and debug-only startup text/PNG captures.
- Crash-resilient temporary cookie-file lifecycle hardening (existing no-egress rule only).
- Richer trace-keyed Transcode/backend evidence if support cases prove typed facts insufficient.
