# Compact Mascot ear geometry repair implementation report

Date: 2026-08-24

## Result

Selected the existing two-node `avatar-core` diamond seam with short, broad,
deep-rooted ears. The final production UI Lab neutral/front 1x crop reads as a
round cat at the unchanged Compact size, while retained poses preserve natural
full-pose rotation and head occlusion.

Final node values in `compactMascotDefinition.ts`:

- surface: `diamond`, width `76`, height `135`, depth `78`, roundness `1`;
- positions: `[-70,-76,-82]` and `[70,-76,-82]`; and
- mirrored rotations: `[0,-5,-10]` and `[0,5,10]`.

The values retain comparable X/Z mass with moderated Y length, a wider
forehead notch, and deeper root embedding. They use the existing full-pose
projection and do not change the host, runtime, `.95` scale, shell, pointer
field, lifecycle/native ownership, Full/MR9, action timing, or allowlist.

## Candidate loop

`research/calibration-log.md` records seven controlled production-Lab
comparisons. The current tall diamond, short/balanced diamonds, capsule, and
rounded cone were rejected for neutral silhouette quality. Candidate 6 passed
neutral but exceeded the unchanged scaled action-shell bound (`165.433` versus
`160.714`). Candidate 7 moves the same short/broad diamond deeper into the
head, preserves the 1x cat read, and passes the retained full-pose shell test.

No retained action is a curation candidate. In the action sheet, partial ear
occlusion under `curious-short` is the intended result of real head-relative
3D depth, not clipping or detachment.

## Reviewable evidence

- `research/evidence/candidate-comparison-1x.png` and `.svg`: compact neutral
  1x production comparison and selected candidate rationale.
- `research/evidence/final-neutral-front-1x.png`: primary normal-size cat-read
  proof.
- `research/evidence/final-static-regressions.png` and `.svg`: tight
  neutral/idle/pointer-approach/Reduced-Motion Compact crops plus unchanged
  Full/MR9 crop.
- `research/evidence/final-retained-actions.png` and `.svg`: every retained
  browser-Lab action at first hold, transition, and second hold; each action's
  representative maximum rotation is labelled.

All images are element crops or compact sheets. Hidden/visible and
dispose/remount semantics remain covered by the focused runtime regression,
because the browser Lab intentionally does not recreate native-window
visibility behavior.

## Validation

| Command | Result |
| --- | --- |
| focused Compact/Lab Vitest command | PASS — 15 files, 152 tests |
| `npx vitest run src/architecture/import-guard.test.ts` | PASS — 5 files, 102 tests |
| `npm run type-check` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS; existing externalized Node-module and large-chunk warnings only |
| `npm test` | 987 files / 8,608 tests PASS; 3 failures are pre-existing architecture-guard copies under unrelated `.cindy-worktrees/` |
| task-owned `git diff --check` | PASS |

Browser execution: PASS at `http://127.0.0.1:1421/lab.html` using the real
production Compact leaf.

Native Electron interaction is **NOT VERIFIED**. This task did not change
native forwarding, passthrough, hotspots, or bounds, and the Lab intentionally
does not mount the native surface.

## Scope and review status

Changed production/test files are limited to
`src/presentation/main-window/compactMascotDefinition.ts` and
`src/presentation/main-window/compactMascotDefinition.test.ts`; all other
changes are task-local planning, capture, evidence, and report artifacts.

Architecture status: not approved.
