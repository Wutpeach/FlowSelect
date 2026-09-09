# Fix Compact mascot ear-root integration

## Goal

Keep both canonical Compact ears visually behind the opaque body/head silhouette in every existing Compact pose and bounded-pointer state, so painter order naturally hides the ear roots inside the body while preserving the visible exterior ear geometry.

## Background

`avatar-core` remains authoritative for ear geometry, projection, and shared pose behavior. Its dynamic whole-node front/back classification is useful renderer output but must no longer determine the final Compact paint layer for either canonical ear. Compact Production and Lab must continue to consume one rendering truth.

## Requirements

- Keep `avatar-core` authoritative for canonical ear geometry, projection, and shared poses.
- Keep both canonical Compact ear nodes permanently in the behind-head visual layer after projection.
- Ignore `avatar-core` whole-node front/back classification only when assigning the two canonical Compact ears to their final paint layer.
- Continue using the opaque body/head silhouette and existing painter order to cover the portions of ear roots that enter the body.
- Preserve the existing mascot definition and pose/behavior authority; do not substitute static SVG ears, independent animation, or parallel ear state.
- Keep Production and Lab on the same Compact rendering path/truth.
- Preserve Reduced Motion, pointer-follow, lifecycle, and Compact shell semantics.
- Add the smallest regression coverage that proves both canonical ears remain behind-head across neutral, existing action poses, and bounded-pointer states while retaining projected geometry.
- Produce task-local visual evidence for the representative states needed to confirm the natural ear-root occlusion result.

## Acceptance Criteria

- [ ] In neutral, every existing action pose, and representative bounded-pointer scenarios, neither canonical ear moves wholesale in front of the head because of core whole-node classification.
- [ ] Existing painter order lets the opaque body/head cover the portions of both ear roots that enter the body while exterior ear portions remain visible.
- [ ] Ear geometry and shared pose behavior still come from `avatar-core` projection; no fixed static SVG or independent animation bypass is introduced.
- [ ] Production and Lab results remain sourced from the same rendering truth.
- [ ] Reduced Motion, pointer-follow, lifecycle, and Compact shell semantics do not regress.
- [ ] No mask, inverse clipping, path boolean/silhouette intersection, fragment/depth renderer, new geometry mechanism, or `avatar-core` modification is introduced.
- [ ] Relevant automated tests pass and visual evidence covers neutral, action-pose, and bounded-pointer cases.

## Out of Scope

- Masks or inverse clipping.
- Path booleans or silhouette intersection.
- Fragment/depth renderer capabilities.
- New geometry mechanisms.
- Changes to `avatar-core`.
- A second ear pose, behavior, or state authority.
- Subsequent mascot refinement or unrelated cleanup.
- Self-awarding Architecture PASS.

## Completion Boundary

Stop after implementation, tests, validation, required visual evidence, and an implementation report. Report the evidence and remaining review boundary without granting Architecture PASS.
