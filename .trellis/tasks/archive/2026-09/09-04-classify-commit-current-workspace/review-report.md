# Trellis check report

## Findings (fixed)

- File: `.codex/hooks/inject-subagent-context.py`
  - Issue: `read_jsonl_entries()` called `.get()` on every decoded JSON value. A valid non-object row such as `null` or `[]` raised `AttributeError`, the outer catch aborted the rest of the manifest, and later valid context rows were silently lost.
  - Fix: Skip decoded values that are not JSON objects. The existing malformed-row regression test now passes.
- File: `.trellis/scripts/tests/test_context_document_policy.py`
  - Issue: The test still asserted that `task.py start` accepted an empty curated context manifest, while the 0.6.16 implementation intentionally rejects it unless `--allow-empty-context` is supplied.
  - Fix: Align the test with the committed gate and verify that failure leaves the task in `planning` without setting an active task.

## Findings (not fixed)

- The workspace-classification artifacts describe the Trellis sync as a 33-path group, but commit `9cdcb71` contains 32 of those paths and omits `.agents/skills/trellis-channel/references/command-reference.md`. The 0.6.16 template differs only by an extra blank line at EOF; matching its manifest hash makes `git diff --check` fail with `new blank line at EOF`. This is a task-contract/manifest policy choice, so no change was retained; the Lead should either document the actual 32-path commit or explicitly accept a follow-up whitespace-only sync.
- Canonical frontend checks could not run because root dependencies are absent: `npm run lint` cannot find `eslint`, and `npm run type-check` cannot find `tsc`. No dependency installation was attempted because this review must not install dependencies.
- The requested pytest command could not run because the active Python environment has no `pytest` module. Standard-library unittest discovery exercised the same local suite successfully.

## Commit and workspace review

- `9cdcb71 chore(trellis): sync project tooling with 0.6.16`: boundary matches the documented group except for the one command-reference path above; commit whitespace check passes.
- `89dccf5 chore(task): record managed yt-dlp follow-up plans`: contains only the three planned managed-yt-dlp task roots; commit whitespace check passes.
- `bb8a20d chore(task): record mascot production adoption plan`: contains only the Mascot production-adoption planning task root; commit whitespace check passes.
- All five reviewed task roots pass `task.py validate`; warnings only note files that will be truncated to the configured context-injection byte limit.
- The remaining three pre-existing tracked changes are whitespace/EOL-only: `git diff --ignore-all-space --exit-code` passes for all three.
- All 38,713 untracked files are accounted for: current task record (8 after this report), `.p2v-release-evidence/` (28,823), `agentation-placement-package-output/` (3,313), `spike-package-output/` (3,314), `.cindy-worktrees/` (3,254), and `.cindy-upstream/` (1). No other untracked prefix exists.
- No files were staged or committed by this reviewer.

## Verification

- Lint: blocked — `eslint` is not installed.
- TypeCheck: blocked — `tsc` is not installed.
- Pytest: blocked — `pytest` is not installed.
- Tests: pass — `python -m unittest discover -s .trellis/scripts/tests -p 'test_*.py' -v` ran 7 tests.
- Context smoke checks: pass — phase and package context commands both exited 0.
- Task validation: pass — all five task roots exited 0.
- Reviewer diff whitespace check: pass for the two fixed files and this report.

## Spec update decision

No `.trellis/spec/` update is needed. The parser behavior is a Trellis tooling
implementation detail now captured by its focused regression test, while the
one-off workspace classification and environment limitations belong in this
task report rather than the application code-spec.

## Next Mascot task

`.trellis/tasks/08-25-oneworks-mascot-production-adoption-planning/` is the next
Mascot planning gate. The older source-fidelity task still has a stale
`in_progress` status and should be reconciled before adoption work starts; no
Mascot implementation was performed in this cleanup task.
