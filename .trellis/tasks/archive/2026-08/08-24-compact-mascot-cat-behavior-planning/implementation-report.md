# Compact Kirby cat mascot implementation report, pre-repair checkpoint

> Superseded for final geometry, shared-shell, approach-input, evidence, and
> validation facts by [`repair-report.md`](./repair-report.md), dated
> 2026-08-24. The material below records the earlier implementation checkpoint
> and must not be read as the final calibration or final test count.

Date: 2026-08-24

## Scope and changed files

- Replaced the Strobi-specific definition/runtime with
  `compactMascotDefinition.ts` and `compactMascotBehaviorRuntime.ts`.
- Updated `CompactMascot.tsx` to paint exactly two fixed core back-ear slots,
  head/eyes, then two fixed front-ear slots. The pinned derivative emits both
  ears behind the head in all currently retained poses; the front slots remain
  explicit for core layer-order correctness.
- Updated focused definition/runtime/host/surface/import-guard tests and
  reconciled `character-motion.md` with the landed one-rAF CompactMascot truth.
- Task-local evidence helpers are intentionally retained at
  `research/capture-compact-mascot-evidence.mjs` and
  `research/render-source-fidelity-sheet.mjs`; they regenerate the reviewed
  browser-Lab crops and the source/action sheet without changing production.

## Pinned facts and Ameow deltas

Pinned Kirby facts: revision `175691ab32cefe5faec7828af62f3d50210a8eb2`; 240³
sphere; exactly two source nodes; default eyes 20×60.473828125 at spacing
28.74921875/y -7; palette `#ffc2e9` / `#3e4e65`; idle `00→08`; source holds
2300ms and smooth 500ms transitions; source blink envelopes.

Ameow-only deltas: the two source nodes are the only geometry change: calibrated
cone ears (94×154×68, positions `[-67,-118,-48]` / `[67,-118,-48]`, outward
z rotation `-16` / `16`, rounded tip/base 0.2); theme tokens still provide live
production color; bounded additive Pointer Field eye offset; local once action
policy; visibility/Reduced Motion/disposal handling.

Final cadence is fixed at visible-normal 18–32 seconds. The local allowlist is
`surprised` `03→21`, `curious-short` `00→15`, and `playful-short` `02→17`.
It uses the existing one rAF as playback and deadline clock, has no timer,
queue, priority bus, completion callback, or extra renderer.

## Validation

- PASS: latest focused Compact/runtime/host/surface/architecture/import suite:
  13 files, 137 tests.
- PASS: `npm run type-check`.
- PASS: `npm run lint`.
- PASS: `npm run build` (only existing Vite bundle/externalized-module warnings).
- PASS: `git diff --check` for this task’s changed files. Repository-wide
  `git diff --check` is blocked by pre-existing CRLF/trailing-whitespace in
  `browser-extension/locales/contract.json`, changed by unrelated locale work.
- Full `npm test`: 987 files/8597 tests passed; 3 failures are duplicated,
  pre-existing architecture-guard failures inside unrelated `.cindy-worktrees`
  (their expected background listener terminator no longer matches), not the
  main Compact implementation.

## Browser evidence

All assets are tightly cropped element captures produced from the existing real
browser Lab production Compact leaf:

- `research/evidence/kirby-cat-1x.png`
- `research/evidence/kirby-cat-2x.png`
- `research/evidence/kirby-cat-3x.png`
- `research/evidence/kirby-cat-pointer.png`
- `research/evidence/kirby-cat-浅色.png` (production Compact leaf on the Lab
  light/white background)
- `research/evidence/kirby-cat-棋盘格.png` (same production leaf on the Lab
  checkerboard background)
- `research/evidence/full-mr9-regression.png`
- `research/evidence/kirby-to-cat-source-and-actions.png` (also retained as
  SVG): reviewable pinned source baseline beside the final derivative and one
  representative retained hold for each local action.
- `research/evidence/lifecycle-validation.json`: independently readable mapping
  from lifecycle claims to the focused runtime tests.

The 1× crop was used to tune the ears from an initially too-short 104-unit
candidate to the final 154-unit calibration. It visibly reads as a two-ear cat
without face crossings. The Full crop confirms the Lab's unchanged Full host.
The new light and checkerboard captures confirm the final cat remains readable
against both requested existing Lab backgrounds; they are tightly cropped to the
preview viewport rather than a full browser page.

The source/action sheet intentionally distinguishes exact source facts in its
heading from Ameow's two-cone delta. It renders upstream Kirby neutral with the
pinned 240-sphere/two-sphere-node construction next to the final derivative,
then the three retained action holds: `surprised` 03→21, `curious-short` hold
15, and `playful-short` hold 17. `compactMascotDefinition.test.ts` samples
every retained action at start, transition, each hold, and completion and proves
exactly two nonempty back paths with no front crossing; this is the machine
checked no-gap/layer/clip evidence.

Lifecycle is also machine checked rather than inferred from screenshots:
`compactMascotBehaviorRuntime.test.ts` proves pointer geometry changes while
`surprised` remains active; pauses that active action and resumes its exact
remaining phase; Reduced Motion renders static/open-eye with zero pending rAF,
cancels deadline/action, and starts a fresh baseline on normal re-entry; and
rejects stale callbacks/start after disposal. `sceneFor` now consumes the same
injected `dependencies.random` as playback, so blink sampling is deterministic
under the harness rather than silently using global `Math.random`.

`tmp.png` was created by this task at 2026-08-24 16:50:26 during its initial
browser probe; it was a superseded temporary capture and has been deleted.

## Remaining NOT VERIFIED

- No real native/Electron Compact window run was attempted; all visual proof is
  from the existing browser Lab production Compact leaf.
- Browser screenshots do not independently expose `document.hidden`; exact
  hidden/visible semantics are covered by the task-local runtime harness and
  lifecycle JSON instead.

## Simplification and review state

The implementation deliberately reuses `avatar-core`; it introduces no
generic node renderer, avatar registry/provider/plugin, second animation DSL,
shared scheduler, Surface prop, lifecycle/native authority, or reaction map.
No Architecture PASS is claimed by this report.
