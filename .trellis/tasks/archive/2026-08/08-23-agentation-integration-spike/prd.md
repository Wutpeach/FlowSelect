# Agentation Integration Spike

## Goal

Implement and verify the approved minimum `agentation@3.0.2` real-browser spike in Ameow UI Lab. The spike proves native integration behavior, useful inspection granularity, actual React/source context, pointer isolation, and production artifact isolation. It does not extend Agentation or change Ameow production architecture.

## Requirements

- Pin exactly `agentation@3.0.2` as a development dependency.
- Mount one unconfigured official `<Agentation />` component only from the UI Lab entry.
- Preserve Agentation's default bottom-right UI and interaction behavior.
- Keep Agentation separate from Dev Tools and do not add a wrapper, adapter, provider, state store, endpoint, webhook, Inspector abstraction, or Preview-only filter.
- Do not change production renderer, Presentation, pointer, lifecycle, Product, native-window, MR9 visual, Compact mascot, UI Lab layout, locale, or public docs.
- Accept coarse stage/frame identity plus area/draw annotation for Full WebGL and pointer-transparent Compact SVG internals.
- Add a Lab-local `event.defaultPrevented` origin guard only if the browser spike reproduces origin mutation and proves that guard is sufficient.
- Stop and return NO-GO evidence if useful integration requires an active-state bridge, production pointer/layering changes, or a more complex adaptation.

## Browser Proof

- Verify the official bottom-right toolbar has no unacceptable collision.
- Verify Full selection/outline geometry at 1x, Auto, and 3x before and after target/scale changes.
- Verify Full pixels remain coarse frame/canvas visual annotations, and area/draw annotation works without claiming shader identity.
- Select at least one real shared DOM overlay or popover element.
- Verify Compact stage/shell selection and accepted area annotation when SVG children are pointer-transparent.
- Verify Reset, Background, queue/runtime controls, target switching, and scale switching before and after annotation mode.
- Verify an annotation click does not mutate Full origin, or apply and prove the one allowed Lab-only guard.
- Record actual React component and `sourceFile` output from Ameow Vite + React 19 without inference.

## Production Isolation Gate

- Verify the production renderer build contains no Agentation code, identifying strings, or assets.
- Verify Electron production artifacts contain none.
- Build and inspect the current-platform unpacked production package and asar contents for the same absence.
- Treat source/import guards as supplementary evidence only, never a substitute for artifact inspection.

## Acceptance Criteria

- [x] Exact devDependency and single official Lab-entry mount are implemented.
- [x] Browser proof covers Full, Compact, scaling, controls, placement, and actual source/component output; the runtime fixture required test-only selection because the final visible strip has no runtime entry.
- [x] Pointer-origin behavior is recorded and no adaptation beyond the allowed Lab guard is needed.
- [x] Production renderer, Electron artifacts, and the unpacked raw package pass Agentation isolation scans; asar is disabled and no asar exists.
- [x] Focused tests, type-check, lint, build, package proof, and diff checks pass; the full suite retains one unrelated pre-existing browser-extension guard failure.
- [x] A Spike Implementation Report records GO, measured granularity, source/component context, origin-guard result, artifact evidence, and dependency-retention recommendation.
- [x] Work stops before Architecture PASS, archive, feature expansion, or Compact Mascot work.

## Approved Basis

- Parent planning task: `.trellis/tasks/08-23-agentation-integration-planning`
- GPT Architecture Lead accepted PolyForm Shield 1.0.0 for this UI Lab dev-only dependency on 2026-08-23.

## Final Placement Repair (2026-08-23)

- [x] Move the existing Background trigger and icon-only Reset into one lower-left Preview-local group without changing either control's state or semantics.
- [x] Keep the Background menu above the group with no Reset overlap.
- [x] Use Agentation's official `className` placement escape hatch to move the unchanged document-level toolbar near the Preview lower-right in the normal desktop Lab viewport.
- [x] Add no geometry state, resize synchronization, Agentation bridge/filter/wrapper, production change, or inspection expansion.
- [x] Re-run browser interaction, origin-guard, and production artifact-isolation proof before finalization.
