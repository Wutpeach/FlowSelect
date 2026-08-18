# Trellis history, established contracts, and landing recommendation

## Scope

This note records repository-established diagnostic/terminal contracts and the
current MR9 state. It does not inspect every present-day producer/consumer (the
other repository research tracks cover that), change product code, or grant an
architecture gate.

## Existing contracts that the new plan must treat as baseline

### P6B already established the diagnostic semantics seam

The completed P6B task (`b5b414f`, archived by `98e1172`) is not merely prior
discussion: its acceptance record says the implementation has a stable Job
trace, Application-owned monotonic attempt identity, a closed download-only
diagnostic event union, bounded sanitized attempt history, structured failure
categories, best-effort sink isolation, and allowlisted redaction
(`.trellis/tasks/archive/2026-08/08-10-p6-site-engine-extension-observability/prd.md:110-121`).

Its architecture audit fixes the dependency direction:

```text
Domain typed error/category
  -> Application lifecycle/attempt/terminal diagnostic facts
  -> Infrastructure typed safe execution/network evidence
  -> Composition-owned best-effort sinks
  -> Presentation consumes only allowed terminal category/summary
```

The exact ownership statement is in
`.trellis/tasks/archive/2026-08/08-10-p6-site-engine-extension-observability/research/current-observability-audit.md:188-207`.
The vocabulary was intentionally download-only and closed, not an Event Bus
(`current-observability-audit.md:81-101`). Therefore the current cleanup should
extend/project the implemented P6B facts rather than create another diagnostic
model, infer semantics from raw output, or introduce a general observability
framework.

### P6B already chose privacy and retention direction

P6B's redaction contract is allowlist-first: URL origin plus safe metadata,
never raw request/plan/context/environment/CLI args; cookies, authorization,
proxy credentials, session/browser auth, cookie paths, raw environment, and
filesystem secrets are excluded; bounded stdout/stderr must be scrubbed before
log, clipboard, telemetry, or protocol egress
(`current-observability-audit.md:177-186`).

P6B also explicitly rejected a new persistent event store. Attempt history is
bounded in the active Job, structured lifecycle facts may render into the
existing session runtime log, and terminal telemetry remains a separate
aggregate (`current-observability-audit.md:227-246`). The present cleanup should
reuse this storage decision. It may bound/project existing history, but should
not add a diagnostic database, tracing store, or replay model.

### Terminal authority was corrected after P6B

The terminal-authority repair established that `DownloadJobService` is the only
ordinary Job terminal authority while Infrastructure owns fallible output
settlement
(`.trellis/tasks/archive/2026-08/08-11-terminal-authority-correction/design.md:5-18`).
The current backend contract further requires settlement to occur before the
single structured diagnostic terminal and `video-download-complete`, and says
diagnostic and Product terminal outcomes must always agree
(`.trellis/spec/backend/sidecar-runtime-contracts/03-electron-download-runtime-core.md:49`).

Consequences for this plan:

- Copy/Export may select and format the typed terminal/attempt facts, but cannot
  classify success/failure/cancellation from yt-dlp/gallery-dl/ffmpeg strings.
- Evidence cleanup, repetition collapse, and chronology formatting cannot
  manufacture or replace a terminal event.
- Download, Transcode, runtime bootstrap, Electron/native, and config owners
  continue to publish their own facts; Diagnostics only consumes snapshots.

### Trellis already defines a support-export compatibility contract

The backend logging spec identifies `electron/main.mts` as source, Settings as
the renderer trigger, and `export_support_log` as the command, with required
`[environment]`, `[settings]`, `[runtime]`, and `[recent-runtime-log]` sections
(`.trellis/spec/backend/logging-guidelines.md:39-59`). It also requires recent
runtime output and names current inputs as main-process console output,
renderer console output, and non-progress yt-dlp output
(`logging-guidelines.md:61-64`). Cookies/tokens, progress markers, and repeated
queue/UI chatter are explicitly excluded (`logging-guidelines.md:66-70`).

This is a compatibility surface, not evidence that the current implementation
fully satisfies privacy/readability. A minimum migration should preserve the
command and recognizable section contract while making section contents
bounded, structured-first, and canonically sanitized. If section names or the
log filename must change, retain a version/header or compatibility fixture
rather than silently changing support expectations.

## Planning implications for Quick Copy and Export

1. Treat the P6B event/category/attempt model as the shared semantic input.
   Quick Copy is a projection of one current terminal incident; Export is a
   wider support snapshot using the same semantic vocabulary plus environment,
   runtime dependency/native facts, and bounded evidence.
