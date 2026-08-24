# Repository State Consolidation — Phase 3

## Outcome

Complete Phase 3 repository-state truth closure: preserve the accepted Product
baseline and main-only truth, give every historical candidate a recoverable and
explicit disposition, and produce a reviewable Phase 3 consolidation commit.
Phase 4 main integration/merge is explicitly out of scope.

This task is still `planning` before Lead acceptance. After acceptance, the
task may be activated and executed by `develop`; it must then be committed,
validated, and completed/archived through the normal Trellis workflow. This
planning correction itself performs none of those actions.

## Fixed decisions and boundaries

- Preserve `origin/main@5619ba031163c3dab7071f67ad4739d49b1f095f` and
  `main@2b46f91496214a85162593557f38c04267524deb` as repository truth. The
  main-only archive/journal commits already in that ancestry are not replayed
  or duplicated.
- Keep `motion/compact-mascot-visual@2bb9a221708c211bdec8721e02d0e469de44ef89`
  immutable and clean. No Product-code refactor or Motion/Presentation
  redesign is authorized.
- Assign the 22-path root Trellis/tooling diff to separate
  tooling-maintenance ownership. Preserve its exact dirty state and exclude it
  from Phase 3 and Product commits; its ownership disposition is decided
  separately from this consolidation.
- Snapshot the dirty `auto-o3p8cr` M3 state on its own non-Product historical
  lineage, preserve unique evidence, record it as superseded by accepted MR8
  semantics, and never reintegrate the dirty implementation wholesale.
- Use completed candidate archives as canonical for exact/superset duplicates:
  the MR8 duplicate closes against its completed archive/implementation; Paper
  task truth closes as final NO-GO while retaining unique predecessor research;
  Diagnostics `b9ba0278d9f49d1831f5acbf813448072f53178b` is already inherited
  by the immutable Product baseline and is the canonical Product implementation
  truth, while repair-line `353a7984174a3d3d6e56a7944b7cb33b1ce5707f` remains
  recoverable duplicate evidence and is not reintegrated.
- Keep `.cindy-*`, package outputs, runtime/temp/cache/log artifacts, and other
  operational outputs excluded and untouched.
- Do not activate the task, modify Product/source, change refs/index/worktrees,
  commit, merge, rebase, cherry-pick, clean, delete, or archive during this
  planning correction. Do not start Phase 4.

## Requirements

- Maintain the evidence-backed disposition matrix in
  `research/repository-disposition.md`, with exact commits, paths, worktrees,
  patch IDs, canonical owners, and final dispositions.
- Define an exact execution order for the future Phase 3 run: preflight
  snapshot, recoverable M3 raw snapshot and supersession record, isolated
  consolidation line from exact `main@2b46f91`, canonical duplicate closure,
  validation, commit, and Trellis completion/archive.
- Keep the M3 raw snapshot recoverable before any historical status/closure
  metadata changes. Verify its tracked and untracked paths against the dirty
  source state, and keep the original `.cindy-worktrees/auto-o3p8cr` untouched.
  The authoritative M3 gate is the 32-row raw-byte SHA-256 manifest
  `398c293e75c565cefde7da28c6583aa44d8926fcf63f850ca368aaa967026383`:
  16 tracked files plus 16 individual untracked files. The 10 untracked
  top-level porcelain rows are only a directory/file view of those 16 files.
- Keep all Product-path diffs empty and all research implementations outside
  the Phase 3 consolidation commit. The accepted MR8 `acceptedTraceId`
  semantics remain the only Product reference for M3 disposition.
- Treat Paper active records as final NO-GO closure candidates, retain unique
  predecessor reports/evidence, and close Diagnostics root/worktree task
  records against Product-canonical `b9ba0278d9f49d1831f5acbf813448072f53178b`;
  retain patch-equivalent `353a7984174a3d3d6e56a7944b7cb33b1ce5707f` evidence
  without reintegration or code duplication.
- Preserve exact root tooling/operational state without staging it. Phase 3
  must not silently convert separate tooling ownership or operational retention
  into Product history.
- Keep Phase 4 main integration/merge, Product release, and architecture work
  out of the task’s completion criteria.

## Acceptance criteria

- [ ] After Lead acceptance, the task is activated and `develop` executes the
  bounded Phase 3 plan; before acceptance it remains `planning`.
- [ ] A recoverable M3 historical snapshot commit exists on a dedicated
  non-Product lineage, the exact raw-byte manifest and aggregate hash are
  verified, and a disposition record marks M3 superseded by accepted MR8
  semantics without wholesale reintegration. Patch IDs are informational only
  under the observed CRLF configuration.
- [ ] A dedicated consolidation line is based exactly on
  `main@2b46f91496214a85162593557f38c04267524deb`; its Phase 3 commit contains
  only task/closure evidence and no Product, tooling, `.cindy-*`, package, or
  operational paths.
- [ ] Main-only archives/journals and `5619ba0` remain reachable; the Compact
  Mascot baseline remains clean/unchanged; Product-path diff remains empty.
- [ ] MR8 duplicate, Paper active records, Diagnostics duplicate/status records,
  and M3 status are aligned with their canonical historical dispositions;
  Paper is explicitly final NO-GO and Diagnostics has one canonical truth.
- [ ] Root Trellis/tooling dirty state and all `.cindy-*`/package/runtime/temp/
  cache/log outputs remain untouched and outside Product/Phase 3 commits.
- [ ] Scoped JSONL, `git diff --check`, path allowlist, ancestry, patch-ID,
  baseline/worktree, and recoverability gates pass. Only then is the task
  committed, validated, and completed/archived.
- [ ] Phase 4 main integration/merge is not started, implied, or included in
  the Phase 3 completion record.
