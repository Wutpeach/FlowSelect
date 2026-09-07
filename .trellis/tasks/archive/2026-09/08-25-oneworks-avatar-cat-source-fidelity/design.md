# Design — OneWorks Avatar Lab-only source-fidelity spike

## Boundary

The experiment lives entirely in the existing browser-only UI Lab entry. It owns only ephemeral editor definition, inspection pose, playback selection, pointer sample, Reduced Motion toggle, and evidence controls. It may read the archived Compact baseline for comparison but never imports or edits production authority modules.

```text
lab.html -> lab-main.tsx
  -> PresentationLab
    -> OneWorks Mascot Inspector
       -> upstream Avatar (60 px)
       -> upstream Avatar (magnified)
       -> upstream AvatarEditor
       -> Lab-local pose/pointer/reduced-motion controls
```

The production graph remains:

```text
index.html -> src/main.tsx -> existing Compact presentation/runtime
```

There is no dependency edge from production to the Inspector.

## Upstream pinning

- Source baseline: `3ad2542ea4487e95884f313b84943df602c0e742`.
- Preferred direct package: exact `@oneworks/avatar-react@1.0.0-rc.6`, installed as a dev dependency, plus its exact core dependency.
- Before visual conclusions, compare the registry artifact's used cat preset and renderer/editor exports with the pinned revision. If they differ materially, build/consume the two upstream packages from the exact revision through a reproducible Lab-only mechanism and document package provenance.
- No upstream source is copied into Ameow renderer modules.

## Inspector state and data flow

- One controlled upstream definition feeds both `Avatar` views and `AvatarEditor`.
- Editor `onDefinitionChange` updates only Inspector-local state.
- One Lab-local pose state drives both preview views; preset buttons select deterministic evidence poses.
- The pointer adapter translates Lab pointer position into bounded upstream view yaw/pitch. It never imports or writes production `pointerField.ts`.
- Reduced Motion freezes pose/playback at an explicit deterministic frame and suppresses optional continuous experiment playback.
- Remount/visibility controls exercise React teardown/reconstruction inside the Lab only.

## Visual structure

- Add one dedicated Mascot Inspector mode/region inside the existing Lab workspace rather than a new page or window.
- The real-size and magnified previews remain visually adjacent so silhouette differences are readable without switching context.
- The upstream Editor retains its native control panel and CSS. Ameow adds only the outer Lab shell, evidence labels, and minimal deterministic controls.
- Reuse ThemeContext tokens and existing Lab segmented/control patterns; do not create a new design system or repeated card grid.

## Isolation and compatibility

- Import `@oneworks/avatar-react/style.css` only from the Lab entry or a Lab-owned module.
- Keep upstream packages in `devDependencies` so production inclusion requires an explicit forbidden import.
- Extend existing renderer-reuse/import-guard tests to prove `src/main.tsx`, production Vite build input, and Compact modules do not reference OneWorks Editor/Lab code.
- The Inspector uses browser APIs only; no desktop runtime, Electron, native bridge, Product state, or lifecycle reducer imports.
- Production build remains `index.html` only. Lab build/serve may include the full editor.

## Evidence and failure classification

Evidence must include 60 px and magnified crops for front, yaw, pitch, and tangent poses; a compact pose-sweep sheet; pointer and Reduced Motion states; Editor controls; and mount/remount results. Measure Lab production-package chunks separately from the normal production renderer bundle.

Route A fails only if the renderer cannot preserve required geometry/occlusion, cannot be controlled beneath Ameow authority, or cannot tear down/reconstruct safely. CSS, layout, missing convenience controls, or a single preset mismatch are adapter findings, not failure.

## Rollback

The spike is removed atomically by deleting its Lab component/tests/evidence and removing the dev dependencies. Production code requires no rollback because it is not changed.
