# P1 read-only diagnostics design

## Change boundary

### Smallest behavior gap

Ameow currently owns the relevant facts, but they are fragmented across runtime status, Electron main, Browser Bridge, queue diagnostics, output config, and support export. Some runtime path/status helpers create directories, so there is no single safe read-only query or user-facing self-check.

### Where the behavior lives

- Pure no-create runtime path/fact derivation belongs in `src/electron-runtime` alongside the current runtime resolver.
- Electron-specific environment, version probes, Browser Bridge snapshot, output/config facts, gate facts, and queue/recent diagnostics are composed in `electron/` under the existing `electron/main.mts` composition root.
- Serializable contracts live in existing shared type/bridge boundaries.
- Renderer consumption goes through `src/desktop/runtime.ts` / typed `window.ameow` contracts.
- Minimal presentation belongs in the existing Settings/support/runtime surface, reusing current UI primitives and i18n sources.
- Public user behavior documentation belongs in `site/src/content/docs/` for both locales.

### Explicitly not changing

- Managed runtime bootstrap/install code and bootstrap order.
- Download queue, engine registry, adapters, process runner, retry/cancellation, or terminal event semantics.
- Runtime selection, fallback, update, rollback, release metadata, or candidate identity.
- Browser Bridge connection ownership or protocol.
- Support-log raw evidence policy.

## Data contract

Use two independent dimensions rather than one overloaded status enum:

```ts
type DiagnosticEvidenceOrigin = "configured" | "observed" | "probed";

type DiagnosticConclusion =
  | "available"
  | "degraded"
  | "unavailable"
  | "unknown"
  | "not_verified";

type DiagnosticFact<T> = {
  origin: DiagnosticEvidenceOrigin;
  conclusion: DiagnosticConclusion;
  value: T | null;
  summary?: string | null;
};
```

The final exact shape should stay minimal and reuse existing runtime DTOs where their semantics are honest. It must not add P2 fields.

Suggested snapshot sections:

```text
environment
runtimes
runtimeGate
outputDirectory
browserBridge
downloads
generatedAt
```

`generatedAt` describes observation time only and is not persisted.

## Read flow

```text
Settings Diagnostics entry
  -> typed preload command
  -> existing renderer-command controller registry
  -> application-owned Diagnostics query
       -> pure no-create runtime facts
       -> bounded version probes
       -> existing gate snapshot
       -> read-only output-path checks
       -> existing Browser Bridge snapshot
       -> existing queue + sanitized diagnostic projection
  -> serializable snapshot
  -> minimal themed report
```

There is no write flow.

## Non-mutation contract

- Runtime path derivation accepts environment/config path but never calls `mkdir`, bootstrap, installer, metadata writer, or cleanup.
- Output-directory checks inspect the configured/derived path without creating it. If a safe writability fact cannot be proven without mutation, return `not_verified`; do not create/delete a probe file in P1.
- Version probes use current executable paths only when observed present, remain time-bounded, capture bounded sanitized output, and do not install missing dependencies.
- Diagnostics reads the runtime gate but never calls refresh/start if those paths can bootstrap or mutate. If current refresh is proven pure, it may be reused; otherwise use the already-owned snapshot getter.
- Browser Bridge facts are projected from its existing owner; Diagnostics does not open, reconnect, broadcast, or send a probe frame.
- Queue facts are snapshots only; Diagnostics does not subscribe, cancel, retry, acknowledge, or emit events.

## Minimal UI direction

Product register. A user opens Diagnostics from the existing Settings/support area and receives one compact, scannable report with short section labels and quiet inline states. Use current `ThemeColors`, `Neon*` primitives, shared shell/field styles, black/white themes, and existing Settings density. Provide a manual refresh action only if it runs the same read-only query. Do not add decorative motion or a repair button.

## Support/export safety

- Reuse the current allowlisted support snapshot/export projection.
- Raw paths, cookies, URLs, query strings, stderr/stdout, user names, and site/session data stay redacted or bounded according to existing rules.
- Diagnostics UI may display more local detail than exported support data only when the current product already considers that detail safe; export remains the stricter boundary.

## Failure behavior

- Section-level failure does not abort the whole report; return a degraded/unknown fact with sanitized summary.
- A failed executable probe does not mark the tool available merely because its path exists.
- An absent Browser Bridge client is an observed connectivity state, not an application error.
- Missing output directory reports unavailable/not verified without creating it.
- Unexpected query failure propagates through the existing controller error behavior; it must not trigger repair.

