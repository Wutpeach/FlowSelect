# UI Lab Refresh Repository-Grounded Planning Report

Date: 2026-08-22

Review status: **Planning complete, ready for GPT Architecture Lead Planning Architecture Review. This report is not Architecture PASS.**

Baseline: `motion/mr9-fullscreen-activation-fx` at `eaead6573302e16839aa87a7d70b15717a708f3f`

## Executive Recommendation

Refresh the current dev-only Browser Presentation Lab by rebalancing its existing three-column structure:

- left becomes focused Scenario Navigation;
- center becomes the dominant Preview Workspace;
- right becomes progressive Dev Tools;
- raw state and shader JSON move to Diagnostics / Advanced.

Do not build a new Lab runtime or scenario authority. Preserve the current local reducer / static-fixture model and its projection through existing production selectors and renderer inputs.

Treat Full and Compact as two first-class Preview Targets with different existing capabilities:

- Full continues to mount the one production `ExpandedPresentationSurface` and shared production DOM overlays.
- Compact receives one Lab-local browser host that mounts the existing `CompactCatCharacter` renderer leaf in production `80 / 60 / 56` geometry with browser-local pointer MotionValues.

Agentation is technically feasible as optional Lab-only tooling, but only at semantic DOM/stage granularity. Keep it out unless a bounded browser proof passes and the PolyForm Shield license is accepted.

No production architecture blocker must be fixed first.

## Current Repository Facts

### Dev-only boundary

The Lab already has strong isolation:

- dedicated command and server: `package.json:13`, `vite.lab.config.ts:4-23`;
- plain browser entry: `lab.html:9-12`, `src/lab/lab-main.tsx:7-18`;
- production build pinned to `index.html`: `vite.config.ts:9-16`;
- explicit regression guards: `src/lab/rendererReuse.test.ts:43-77`.

This boundary is sufficient for the Refresh and for an optional Lab-local devDependency.

### Existing page shape

`PresentationLab.tsx` already renders left pane, center Preview, and right pane (`599-1024`). The problem is hierarchy and responsibility:

- both side panes share the same generic debug-panel treatment (`127-149`);
- the center Preview is fixed at `200×200` with limited workspace framing (`229-243`, `879-933`);
- the right pane mixes real controls, useful facts, raw JSON, and shader uniforms at one level (`935-1023`).

The implementation should refactor this page, not add a route, dashboard framework, or new shell application.

### Scenario and projection flow

The Lab has two bounded synthetic inputs:

- `scenarios.ts` owns a pure local reducer and composes one production `ExpandedPresentationTarget` (`157-184`, `219-399`);
- `stateFixtures.ts` provides static production-model fixtures with no command/controller authority (`1-11`, `33-37`, `198-212`), then `overlayProjection.ts` runs them through production selectors/helpers (`11-38`, `172-299`).

`LabOverlayStage.tsx:198-254` mounts the one production Full surface and shared overlays. `rendererReuse.test.ts:80-153` forbids Lab-owned renderer/runtime/shader work and protects browser-safe imports.

Scenario selection must remain a Lab preview choice over these existing paths. It must never become a second Product/lifecycle truth.

## Recommended Responsibility Split

| Region | Owns | Explicitly does not own |
| --- | --- | --- |
| Scenario Navigation | grouping, scenario selection, target compatibility, reset | raw JSON editing, production commands, lifecycle transitions |
| Preview Workspace | Full/Compact target tabs, one active stage, display zoom, logical-size label, replay/export, annotation surface | Product state, native window mode, renderer implementation |
| Dev Tools | current real inputs, human-readable facts, optional Agentation, Advanced diagnostics | generic parameter schema, shader editor, second state store |

The center must receive the dominant width and visual quiet. Use standard tabs/rows/disclosures, restrained Ameow tokens, and separators rather than nested debug cards.

## Full and Compact Preview Direction

### Full

Keep the current Full path. Do not create another surface or preview renderer.

One Lab-only chrome correction is recommended: change the stage wrapper from the current `14px` radius (`LabOverlayStage.tsx:125-135`) to the production Full radius `16px` (`geometry.ts:45-75`). This does not change MR9 shader visuals.

### Compact

The existing Compact renderer is already a suitable leaf:

- `CompactCatCharacter.tsx:1-19` owns no Product, lifecycle, native, or IPC authority;
- its prop contract is limited to size/colors/Reduced Motion/read-only MotionValues/attention center (`49-63`);
- production geometry is explicit in `windowMetrics.ts:1-3`, `geometry.ts:51-65`, and `characterRecipe.ts:13-15`.

Create a Lab-local Compact stage with an `80×80` logical outer frame, centered `60×60` shell, `56×56` current character, and attention center `(40,40)`. Supply pointer MotionValues from browser pointer movement and pass Reduced Motion/theme values directly.

Do not mount `MainWindowPresentationSurface`; it imports desktop runtime and composes native/lifecycle concerns. Do not change the mascot renderer or recipe.

