# Agentation Repository Compatibility Research

Evidence was checked on 2026-08-23 against the completed UI Lab Refresh baseline on
`planning/ui-lab-refresh` at `9648d91` (UI Lab implementation commits `25040db` and `878d868`).
This research changes no source, dependency, or visual layout. The current Agentation package was not
installed or mounted; Agentation-specific mechanics below are taken from `upstream-agentation.md` and
are used only to assess the repository surface they would meet.

## 1. Final UI Lab architecture and DOM

The Lab is a dedicated browser-only entry:

```text
lab.html -> src/lab/lab-main.tsx -> ThemeProvider -> PresentationLab
                                              |-> LabOverlayStage (Full)
                                              `-> CompactPreviewStage (Compact)
```

- `vite.lab.config.ts` serves the Lab on `127.0.0.1:1421`; the production Vite config pins its only
  Rollup input to `index.html`.
- `lab-main.tsx` initializes the Lab locale and theme without Electron/desktop bridges.
- `PresentationLab.tsx` renders two page-level surfaces: the dominant Workspace Shell and persistent
  right-side Dev Tools. The Workspace owns a scenario header, Preview body, and target/scale/action
  footer. Dev Tools owns facts and advanced diagnostics; it is not part of the Preview host.
- Preview Target is one Lab-local `full | compact` discriminant. Display scale is a separate Lab-local
  value (`auto | 1 | 2 | 3`). Auto resolves to a concrete integer scale from the measured viewport.

The Preview body has this relevant shape:

```text
[data-lab-stage-viewport]                         overflow:hidden; position:relative
  [data-lab-env]                                  absolute; inset:0; pointer-events:none
  layout reservation div                          logicalSize * effectiveScale
    transform div                                 scale(effectiveScale); origin top-left
      Full: [data-lab-preview-frame]               logical 200 x 200
        canvas                                    absolute; pointer-events:none; z 0 or 2
        shared center overlay                     absolute; usually pointer-events:none
        queue badge / full-frame queue popover    interactive; z 30 / 25
        runtime indicator / popover                interactive; z 12
        [data-lab-chrome] origin marker            pointer-events:none; z 5
      Compact: [data-lab-compact-stage]            logical 80 x 80
        [data-lab-compact-shell]                   centered logical 60 x 60
          CompactCatCharacter svg                 logical 56 x 56; pointer-events:none
  Preview Environment picker wrapper               absolute right/bottom; z 40
  Reset wrapper                                    absolute left/top; z 40
