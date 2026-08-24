# Repository State Consolidation — Phase 3 Execution and Validation Plan

## Execution status

This document authorizes and bounds the future Phase 3 execution; it does not
execute it. After Lead acceptance, the Lead activates this task and dispatches
`develop`. `develop` performs the ordered snapshot/closure work, commits it,
runs the validation gates, and then completes/archives this Trellis task. The
current correction must not activate the task, change refs/index/worktrees,
commit, merge, rebase, cherry-pick, clean, delete, or archive anything.

Phase 4 main integration/merge is a later handoff and is excluded from every
step and acceptance gate below.

## 1. Lead acceptance and preflight freeze

After acceptance only:

1. Activate the task through the normal Trellis workflow and dispatch `develop`.
2. Record the preflight snapshot: `main@2b46f91496214a85162593557f38c04267524deb`,
   `origin/main@5619ba031163c3dab7071f67ad4739d49b1f095f`, compact baseline
   `2bb9a221708c211bdec8721e02d0e469de44ef89`, accepted MR8 `3a3aeb3`/
   `4de9c2e`, M3 `cindy/auto-o3p8cr@3429917`, Diagnostics `353a798`, Paper
   `77eb561`, Ripple `818057f`, worktree paths, statuses, task records, and
   informational patch IDs. For M3, the hard identity is the reviewed
   32-row raw-byte manifest, not a CRLF-sensitive patch ID.
3. Confirm main-only Product-path diff against `5619ba0` is empty, the Compact
   Mascot and accepted MR8 worktrees are clean, and the current root’s 22
   tracked tooling changes and operational outputs are still present. Do not
   use the dirty root for execution.

If this snapshot differs from the reviewed evidence, stop and obtain a new Lead
decision before mutating anything.

## 2. Preserve M3 before any historical closure

M3 is the first mutation boundary because its dirty evidence is unique:

1. Freeze `.cindy-worktrees/auto-o3p8cr` without editing it. Record branch
   `cindy/auto-o3p8cr`, HEAD `342991724502ff067583d56fd877de9d1e536943`, tracked
   current raw stable patch `0da5bd7bddd5d3a812f66007f4a107a3a6945740`, the
   exact 16 tracked paths, the exact 16 individual untracked paths, and the
   per-file SHA-256 manifest with aggregate
   `398c293e75c565cefde7da28c6583aa44d8926fcf63f850ca368aaa967026383`.
   The historical `a543b0...` is informational only and must not block a
   manifest match.
2. Create a dedicated non-Product historical worktree/branch from that exact
   M3 HEAD. Materialize the recorded tracked diff and 16 individual untracked
   files there; do not use the Product or consolidation worktree.
3. Compare the aggregate manifest, path names, byte counts, and raw SHA-256
   values against the frozen source. Treat `0da5bd7...` and all CRLF-sensitive
   patch variants as informational. If any manifest item differs, stop before
   staging.
4. Stage only those 32 M3 entries and create a raw snapshot commit. This is
   the immutable recovery point; it must be reachable before any task-status
   or disposition change.
5. Add a separate disposition record on the same historical line that names
   accepted MR8 `acceptedTraceId` semantics, marks M3 superseded, states
   non-Product/research-only retention, and forbids wholesale reintegration.
   Commit this metadata separately so raw evidence remains independently
   recoverable.
6. Leave the original `.cindy-worktrees/auto-o3p8cr`, its branch, and all
   `.cindy-*` operational state untouched. The historical line is additive
   recovery, not cleanup.

## 3. Canonicalize historical task truth

On the basis of the verified M3 snapshot, update only the specific Trellis
task/archive records needed for Phase 3 truth closure, preserving unique files:

- Close/archive the root MR8 duplicate `08-14-mr8-download-intake-reveal-planning`
  against completed archive `4c43c08` and implementation `3a3aeb3`; retain any
  unique notes.
- Close/archive both active Paper records as final NO-GO, referencing
  `77eb561` and the canonical Paper archive `94692a9`; retain predecessor
  research and all unique evidence. Their old `UNDECIDED` wording must not
  remain task truth after closure.
