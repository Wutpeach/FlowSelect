# Implementation Plan: Paper Heatmap Panel Mapping Comparison

## Preconditions

- Wait for explicit GPT Architecture Lead Planning PASS.
- Do not run `task.py start` before that PASS.
- Use the accepted isolated official-baseline worktree as the implementation base. Before editing,
  verify its status and changed-path set still match the accepted baseline Implementation Report.
- Verify the separate stable `motion/mr9-fullscreen-activation-fx` worktree is clean; never edit it.
- Do not install, upgrade, or change dependencies. The accepted baseline already pins both Paper
  packages at 0.0.80 and carries the required Apache-2.0/NOTICE text.

## Ordered Implementation Checklist

1. Record the pre-spike baseline boundary.
   - Capture `git status --short`, `git diff --name-only`, exact package resolution, and current
     baseline runtime/evidence paths.
   - Stop if unexpected files or Paper versions are present.
2. Add the Scheme A computational input.
   - Add `src/lab/paperHeatmapFullFrame.svg` with one full-frame black 200×200 rectangle and no r16.
   - Keep the asset URL-only; never mount it in the DOM or CSS.
3. Add one focused Lab comparison component.
   - Create `src/lab/PaperHeatmapPanelComparison.tsx`.
   - Import only `Heatmap` from `@paper-design/shaders-react` and reuse the accepted r16 SVG URL.
   - Render both Heatmaps under one shared Suspense boundary.
   - A: full-frame image, suspension, 200×200 size, display-only r16 clip, no real panel.
   - B: accepted r16 image, suspension, 200×200 size, exact transparent `colorBack`, real black-theme
     panel from existing geometry/style helpers, same r16 clip.
   - Keep labels outside both panel geometries and add stable `data-lab-*` hooks for element-level
     evidence and runtime assertions.
4. Expose one mutually exclusive comparison category.
   - Extend `PresentationLab.tsx` with `Paper panel A/B` while leaving `Paper official` and all
     ordinary categories intact.
   - In A/B mode, mount only the comparison component; suppress Production inspector polling,
     export, input controls, and `LabOverlayStage` exactly as the accepted baseline already does for
     the official mode.
   - Add short English and Chinese Lab-only labels/captions. No user-facing docs-site update is
     required for a dev-only experiment.
5. Add source-fidelity tests.
   - Add `src/lab/paperHeatmapPanelComparison.test.ts`.
   - Assert the A asset is one full-frame black rect with no radius or extra element.
   - Assert A's Heatmap prop allowlist is image/suspension/200×200 style only.
   - Assert B reuses the exact r16 asset and adds only `colorBack="#00000000"`.
   - Assert neither asset is rendered and neither cell uses Paper internals, Ameow effects, locked
     Paper props, filters, opacity tuning, blend modes, output masks, or duplicate geometry.
   - Assert A has no panel shell and B has exactly one real panel shell below one Paper overlay.
   - Assert A/B mode is mutually exclusive with Production preview/readback/export.
   - Extend renderer-reuse/build-isolation coverage only enough to recognize this explicit two-
     official-canvas Lab exception; do not weaken ordinary one-renderer assertions.
6. Run automated validation.
   - Run the focused Lab suites first.
   - Run type-check, lint, Production renderer build, full tests, exact dependency resolution, and
     whitespace/diff checks.
   - Inspect the incremental comparison paths and confirm no Production source or stable worktree
     changed. Reproduce any full-suite failure against the accepted baseline before calling it
     pre-existing.
7. Run real-browser A/B validation.
   - Start the dev-only Lab and select `Paper panel A/B`.
   - After shared Suspense settles, assert exactly two Paper canvases/mounts, zero Production
     previews/canvases, and one composed panel shell only in B.
   - Record independent frame values, observe continuously for at least 12 seconds, and record both
     advancing afterward. Do not manipulate or synchronize frames.
   - Switch away and confirm both Paper canvases dispose; switch back and confirm exactly two mounts.
8. Capture compact visual evidence.
   - Capture A and B composed panel elements at the same wall-clock start and at 12 seconds or later.
   - Build one tightly cropped labelled two-up sheet; optionally add a compact 0/4/8/12 contact
     sheet if motion differences need more than two stills.
   - Never use a tall full-page screenshot or raw diagnostics capture. Capture B's composed element,
     not its transparent canvas alone.
9. Write the Implementation Report and stop.
   - Record exact version/source, runtime counts, frame deltas, factual A/B visual differences,
     deviations from Default/baseline, validation results, and evidence links.
   - Leave PASS/REJECT and A/B selection explicitly undecided for the user.
   - Do not tune, commit/integrate the Production line, begin a hybrid/derivative round, archive the
     task, or self-award Architecture PASS.

## Planned Files

Expected comparison-only implementation paths:

- `src/lab/PaperHeatmapPanelComparison.tsx` (new)
- `src/lab/paperHeatmapFullFrame.svg` (new)
- `src/lab/PresentationLab.tsx`
- `src/lab/locales/en.json`
- `src/lab/locales/zh-CN.json`
- `src/lab/paperHeatmapPanelComparison.test.ts` (new)
- `src/lab/rendererReuse.test.ts` only if required to preserve the scoped exception
- this task's report/evidence paths

Expected unchanged inputs reused from the accepted baseline:

- `src/lab/paperHeatmapSilhouette.svg`
- `src/lab/PaperHeatmapOfficialBaseline.tsx`
- `package.json`, `package-lock.json`, `THIRD_PARTY_NOTICES.md`

Forbidden change areas include `src/presentation/`, `src/product/`, `src/application/`, Electron,
native-window, extension, Download, Production Thermal/Refraction/Boundary/Halo/timing, site docs,
and release files.

## Validation Commands

Run from the accepted isolated baseline worktree after Planning PASS:

```powershell
npm exec vitest run -- src/lab/paperHeatmapPanelComparison.test.ts src/lab/paperHeatmapOfficial.test.ts src/lab/rendererReuse.test.ts src/lab/scenarios.test.ts
npm run type-check
npm run lint -- --quiet
npm run build:renderer
npm test
npm ls @paper-design/shaders-react @paper-design/shaders --depth=1
git diff --check
git status --short
git diff --name-only
```

Production build inspection must still find no Paper package or shader identifiers in the shipped
renderer output. The browser validation script may use Playwright/CDP against `npm run dev:lab`,
but it must not become a Production runtime dependency.

## Rollback Points

- Before code edits: the accepted official-baseline diff/status is the authoritative recovery point.
- Component/category rollback: remove only the new comparison component, A asset, category/locales,
  focused tests, and task evidence.
- No dependency, license, Production renderer, or stable Thermal rollback should be necessary.
- If either scheme cannot be expressed within the prop/composition allowlist, stop and return to
  Architecture planning. Do not patch Paper source as a fallback.

## Review Gate

This file is an execution plan, not implementation authorization. After implementation and visual
evidence, stop for GPT Architecture Lead Implementation Review without choosing A or B.
