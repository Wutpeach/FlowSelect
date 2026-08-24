# Agentation Integration Spike Design

## Boundary

The production renderer continues to enter through `index.html` and `src/main.tsx`. The browser-only UI Lab enters through `lab.html` and `src/lab/lab-main.tsx`. Agentation is a static dependency of the Lab entry only and portals its official UI to `document.body`.

## Minimum Change

1. Add exact `agentation@3.0.2` under `devDependencies`.
2. Import `Agentation` in `src/lab/lab-main.tsx`.
3. Mount one unconfigured `<Agentation />` sibling after `<PresentationLab />`.
4. Add only minimum boundary assertions to the existing Lab reuse test.
5. Add a Lab-local origin guard and focused test only after reproducing the exact click bleed.

No UI styling, placement override, provider, adapter, state bridge, filtering, production import, or renderer change is designed.

## Proof Model

The real-browser spike owns compatibility truth. It records viewport geometry and actual annotation output for Full 1x/Auto/3x, Compact, a shared DOM control/popover, target and scale changes, Lab controls, and origin state. Expected coarse identity for WebGL pixels and pointer-transparent SVG children is a successful result when area/draw annotation remains usable.

The production isolation gate builds the actual renderer/Electron outputs and a current-platform unpacked package. Both raw artifacts and asar contents are scanned for the package name, Agentation-specific attributes/strings, and shipped package resources.

## Stop Conditions

Return NO-GO and remove the dependency/mount if acceptable operation requires production changes, an Agentation active-state bridge, Preview filtering, layout redesign, or a repair beyond `event.defaultPrevented` in the Lab click handler.

## Final Placement Repair Addendum (2026-08-23)

The Preview environment trigger and existing Reset button become siblings in one absolute lower-left Lab chrome group. The picker continues to own its existing local open/value state and opens its popover upward, aligned to the group's left edge.

The single official Agentation mount receives only its documented `className` prop. Lab CSS applies a stable viewport-relative right/bottom offset derived from the existing desktop shell and Dev Tools rail, placing the official fixed toolbar visually inside the Preview lower-right. This is deliberately not exact responsive anchoring: no Preview measurement, resize state, portal relocation, or Agentation state bridge is introduced.
