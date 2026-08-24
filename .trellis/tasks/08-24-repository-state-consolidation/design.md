# Repository State Consolidation — Phase 3 Design

## Status and boundary

This is the execution design for Phase 3 repository-state truth closure. It is
pending Lead acceptance and is not execution. Once accepted, the Lead may
activate this task and dispatch `develop`; `develop` will execute, commit,
validate, and hand the task to the Trellis completion/archive workflow. Phase 4
main integration/merge is a later, separate decision and is excluded here.

No Product architecture changes are needed. The immutable Product comparison
point is clean `motion/compact-mascot-visual@2bb9a221708c211bdec8721e02d0e469de44ef89`.

## Repository lines

Phase 3 uses two deliberately separate lines:

1. **M3 historical line.** A new, non-Product historical branch/worktree is
   created from dirty M3’s exact HEAD
   `342991724502ff067583d56fd877de9d1e536943`. It receives a raw, recoverable
   snapshot of all 32 dirty M3 entries first, then a separate disposition
   record that marks the paused implementation superseded by accepted MR8
   `acceptedTraceId` semantics. This line is never merged into Product.
2. **Phase 3 consolidation line.** A dedicated clean branch/worktree is
   created from exact `main@2b46f91496214a85162593557f38c04267524deb`. It
   receives only repository/task closure evidence and the active task’s
   planning files. It preserves the `5619ba0` anchor and existing main-only
   archive/journal ancestry by parentage, without copying or replaying those
   commits. It is not merged to main in Phase 3.

The dirty root, Product baseline worktree, M3 source worktree, Paper/Ripple
research worktrees, Diagnostics worktree, root tooling diff, and operational
outputs are never used as the consolidation worktree.

## Phase 3 disposition map

| Evidence | Phase 3 action | Product/mainline rule |
| --- | --- | --- |
| `5619ba0` and main-only `94692a9`, `a5db244`, `0ef5238`, `2b46f91` | Retain through the consolidation line’s exact main parent; do not duplicate archives/journals. | Already accepted repository truth; no main merge. |
| Root Trellis/tooling diff, normalized patch `55ff33a0c35a8b0ba68f431ba8aff79340e1ad96` | Preserve exact dirty state for separate tooling-maintenance ownership. | Exclude from Phase 3/Product commits; its ownership disposition is decided separately. |
| M3 `.cindy-worktrees/auto-o3p8cr`, branch `cindy/auto-o3p8cr`, HEAD `342991724502ff067583d56fd877de9d1e536943`; current raw stable patch `0da5bd7bddd5d3a812f66007f4a107a3a6945740` | Verify the 32-row raw-byte manifest (`398c293e75c565cefde7da28c6583aa44d8926fcf63f850ca368aaa967026383`), then create the raw snapshot and supersession disposition commits on the M3 historical line. | Never copy/reintegrate its dirty implementation wholesale; original `.cindy-*` worktree remains untouched. Patch IDs, including historical `a543b0...`, are informational under CRLF conversion. |
| Accepted MR8 `3a3aeb3` / `4de9c2e` | Use as the semantic authority for M3 closure. | No Product code movement. |
| MR8 root duplicate `08-14-mr8-download-intake-reveal-planning` | Close/archive against canonical archive `4c43c08` and implementation `3a3aeb3`; retain any unique task notes. | No duplicate Product ancestry. |
| Paper active tasks | Close/archive with final NO-GO truth, retaining unique predecessor reports and evidence; reference `77eb561` research-only checkpoint and main archive `94692a9`. | No Paper Lab/notice code enters Product. |
| Diagnostics candidate `b9ba0278d9f49d1831f5acbf813448072f53178b` inherited by `motion/compact-mascot-visual@2bb9a22`; repair-line `353a7984174a3d3d6e56a7944b7cb33b1ce5707f` with stable patch `e1f4967ec5a9f1ca8a60ec0a1d8e5dfc7f6a3264` | Keep `b9ba0278d9f49d1831f5acbf813448072f53178b` as canonical Product implementation truth; preserve `353a7984174a3d3d6e56a7944b7cb33b1ce5707f` as a patch-equivalent historical duplicate. Close root/worktree task records against the Product pointer. | Do not reintegrate `353a7984174a3d3d6e56a7944b7cb33b1ce5707f` or duplicate Diagnostics code into Product ancestry. |
| Ripple `818057f` and archive `0ef5238` | Retain research/archive evidence; no new Product disposition is needed. | Lab/evidence-only paths stay excluded. |
| `.cindy-*`, package outputs, runtime/temp/cache/log artifacts | Preserve untouched and outside the two lines. | Never stage or commit. |

