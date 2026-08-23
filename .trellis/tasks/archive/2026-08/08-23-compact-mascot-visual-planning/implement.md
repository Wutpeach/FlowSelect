# Compact Mascot Visual Implementation Plan

This checklist is active for the approved implementation session.

## Gate 0: Architecture decision

- [x] GPT Architecture Lead Planning Architecture Review approved the source-fidelity route.
- [x] Record the user-approved decision that license/governance does not block development, Lab experimentation, or validation in this task.
- [x] Keep license/governance as a separate formal distribution/release prerequisite; do not switch this implementation to custom recreation.

## Gate 1: pinned source baseline

- [x] Check out upstream `175691ab32cefe5faec7828af62f3d50210a8eb2` outside the Ameow worktree.
- [x] Confirm the exact official Strobi definition through the pinned source and official package workflow.
- [x] Capture tightly cropped reference evidence for all default `proud` phases, blink, source motion, and Ameow Reduced Motion.
- [x] Record exact package versions and source revision beside the evidence.

## Gate 2: direct-reuse Lab candidate

- [x] In a disposable Lab candidate, mount exact `@bible-strong/avatar-react@0.1.0` plus exact core and the Strobi export only inside Compact Preview.
- [x] Compare 1x/2x/3x output to the pinned baseline across existing backgrounds.
- [x] Record whether 56px clipping/aliasing is acceptable.
- [x] Record the expected API gaps: no explicit Lab Reduced Motion prop and no continuous pointer input.
- [x] Remove or supersede this candidate before production integration. A failure here rejects only direct reuse.

## Gate 3: derivative Compact leaf

- [x] Keep the existing `MainWindowPresentationSurface` Compact prop delivery and shell motion unchanged.
- [x] Replace only the current Compact visual leaf with a source-specific SVG host using exact `@bible-strong/avatar-core@0.1.0`.
- [x] Keep one fixed Strobi/default-`proud` behavior; add no Product/task semantic mapping.
- [x] Add one disposable visual-only frame loop, canceled on hidden, unmount, and Reduced Motion.
- [x] Apply the existing read-only Pointer Field through one bounded local eye projection.
- [x] Enforce Ameow Reduced Motion policy: jump transitions, no ambient/body deformation, smaller direct pointer response, open eyes, no decorative timer/rAF.
- [x] Keep `pointerEvents: none`, 56px content size, 60px shell, 80px outer frame, and current hotspot.
- [x] Change only existing `characterBody` / `characterEye` token values to the source palette for both themes. Add no palette framework.

## Gate 4: focused tests

- [x] Pure tests for pointer projection: invalid input, neutral dead zone, cardinal/diagonal bounds, outer neutral, Reduced Motion amplitude.
- [x] Runtime tests for exactly one active frame loop, hidden/unmount cancellation, Reduced Motion cancellation, and stable resume.
- [x] Compact leaf tests for 300-viewBox scene composition, 56px size, non-interactivity, and no lifecycle/Application/IPC imports or callbacks.
- [x] Existing architecture import guards continue to pin Pointer Field writers to the production surface only.
- [x] Existing UI Lab tests continue to prove the production leaf is mounted directly and Agentation is Lab-only.

## Gate 5: validation

Run from `.cindy-worktrees/compact-mascot-visual`:

```text
npm run type-check
npm run lint
npm test
npm run build
npm run docs:build
```

The docs build is a regression check. A Compact visual-only change should not require public user documentation unless user-facing behavior or help text changes.

Visual review in UI Lab:

- [x] Compact Auto/1x/2x/3x.
- [x] All current preview backgrounds and both themes.
- [x] Neutral/live pointer, leave/reset, cardinal/diagonal limits.
- [x] Normal motion, blink, transitions, hidden/visible, unmount/remount.
- [x] Reduced Motion with zero decorative ongoing work.
- [x] Full target side-by-side regression: MR9 Activation FX unchanged.
- [x] Agentation remains the existing Lab document-level mount with no mascot layout/state bridge.

Native review:

- [x] Windows compact passthrough writer order and 19/23px hysteresis remain unchanged and are covered by the surface/import guards.
- [x] macOS compact interaction recorded as `NOT VERIFIED`; no parity claim.

## Review and rollback points

- Architecture Review after Gate 0.
- Visual source-fidelity review after Gate 2.
- Implementation Architecture Review after Gate 5.
- GPT Architecture Lead Implementation Architecture Review: **PASS** on 2026-08-23.
- Roll back by reverting the Compact leaf, exact dependency/definition additions, and any two existing theme-token value changes. No lifecycle, geometry, Full/MR9, UI Lab structure, or Agentation rollback should be needed.
