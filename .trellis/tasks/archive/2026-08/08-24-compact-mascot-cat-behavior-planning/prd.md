# Plan Compact Mascot cat-like shape and behavior

## Goal

Produce a repository-grounded and upstream-grounded implementation plan for an Ameow-specific cat-like Compact mascot shape and its first visual-local behavior model, building on the already approved Compact derivative adapter without entering implementation.

## Requirements

- Evaluate `bible-strong-avatar-lab` Kirby as the source baseline and identify a better upstream candidate only if Kirby is unsuitable.
- Define the smallest Kirby-to-cat-like derivative that preserves the simple, cute character structure while replacing the side-limb visual idea with two clearly cat-like ears.
- Inventory upstream animation and expression resources that can be reused or composed for the first Compact behavior.
- Make pointer-follow the default behavior, with eyes and/or body continuously sensing pointer direction where the existing Compact integration seam provides the signal.
- Insert intermittent upstream-derived expressive actions so the mascot does not remain in mechanical follow mode indefinitely.
- Define one owner for current visual behavior and explicit arbitration among pointer-follow, random action scheduling, interruption, completion, and resumption.
- Define lifecycle principles for Reduced Motion, hidden/visible, and unmount/remount.
- State whether a new source-fidelity baseline or new visual evidence is required.
- State whether any Architecture blocker prevents a later implementation phase.

## Architecture Constraints

- Preserve the already approved Compact mascot integration seam and its authority boundaries.
- The mascot remains a Compact-only visual implementation; it receives no Product, lifecycle, native-window, shell, protocol, or business authority.
- Pointer-follow and random expressive actions remain visual-local behavior.
- Full and MR9 visuals remain unchanged.
- Do not introduce a generic mascot framework, animation plugin system, avatar registry, or multiple competing schedulers.
- Do not design formal mappings from click, shortcut, download state, or other business/user events to mascot animation; reaction policy is deferred.
- Prefer reuse and composition of upstream behavior over inventing a large new animation library.

## Out of Scope

- Product implementation or `task.py start`.
- Full mascot behavior or visuals.
- UI Lab or Agentation expansion.
- Redesign of the existing Compact mascot architecture.
- Release or license governance.

## Acceptance Criteria

- [x] The Planning Report answers all eight requested questions with repository and upstream evidence.
- [x] Kirby suitability and any alternative candidate are justified against Compact visual, motion, dependency, and authority constraints.
- [x] The minimum cat-like derivative route is concrete enough to implement without reopening product-shape scope.
- [x] Directly reusable and composable upstream actions are named with source identifiers or paths.
- [x] One visual-local behavior authority model defines pointer-follow, intermittent actions, interruption, completion, and resume semantics without scheduler competition.
- [x] Reduced Motion, hidden/visible, unmount/remount, and cleanup semantics are explicit.
- [x] Source-fidelity and visual-evidence needs are explicit.
- [x] Architecture blockers, unknowns, and deferred reaction-policy work are separated.
- [x] `design.md`, `implement.md`, and research artifacts capture the plan; no product code is changed and the task remains in `planning`.

## Technical Notes

- Kirby is the selected shape baseline; Strobi remains the existing renderer/source-fidelity reference.
- The later implementation must add fixed support for exactly two upstream body-node ear paths in the current source-specific SVG leaf.
- The first behavior allowlist is upstream `surprised` (`03 -> 21`), `curious-short` (`00 -> 15`), and `playful-short` (`02 -> 17`), all expressed as local `once` clips inside one runtime with visible-normal 18-32 second quiet intervals.
- The later implementation must narrow-update the stale pre-adapter wording in `.trellis/spec/frontend/character-motion.md`; this spec debt does not reopen the Architecture-approved seam.
- There are no blocking product questions and no authority-level Architecture blocker.