Existing Full download/runtime/transcode scenarios do not automatically gain Compact meaning. Add only Compact scenarios backed by current renderer capability: neutral, pointer attention, and Reduced Motion. Mark/filter incompatible scenarios rather than fabricating a projection.

This makes Compact first-class in the Preview model without pre-designing the future mascot.

## Preview Scale Contract

Keep three separate facts:

- Full logical geometry: `200×200`;
- Compact logical geometry: `80×80` outer, `60×60` shell, `56×56` character;
- Lab display scale: workspace-only magnification.

Apply display scale to a Lab wrapper around the unchanged logical stage. The current normalized click mapping uses `getBoundingClientRect()` (`PresentationLab.tsx:428-438`), which is compatible with uniform scaling.

Full raster/backing scale remains separate. Existing PNG export explicitly raises backing scale while holding CSS geometry fixed (`PresentationLab.tsx:513-538`). Implementation must prove that display zoom does not change export dimensions/framing.

Compact export is not required to make Compact a first-class live Preview Target. Add it only if the existing Lab export path supports the `80×80` logical frame without production changes.

## Diagnostics Disposition

Keep in normal Dev Tools:

- selected scenario/target and logical-size summary;
- Reduced Motion;
- origin and determinate progress where applicable;
- human-readable download/transcode/runtime facts;
- queue rows/open state for relevant fixtures;
- export status/error;
- optional Agentation status.

Move to Diagnostics / Advanced:

- composed target JSON;
- raw fixture JSON summary;
- WebGL uniform readout;
- logical/display/backing scale details;
- low-level capture facts.

The existing origin, progress, and Reduced Motion controls are the only clear low-cost parameter capability (`PresentationLab.tsx:938-1004`). Retain them as scenario-specific controls. Do not design a general live Inspector.

## Agentation Feasibility

Current upstream baseline: `agentation@3.0.2`, React `>=18`, no runtime dependencies, approximately `3.63 MB` unpacked, desktop browser only, PolyForm Shield 1.0.0.

Technical fit:

- Agentation uses browser point hit testing and `getBoundingClientRect()`, so uniform stage scaling should align live highlights.
- Its UI portals to `document.body` and its overlay is pointer-transparent outside its own controls.
- Ameow Full's WebGL canvas is itself `pointer-events: none` (`ExpandedPresentationSurface.tsx:786-798`), so shader pixels resolve to the Lab frame, not an internal effect node.
- Compact SVG is also `pointer-events: none` (`CompactCatCharacter.tsx:217-227`), so the meaningful selectable node is the Lab Compact stage.
- Shared production DOM overlays remain normal element targets where production pointer behavior permits.

Expected usage:

- DOM controls/overlays: click annotations;
- Full shader regions: area/draw annotations against the Full stage;
- Compact eyes/body: area annotations against the Compact stage.

Known risk: annotation clicks may also trigger Full preview origin selection because Agentation prevents default but does not always stop propagation. If reproduced, add only a Lab-local `defaultPrevented` guard. Do not change production pointer behavior or layering.

Adoption gates:

1. explicit PolyForm Shield license/notice acceptance;
2. real-browser proof at `1×` and maximum zoom;
3. no preview-state mutation while annotating;
4. no Agentation asset/reference in production build;
5. no production renderer/layering modification.

If any gate fails, omit Agentation. The core Refresh remains complete.

Full evidence is recorded in [agentation-feasibility.md](./agentation-feasibility.md).

## Architecture Blockers and Risks

### Blockers

None.

### Non-blocking implementation risks

- display transforms can couple accidentally to export capture;
- current shader readout assumes the first canvas and must become Full-only;
- Compact internal SVG nodes are intentionally not hit-test targets;
- Agentation click propagation needs proof;
- Agentation's non-standard license needs explicit acceptance;
- current Lab uses scattered local hex styles; Refresh should reuse existing Theme tokens without expanding into a design-system refactor;
- locale parity and existing Lab validation scripts must remain current.

## Recommended Bounded Implementation Scope

1. Rebalance the current page into the three explicit responsibilities.
2. Add one local Full/Compact target choice and small compatibility metadata.
3. Add display-scale handling around unchanged logical stages.
4. Add the Lab-local Compact stage using the existing renderer leaf.
5. Demote JSON/uniforms to Advanced and keep current real controls.
6. Run an optional Agentation proof, then adopt or omit it cleanly.
7. Extend Lab isolation/reuse/geometry tests and real-browser validation.

Expected source scope is primarily `src/lab/`, Lab locales/tests, and package files only if Agentation is retained. Production Presentation, Product, lifecycle, Electron, browser-extension, docs-site, and MR9 visual files are out of scope.

Detailed execution and rollback steps are in `implement.md`. Architecture and target contracts are in `design.md`.

## Stop Condition

Planning is complete. Keep the Trellis task in `planning`; do not run `task.py start`, implement UI, commit UI Lab Refresh implementation, or claim Architecture PASS.

Wait for GPT Architecture Lead Planning Architecture Review.
