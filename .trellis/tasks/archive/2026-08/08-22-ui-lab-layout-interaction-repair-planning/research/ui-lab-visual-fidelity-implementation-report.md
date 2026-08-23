# UI Lab Visual Fidelity Pass: Implementation Report

Date: 2026-08-23  
Status: implementation and validation complete; awaiting GPT Implementation Architecture Review.  
Baseline: v1 checkpoint `25040db9ab7887444010a70d43cd537331286721` plus the uncommitted Layout & Interaction Repair.  
Execution: Orca Develop Worker implemented the first pass; Cindy Lead simplified, corrected, ran all available validation, and performed the final reference-image review.

## Outcome

The real Lab now materially follows the supplied desktop reference in proportion, whitespace, control grouping, surface hierarchy, and overall calmness without changing the validated Lab architecture.

- The Full scenario row is a centered, single-row set of five 36px selectors: Intake, Heatmap, Download, Transcode, and Mixed. Compact keeps its three renderer-relevant scenarios.
- Fit is still adaptive and uncapped by the manual 3x option. It now reserves proportional breathing room plus the existing safety floor, producing an 81.5% Full stage fill and an 82.3% Compact stage fill at 1600x900.
- Target, Scale, and applicable context actions are separate stacked field-surface groups. Compact omits the empty Actions group because it has no real action.
- The small Background picker remains inside the Preview bottom-right. Dark, Light, and Checkerboard remain screen-only Lab environment state.
- Dev Tools is 384px at the reference viewport, uses the same outer surface as Main Workspace, and groups human-readable facts into repository field surfaces. Advanced Diagnostics stays collapsed by default.
- No `Ameow UI Lab` title, Agentation placeholder, shadcn dependency, generic inspector, or production authority was added.

## Lead simplify and corrections

The Lead corrected issues not caught by the Worker's static-only pass:

- removed an unused Fit constant import that failed TypeScript;
- simplified the Fit helper signature and comments and added a non-finite logical-size guard;
- removed unused disabled-state plumbing from the scenario chip;
- reduced Full primary scenarios from seven to five and made Intake the coherent default selected scenario;
- replaced bare separators with shared `getFieldSurfaceStyle` grouping for bottom controls and Dev Tools;
- widened Dev Tools from the previous 320px ceiling to a 384px reference-viewport width;
- tuned Fit from the Worker's over-conservative 73.6% result to 81.5%, matching the reference's comfortable but substantial preview;
- hid the empty Compact Actions row;
- recaptured screenshots after popover exit and export-feedback reset so final evidence shows the stable UI.

## Preserved architecture boundaries

- Full mounts exactly one production `ExpandedPresentationSurface`.
- Compact reuses the existing production `CompactCatCharacter` leaf and mounts zero canvases.
- Logical geometry remains Full 200px and Compact 80/60px; Fit changes display scale only.
- Full export remains `912x912`; Background does not enter the export capture root.
- Reduced Motion retains one derived Lab-local preview value.
- Production build remains Lab-free; no Product, lifecycle, native-window, renderer, shader, MR9 visual, or Compact mascot files changed.
- Package and lockfile diff is empty. No Agentation UI or dependency exists.

## Real-browser validation

Edge/Playwright ran against the real Lab at 1600x900 with no unexpected console or page errors.

- Full: five scenario selectors, one row, 36px minimum height, exactly one selected; logical frame 200px; displayed frame 425.16px; stage fill 0.8153; one canvas.
- Compact: logical host/shell 80/60px; displayed host 485px (`6.1x`, above the manual 3x option); stage fill 0.8227; zero canvases; one scenario and one target selected.
- Mouse selection did not match `:focus-visible`; keyboard navigation produced the custom solid focus ring.
- Light Background changed only the screen environment; Full logical and display geometry stayed stable and the environment did not contain the export frame.
- Advanced Diagnostics opened and closed correctly and started collapsed.
- Full PNG export remained `912x912`.

Artifacts:

- `artifacts/ui-lab-visual-reference.webp`
- `artifacts/ui-lab-visual-fidelity-full.png`
- `artifacts/ui-lab-visual-fidelity-compact.png`
- `artifacts/ui-lab-visual-fidelity-export.png`
- `artifacts/browser-visual-fidelity-result.json`
- `artifacts/validate-visual-fidelity.cjs`

## Automated validation

Passed:

- Lab suite: 11 files, 113 tests.
- `npm run type-check`.
- `npm run lint`.
- `npm run build`.
- `git diff --check`.
- Production bundle scan: no Lab symbols.
- Package/lockfile diff: empty.
- Production source diff outside `src/lab`: empty.

Full repository suite: 1817/1818 tests passed. The only failure is the existing Windows CRLF-sensitive assertion in `browser-extension/architecture-guard.test.js`. Neither that test nor `browser-extension/background.js` has a diff, and this is unchanged from the prior validated pass.

## Reference comparison

Converged:

- The scenario area now reads as a small selector set rather than an engineering button cloud.
- Preview scale and surrounding light environment closely match the reference's centered subject and visible breathing room.
- Bottom controls now form three clear vertical groups instead of one compressed toolbar.
- Dev Tools width, section hierarchy, spacing, and surfaces read as part of the same Lab shell.
- The page remains title-free and visually restrained.

Intentional differences:

1. The Lab shows five primary Full scenarios rather than the mockup's four, retaining Download as a useful real fixture.
2. Existing bilingual labels remain; the mockup is Chinese-only.
3. Dev Tools retains real origin, progress, Reduced Motion, and diagnostics capabilities instead of copying mock content.
4. Background state is reported accurately as Light in the final evidence; the reference image visually shows a light environment while labeling it Dark.
5. Agentation and Inspect UI remain absent by design.

## Stop state

The child task remains `in_progress`. Changes are uncommitted. Nothing is archived, and no Architecture PASS is claimed.
