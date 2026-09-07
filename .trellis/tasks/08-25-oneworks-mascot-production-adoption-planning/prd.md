# OneWorks Mascot Production Adoption Planning

## Goal

Produce a repository-grounded implementation plan for adopting the approved OneWorks-based Ameow mascot in Production Compact while preserving the existing single authorities for lifecycle, Pointer Field, native visibility, Product state, and Presentation state.

This task decides whether direct upstream Route A is ready to enter implementation and defines the boundaries, gates, migration, and rollback shape. It does not implement the migration or grant Architecture PASS.

## Background and Fixed Inputs

- The fixed visual input is canonical candidate `ameow-oneworks-cat-2026-08-25-v1`, schema version `1`, checksum `fnv1a32:eb514f72`.
- The candidate was produced with `@oneworks/avatar` and `@oneworks/avatar-react` `1.0.0-rc.6` against upstream reference `oneworks-ai/avatar@3ad2542ea4487e95884f313b84943df602c0e742`.
- The archived candidate checkpoint grants a visual GO for Production Adoption Planning only. It does not authorize production migration, package adoption, or Architecture PASS.
- The current production diamond mascot remains authoritative until a future implementation passes its replacement gates.
- The worktree contains unrelated in-progress changes. Planning and any later implementation must preserve them.

## Requirements

### R1 — Direct Route A feasibility

- Prefer direct adoption of the upstream renderer/package.
- Establish repository and runtime evidence for its production dependency shape, public API, CSS/assets, browser assumptions, bundle impact, Electron packaged `file://` behavior, and Windows/macOS compatibility gates.
- Do not recommend Route B or C unless concrete evidence shows that Route A cannot satisfy a required production invariant.

### R2 — Single ownership and dependency model

- Production must have exactly one Compact mascot renderer authority and one canonical mascot-definition authority after migration.
- OneWorks may own only mascot rendering and animation mechanics. It must not own Ameow lifecycle, Pointer Field truth, native visibility, Product state, Presentation state, or Compact/Full transitions.
- Dependency direction must remain from Ameow production authorities into a narrow renderer adapter, never from OneWorks into Ameow state ownership.

### R3 — Pointer, pose, actions, and motion

- Existing Production Pointer Field remains the only pointer-input truth.
- Any head pose or attention input must be a one-way presentation projection derived from existing production state; it must not create mirrored pointer state, a second event source, or new hot-path IPC.
- `idle`, `surprised`, `curious`, and `playful` behavior must enter the existing motion lifecycle as bounded presentation outputs rather than a second scheduler or runtime authority.
- Reduced Motion must settle to a deterministic, non-decorative presentation.

### R4 — Lifecycle preservation

- Preserve current hidden/visible, mount/dispose, Compact→Full, native-window visibility, and superseded-transition semantics.
- OneWorks playback and rendering work must stop or settle when the existing lifecycle requires it, with no lingering renderer-owned work after teardown.
- Do not refactor unrelated Presentation architecture to accommodate the renderer.

### R5 — Canonical definition ownership

- The approved candidate must enter production without independently maintained copies or drift from the canonical source.
- The plan must identify a production-owned location and validation mechanism for the fixed definition while keeping Editor, authoring controls, export state, and Lab state out of production.
- Archived evidence remains immutable historical proof rather than a runtime dependency unless repository evidence establishes that such a dependency is intentional and supportable.

### R6 — Diamond retirement, migration, and rollback

- Define an atomic replacement strategy that prevents long-lived diamond/OneWorks dual renderer or dual definition authority.
- Identify the last safe rollback point, the files or seams retained temporarily for rollback, and the gate after which obsolete diamond runtime/definition files are removed.
- Rollback must restore one coherent renderer authority, not enable a production feature flag that perpetuates two implementations.

### R7 — Implementation boundary and validation

- Define ordered implementation slices, their ownership boundaries, architecture invariants, and stop/review gates.
- Include production build, dependency lock, bundle budget, Electron packaged runtime, `file://`, lifecycle, Reduced Motion, pointer/pose, native visibility, and cross-platform validation.
- Clearly separate unresolved blockers from implementation risks and deferred platform verification.

## Acceptance Criteria

- [x] The planning report recommends a production ownership, authority, and dependency model grounded in current repository evidence.
- [x] It gives a Route A verdict with exact evidence and states whether any unresolved issue blocks implementation.
- [x] It defines one canonical production source of truth for `ameow-oneworks-cat-2026-08-25-v1` without copying or importing authoring/Lab state.
- [x] It defines responsibility boundaries for pointer truth, pose projection, actions, Reduced Motion, hidden/visible, mount/dispose, native visibility, and Compact→Full transitions.
- [x] It provides an atomic diamond retirement strategy plus migration and rollback boundaries.
- [x] It records dependency, bundle, Electron packaging, `file://`, and platform risks with an executable validation plan.
- [x] It sets a bounded implementation phase and lists the architecture invariants a future implementation and review must enforce.
- [x] It stops before implementation, production-code changes, task activation, or Architecture PASS.

## Planning Conclusion

- Route A is mechanically compatible with the existing Ameow ownership model.
- `@oneworks/avatar-react@1.0.0-rc.9` now publishes renderer-only `./renderer` and `./renderer.css` exports. An isolated consumer removes Editor components, persistence code, `localStorage`, authoring locales, and editor CSS, while retaining one inert `avatar-controls__entity-preset-icon` string; the installed shared renderer chunk also contains dead saved-preset helpers that tree-shake from the consumer bundle.
- On 2026-09-07, Product/Lead explicitly accepted those two inert residues. Gate A is therefore unblocked for an exact rc.9 pin; this does not permit Editor runtime, persistence behavior, authoring controls, additional editor selectors, or Lab state in production output.
- Route B/C remains unnecessary. Production implementation belongs to a follow-up implementation task and must preserve every ownership, lifecycle, bundle, packaging, and rollback gate in this plan.
- Electron `file://`, final bundle/package size, real production lifecycle/performance, Windows native behavior, and macOS remain implementation validation gates rather than current mechanism blockers.

## Out of Scope

- Recalibrating or visually changing the approved candidate.
- Editing production code, dependencies, configs, tests, Electron runtime, or the production build in this planning checkpoint.
- Shipping `AvatarEditor`, Lab controls, candidate export tooling, or Lab state in production.
- Replacing existing lifecycle, Pointer Field, native visibility, Product, or Presentation authority.
- Beginning Route B/C work without a repository/runtime blocker for Route A.
- Granting Architecture PASS or starting the implementation task.
