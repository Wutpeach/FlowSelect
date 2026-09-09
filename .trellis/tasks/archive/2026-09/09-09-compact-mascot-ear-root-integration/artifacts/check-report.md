# Compact mascot ear-root integration — check report

## Findings (fixed)

No mechanical code, type, lint, test, import, or assertion issue was found, so
the check worker made no source change.

## Findings (not fixed)

- No native holder/window was available for visual capture. The task-local
  implementation report states this limitation and does not claim or
  fabricate a native screenshot. The shared Production path remains covered
  by architecture, surface, lifecycle, pointer-boundary, shell, and import
  tests.
- Architecture PASS, further ear geometry refinement, OneWorks cleanup,
  commits, and later work remain intentionally outside this check boundary.

## Contract review

- `renderCompactMascotScene` remains the shared composition seam used by the
  Production leaf and the Lab preview. It keeps `avatar-core` projection and
  pose sampling authoritative, concatenates core `backPaths` then
  `frontPaths` with the matching `backNodeIds` then `frontNodeIds`, and emits
  empty Compact `frontPaths` / `frontNodeIds`.
- `CompactMascot` retains the fixed painter order: two back ear slots, opaque
  head/body, clipped eyes, then two front slots. Runtime scenes therefore
  leave both front slots empty, and the existing opaque head naturally
  overpaints embedded roots.
- The regression test compares every retained neutral/action sample against
  the unchanged direct core projection, including path and node-ID order. It
  also proves bounded pointer attention changes only the eyes, every Reduced
  Motion preview settles to neutral, one-rAF deadline ownership remains, and
  hidden/resume/dispose behavior remains bounded.
- `package.json`, `package-lock.json`, and
  `compactMascotDefinition.ts` are unchanged from `HEAD`; the installed core
  remains `@bible-strong/avatar-core@0.1.0`. No mask, clipping, boolean,
  fragment/depth renderer, dependency, core API, or alternate geometry path
  was introduced.
- Production continues to omit the Lab-only `previewPose`; Lab mounts the
  exact Production `CompactMascot` leaf with Lab-local pointer MotionValues.
  Lifecycle, shell, native, Product, and IPC authority stay outside the leaf.

## Visual and DOM evidence

- The task-local capture script parses successfully and asserts exactly four
  ear slots before capture: both `back-*` paths must be non-empty and both
  `front-*` paths must be empty. Its bounded-pointer branch additionally
  proves the eye paths change before rechecking the ear-layer invariant.
- `lab-captures/` contains the complete expected set of 28 PNG files with no
  extra or missing names: black and white themes, neutral/pointer/Reduced
  Motion/three retained actions, bounded pointer, and both 1x and 3x scales.
  Fourteen files are 81×81 and fourteen are 241×241.
- Representative black/white 1x/3x neutral, curious, playful, surprised,
  bounded-pointer, and Reduced Motion images were opened directly. They show
  the opaque head covering the embedded ear roots while projected exterior
  regions remain naturally visible; no front-layer leak was observed.

## Dirty-worktree preservation

- The unrelated tracked edits and untracked evidence/output trees reported at
  review start remain present; no reset, restore, cleanup, or rewrite was run.
- The 09-07 task contains 112 files with aggregate SHA-256
  `EF6D415EED02BAF6F09522E01379C41EC1C59C33AE2CAE9BC812CA4C3B48B359`
  before and after this review. Its preserved historical depth patch remains
  `B8EDD2CF617558EC0C0A80FBA013DD3CA88DE6A22EF21C915D61403191A0A23D`.

## Verification

- Focused tests: pass (19 selected Compact, Production/Lab reuse, pointer,
  lifecycle, shell, architecture/import, Windows-risk, and native-boundary
  files; exit 0).
- Runtime detail: pass (1 file / 11 tests).
- TypeCheck: pass (`npm run type-check`).
- Lint: pass (`npm run lint`).
- Task validation: pass (4 implementation + 4 check context entries).
- Task-scoped `git diff --check`: pass.
- Capture script syntax: pass (`node --check`).

No Architecture PASS is awarded by this report.
