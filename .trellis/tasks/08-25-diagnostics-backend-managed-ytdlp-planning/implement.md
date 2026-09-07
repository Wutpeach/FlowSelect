# Diagnostics backend lifecycle and managed yt-dlp — future execution plan

## Status and gate

This is a planning artifact only. Do not run it in this task. Implementation requires a later explicit user approval and architecture review of the repository-grounded design.

## P1 — read-only Diagnostics

1. Define a structured read-only diagnostics result that separates configured, observed, healthy, degraded, unavailable, and not-verified facts.
2. Add application-owned fact collectors by adapting existing runtime owners rather than duplicating backend discovery or process authority.
3. Cover bundled yt-dlp and its required FFmpeg/FFprobe dependencies, current execution/failure signals, Browser Bridge state, and download-directory/config accessibility.
4. Expose one read-only desktop command through the existing preload/runtime contract.
5. Verify that invoking diagnostics causes no network request, binary installation, configuration write, directory creation, process termination, or backend selection mutation.
6. Add platform-relevant tests for missing, non-executable, version-probe failure, bridge-unavailable, and unwritable/missing path reporting.

## P2 — managed yt-dlp update and rollback

1. Specify a yt-dlp release manifest and integrity/authenticity policy before adding network or installation code.
2. Store managed releases under an application-owned writable versioned directory; never modify the packaged resources directory.
3. Implement download-to-temporary, verify, atomic stage, and explicit eligibility probing without activation side effects.
4. Add a single candidate resolver inside the current download execution boundary: selected managed release when eligible, otherwise bundled baseline.
5. Pin the resolved executable and dependency set in each execution context before spawn.
6. Activate or roll back only for new executions; retain referenced releases until all pinned executions finish or cancel.
7. Make fallback causes and selected identity observable to P1 Diagnostics and existing error reporting.
8. Test failed download, failed verification, failed probe, broken managed execution, rollback, application update coexistence, cancellation, retry, and concurrent downloads.

## Required review gates before execution

- Repository-grounded architecture review confirms the exact current authority owner and insertion point.
- Windows packaging/runtime verification covers installed and portable forms present in the repository.
- macOS verification covers packaged-app signing/notarization behavior plus managed executable permission/quarantine behavior; unproven assumptions remain blocking.
- Security review approves the release source, integrity/authenticity chain, transport, redirect, and downgrade policy.
- Lifecycle review proves there is one selector and one execution authority, and that activation cannot replace dependencies used by running processes.
- P1 ships and provides the facts needed to diagnose P2 failures before P2 repair/update is enabled.

## Rollback points

- Before managed installation exists: bundled-only behavior remains unchanged.
- After staging but before activation: discard or quarantine the staged release; selection remains unchanged.
- After activation: switch selection metadata back to the bundled baseline or previous eligible release for new executions; do not delete a release still pinned by an active execution.
- If selection metadata is unreadable or inconsistent: fail closed to the bundled baseline and report the managed state as degraded.
