<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## Mandatory Orca Worker Dispatch

The current session is the Lead Coordinator. For every non-trivial repository
task, it MUST use real Orca orchestration and MUST NOT substitute Codex native
sub-agents or inline execution.

Choose the Trellis role for each dispatched phase and read its definition first:

- Investigation / debugging → `.codex/agents/trellis-research.toml`
- Implementation / code changes → `.codex/agents/trellis-implement.toml`
- Validation / tests / review → `.codex/agents/trellis-check.toml`

The Lead owns planning, dispatch, result review, commits, and user
communication. Workers must not spawn additional workers.

### Dispatch

For each worker:

1. Get the exact active task path from Trellis. Never guess it.
2. Create or bind an Orca Run. Reuse the current Run across related phases
   unless it is unavailable or the workflow intentionally requires a separate
   Run.
3. Create an Orca Task whose spec starts with the exact
   `Active task: <path>` and tells the worker to read and follow the selected
   TOML. Do not copy the full TOML into the Task spec.
4. Start a fresh visible Codex terminal in the current worktree with:

   `orca orchestration worker-start --task <task_id> --worktree current --agent codex --model <model> --effort <model_reasoning_effort> --json`

   Use the selected TOML's exact `model` and `model_reasoning_effort` values.

### After Dispatch

After a successful dispatch, keep exactly one filtered lifecycle-message wait
open for the Run:

`orca orchestration check --wait --types worker_done,escalation,question --timeout-ms 900000 --json`

This waits only for structured Orca messages. It is not progress monitoring and
must not be combined with transcript, terminal, task, dispatch, or worker-state
reads. While the wait is active, the user may still steer the Lead conversation.

If the wait times out with no messages, do not inspect the worker or treat the
timeout as failure. Re-arm the same filtered wait while an expected Dispatch is
still unsettled, unless the user asks to stop waiting. Do not rely on a host
notification to wake an ended Lead turn; durable mailbox storage alone does not
resume the coordinator.

Do not:

- poll `task-list`, `dispatch-show`, terminal state, or worker state
- use `worker-read` to watch progress
- use `terminal read` or `terminal wait` to watch progress
- run sleeps or any additional monitoring loop alongside the filtered wait
- restart or replace a worker merely because no notification has arrived

Orca messages are durable. A worker's `worker_done`, question, or escalation
remains in the Run until the Lead processes and acknowledges its Delivery.
The single filtered wait is the Delivery consumer; no worker transcript or
status polling is required.

### Processing Orca Messages

When the filtered wait returns a Delivery, process it directly. If no wait is
active and the host injects an Orca notification with an exact check command,
run that command once instead.

1. Process every message in the returned Delivery.
2. For `worker_done`, verify the task ID, dispatch ID, outcome, modified files,
   and report path.
3. Read the worker's task-local report from `reportPath` first. Do not use
   `worker-read` when the completion message and report are sufficient.
4. Review the result, then either:
   - immediately reuse the same worker for the next Orca Task; or
   - release it with `worker-release`.
5. After all messages and worker lifecycle decisions in the Delivery have been
   handled, acknowledge the Delivery using its `deliveryId`.
6. If other expected Dispatches remain unsettled, open one new filtered wait
   after the acknowledgement.

For a question, reply through Orca before acknowledging the Delivery. For an
escalation, inspect and resolve the reported condition before deciding whether
the worker should continue, be replaced, or be released.

### Bounded Status Checks

If the user explicitly asks for worker status, perform only one bounded
`task-list` or `dispatch-show` query and report the result. Do not turn the
request into recurring monitoring.

The absence of a lifecycle message or a wait timeout is not evidence that a
worker failed or stalled.

### `worker-read` Restrictions

Do not use `worker-read` for progress monitoring.

Use it only when:

- a completed worker's `worker_done` and task-local report are insufficient;
- Orca reports an explicit failure or escalation that requires transcript
  inspection; or
- the user explicitly asks to inspect the worker's detailed execution.

Prefer the task-local report over the full worker transcript because
`worker-read` can inject a large amount of unnecessary context and consume
substantial tokens.

### Inline Work

Inline work is allowed only for simple explanations, trivial read-only
actions, user clarification, Lead-owned planning/task artifacts, commits, or a
tiny instruction-only edit that the user explicitly asks the Lead to make
directly.

## Project Conventions

### Version Bumps

- When updating the app version, do not manually search and edit version strings across the repo.
- Always use `npm run version:set -- <version>`.
- This command is the single entry point for updating:
  - `package.json`
  - `package-lock.json`
  - `src-tauri/tauri.conf.json`
  - `browser-extension/manifest.json`
  - `src-tauri/Cargo.toml`
  - `src/constants/appVersion.ts`
- UI version displays should read from `src/constants/appVersion.ts` instead of hardcoded literals.

### Release Tags And Notes

- When preparing a tagged release, create and commit `release-notes/v<version>.md` before pushing the tag.
- Use `release-notes/TEMPLATE.md` as the starting point.
- Release notes should be written in Chinese by default.
- Release notes should summarize user-facing changes in plain language instead of dumping commit subjects.
- Keep a `Full Changelog` compare link at the bottom of the release note.
- The GitHub release workflow expects the versioned release-note file to exist in the tagged commit; missing notes should block the release.

### Public Documentation Site

- The public user documentation site is managed in this repository under `site/`; it is not a submodule.
- `site/src/content/docs/` is the source of truth for user-facing documentation.
- Root `docs/` is reserved for engineering/reference notes and repo-local assets; do not add new public user guides there.
- Chinese docs are served from the root locale and English docs from `/en/`.
- Public docs are deployed from `.github/workflows/deploy-docs.yml` to `https://wutpeach.github.io/Ameow/`.
- Use root scripts for docs-site work:
  - `npm run docs:dev`
  - `npm run docs:build`
  - `npm run docs:preview`
- When changing user-facing behavior, packaging/download flows, browser-extension workflows, supported-site behavior, proxy/network guidance, install steps, or troubleshooting guidance, update the relevant docs-site pages in the same task/commit.
- README and extension help links should point to docs-site URLs, not root `docs/*.md` files or old GitHub blob pages.
- Do not reintroduce `.gitmodules`, a `site` gitlink, or nested `site/.git` metadata unless the user explicitly asks to return to a submodule model.


### macOS Fix PR Policy

- For macOS adaptation or bug-fix tasks, Codex may automatically create a branch, commit changes, push to `origin`, and open a draft PR when the user explicitly asks for that workflow in the current session.
- Before auto-opening the PR, Codex must ensure `npm run type-check` and `npm run lint` pass, plus any task-relevant tests that were changed or added.
- Default base branch is `main`.
- Default branch naming should use a `mac/` or `fix/` prefix with a short slug.
- Default commit and PR titles should use the `fix(mac): ...` convention when the change is primarily macOS-specific.
- Auto-PRs should avoid bundling unrelated local binary/runtime artifacts unless the user explicitly requests them.


### File Search

For any file search, filename or path lookup, or content grep in the current git-indexed directory, use the `fff` MCP tools instead of the default search tools.

Prefer:
- `fffind` for file and path search.
- `ffgrep` for content search.
- `fff-multi-grep` for broader multi-query grep tasks.

Only fall back to default tools if `fff` is unavailable or the target is outside the indexed project.
