# Diagnostics Readability / Export Cleanup — Implementation Report

Date: 2026-08-18

Branch: `repair/diagnostics-readability-export-cleanup`

Baseline: `main@5619ba0`
Status: implementation complete and validated; awaiting GPT Architecture Lead Architecture Review. No Architecture PASS is granted here.

## Ownership and dependency boundary

- Product/Application typed terminal facts remain the only error-semantics authority.
- Quick Copy and Support Export are read-only Electron-main projections. They do not call Download or Transcode commands, mutate runtime/config/lifecycle state, or acknowledge terminal outcomes.
- Raw yt-dlp/gallery-dl/ffmpeg/runtime output remains evidence only. New report category resolution never scans raw message/context text.
- Shared privacy order is: report-specific allowlist projection -> bounded recursive sanitizer -> Electron clipboard/file egress. Producer redaction and runtime-log ingress scrubbing remain defense in depth.

## Final data flow

### Quick Copy v2

Renderer typed terminal failure -> `copy_error_diagnostics` -> payload normalization/open-context removal -> incident report projection -> final recursive sanitizer -> readable sectioned text -> Electron `clipboard.writeText`.

The report contains app identity, localized summary, typed incident/category facts, safe URL metadata, ordered attempts and terminal facts. It no longer reads or includes the 120-line session runtime-log excerpt. Transcode or truly legacy failures without typed attempts may include one bounded sanitized evidence line, explicitly labeled evidence-only.

### Support Export v2

Settings `export_support_log` -> Electron composition-owned environment/config/runtime inputs -> explicit safe environment/settings/runtime projections -> recursive sanitizer -> newest 800 chronological runtime lines sanitized again -> four-section text -> `support-<timestamp>.txt` -> unchanged string path return and Settings folder-open flow.

The recognizable `[environment]`, `[settings]`, `[runtime]`, and `[recent-runtime-log]` sections remain. Raw config objects, proxy endpoints, output/runtime executable paths, cookies, credentials, signed query data, and unknown config keys do not egress.

## Compatibility and semantic result

- Preserved commands: `copy_error_diagnostics`, `export_support_log`.
- Preserved Export return type, filename behavior, log directory, four sections, and Settings folder-opening behavior.
- Quick Copy intentionally migrates from JSON schema v1 to readable sectioned report format v2; repository tests and Chinese/English troubleshooting docs were updated.
- Typed `diagnosticCategory` wins. Typed Transcode surface maps to `transcode_merge` before Download-compatible code fallbacks. Truly untyped legacy Download becomes `unclassified`.
- Legacy raw-message/context semantic inference has exited the new report path. Product terminal classification remains unchanged.

## Privacy/security validation

Fixtures cover signed URL query/fragment/userinfo, scheme-less URLs, Cookie/Set-Cookie, Authorization/Proxy-Authorization, Bearer/Basic, proxy credentials, secret-bearing CLI arguments, cookie paths, quoted paths with spaces/opposite quotes, Windows drive and UNC paths, POSIX/macOS roots, `~/`, browser/session/API tokens, unknown config fields, and recursive depth/string/array bounds.

Sink failures propagate without any Product authority callback: clipboard-write failure and support-file write failure are explicitly tested. No generic dedupe was added; retry, fallback, auth recovery, repeated failure, and terminal chronology remain intact.

## Validation results

- Lead focused suite: 10 files, 178 tests passed.
- Final affected suite: 6 files, 87 tests passed.
- `npm run type-check`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run docs:build`: passed, 53 pages built with search index.
- `git diff --check`: passed; CRLF conversion warnings only.
- `npm test`: 1516 passed, 1 failed. The failure is the pre-existing `browser-extension/architecture-guard.test.js` unknown-message guard assertion; `browser-extension/` has no content diff from `main`, and the same failure reproduces on the baseline.

Windows actual Electron-host validation used the built main-process modules and real Electron APIs. It verified typed Download and Transcode clipboard reports, retry/auth-recovery/fallback order, absence of session logs, privacy redaction, support-file creation/four sections, chronological runtime evidence, and native `shell.openPath` folder opening. The prior clipboard contents were restored and the temporary harness/files were removed.

macOS runtime validation was not available. macOS path/privacy behavior is covered by fixtures for `/Users`, `/Applications`, `/Volumes`, `/Library`, POSIX roots, home-relative paths, spaces, and quote variants; macOS runtime smoke coverage remains debt.

## Residual risks and deferred debt

- The approved Transcode/legacy evidence line is bounded and sanitized but still arbitrary producer prose; future unmatched sensitive formats may require additional sanitizer fixtures.
- Settings allowlisting fails closed for future unknown keys; useful new settings must be added deliberately.
- End-user GUI click-through was not automated; actual Electron clipboard/file/shell APIs and renderer/controller contracts were validated separately.
- Deferred by scope: runtime-log rotation, support-file retention, telemetry JSONL/startup capture retention, crash-resilient cookie-sidecar cleanup, and a richer trace-keyed backend evidence store.
- The unrelated baseline browser-extension architecture-guard failure remains open and was not changed in this repair line.
