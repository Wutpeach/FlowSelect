# UI Lab Layout & Interaction Repair — Implementation Report

Date: 2026-08-22  
Status: implementation and validation complete; awaiting GPT Implementation Architecture Review.  
Baseline: `25040db9ab7887444010a70d43cd537331286721`. No archive or Architecture PASS.

## Result

- Replaced the v1 three-pane dashboard with two persistent macro regions: a dominant Main Workspace and right Dev Tools using the same surface, spacing, and typography language.
- Main Workspace now flows top-to-bottom: one unclassified flat row of representative Full/Compact scenarios, dominant Preview, then Target/Scale and scene controls. No `Ameow UI Lab` title or replacement heading is rendered.
- Full/Compact and Fit/1x/2x/3x use Lab-local segmented controls with one roving tab stop. Existing selectable-option/theme primitives provide normal, hover, and selected styles; `.lab-control:focus-visible` provides a separate keyboard ring. Mouse clicks do not leave focus-visible styling.
- Fit is the default continuous adaptive mode. It derives display scale from the measured stage minus a 32 CSS-pixel safety allowance, has no manual 3x cap, and never changes logical geometry or export backing scale.
- Dark/Light/Checkerboard is a screen-only backdrop sibling behind the preview host. The small picker is anchored inside the Preview bottom-right and remains outside the Full export capture root.
- Dev Tools keeps human-readable target/scale/background/Reduced Motion and scene facts primary. Projection/WebGL/raw JSON remain collapsed under Advanced Diagnostics.

## Scope and boundaries

Changed product files are limited to `src/lab/**`. No `src/presentation`, Product, lifecycle, native-window, desktop bridge, shader, Compact mascot, package, or lockfile changes exist.

Preserved invariants:

- exactly one production `ExpandedPresentationSurface` on Full;
- Compact reuses the existing `CompactCatCharacter` Lab host and mounts no canvas;
- one derived Reduced Motion preview value;
- Full PNG export remains `912x912`;
- production build input remains Lab-free;
- no shadcn/Radix/Tailwind-in-Lab, generic Inspector, Agentation dependency, placeholder, or fake inspect UI.

## Lead simplify/review corrections

The Orca Worker implementation was simplified before final validation:

- removed a newly invented hard-coded orange/violet Lab control system and reused `getSelectableOptionStyle`, `getCompactLabelStyle`, and Theme tokens;
- replaced JS mouse/keyboard focus state with native `:focus-visible` and real roving `tabIndex`;
- reduced six categorized scenario groups to one flat representative scenario row;
- made mutually exclusive scenario actions clear stale Lab-local heatmap/fixture state so the row has one selected scenario per target;
- gave Main Workspace and Dev Tools the same region surface;
- moved Background from the controls row into the Preview bottom-right;
- removed redundant boundary comments that caused a false-positive isolation test.

## Validation

Passed:

- `npm run test -- --run src/lab`: 11 files, 110 tests.
- Relevant architecture/renderer guards: 2 files, 36 tests.
- `npm run type-check`.
- `npm run lint`.
- `npm run build` (production renderer + Electron TypeScript build).
- `git diff --check`.
- Package/lockfile diff: empty.
- Production-authority diff outside `src/lab`: empty.
- Production bundle scan: no `PresentationLab`, `LabSegmentedControl`, `PreviewEnvironmentPicker`, Lab environment constant, or scenario-strip marker.
- Real Edge/Playwright validation: PASS with no unexpected console/page errors.

Browser evidence at 1600x1000:

- no page heading or `<nav>`; scenario row is the first Main Workspace child;
- Full logical width remains 200px and Fit renders at about 733px (`3.67x`);
- Compact logical geometry remains 80/60px, mounts zero canvas, and Fit renders at about 740px (`9.25x`), proving no 3x cap;
- selected scenario count is one; mouse click is not `:focus-visible`; keyboard navigation produces a visible solid focus ring;
- Light background changes only the screen backdrop; Full geometry is unchanged and the environment does not contain the export frame;
- downloaded export remains `912x912`;
- Dev Tools remains `display:flex` and 240px wide at a 900px viewport;
- Main Workspace and Dev Tools computed surface colors match.

Artifacts:

- `artifacts/validate-layout-repair.cjs`
- `artifacts/browser-validation-result.json`
- `artifacts/ui-lab-layout-repair-full.png`
- `artifacts/ui-lab-layout-repair-compact.png`
- `artifacts/ui-lab-layout-repair-export.png`

Full repository suite note: `npm run test` reports 1817/1818 passing. The only failure is the pre-existing Windows CRLF-sensitive string assertion in `browser-extension/architecture-guard.test.js`; neither that test nor `browser-extension/background.js` has a diff, and direct inspection confirms the listener still ends in `return false;`. This is unrelated to the UI Lab change and does not affect the focused or architecture gates above.

## Stop state

- Child task remains `in_progress` and is the active Trellis task.
- Parent remains unarchived.
- Implementation remains uncommitted for review.
- No Architecture PASS is claimed.
