# Archive-readiness review — OneWorks Avatar cat source fidelity

Date: 2026-09-07

## Verdict

**Safe to commit and archive with `--skip-branch-validation`, provided the commit stages only this task's files and the two scoped Lab marker/test edits.** The task records `branch: "main"` and `base_branch: "main"`, so the skip flag is appropriate for this deliberately non-PR-backed task. No source-fidelity blocker remains.

## Findings fixed

- The pointer-follow capture was byte-identical to the front image because its mouse sample resolved to the neutral outer zone. Both capture scripts now dispatch one deterministic pointer event through the actual `data-oneworks-pointer-adapter` host and fail if the resulting image remains unchanged.
- The built-Lab animation screenshot showed the Create panel while the report claimed Playback plus `Yaw sweep`. The script now selects Playback, waits for `Yaw sweep`, and captures the upstream animation panel.
- `task.json` used CRLF and made the task-scoped whitespace check report trailing whitespace. It is normalized to LF.

## Evidence and isolation

- The stable pointer marker exists once on the candidate attention host. Pose buttons are resolved inside `data-oneworks-pose-controls`, while yaw/pitch/tangent screenshots are scoped to `data-oneworks-mechanism-preview`; the regenerated images are distinct and show the requested poses.
- Front and Reduced Motion images are intentionally identical static canonical states. Pointer-follow has a different SHA-256 and visibly shows a non-neutral pose.
- Lifecycle artifacts agree internally: the built capture returns to its one-interval baseline after Reduced Motion/unmount, while dev-server instrumentation returns to its two-interval Vite-HMR/Agentation baseline with no OneWorks-owned residual work.
- `mechanismEquivalent` is true, while byte identity and registry build provenance remain explicitly unproven.
- Production `dist/` contains none of `@oneworks/avatar`, `AvatarEditor`, `OneWorksMascotInspector`, or `src/lab`; import-guard tests also pass.
- Report byte counts match disk: upstream JS/CSS `318,589 / 65,529 B`; Lab main/lazy/CSS `1,356,706 / 199,566 / 65,368 B`; production JS/CSS `884,970 / 18,508 B`.

## Verification

- Focused tests: 10 files, 176 tests passed.
- Import guard: 5 files, 102 tests passed.
- `npm run type-check`, `npm run lint`, production renderer build, Lab build, built-Lab evidence capture, mechanism-equivalence check, and Trellis task validation passed.
- Task-scoped `git diff --check` passed. Repository-wide `git diff --check` still reports only unrelated concurrent CRLF changes in `browser-extension/locales/contract.json`, `electron-builder.config.mjs`, and `src/electron-runtime/runtimeDependencyGate.ts`; they were not touched.
- `src/lab/oneworksAmeowCandidate.test.ts` remains unavailable only because the out-of-scope archived canonical-candidate JSON is absent. It was not recreated.
