# Workspace classification and commit plan

## Ordered Checklist

- [x] Validate this task and the four pre-existing untracked planning task roots.
- [x] Stage the effective 32-file Trellis 0.6.16 sync group; omit the candidate EOF-only path that fails the whitespace gate.
- [x] Review the staged file list and diff, then run Trellis tests available without installation and context smoke checks.
- [x] Commit the tooling group as `chore(trellis): sync project tooling with 0.6.16`.
- [x] Stage, review, validate, and commit the three related managed yt-dlp planning roots as one planning-record commit.
- [x] Stage, review, validate, and commit the Mascot production-adoption planning root separately.
- [x] Run an Orca `trellis-check` worker against the resulting commits and remaining workspace state; accept only evidence-backed mechanical fixes.
- [x] Record the final status and prepare this task record for the Trellis finish workflow.
- [x] Report all intentionally retained paths and identify the Mascot production-adoption task as the next planning gate after this cleanup task is closed.

## Validation

- `python -m pytest ./.trellis/scripts/tests`
- `python ./.trellis/scripts/get_context.py --mode phase`
- `python ./.trellis/scripts/get_context.py --mode packages`
- `python ./.trellis/scripts/task.py validate <task-dir>` for every committed task root
- `git diff --cached --check` before each commit
- `git status --short` after the final commit

## Rollback Points

- Before each commit: unstage the explicit group and leave working-tree content intact.
- After a commit: do not rewrite history; make a follow-up repair commit only if validation finds a real defect.
