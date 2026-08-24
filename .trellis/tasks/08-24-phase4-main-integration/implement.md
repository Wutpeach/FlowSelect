# Execution and validation

1. Freeze refs, worktrees, root tooling patch, Phase 3 ancestry, and recovery
   ref; create/activate this task in an isolated worktree.
2. Merge `2bb9a22` once. Resolve only actual conflicts: use repository truth
   for Trellis archive/journal conflicts and approved Product content for
   Product conflicts. Record the paths and rationale.
3. Verify ancestry, exclusions, task truth, import/lifecycle guards, type-check,
   lint, tests, and production build from the clean integration worktree.
4. Archive and journal the task only after gates pass, then fast-forward main
   after moving verified colliding local task archives to an external backup.
