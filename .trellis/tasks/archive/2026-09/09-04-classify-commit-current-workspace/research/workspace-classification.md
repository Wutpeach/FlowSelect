# Research: Workspace classification

- Query: classify the current working tree for narrow, evidence-backed commits.
- Scope: internal repository state, diffs, and recent history.
- Date: 2026-09-07

## Findings

### Snapshot

- Branch: `main`; `HEAD`: `b740232` (`chore: record journal`).
- No staged changes.
- Initial porcelain snapshot (before this report): 36 tracked paths (33 modified,
  3 deleted) and 38,739 untracked paths. Writing this report adds one expected
  untracked research path.
- Recent history establishes the local style: `chore(trellis): sync project
  tooling with 0.6.15` (`0a93d51`) followed by task/archive and journal commits.

### Tracked paths and intent

The following 33 candidate paths were initially classified as one coherent
Trellis 0.6.16/tooling synchronization group:

- `.agents/skills/trellis-brainstorm/SKILL.md`
- `.agents/skills/trellis-channel/references/command-reference.md`
- `.agents/skills/trellis-continue/SKILL.md`
- `.agents/skills/trellis-meta/references/local-architecture/context-injection.md`
- `.agents/skills/trellis-meta/references/local-architecture/task-system.md`
- `.codex/agents/check.toml` (deleted)
- `.codex/agents/implement.toml` (deleted)
- `.codex/agents/research.toml` (deleted)
- `.codex/agents/trellis-check.toml`
- `.codex/agents/trellis-implement.toml`
- `.codex/hooks/inject-subagent-context.py`
- `.codex/hooks/inject-workflow-state.py`
- `.codex/hooks/session-start.py`
- `.trellis/.template-hashes.json`
- `.trellis/.version`
- `.trellis/scripts/add_session.py`
- `.trellis/scripts/common/__init__.py`
- `.trellis/scripts/common/active_task.py`
- `.trellis/scripts/common/config.py`
- `.trellis/scripts/common/developer.py`
- `.trellis/scripts/common/git.py`
- `.trellis/scripts/common/io.py`
- `.trellis/scripts/common/paths.py`
- `.trellis/scripts/common/safe_commit.py`
- `.trellis/scripts/common/task_context.py`
- `.trellis/scripts/common/task_store.py`
- `.trellis/scripts/common/task_utils.py`
- `.trellis/scripts/common/tasks.py`
- `.trellis/scripts/common/trellis_config.py`
- `.trellis/scripts/common/workflow_phase.py`
- `.trellis/scripts/task.py`
- `.trellis/workflow.md`
- `AGENTS.md`

Evidence for the grouping: `.trellis/.version` changes `0.6.15` to `0.6.16`,
the hash manifest changes with the same files, all of these files were written
on 2026-09-04, and their diffs add the matching task/context safety, atomic
write, parser, platform-routing, and lifecycle behavior. Recommended commit:
`chore(trellis): sync project tooling with 0.6.16`. Proportionate validation:
`python ./.trellis/scripts/get_context.py --mode phase`,
`python ./.trellis/scripts/get_context.py --mode packages`,
`python -m pytest ./.trellis/scripts/tests` (if the local Trellis test suite is
available), and a read-only `task.py validate` for each task selected below.

Staging review refined the effective commit to 32 paths. The only omitted
candidate, `.agents/skills/trellis-channel/references/command-reference.md`,
differed from HEAD solely by an extra blank line at EOF; preserving that
upstream byte-for-byte template makes `git diff --check` fail. The whitespace
gate was kept, so the candidate was normalized back to HEAD and produced no
commit diff.

The remaining three tracked paths are line-ending-only and should not be mixed
into a behavior commit:

- `browser-extension/locales/contract.json` (18/18 line changes)
- `electron-builder.config.mjs` (75/75 line changes)
- `src/electron-runtime/runtimeDependencyGate.ts` (116/116 line changes)

`git diff --ignore-all-space --numstat` emits no entries for these three paths;
their timestamps (2026-05/08-26) also predate the 2026-09-04 tooling sync.
Leave them uncommitted unless the owner explicitly wants an EOL normalization
commit; do not rewrite them during this classification.

### Untracked paths (complete partition)

All 38,739 initial untracked paths are covered by these disjoint prefixes:

| Prefix | Count | Approx. size | Classification / action |
|---|---:|---:|---|
| `.trellis/tasks/**` | 34 | 0.3 MiB | Intentional planning/task records. Review and commit per task root (or leave a task root uncommitted) rather than mixing with tooling. Validate with `python ./.trellis/scripts/task.py validate <task-dir>`. |
| `.p2v-release-evidence/**` | 28,823 | 4,455.5 MiB | Generated Windows packaging/install/profile/evidence trees and media fixtures. Oversized output; leave uncommitted. |
| `agentation-placement-package-output/**` | 3,313 | 398.6 MiB | Generated Electron `win-unpacked` package output. Leave uncommitted. |
| `spike-package-output/**` | 3,314 | 398.7 MiB | Generated Electron `win-unpacked` package output. Leave uncommitted. |
| `.cindy-worktrees/**` | 3,254 | 56.2 MiB | Nested Cindy worktrees/closure sources and a bundled Python tree (machine-local, some with their own WIP). Leave uncommitted; do not delete. |
| `.cindy-upstream/**` | 1 | nested clone marker | Nested upstream clone metadata; machine-local. Leave uncommitted; do not delete. |

The counts sum to 38,739. The generated/output and nested-worktree prefixes
have no source-control commit boundary in the root repository and are expressly
out of scope for cleanup. If desired later, add narrowly scoped ignore rules;
that is a separate change and was not performed here.

### Commit boundaries

1. **Trellis sync** — the 33 tracked paths above, after reviewing the staged
   diff; message `chore(trellis): sync project tooling with 0.6.16`.
2. **Task records** — one narrow `chore(task): record <task>` commit per
   `.trellis/tasks/<task-root>/` that the owner confirms (including this task's
   PRD/manifests and this report). Do not auto-include unrelated active tasks.
3. **Not commits** — the three EOL-only tracked paths and all generated,
   oversized, nested-worktree, or otherwise machine-local prefixes above.

No Mascot implementation is present in the root dirty set. The immediate
Mascot continuation is the already `in_progress`
`.trellis/tasks/08-25-oneworks-avatar-cat-source-fidelity/`; the adoption plan
`.trellis/tasks/08-25-oneworks-mascot-production-adoption-planning/` remains the
next planning gate. Neither should be implemented or activated by this task.

## Caveats / Not Found

- This report intentionally does not inspect or mutate nested worktree contents;
  the prefix-level classification is based on their filesystem role, status,
  size, and nested-repository markers.
- No commit, reset, checkout, cleanup, or line-ending rewrite was run.
- The three EOL-only files may be deliberate formatting work; ownership must be
  confirmed before any restore or normalization.