2. Treat raw process/runtime lines as evidence owned by their producer. They may
   be included only after the same canonical pre-egress sanitizer and bounded
   evidence policy; they never override typed facts.
3. Put the canonical privacy gate before both clipboard and file-write egress.
   Producer-side safe snapshots remain defense in depth, but renderer-only or
   copy-only redaction is insufficient because Export has a separate path.
4. Preserve event order and attempt/retry identity. Collapse only adjacent,
   mechanically repeated progress/noise records whose removal cannot erase an
   attempt boundary, fallback, auth recovery, retry, or repeated terminal
   failure.
5. Reuse the existing session runtime log/buffer and bounded Job attempt history;
   do not add another lifecycle store. Any current unbounded terminal telemetry
   retention remains separate debt unless the present Export actually reads it.
6. Update the logging spec during implementation if source coverage or egress
   policy changes, because it currently contains the public support-export
   contract and some broad `What to Log` examples that can conflict with the
   stricter P6B allowlist.

## MR9 relationship and landing recommendation

MR9 is already an implementation line, not an unstarted plan. Its current
worktree task is `in_progress`, scope `implementation`, with core commit
`c762c14`; it remains at the user manual visual-acceptance gate and has not been
finally passed, archived, or merged
(`.cindy-worktrees/mr9-fullscreen-activation-fx/.trellis/tasks/08-15-mr9-fullscreen-activation-fx-progress-visual-refinement/task.json:6-26`).
The MR9 design explicitly preserves typed terminal truth, diagnostic payload,
bounded retention, and lifecycle behavior, and retains the restrained DOM
diagnostic/copy affordance while removing only the fullscreen terminal shader
recipe
(`.trellis/tasks/08-15-mr9-fullscreen-activation-fx-progress-visual-refinement/design.md:100-107`).

Repository-grounded recommendation: **independent implementation line, not an
MR9 prerequisite repair**.

Reasons:

- MR9's correctness and acceptance concern Presentation activation/progress and
  already treats diagnostics as a preserved read-only consumer; it does not
  depend on diagnostic formatting/export behavior.
- The cleanup spans Electron composition/log capture, Settings export,
  Application diagnostic projections, and the main-window copy projection.
  Making that a prerequisite would reopen the active MR9 visual/manual gate for
  unrelated cross-layer work.
- P6B and terminal authority already provide the semantic prerequisites, so the
  cleanup can be scoped and reviewed independently without modifying MR9's
  Product/Download/Presentation authority.
- Because Quick Copy touches the terminal DOM path MR9 preserves, implementation
  should preferably branch from the stabilized post-MR9 integration baseline
  (after MR9 closure/consolidation) to avoid conflicting edits in `App.tsx` or
  `MainWindowPresentationSurface.tsx`. That sequencing is a merge-risk choice,
  not an architecture dependency.

Privacy failures found by the current audit should still be treated as a
release/support-export gate. Urgency does not make them a dependency of the
thermal FX architecture; if an urgent narrow leak repair is needed, it should
remain its own reviewed repair rather than being folded into MR9 tuning.

## Validation obligations inherited from history

- P6B trace/attempt/fallback/auth-recovery/exactly-one-terminal tests must remain
  green; add incident report fixtures rather than replacing those semantics.
- Redaction fixtures must cover signed URLs (query, fragment, userinfo and
  tokenized paths), cookies, Authorization/proxy credentials, browser/session
  tokens, raw environment, user paths, cookie paths, CLI args, and bounded
  stdout/stderr for both clipboard and export sinks.
- Add compatibility fixtures for the existing `export_support_log` command and
  required section shape, including an empty-log placeholder.
- Add chronology/noise fixtures proving retry/fallback/repeated-failure events
  survive while adjacent progress chatter is collapsed or omitted.
- Assert sink/serializer/file/clipboard failures do not alter Download terminal
  correctness or runtime lifecycle.
- Run focused diagnostic/export tests plus `npm test`, `npm run type-check`,
  `npm run lint`, `npm run build`, `git diff --check`, and `npm run docs:build`
  when user-facing copy/export behavior or troubleshooting guidance changes.

## Non-goals reinforced by repository history

- no Event Bus, logging rewrite, generic observability/tracing platform, new
  event store, analytics/telemetry SaaS, remote upload, or crash service;
- no raw stderr in the UI and no raw-log semantic parsing;
- no Extension terminal lifecycle redesign;
- no P0-P6 authority reversal, Download/Transcode/runtime/native/config control,
  or MR9 Thermal FX tuning.
