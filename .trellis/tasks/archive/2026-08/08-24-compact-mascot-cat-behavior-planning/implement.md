# Compact Mascot cat-like shape and behavior implementation plan

This is a future execution plan only. Do not run `task.py start` in the current planning phase.

## Ordered implementation checklist

1. Pin a Kirby source-fidelity fixture from upstream revision `175691ab32cefe5faec7828af62f3d50210a8eb2`, preserving the 240 sphere, eye values, selected expressions, timing, blink, and source identifiers.
2. Add a disposable UI Lab/source comparison that renders unchanged Kirby through the existing Compact seam; capture tightly cropped 1x/2x/3x baseline evidence.
3. Create the Ameow cat derivative by changing only Kirby's two body nodes to mirrored cone ears. Calibrate dimensions/position/rotation/rounding against the 1x silhouette and retained action poses.
4. Extend the source-specific `CompactMascot` SVG host to paint exactly two core body-node ear paths in correct back/front order. Keep the existing prop contract and negative authority imports.
5. Replace the Strobi-specific source definition/runtime naming atomically with one Kirby/Ameow-specific definition and one Compact behavior runtime. Do not add a registry, interface layer, plugin, provider, second renderer, or `avatar-react`.
6. Preserve upstream `idle` as baseline. Add the fixed allowlist: direct `surprised` (`03 -> 21`), `curious-short` (`00 -> 15`), and `playful-short` (`02 -> 17`) once clips. Preserve both 2300ms holds, 500ms smooth transitions, selected expression values, and blink data.
7. Implement one-runtime arbitration: baseline, one visible-normal 18-32 second randomized deadline, at most one current action, current-frame retarget, local once completion, baseline resume, and immediate-repeat guard.
8. Keep the existing Pointer Field projection additive in baseline and action. Pointer changes must never select or interrupt actions.
9. Implement environment transitions exactly as designed: hidden pauses/freeze-resumes; Reduced Motion cancels action/deadline and renders neutral/open eyes with smaller direct pointer; unmount disposes; remount starts fresh.
10. Update source-specific unit, surface, architecture, import-guard, and runtime tests. Do not change Full/MR9 assertions except to prove unchanged output.
11. Reconcile `.trellis/spec/frontend/character-motion.md` from the retired `CompactCatCharacter`/no-rAF wording to the Architecture-approved single-rAF `CompactMascot` contract plus the new one-owner behavior lifecycle; preserve all authority, Pointer Field, Reduced Motion, and cleanup boundaries.
12. Capture the final evidence matrix and request Implementation Architecture Review. Stop on any need for Surface/lifecycle/native authority, more than two ear nodes, a second scheduler, or a broader reaction policy.

## Focused validation

- `npm run type-check`
- `npm run lint`
- Focused Vitest suite for Compact mascot definition, recipe, behavior runtime, Surface wiring, architecture/import guards, geometry/hotspot, and UI Lab production leaf.
- Full `npm test` with any pre-existing Windows CRLF debt reported separately.
- `npm run build`
- `npm run docs:build` only if later implementation changes user-facing behavior or public documentation.
- `git diff --check`

Browser/UI Lab checks:

- unchanged Kirby baseline versus cat derivative at 1x/2x/3x;
- neutral and all retained action holds/transitions;
- blink and ear layer stability;
- pointer cardinal/diagonal/leave/reset and Windows pre-hotspot path;
- normal/hidden/visible/Reduced Motion/unmount/remount;
- black/white and all existing preview backgrounds;
- Full/MR9 regression crop.

## Risky files and rollback points

- `src/presentation/main-window/CompactMascot.tsx`: fixed ear-path capacity and DOM layer order.
- `src/presentation/main-window/strobiDefinition.ts`: atomic replacement by a pinned Kirby/Ameow definition; preserve source anchors.
- `src/presentation/main-window/strobiPlaybackRuntime.ts`: atomic replacement by the single behavior owner; frame/timer lifecycle is the highest-risk logic.
- Compact mascot tests and `src/architecture/import-guard.test.ts`: must continue proving authority isolation and sole Pointer Field ownership.

Rollback point: one focused commit containing only the Compact leaf/definition/runtime/tests/evidence. Revert it to restore Strobi without touching the Surface or repository-wide architecture.

## Review gates before activation

- Planning Report accepted as the intended shape and behavior scope.
- Source-fidelity baseline confirms the fixed `surprised`, `curious-short`, and `playful-short` clips remain legible with stable ear layering at 56px; if one fails, return to planning instead of adding runtime configurability.
- Architecture Review agrees the fixed two-ear host is source-specific rather than a generic renderer.
- Task remains planning until a later explicit implementation request and `task.py start`.
