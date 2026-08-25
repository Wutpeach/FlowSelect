# P1 read-only diagnostics implementation plan

## Ordered implementation

1. Add shared serializable P1 Diagnostics fact types with separate evidence-origin and conclusion dimensions; exclude all P2 lifecycle concepts.
2. Split or add pure no-create runtime path/status inspection under the current `src/electron-runtime` owner, preserving existing mutating callers where required.
3. Add focused read-only collectors for current runtime dependency/version facts, platform/package environment, gate snapshot, output directory, Browser Bridge, queue, and bounded sanitized recent diagnostics.
4. Compose one Diagnostics query/controller under `electron/main.mts`, then expose it through the existing preload and typed renderer bridge.
5. Add the minimum Settings/support Diagnostics entry and report display using existing primitives, tokens, i18n, and accessibility patterns.
6. Extend the current support/export projection only where a new fact is explicitly allowlisted and sanitized; do not export raw local evidence.
7. Update Chinese and English docs-site troubleshooting/runtime pages with the read-only scope and meaning of unknown/not-verified results.

## Required tests

- Pure runtime path/status tests proving missing roots are not created.
- Collector tests for configured/observed/probed separation, file-present probe failure, missing dependencies, partial FFmpeg/FFprobe state, and unknown/not-verified facts.
- Mutation-proof integration test that snapshots a temporary filesystem/config/runtime/gate/job harness before and after the full query and asserts no change.
- Bootstrap spy assertions: no download, fetch, installer, bootstrap, mkdir, cleanup, config write, queue mutation, cancellation, or terminal event.
- Active-job regression test: query during active work leaves queue membership, AbortController/cancellation behavior, and exactly-one terminal semantics unchanged.
- Browser Bridge snapshot tests proving no connection/broadcast/request mutation.
- Controller/preload/bridge serialization and dispatch tests.
- Renderer tests for loading, partial/degraded, unavailable, unknown/not-verified, refresh, and accessibility behavior.
- Support/export tests for allowlisting, redaction, bounded evidence, and absence of raw paths/sensitive values.

## Validation commands

```text
npm test
npm run type-check
npm run lint
npm run build
npm run docs:build
git diff --check
```

Run narrower affected test files first, then the full commands above. Record platform-specific behavior not executed on the current Windows host as NOT VERIFIED rather than inferred.

## Review gates

- No P2 terminology or fields in production types.
- No diagnostics dependency on bootstrap/install/updater modules.
- No new runtime/download/Bridge/config source of truth.
- No filesystem mutation hidden behind status/path/output helpers.
- No active-download event or lifecycle changes.
- Minimal UI contains no Repair/update affordance.
- Public docs describe Diagnostics as observation only.

## Rollback boundary

The feature is additive at the typed query/UI entry. If validation fails, remove the new command/types/UI/docs and retain any independently safe pure path-resolution split only if existing tests prove no behavior change; otherwise revert that split as well. Never compensate by adding an implicit bootstrap or mutation fallback.

