# Workspace classification and commit design

## Boundaries

The task changes no Product behavior. It stages explicit path sets, reviews each staged diff, runs checks appropriate to that set, and lets the Lead create the commits.

## Commit Groups

1. **Trellis 0.6.16 tooling sync** — 32 effective tracked tooling paths from `research/workspace-classification.md`; the candidate `command-reference.md` change was only an upstream EOF blank line and was normalized back to HEAD because it fails `git diff --check`.
2. **Managed yt-dlp planning records** — the related Diagnostics parent, managed update/rollback parent, and P2-B stage-only task roots.
3. **Mascot production-adoption planning record** — its task root only; no Product or Lab code.
4. **Workspace-classification task record** — this task's artifacts and eventual closeout.

## Exclusions

- Keep the three line-ending-only tracked files unstaged; do not rewrite or restore them.
- Keep `.p2v-release-evidence/`, `agentation-placement-package-output/`, `spike-package-output/`, `.cindy-worktrees/`, and `.cindy-upstream/` unstaged and undeleted.
- Do not add ignore rules in this task; hiding retained local artifacts is a separate preference, not required for safe commits.

## Safety and Rollback

- Stage with explicit literal paths, never `git add .` or `git add -A`.
- Review `git diff --cached --stat`, `--name-status`, and `--check` before every commit.
- If a group fails validation, unstage that group without changing the working-tree files and stop before committing it.
- Never amend, reset history, delete artifacts, or push.

The Diagnostics parent currently contains legacy `_example` rows in both JSONL manifests. The implementation worker may replace those placeholders with real references already present in that task; it must not alter the task's product scope.
