# Compact Mascot Visual Planning

## Goal

Implement and validate the Planning-Review-approved, upstream-first Compact mascot adaptation, using `motion/mr9-fullscreen-activation-fx` at commit `2f5f1a0` as the authoritative baseline and `smontlouis/bible-strong-avatar-lab` as the primary visual and motion source.

The implementation must first validate the official direct package candidate at 56px, then use the official avatar-core playback and scene behavior in a derivative Compact visual leaf. A local direct-candidate integration failure does not authorize switching to custom recreation.

## Background

- The requested baseline is `motion/mr9-fullscreen-activation-fx` at `2f5f1a0`, which already contains the UI Lab refresh and Agentation integration.
- The validation environment to preserve includes Compact Preview, Auto/manual scale, selectable preview background, and Agentation.
- Source fidelity has priority over a merely similar effect: validate the upstream result first, then evaluate integration or adaptation, and consider a custom recreation only after evidence rules out the earlier candidates.

## Requirements

1. Research the upstream repository's renderer and animation model, character construction, pointer or attention behavior, state inputs, dependencies, run/build shape, and license.
2. Define a source-fidelity baseline that first reproduces or observes the upstream effect independently of Ameow-specific constraints, then evaluates bounded integration candidates.
3. Map the current Ameow Compact renderer, lifecycle, pointer field, geometry, scale, theme, and Reduced Motion boundaries at `2f5f1a0`.
4. Keep all mascot behavior subordinate to the existing Compact presentation authority. Do not add lifecycle, Product, business, or presentation-state authority.
5. Preserve Full presentation and MR9 Activation FX behavior and ownership.
6. Classify upstream behavior into directly reusable, adaptation-required, and Ameow-specific parts.
7. Recommend exactly one primary direction among direct reuse, derivative adaptation, and custom recreation, with repository and upstream evidence.
8. Identify risks, the minimum implementation scope, validation gates, and any genuine Architecture blocker.

## Constraints And Out Of Scope

- License/governance is explicitly deferred to a separate formal distribution/release gate and does not block this development or Lab validation task.
- Do not modify Fullscreen Activation FX, redesign UI Lab, or extend Agentation.
- Do not introduce a general mascot framework, plugin system, or speculative abstraction.
- Do not reject upstream solely because integration could be risky; rejection requires source or repository evidence.
- A failed adaptation experiment rejects only that candidate, not the upstream visual concept.
- Do not grant Architecture PASS. The planning output waits for GPT Architecture Lead Planning Architecture Review.

## Implementation Acceptance Criteria

- [x] Pinned upstream Strobi/default `proud` baseline and direct React package candidate are validated at Ameow's 56px Compact size.
- [x] The production Compact visual leaf uses the official avatar-core playback/scene behavior without adding lifecycle, Product, native-window, or presentation authority.
- [x] The old Compact mascot visual is replaced atomically; no dual renderer or dual visual authority remains.
- [x] UI Lab verifies source fidelity at 1x and detail at 2x/3x across existing backgrounds, pointer input, Reduced Motion, visibility, and remount scenarios.
- [x] Full/MR9 behavior and existing Compact geometry, shell lifecycle, Pointer Field ownership, and Reduced Motion policy have no regression.
- [x] Implementation stops for GPT Architecture Lead Implementation Architecture Review without self-granting Architecture PASS.

## Acceptance Criteria

- [x] The planning report cites an exact upstream revision and evidence for source, license, dependencies, renderer, character, pointer behavior, and state inputs.
- [x] The report defines an upstream-first source-fidelity baseline and separates source validation from Ameow integration validation.
- [x] The report names the current Compact authority and the narrow visual seam where a mascot implementation may attach.
- [x] Pointer, Reduced Motion, geometry/scale, theme, lifecycle, UI Lab, Agentation, and Full/MR9 isolation boundaries are explicit.
- [x] Directly reusable, adaptation-required, and Ameow-specific behavior is classified.
- [x] The recommended direction and minimum implementation scope avoid speculative architecture.
- [x] Architecture blockers are stated as evidence-backed blockers or explicitly reported as absent.
- [x] `design.md`, `implement.md`, and task-local research artifacts preserve the final plan for Architecture Review.

## Open Questions

- None from product intent. Technical unknowns are resolved through repository and upstream inspection in this Planning task.
