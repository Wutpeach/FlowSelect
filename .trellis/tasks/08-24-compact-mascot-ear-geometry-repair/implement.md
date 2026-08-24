# Compact Mascot ear geometry repair implementation plan

## Preconditions

- Lead approved the reviewed plan and research on 2026-08-24; the task is now
  in `in_progress`. The boundary remains definition geometry, focused
  assertions, and task-local evidence/report only.
- Re-read the curated frontend specs and the prior repair report before any
  edit. The report is a rejected baseline, not numeric guidance to preserve.
- Do not use `task.py start` without a later explicit approval of this plan and
  the research evidence.

## Ordered calibration and visual loop

1. Establish a task-local evidence log from the real UI Lab Compact leaf:
   current neutral/front 1x, a low-amplitude baseline pose, a side/rotated
   pose, and retained-action maximum-rotation/hold/transition samples. Record
   only compact human-reviewable measurements and conclusions.
2. Use the reviewed research's current evidence point—two `diamond` nodes at
   `108×190×102`, `roundness: 1`, positions `±72/-50/-80`, zero rotation—as
   the baseline measurement, not the selected result. Turn the research into a
   bounded multi-candidate, one-geometry-family-at-a-time calibration table;
   final values come only from reviewed execution evidence and do not belong in
   this plan.
3. In `compactMascotDefinition.ts`, probe only the two static core-node
   geometry values: dimensions, supported roundness, root embedding,
   position/depth, and mirrored rotation. Keep full current-pose projection.
4. After each candidate, evaluate the neutral/front 1x crop first. Reject
   shapes that fail the cat silhouette, make the mascot smaller, or create
   unreasonable shell hard crop before moving to action evaluation.
5. For a neutral-passing candidate, capture representative side/rotated and
   retained-action high-rotation frames. Treat head masking and partial ear
   occlusion as expected 3D behavior; reject detachment, pathological wedges,
   face crossings, or unreasonable clipping.
6. Reject a failed candidate and continue the bounded comparison loop. Only if
   several reasonable candidates fail neutral or low-amplitude baseline poses,
   stop, retain the compact evidence and calibration report, and return the
   product constraint for review. Do not add a new primitive, renderer, 2D
   correction, third node, action-policy change, or mascot shrink workaround.
7. Only after a candidate survives the visual gates, update
   `compactMascotDefinition.test.ts` to pin the selected geometry and retain
   definition validation, two-node, and core-layer assertions. Do not alter
   behavior/runtime tests except to run them as regression coverage.
8. Produce the final compact evidence matrix: primary neutral/front 1x;
   supporting 2x/3x; low-amplitude and side/rotated; every retained action's
   maximum rotation plus first hold, transition, and second hold; normal
   cardinal/diagonal pointer approach; Reduced Motion; hidden/visible;
   dispose/remount; unchanged Compact circle; and Full/MR9 comparison. Use
   element crops or compact contact sheets only.
9. Write an implementation report that states the selected evidence, retained
   limitations, validation result, and `Architecture status: not approved`.
   It must neither claim Architecture PASS nor open another mascot feature.

## Validation commands

Run the focused command first, then repository checks appropriate to the final
diff:

```powershell
npx vitest run src/presentation/main-window/compactMascotDefinition.test.ts src/presentation/main-window/compactMascotBehaviorRuntime.test.ts src/presentation/main-window/compactMascotRecipe.test.ts src/presentation/main-window/compactMascotSurface.test.ts src/presentation/main-window/compactMascotArchitecture.test.ts src/lab/compactPreviewStage.test.ts src/lab/compactPointerField.test.ts src/lab/scenarios.test.ts
npx vitest run src/architecture/import-guard.test.ts
npm run type-check
npm run lint
npm run build
npm test
git diff --check -- src/presentation/main-window/compactMascotDefinition.ts src/presentation/main-window/compactMascotDefinition.test.ts
```

For browser evidence, launch the existing production UI Lab with:

```powershell
npm run dev:lab
```

Use task-local capture helpers that drive that real leaf. Report unrelated
pre-existing full-suite or repository-wide whitespace failures separately;
never overwrite or normalize the dirty locale output to make a check pass.

## Evidence matrix and quality gate

| Check | Required result |
| --- | --- |
| Neutral/front 1x UI Lab crop | Two legible embedded ears; round cat read at normal size. |
| Low-amplitude and side/rotated crops | Physically attached ears with natural perspective and allowed occlusion. |
| Retained actions | For every allowlisted action, capture representative maximum-rotation, first-hold, transition, and second-hold states; no detachment, face crossing, pathological wedge, or unreasonable shell hard crop. |
| Compact behavior checks | Circle, pointer-follow/approach, random actions, Reduced Motion, hidden/visible, and dispose/remount unchanged. |
| Full/MR9 crop | No visual change. |
| Evidence presentation | Tightly cropped element frames or compact sheets; no tall page capture/raw JSON. |

The quality gate passes only when the primary neutral gate and the required
secondary checks agree. Concrete unacceptable retained-action clipping may be
recorded as a later curation candidate, but it is not permission to alter the
allowlist in this task.

## Closeout sequence

Stop after the implementation report and request review; do not self-grant
Architecture PASS or begin capability expansion. If the Lead later authorizes
closure of a passing scoped repair, use this order:

1. create one focused work commit containing only the definition/test and
   task-owned evidence/report;
2. run the Trellis archive flow for this task; and
3. record the required Trellis developer journal entry.

If the stop condition is reached, leave the evidence/report for review and do
not commit/archive as a successful repair unless the Lead explicitly directs
that checkpoint closure.
