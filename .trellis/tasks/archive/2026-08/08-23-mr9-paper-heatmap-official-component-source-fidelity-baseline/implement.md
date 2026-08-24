# MR9 Paper Official Heatmap Baseline Implementation Plan

## Preconditions

1. Obtain explicit GPT Architecture Lead approval of the current `prd.md` and `design.md`.
2. Create a new branch/worktree from clean `431114a`; leave
   `motion/mr9-fullscreen-activation-fx` clean and unchanged.
3. Re-read the task research plus frontend component, motion, quality, and Browser Lab contracts.
4. Record baseline `git status`, focused Lab tests, and production build-input isolation before the
   first code edit.

## Ordered Implementation

1. Install exact dev dependency `@paper-design/shaders-react@0.0.80` with npm so
   `package.json`/`package-lock.json` resolve the official React and core packages at 0.0.80.
2. Add the one transparent black 200×200/r16 SVG under the Lab source tree; do not add a rendered
   image component or public production asset.
3. Add `PaperHeatmapOfficialBaseline.tsx`, importing only the official `Heatmap`, wrapping it in
   Suspense, and passing only the SVG URL, `suspendWhenProcessingImage`, and plain 200×200 sizing.
4. Add one `Paper official` Lab category/mode in `PresentationLab`. Render it mutually exclusively
   with (and instead of) `LabOverlayStage`; hide production uniform readback/export controls for
   this mode and show only a short source/version label outside the canvas.
5. Add zh-CN/en Lab copy identifying this as Paper 0.0.80 Default with image-only substitution.
6. Update `rendererReuse.test.ts` and focused Lab tests: retain the one-production-renderer contract
   for normal scenarios, allow the imported Paper-owned canvas only in the isolated file, enforce
   the prop/asset allowlist, and prove build isolation and branch mutual exclusion.
7. Update `THIRD_PARTY_NOTICES.md` to active dev-only direct usage while preserving Apache-2.0 and
   Paper NOTICE text and explicitly stating that Ameow does not modify Paper source.

## Validation

Run in the isolated implementation worktree:

1. `npm exec vitest run -- src/lab/rendererReuse.test.ts src/lab/scenarios.test.ts`
2. `npm run type-check`
3. `npm run lint -- --quiet`
4. `npm test`
5. `npm run build:renderer`
6. `git diff --check`
7. Inspect `git diff --name-only 431114a...HEAD` and reject any production presentation,
   lifecycle, Product, Application, Electron/native, extension, Download, or docs-site path.

If a full-suite failure appears, reproduce it at `431114a` without modifying that checkpoint and
record whether it is pre-existing.

## Browser and Visual Evidence

1. Start `npm run dev:lab`; select `Paper official` and wait for Suspense to settle.
2. Assert one `[data-paper-shader]`, one canvas, no `ExpandedPresentationSurface`, no Lab panel
   shell/clip/overlay, and no rendered SVG/image element in the preview.
3. Sample `paperShaderMount.getCurrentFrame()`, wait a bounded interval, sample again, and prove it
   advances. Switch away and prove the Paper mount/canvas is disposed; switch back and prove one
   clean mount returns.
4. Open <https://shaders.paper.design/heatmap> on Default beside the Lab. Verify the controls
   against `design.md`, then observe both for at least 12 continuous seconds without parameter
   changes.
5. Capture a tightly cropped Lab canvas and optional compact two-up comparison sheet. Store an
   implementation/visual report with source commits, package lock resolution, motion observation,
   resource/disposal checks, validation results, and the reviewer's visual verdict.

## Rollback Point

The entire change is removable by deleting the Lab-only scenario/component/asset, dependency and
lockfile entries, focused tests, and active-direct-use notice wording. No production source or
checkpoint rollback is allowed or necessary.

## Stop Condition

After the official baseline, evidence, validation, and report are complete, stop for GPT
Architecture Lead Implementation Review. Do not tune Paper, add Ameow effects, integrate to
production, commit to the stable line, archive the task, or self-award Architecture PASS.
