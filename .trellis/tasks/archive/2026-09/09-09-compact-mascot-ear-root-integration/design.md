# Compact mascot ear-root integration design

## Architecture

`avatar-core` remains the sole authority for canonical ear geometry, projection,
and shared pose sampling. `renderCompactMascotScene` remains the shared
Production/Lab composition seam and becomes the final layer authority for the
two Compact ears.

After the existing body-node render, preserve every projected path and matching
node ID while flattening the core `backPaths` and `frontPaths` partitions into
Compact `backPaths`. Compact `frontPaths` and `frontNodeIds` are empty. The
existing SVG painter order then renders both ears before the opaque head/body,
which naturally covers embedded roots while leaving exterior ear geometry
visible.

## Data flow and contracts

```text
canonical definition
  -> avatar-core pose sampling and projection
  -> core back/front whole-node partitions
  -> shared Compact runtime flattens both partitions into behind-head output
  -> shared Compact SVG paints ears, opaque head/body, eyes
  -> Production and Lab consume the same leaf/runtime truth
```

- Preserve path values, node IDs, and their existing partition order.
- Do not modify the definition, `avatar-core`, pointer attention, action timing,
  Reduced Motion, lifecycle, shell semantics, or runtime scheduling.
- Keep the existing fixed SVG slots; the front slots receive empty paths.
- Update only stale project contract wording that assigns final Compact ear
  layer authority to core classification.

## Compatibility and rollback

No public API, persisted data, migration, dependency, or renderer capability is
added. Rollback is the focused runtime/test/spec diff; all 09-07 historical
evidence and unrelated dirty-worktree changes remain untouched.

## Trade-off

This deliberately selects composition-only whole-ear behind-head painting. A
future requirement for mixed per-ear depth would need a different architecture
and is outside this task.
