# Diagnostics Readability and Export Cleanup — Design

## Decision summary

Keep existing Product / Runtime terminal facts authoritative and make the two user-shareable outputs narrow projections of those facts:

- Quick Copy: one terminal incident, readable, small, typed-facts-first, with no session log dump.
- Settings Export: one bounded support snapshot containing safe environment/settings/runtime facts plus bounded chronological runtime evidence.

Both outputs pass through the same main-process pre-egress privacy policy. Producer-side sanitization remains defense in depth. No new event store, Event Bus, tracing model, or generic logging framework is introduced.

## Current ownership and flow

### Typed Download facts

`src/application/download-diagnostics.ts` owns one stable Job trace, monotonic attempts, retry/auth-recovery/fallback lifecycle events, bounded attempt history, and exactly one terminal summary. The composition-owned runtime-log sink serializes those already-safe events to the existing runtime logger. The protocol mapper publishes only code, classification, category, safe URL facts, and the terminal attempt summary to the Renderer.

### Engine evidence

`src/electron-runtime/ytDlpDownload.ts`, `galleryDlDownload.ts`, and `transcode.ts` own raw child stdout/stderr while the process is running. They may use raw evidence inside Infrastructure classification, but diagnostics formatting must consume only the resulting typed facts and explicitly safe/bounded evidence. Raw output never becomes a second Product semantics source.

### Runtime/support evidence

`electron/runtimeLog.mts` captures Electron main console output and explicit renderer/startup lines, scrubs each line, keeps a 1500-line memory fallback, overwrites `runtime-latest.log` at session start, and returns the newest bounded slice (800 by default). The disk file is session-scoped but may grow until restart; generated `support-*.txt` files have no cleanup policy.

The separate local `telemetry/download-outcomes.jsonl` is typed and deliberately omits raw error messages, but is append-only and is not an input to either current output. Debug-enabled startup text/PNG captures are also separate. Do not connect either store to Copy/Export in this implementation.

### Quick Copy

The Renderer builds an `ErrorDiagnosticCopyRequest` from the already-reduced Download terminal or Transcode failure and invokes `copy_error_diagnostics`. Electron normalizes the request, drops open context bags, reads the last 120 runtime-log lines from the whole session, builds pretty JSON, and writes it to the clipboard.

### Settings Export

Settings invokes `export_support_log`; Electron serializes raw environment paths, the entire open config object, the complete runtime-dependency status object, and the latest 800 runtime-log lines into four sectioned blocks, writes `support-<timestamp>.txt`, returns the path, and Settings opens the containing folder.

## Problems to fix

1. Quick Copy is not incident-scoped because its 120 lines are selected by recency, not trace or failure ownership.
2. Quick Copy repeats structured terminal information alongside unrelated session evidence, making a small user action produce a developer-oriented JSON/log dump.
3. Settings Export bypasses the copy redaction path for environment/config/runtime sections. It emits user paths and an arbitrary config object verbatim.
4. The current redaction policy is split between `safe-diagnostic.ts`, network credential redaction, request normalization, and runtime-log ingress. Only Copy has a dedicated output builder privacy pass.
5. Renderer diagnostic-category compatibility logic still has raw message/context pattern fallbacks. New typed payloads win, but a diagnostics cleanup must not add any new raw-text semantic inference.
6. Runtime evidence is chronological and output-bounded, but there is no semantic-aware collapse policy. A generic deduplicator would risk erasing retries or repeated failures.
7. Existing specs describe section and command compatibility but also preserve path-heavy examples and stale source assumptions; implementation must update the executable contract.

## Target design

### 1. One narrow shareable-diagnostic policy, not a framework

Extend the existing `src/core/diagnostics/safe-diagnostic.ts` security boundary with a small allowlist-first pre-egress projection/sanitization API. It must:

- accept only report-specific, already-selected facts;
- recursively sanitize every string leaf as a final safety net;
- reduce URLs to approved safe facts;
- redact local/UNC/POSIX paths, cookies, headers, credentials, secret-like key values, and command-argument secrets;
- bound string length, line count, array count, and nesting;
- omit unknown/open object fields rather than attempting to make an arbitrary config/context bag safe.

The builders remain concrete: one Quick Copy builder and one Support Export builder. They share only semantic labels, limits, and privacy primitives.

The mandatory boundary is immediately before `clipboard.writeText(...)` and `writeFile(...)` in the Electron main process. Runtime-log ingress sanitization and producer-safe snapshots remain defense in depth.

### 2. Quick Copy responsibilities

Quick Copy should contain:

- report format/version and generation time;
- app version, platform, arch, and language;
- visible localized failure explanation;
- typed surface, trace ID, code, classification, and diagnostic category;
- safe URL origin/query/fragment presence when available;
- ordered typed attempt summary, preserving attempt index, engine, cycle, outcome, network-application facts, and final terminal facts;
- for Transcode/legacy-only failures, one sanitized bounded failure summary explicitly labeled as evidence, not classification authority;
- a short privacy note describing URL/path/secret handling.

