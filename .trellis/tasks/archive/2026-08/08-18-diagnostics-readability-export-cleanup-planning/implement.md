# Diagnostics Readability and Export Cleanup — Implementation Plan

## Preconditions and stop gates

1. GPT Architecture Lead must review the planning artifacts. This plan grants no Architecture PASS.
2. Do not run `task.py start` in this planning session.
3. Use an independent implementation line from the stabilized post-MR9 integration baseline; do not fold the work into Thermal FX tuning.
4. Preserve Product/Runtime terminal semantics and existing unrelated dirty work.
5. If readable Quick Copy requires a new event store or raw-log correlation parser, stop and return to Architecture Review; the approved minimum omits session logs from Quick Copy.

## Ordered implementation slices

### 1. Lock target contracts with fixtures

- Add deterministic Quick Copy v2 report fixtures for typed Download failure, fallback/retry/auth-recovery attempts, Transcode failure, legacy/untyped failure, unavailable optional facts, and malformed renderer input.
- Add Support Export v2 fixtures preserving command/path/filename behavior and the four section names while proving raw config and local paths are absent/redacted.
- Add negative fixtures proving neither builder parses raw evidence to choose terminal/category semantics.

### 2. Harden the canonical pre-egress privacy boundary

- Extend `src/core/diagnostics/safe-diagnostic.ts` with the minimum report-value/line bounding needed by both outputs.
- Cover cookies, Authorization/Proxy-Authorization, bearer/basic credentials, signed URLs/query/fragment/userinfo, browser/session/API tokens, proxy credentials, cookie paths, Windows drive and UNC paths, POSIX/macOS user paths, and secret-bearing command arguments.
- Keep allowlist-first projection mandatory; unknown config/context keys must be omitted, not merely key-name scrubbed.
- Preserve producer-side redaction and runtime-log ingress sanitization as defense in depth.

### 3. Replace Quick Copy's session excerpt with an incident report

- Keep `ErrorDiagnosticCopyRequest` as the Renderer-to-main input boundary.
- Rework `electron/errorDiagnosticCopy.mts` into a stable sectioned text formatter led by typed incident facts and ordered attempt summaries.
- Remove `readRecentRuntimeLogLines(120)` from the Copy path and the `runtimeLog` dump from its output contract.
- Include only a bounded sanitized Transcode/legacy failure summary when typed attempt evidence is unavailable.
- Keep normalization, open-context dropping, Electron-owned clipboard write, and copy-success dismissal behavior.

### 4. Make Support Export allowlisted and privacy-safe

- Replace raw `readConfigObject()` serialization with a concrete safe settings snapshot created at Electron composition.
- Replace raw runtime-dependency paths/errors with a safe status snapshot.
- Redact environment path values while preserving compatibility keys/sections.
- Sanitize and bound runtime evidence again immediately before file write; preserve chronology and existing 800-line ceiling.
- Do not add general deduplication. If a focused noise collapse is implemented, restrict it to exact adjacent producer-tagged progress/UI noise and test every protected boundary.

### 5. Remove raw-message diagnostic-category inference for new reports

- Make typed `diagnosticCategory` the Download presentation authority.
- Map the typed Transcode surface to the existing `transcode_merge` presentation category without inspecting ffmpeg text.
- Make genuinely untyped legacy Download reports `unclassified`.
- Preserve `classifyDownloadTerminal` legacy cancellation compatibility and all Product terminal outcomes.

### 6. Align specs, user guidance, and compatibility tests

- Update `.trellis/spec/backend/logging-guidelines.md` to describe actual runtime-log sources, allowlist-first support export, redacted path compatibility, and protected chronology.
- Update the relevant Chinese and English `site/src/content/docs/` troubleshooting/error pages to describe readable Quick Copy and sanitized Support Export.
- Update command-controller/type-contract tests without renaming commands or changing `export_support_log`'s string return.

## Validation strategy

### Focused tests

```powershell
npx vitest run `
  src/core/diagnostics/safe-diagnostic.test.ts `
  electron/errorDiagnosticCopy.test.mts `
  electron/errorDiagnosticCommands.test.mts `
  electron/supportLogExport.test.mts `
  electron/supportLogCommands.test.mts `
  electron/runtimeLog.test.mts `
  src/utils/errorDiagnosticCategories.test.ts `
  src/features/download/useDownloadQueue.test.ts `
  src/application/download-diagnostics.test.ts `
  src/electron-runtime/service.test.ts
```

### Security/authority assertions

- Clipboard and support file contain no fixture secret, signed query, user path, raw proxy URL, raw config object, cookie path, or command-argument credential.
- Typed trace/attempt order, fallback, auth recovery, retry, repeated failures, and final terminal facts remain intact.
- Evidence text changes never change report category or Product terminal result.
- Clipboard, serializer, runtime-log read, and support-file write failures remain non-authoritative and do not mutate Download/Transcode/runtime/lifecycle/config state.
- Quick Copy contains no unrelated trace/session lines.

### Repository gates

```powershell
npm run type-check
npm run lint
npm test
npm run build
npm run docs:build
git diff --check
```

### Manual Electron validation

- Trigger a typed Download failure and a Transcode failure; verify readable clipboard text, correct localized summary, preserved retry/attempt order, and prompt dismissal only after successful copy.
- Export from Settings; verify the file is created, the folder opens, required sections remain, structured facts precede evidence, and local paths/secrets are absent.
- Inspect a noisy/retry case and verify repeated failure/retry semantics survive while progress noise does not dominate.
- Record Windows as required coverage. Add macOS path/privacy fixture coverage even if a macOS runtime host is unavailable; record runtime validation debt explicitly.

## Risk and rollback points

| Risk | Containment / rollback |
| --- | --- |
| Quick Copy loses useful backend detail | Keep typed attempt/network facts; defer richer evidence until a producer-owned bounded trace field exists |
| Support tooling relies on old raw sections | Preserve command, return type, filename, section names, and add a format version; keep compatibility fixtures |
| Sanitizer gives false confidence over arbitrary objects | Allowlist first, sanitize second; unknown fields never leave the process |
| Noise collapse erases a retry/failure | Ship with no collapse or exact adjacent tagged-noise collapse only |
| Raw fallback removal changes Product outcome | Do not touch Product terminal classification; limit change to diagnostic presentation/report category |
| MR9 merge conflicts in terminal UI | Land independently from post-MR9 baseline; avoid shader/Presentation policy changes |

## Explicit follow-up debt, not first-line scope

- Runtime log file rotation within a very long session.
- Cleanup/retention policy for generated `support-*.txt` files.
- Rotation/cleanup for typed telemetry JSONL and debug-only startup text/PNG captures.
- Crash-resilient temporary cookie-file lifecycle hardening; this line only preserves the existing no-egress rule.
- Richer trace-keyed Transcode/backend evidence if support cases prove typed facts insufficient.
- Broader startup/native diagnostic export beyond selected safe facts.