- Treat candidate-line `b9ba0278d9f49d1831f5acbf813448072f53178b` inherited by
  `motion/compact-mascot-visual@2bb9a22` as canonical Product truth. Preserve
  repair-line `353a7984174a3d3d6e56a7944b7cb33b1ce5707f` and its clean
  worktree/reports as patch-equivalent
  duplicate evidence; close root/worktree task records against the Product
  pointer. Do not reintegrate the repair-line commit or copy Diagnostics code
  again.
- Point M3 task closure metadata at the raw snapshot and supersession record;
  never move its implementation into Product. Any archive operation must
  preserve the historical line and its unique task files first.
- Leave Ripple’s existing archive/evidence and all operational artifacts
  outside Product. Empty task directories may be removed only after an exact
  emptiness/uniqueness check; `.cindy-*`, package outputs, runtime/temp/cache,
  and logs are never cleaned by Phase 3.

Do not close any record until its canonical commit, path, and recovery pointer
are written. Do not touch other active tasks.

## 4. Build the isolated Phase 3 consolidation line

After M3 raw/disposition commits and canonical pointers verify, create a clean
dedicated consolidation worktree/branch from exact
`main@2b46f91496214a85162593557f38c04267524deb`. This line must retain
`5619ba0` ancestry and must not be based on the dirty root, a Product worktree,
or a research worktree.

The Phase 3 commit allowlist is:

```text
.trellis/tasks/08-24-repository-state-consolidation/**
specific Trellis task/archive closure metadata for MR8, Paper, Diagnostics, and M3
```

The second line is limited to task/research metadata and reports required for
canonical pointers. It excludes every Product/source path, package manifest,
root Trellis/tooling path, `.cindy-*`, package output, runtime/temp/cache/log,
Lab, and research implementation path. Existing main-only archive/journal
commits remain in parent ancestry and are not copied or replayed.

Inspect the staged name list before committing. If a source or operational path
appears, remove it from staging in the isolated worktree and stop for review;
never broaden the allowlist to make the commit pass.

## 5. Validate and commit Phase 3

Run all gates before the Phase 3 consolidation commit:

1. `5619ba0` is reachable, consolidation parent is exact `2b46f91`, Product
   baseline is clean at `2bb9a22`, accepted MR8 remains available, and no
   reference worktree changed.
2. M3 raw snapshot exactly matches the frozen 32-row manifest and aggregate
   hash; raw/disposition commits are reachable; original M3 `.cindy-*` state is
   unchanged. The current raw patch `0da5bd7...` is informational; historical
   `a543b0...` and CRLF variants are not hard gates.
3. Canonical MR8 archive, Paper final NO-GO, Product-canonical Diagnostics
   `b9ba0278d9f49d1831f5acbf813448072f53178b` with duplicate
   `353a7984174a3d3d6e56a7944b7cb33b1ce5707f` retention, M3 supersession, and
   Ripple archive pointers are present. No unique report or evidence path
   disappeared. The repair-line commit is not reintegrated or duplicated into
   Product ancestry.
4. Staged paths match the allowlist; `git diff 5619ba0..HEAD -- src electron
   package.json package-lock.json` remains empty; no Product, tooling,
   generated, operational, Lab, or implementation path is staged.
5. Parse `task.json`, `implement.jsonl`, and `check.jsonl`; run scoped
   `git diff --check`; verify branch/worktree statuses and final commit
   identity; recompute all cited patch IDs needed for closure.

Only after every gate passes may `develop` create the Phase 3 consolidation
commit. Then record the commit, run the Trellis completion/archive workflow for
this task, and report the exact closure pointers to Lead.

## 6. Rollback and stop conditions

- M3 path/hash mismatch: stop before raw snapshot; preserve the source dirty
  worktree unchanged. If raw snapshot exists but disposition validation fails,
  keep raw commit and stop before closure.
- Staged-path escape, changed Product baseline, missing main ancestry, patch-ID
  mismatch, lost evidence, or unverified canonical pointer: stop before the
  consolidation commit and leave the isolated worktree uncommitted.
- Any failure after a Phase 3 commit: retain the M3 raw snapshot and evidence;
  revert/abandon only the isolated Phase 3 line according to the recorded
  snapshot. Never reset the shared root, clean/delete `.cindy-*` or outputs,
  alter Product/reference branches, or merge to main.
- Do not mark this task completed/archived while a gate fails. Phase 4 main
  integration/merge is not a recovery step and must not start here.
