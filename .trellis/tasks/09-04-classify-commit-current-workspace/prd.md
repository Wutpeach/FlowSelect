# Classify and commit current workspace

## Goal

Inventory the existing dirty working tree, group related changes, verify each group, and commit them without mixing Mascot development.

## Requirements

- Inventory every tracked modification, deletion, and untracked path currently present.
- Distinguish intentional source changes, Trellis/tooling synchronization, task records, generated evidence/output, line-ending-only changes, and disposable local artifacts.
- Preserve all user-owned changes; do not reset, overwrite, or silently discard anything.
- Commit only groups whose purpose and validation can be established from repository evidence.
- Use narrow commit boundaries and descriptive commit messages; do not mix Mascot development into this task.
- Leave ambiguous, generated, oversized, or machine-local artifacts uncommitted with an explicit explanation.
- After cleanup, report the remaining working-tree state and identify the Mascot task to activate next.

## Acceptance Criteria

- [x] Every initial dirty path is assigned to a documented category.
- [x] Each committed group has an evidence-backed purpose and proportionate validation.
- [x] No unrelated changes are discarded or rewritten.
- [x] Commits are created only after reviewing their staged diffs.
- [x] Remaining uncommitted paths, if any, are listed with reasons.
- [x] The next Mascot task is identified but not implemented as part of these commits.

## Out of Scope

- Mascot production implementation.
- Deleting local worktrees or large evidence directories.
- Rewriting existing history or force-pushing.
- Bundling unrelated changes merely to obtain a clean status.