```

The environment picker opens an upward Lab-local DOM popover (`role=listbox`, `role=option`) with
internal z-index 30. Reset is an ordinary button. The Preview Background is only the non-interactive
`data-lab-env` sibling behind the preview and does not reach renderer/theme/export state.

## 2. Full target: inspection granularity

`LabOverlayStage` mounts exactly one production `ExpandedPresentationSurface`. That renderer creates one
absolute WebGL2 canvas and explicitly sets `pointerEvents: "none"`. The 200 x 200 frame itself owns the
Lab-local click-to-set-origin handler.

Consequences for Agentation's current `document.elementFromPoint()` selection:

- An unobstructed Full pixel resolves to the `data-lab-preview-frame` div, not the canvas. Therefore the
  reliable selectable identity is **the whole Full frame / LabOverlayStage boundary**, not the WebGL
  canvas node and never a shader feature inside it.
- Thermal regions, refraction, activation fronts, progress arcs, and other shader pixels have no DOM
  identity. Agentation area/draw annotations can describe their viewport region, but that produces a
  coordinate annotation rather than component identity.
- Shared center-overlay presentation is real DOM, but its common root uses `pointer-events:none`; most
  non-interactive overlay text/graphics also fall through to the Full frame in native hit testing.
- Interactive production overlay controls remain element-selectable: the queue badge is a button at
  z-index 30; its open full-frame popover is hittable at z-index 25; runtime controls/popovers are
  hittable at z-index 12; protected cancel controls opt back into `pointer-events:auto`.
- Best-effort React/source context follows the actually hit node. A plain Full pixel is expected to
  identify the Lab frame/`LabOverlayStage` chain, not `ExpandedPresentationSurface`; a selectable shared
  overlay control can identify its shared production component chain.

Changing the production canvas or shared presentation overlays to `pointer-events:auto` merely to
increase Agentation granularity is outside the architecture boundary and should be rejected.

## 3. Compact target: inspection granularity

`CompactPreviewStage` mounts the existing production `CompactCatCharacter` leaf in the production
80/60/56 geometry. The renderer is genuine SVG DOM (`svg`, three `path`, two `ellipse` nodes), but the SVG
root explicitly has `pointerEvents: "none"` and `userSelect: "none"`.

Consequences:

- Native hit testing at the character center resolves to the Compact shell div, not the SVG, `path`, or
  `ellipse` nodes.
- The dependable element granularity is **Compact stage or shell**. The visible cat can be area/draw
  annotated, but default hover/click selection should not promise body/ear/eye SVG identity.
- Best-effort React/source context from the shell is expected to describe the Lab Compact host chain;
  it must not promise a `CompactCatCharacter` source location unless the real spike proves Agentation
  can recover it despite the pointer-transparent SVG.

Changing `CompactCatCharacter` pointer behavior for inspection would modify a production renderer leaf
and is a failed integration candidate.

## 4. Scaling, bounds, stacking, and hit testing

Display scale is applied by a Lab wrapper transform while a sibling layout div reserves
`logicalSize * effectiveScale`. Agentation's current outline logic uses post-transform
`getBoundingClientRect()` coordinates and its selection uses viewport-coordinate hit testing, so the
coordinate systems are compatible in principle. The body portal also keeps Agentation outside the
scaled stacking context and outside the stage's `overflow:hidden` clipping boundary.

The current Lab's highest local chrome z-index is 40. Agentation's upstream page overlay/markers/toolbar
use 99997/99998/100000 in a `document.body` portal, so its official overlays should dominate the Lab
without a local z-index adaptation.

A headless Chromium read-only probe of the running completed Lab recorded:

| State | Logical host | Displayed rect | `elementFromPoint()` result |
|---|---:|---:|---|
| Full Auto at 1440 x 1000 viewport | 200 x 200 | 400 x 400 (Auto resolved 2x) | Full frame div |
| Full manual 3x | 200 x 200 | 600 x 600 | Full frame div |
| Download queue badge | within Full | scaled with frame | badge button |
| Open queue popover center | within Full | scaled with frame | popover descendant |
| Compact 3x | 80 x 80 | 240 x 240 | Compact shell div |
| Compact shell 3x | 60 x 60 | 180 x 180 | Compact shell div |
| Compact SVG | 56 x 56 | 168 x 168 | Compact shell div (`svg` computed pointer-events is `none`) |
| Preview environment option | Lab chrome | unscaled | option button |

This proves current repository geometry and hit behavior, not Agentation integration. A real Agentation
browser spike is still required to prove its outlines/markers remain aligned at each scale and after
target/scale changes.

## 5. Pointer and interaction risks

The Full frame uses a React bubble `onClick`. `LabOverlayStage` currently forwards a point object to
`PresentationLab`; neither layer checks `event.defaultPrevented`. The handler normalizes against the
post-transform frame rect, which is why pointer-origin math remains correct at 1x/2x/3x.

Agentation 3.0.2 defaults `blockInteractions` to true. Its capture listener prevents interactive
controls and stops their propagation, but for a non-interactive target it may call `preventDefault()`
without always stopping propagation. Therefore annotating the Full frame could also move the Lab-local
pointer origin. This is the primary integration risk.

The smallest acceptable repair, only if reproduced, is a Lab-local early return in
`LabOverlayStage` when the React click is already `defaultPrevented`. It requires no production pointer,
renderer, layering, or authority change. The spike must first prove that Agentation has set
`defaultPrevented` by the time React's frame click runs; do not add a broader mode/state bridge unless
that minimal guard is insufficient.

Other interaction expectations:

- Agentation's body-portaled toolbar should not inherit Preview scaling.
- Its own body event stop should prevent its toolbar clicks from triggering the environment picker's
  document-level outside-click listener, but this must be checked with both popovers open/closed.
- Annotation mode should suppress Reset, Background options, queue badge/popover actions, and Compact
  pointer behavior while selecting. Normal behavior must resume after annotation mode exits.
- Preview Background itself is intentionally not selectable because it is pointer-transparent; the
  stage viewport is the meaningful element identity for that empty/background region.

## 6. UI placement

Mount the official `Agentation` component at the Lab root and retain its default fixed bottom-right
toolbar. Do not create an Ameow placeholder, Dev Tools section, copied toolbar, or Preview-local portal.
The toolbar's body portal and high z-index are already the correct architecture for an unscaled overlay.

The Lab also has an environment trigger at the Preview body's bottom-right, but it is local to the
workspace stage, whereas Agentation is fixed to the browser viewport's bottom-right (over the reserved
page/Dev Tools area). This is not evidence of a collision. Only a real-browser mount demonstrating an
unusable overlap justifies using Agentation's upstream `className` escape hatch, and any change should
be limited to fixed-position offset/z-index styling.

## 7. Development-only containment and production isolation

The bounded future mount is one static import and one official component in `src/lab/lab-main.tsx`, as
a sibling of `PresentationLab` under the existing Lab React root. Keep the dependency exact-pinned in
`devDependencies`. Do not add endpoint/session/webhook wiring, persistence, an Ameow adapter, Inspector
context, Dev Tools state, or production-owned annotation state.

Repository isolation already has two useful barriers:

1. the production app graph (`index.html` -> `src/main.tsx`) does not reference `lab.html` or `src/lab`;
2. `vite.config.ts` pins the production Rollup input to `index.html`, while the Lab has its own Vite
   config and script.

Future validation should extend `rendererReuse.test.ts` to assert the `agentation` import occurs only in
the Lab entry and remains absent from production entry/config sources. Then run the existing focused Lab
tests, type-check, lint, and production build, and scan `dist/`, `dist-electron/`, and a packaged
application (if packaging is part of the gate) for `agentation` code/assets/strings. The test must not
substitute for inspecting the actual production artifacts.

## 8. Required real-browser spike (minimum scope)

The adoption gate should mount unmodified `agentation@3.0.2` only in the Lab and prove:

1. default bottom-right toolbar, activation, copy/clear workflow, and no actual toolbar collision;
2. Full frame hover/select and area/draw annotation at 1x and 3x (Auto 2x is also covered by switching
   back to Auto), before and after scale changes;
3. explicit confirmation that a plain Full pixel selects the frame rather than promising canvas/shader
   identity;
4. one queue badge and open queue-popover descendant as shared production DOM cases;
5. Compact stage/shell selection and area annotation at 1x and 3x, with an explicit check of whether
   pointer-transparent SVG internals remain unreachable;
6. pointer-origin state does not change while annotating; if it does, prove the Lab-local
   `defaultPrevented` guard and nothing broader;
7. Reset, Background picker, queue popover, Compact pointer attention, target switch, and scale switch
   resume correctly after annotation mode;
8. Agentation toolbar/outlines are unscaled and remain aligned after target/scale/popover changes;
9. React component and `sourceFile` evidence in Ameow's Vite + React 19 runtime, recorded as best-effort
   (absence is not replaced with invented context);
10. production renderer build and package contain no Agentation reference or asset.

No Full shader-internal, Compact SVG-child, or pointer-transparent center-overlay granularity is an
acceptance requirement.

## 9. Repository compatibility recommendation

Repository compatibility is **CONDITIONAL GO**:

- The dedicated Lab entry, body-portaled upstream UI, transformed viewport geometry, and existing build
  graph make a minimal Lab-only integration plausible.
- Whole-frame/stage and area annotations satisfy the useful floor for WebGL and Compact visuals;
  interactive shared DOM overlays provide finer element/source context where the current UI is hittable.
- Adoption remains conditional on upstream license acceptance, the real-browser pointer/hit-test/source
  proof above, and artifact-level production isolation.
- Any result requiring production canvas/SVG pointer changes, production z-index/lifecycle/renderer
  changes, or a new Ameow Inspector/state abstraction is a **NO-GO for that adaptation** and should
  remove or narrow Agentation instead.