Quick Copy should not read or include the session runtime log in the first implementation. Existing Download attempt summaries provide incident-scoped evidence. Transcode has a typed surface plus a bounded failure summary. If richer per-incident raw evidence is needed later, the owning producer must expose a bounded trace-keyed safe evidence field; this task must not invent correlation by scanning log text or add an event store.

Use readable sectioned plain text with stable keys and a format header, rather than pretty-printing the old JSON plus 120 log lines. Keep labels stable and technical identifiers unlocalized; keep the user-facing explanation localized.

### 3. Settings Export responsibilities

Preserve the command, return type, filename behavior, Settings action, and recognizable sections:

- `[environment]`: app version, platform, arch, packaged/development state, and redacted path-presence/location labels. Preserve existing path keys only with redacted values if compatibility requires them.
- `[settings]`: an explicit allowlist of diagnostics-relevant safe facts (for example mode/feature/quality booleans and whether an output/proxy value is configured). Never serialize the raw config object or proxy endpoint.
- `[runtime]`: component state/source/expected-source/fallback-source and sanitized bounded errors; replace executable paths with presence/source facts.
- `[recent-runtime-log]`: newest bounded chronological evidence, sanitized again at egress. Keep attempt, retry, fallback, auth recovery, repeated failure, and terminal lines.

Add a format version and privacy-policy summary. Do not include the separate startup-diagnostics file wholesale; selected safe Electron/native facts may be projected by their owner when they are useful.

### 4. Readability and chronology policy

Order structured facts before evidence. Preserve evidence order exactly.

Do not add fuzzy/aggressive deduplication. The minimum accepted collapse is either no collapse, or exact adjacent collapse restricted to producer-tagged progress/UI-noise records. Never collapse across trace IDs, attempt IDs, cycle changes, retry/fallback/auth-recovery markers, warnings/errors, or terminal events. Repeated failures remain repeated events.

Prefer existing producer filtering: yt-dlp/ffmpeg progress is already converted to typed progress, gallery-dl keeps a 20-line tail, and the logging spec already excludes progress markers and repeated queue chatter. Fix source/spec drift instead of building a general log normalizer.

### 5. Diagnostic category compatibility

New reports consume the category already supplied by the typed terminal path and never parse evidence. Harden the presentation helper so typed `diagnosticCategory` wins, a typed Transcode surface maps to `transcode_merge`, and truly legacy/untyped Download failures become `unclassified` rather than gaining semantics from raw text.

Keep the separate legacy terminal cancellation fallback in `classifyDownloadTerminal` unchanged in this task; it is a compatibility path for terminal handling, not a new diagnostics/log parser. Do not change Product terminal outcomes.

## Dependency direction

```text
Domain/Application terminal facts + producer-owned safe snapshots
                         |
                         v
            concrete report projections
                         |
                         v
      shared allowlist + pre-egress sanitizer
                         |
              +----------+----------+
              |                     |
       Electron clipboard       Electron file write
```

Diagnostics never calls Download/Transcode commands, changes config, resolves routes, mutates runtime dependency state, controls BrowserWindow lifecycle, or acknowledges terminal outcomes.

## Compatibility and migration

- Keep `copy_error_diagnostics` and `export_support_log` command names.
- Keep `export_support_log -> Promise<string>` and Settings folder-opening behavior.
- Keep the four existing support-log section names and add a format-version header.
- Quick Copy changes from informal JSON schema v1 to readable report v2. Repository consumers are tests and docs; update both in the same implementation. There is no repository evidence of an external parser contract.
- Keep runtime log capture format and current-session behavior for this line; disk rotation and support-file retention are explicit follow-up debt.
- Update backend logging specs and Chinese/English public troubleshooting docs in the implementation commit.

## Landing recommendation

Implement on an independent line after MR9 is stabilized/consolidated, not as an MR9 prerequisite repair. MR9 owns visual activation/progress and preserves restrained DOM diagnostics as a read-only consumer; this cleanup spans Electron logging, config/runtime snapshots, Copy formatting, privacy, and Settings Export. P6B plus the terminal-authority repair already provide the semantic prerequisites.

Privacy issues may be release-blocking, but urgency does not make them a Thermal FX architecture dependency. Sequencing after MR9 also reduces overlap in `App.tsx` and the terminal DOM presentation path.

## Non-goals

- No logging rewrite, Event Bus, event database, replay store, tracing platform, telemetry, analytics, remote upload, AI analyzer, or cloud diagnostics.
- No Product terminal semantic change, Download/Transcode authority move, runtime/bootstrap control, lifecycle/config authority, or MR9 tuning.
- No broad historical support-file cleanup/rotation in the first implementation.
- No runtime-log, typed-telemetry, or startup-capture retention/rotation project in the first implementation.
- No raw-log semantic classification or full startup-diagnostics export.