## Canonical closure records

The consolidation line may contain only Trellis task/research closure records
needed to make these dispositions discoverable: the active task directory and
the specific MR8, Paper, Diagnostics, and M3 task/archive metadata selected by
the Trellis archive workflow. It must not contain M3/Paper/Ripple/Diagnostics
source, Lab, package, runtime, or root tooling files. Existing main archives
remain in ancestry and are not copied into the new commit.

The M3 raw snapshot and M3 supersession note remain on the separate historical
line. The consolidation line carries only a pointer/disposition reference to
that line, so a reviewer can recover the raw evidence without placing it in
Product ancestry.

## M3 snapshot safety protocol

The order is deliberately irreversible-safe:

1. Freeze and record the source worktree identity, branch, HEAD, current raw
   stable patch `0da5bd7...`, 16 tracked paths, 16 individual untracked paths,
   and the 32-row raw-byte manifest. The prior `a543b0...` ID is informational
   only. Do not change `.cindy-worktrees/auto-o3p8cr`.
2. Create an isolated historical worktree from M3 HEAD
   `3429917...`, on a clearly non-Product branch. Materialize the tracked diff
   and the exact 16 untracked files from the recorded path list. Stage only
   those 32 M3 entries.
3. Compare the aggregate manifest
   `398c293e75c565cefde7da28c6583aa44d8926fcf63f850ca368aaa967026383`, every
   path, byte count, and SHA-256 with the frozen source. Treat patch-ID or CRLF
   differences as informational; if any manifest item differs, stop before
   committing.
4. Commit the raw snapshot with a history-only message. This commit is the
   recovery point and must be reachable before any status or disposition
   metadata changes.
5. Add a separate historical disposition record referencing accepted MR8
   `acceptedTraceId` paths and stating: M3 is superseded, non-Product, not
   reintegrated, and retained only for recovery/research. Commit that record on
   the same historical line. Any Trellis status/archive update must point to
   the raw snapshot and preserve the disposition record.
6. Leave the original `.cindy-*` worktree, branch, and dirty state untouched;
   the snapshot is additive recovery, not cleanup.

## Consolidation-line safety protocol

After the M3 raw snapshot and disposition commits verify, create a clean
isolated worktree from exact `main@2b46f91`. Inspect the staged path list before
the Phase 3 commit. The allowlist is the active task’s reviewed files plus
specific Trellis closure metadata; the denylist is every Product/source path,
package manifest, root tooling path, `.cindy-*`, package output, runtime/temp,
cache, log, Lab, and research implementation path.

Apply canonical closure in this order: MR8 duplicate against its completed
archive; Paper active tasks to final NO-GO; Diagnostics root/worktree records
against Product-canonical `b9ba027` while retaining duplicate `353a798`; M3
pointer to its historical snapshot; then verify Ripple and operational
exclusions. Do not close a record until its unique
evidence path and canonical reference are present.

Create one Phase 3 consolidation commit only after all gates pass. Complete and
archive this active Trellis task only after the commit and validation succeed.
Do not merge the consolidation line into main, start Phase 4, or alter any
Product/reference worktree.

## Validation and rollback

- Confirm `5619ba0` is an ancestor, the consolidation parent is exact
  `2b46f91`, and the Product baseline remains clean at `2bb9a22`.
- Confirm the M3 raw snapshot matches the frozen 32-row manifest and aggregate
  hash, its disposition commit is reachable, and the original M3 worktree
  remains untouched. Record current patch ID `0da5bd7...` only as informational;
  do not gate on historical `a543b0...` or CRLF-sensitive variants.
- Confirm Paper final NO-GO, MR8 canonical archive, Diagnostics Product
  canonical `b9ba027`, duplicate `353a798` retention, and M3 supersession are
  represented without source-code copies.
- Inspect staged paths; reject any Product, tooling, operational, `.cindy-*`,
  package, Lab, or implementation path. Keep the Product-path diff against
  `5619ba0` empty.
- Parse task JSON/JSONL, run scoped `git diff --check`, verify worktree/branch
  identities and recoverability, and record the final commit before completion.

If a gate fails, stop before the affected commit. For M3, retain the raw
snapshot if already committed and do not alter the original source worktree.
For the consolidation line, abandon only the isolated uncommitted staging
state; never reset the shared root, delete evidence, clean `.cindy-*` or
outputs, or merge to main. Completion/archive is forbidden until every gate
passes; Phase 4 remains a separate later handoff.
