# Phase 4 Main Integration

## Goal

Advance `main` only after an isolated integration of approved Product baseline
`2bb9a22` into repository-truth line `4238790` is validated.

## Requirements

- Merge `2bb9a22` exactly once into an isolated descendant of `4238790`.
- Retain Phase 3 archives/journal and main truth; resolve only merge conflicts.
- Keep Paper, Ripple, M3, and duplicate Diagnostics implementations out of
  Product runtime.
- Preserve the root 22-path tooling patch unstaged and outside every commit.
- Archive this task and journal only after validation; then fast-forward main
  from exact `2b46f91` to the verified final tip with a recovery ref retained.

## Acceptance Criteria

- [ ] Final main contains ancestors `2bb9a22`, `4238790`, and `5619ba0`.
- [ ] Product/type/lint/test/build gates pass or a reproduced non-regression is
      recorded before main advances.
- [ ] Product and operational exclusions are verified; no unrelated paths are
      committed.
- [ ] Root tooling patch remains `55ff33a0c35a8b0ba68f431ba8aff79340e1ad96`
      with 22 tracked paths and no staged entries.
- [ ] Phase 5 is not started.
