# Paper Heatmap Panel Mapping Evidence

Checked: 2026-08-23.

## Repository Baseline

Accepted implementation worktree:

`D:/Ameow/.cindy-worktrees/mr9-paper-heatmap-official-baseline`

Relevant repository contracts:

- `src/lab/PaperHeatmapOfficialBaseline.tsx` passes only the accepted r16 SVG URL,
  `suspendWhenProcessingImage`, and 200×200 style to the official `Heatmap`.
- `src/lab/paperHeatmapSilhouette.svg` contains one black 200×200/r16 rectangle on transparency.
- `src/lab/lab-main.tsx` mounts `ThemeProvider initialTheme="black"`.
- `src/constants/windowMetrics.ts` defines `MAIN_WINDOW_PANEL_SIZE = 200`.
- `src/presentation/main-window/geometry.ts` defines `MAIN_WINDOW_FULL_PANEL_RADIUS = 16`.
- `src/components/ui/shared-styles.ts` provides `getPanelShellStyle(...)`, using the real Ameow
  theme gradient and panel shadow rather than Lab-local color reconstruction.
- `PresentationLab.tsx` already makes the accepted official mode mutually exclusive with
  `LabOverlayStage` and suppresses Production readout/export controls in that mode.

Existing compact visual evidence:

- `../08-23-mr9-paper-heatmap-official-component-source-fidelity-baseline/artifacts/implementation/comparison-00s.png`
- `../08-23-mr9-paper-heatmap-official-component-source-fidelity-baseline/artifacts/implementation/comparison-12s.png`

Both sheets show a dominant black rounded-rectangle interior with Paper's cool outer field and warm
band changing around the perimeter. This is the observed motivation for A/B mapping, not a target
for tuning.

## Published Package Truth

Live npm metadata on 2026-08-23:

| Package | Version | Dependency | gitHead | License | Integrity |
| --- | --- | --- | --- | --- | --- |
| `@paper-design/shaders-react` | 0.0.80 | exact `@paper-design/shaders: 0.0.80` | `60467401863c1917dd02016d0c1ff2f791d0b3c8` | Apache-2.0 | `sha512-Y1oxUeh5D2AECo05O+4UYRbaMfQzKKYH3Q5jcvirOcoX0hTPYbezCLn5g94nvcuzxy5LN/uqwsL3jDUp8r3E+A==` |
| `@paper-design/shaders` | 0.0.80 | none | same | Apache-2.0 | `sha512-pcabvt5xDlFoEhpjUj4b1tGJMfqb0i5mXifWMNQf6z7FoOJYxYDo7F8R6k0JAh5D/7ouxjX5+N0cIq5WURyQ1Q==` |

React peers remain `react ^18 || ^19` and optional `@types/react ^18 || ^19`; Ameow satisfies them.
No dependency or license change is needed for the A/B spike.

Installed published artifacts inspected directly:

- `node_modules/@paper-design/shaders-react/dist/shaders/heatmap.js`
- `node_modules/@paper-design/shaders/dist/shaders/heatmap.js`
- `node_modules/@paper-design/shaders/dist/get-shader-color-from-string.js`
- `node_modules/@paper-design/shaders/dist/shader-mount.js`

## Image and Alpha Semantics

Official preprocessing:

1. creates a 1000px processing canvas with 375px padding around the fitted source;
2. fills the entire canvas white;
3. draws the source image and converts RGB luminance to gray;
4. writes contour, broad blur, and inner blur into R/G/B;
5. writes alpha 255 for every processed pixel.

Consequences:

- transparent SVG pixels become white scalar space because of the white prefill;
- a transparent input asset does not by itself create a transparent Paper canvas;
- the accepted r16 SVG remains appropriate as a computational shape input for Scheme B;
- a full-frame black SVG removes r16 from Scheme A's computational domain while preserving the
  official preprocessing path.

Official background composition:

```text
bgColor = u_colorBack.rgb * u_colorBack.a
color = heatColor + bgColor * (1 - heatOpacity)
opacity = heatOpacity + u_colorBack.a * (1 - heatOpacity)
```

The published color parser accepts three-, four-, six-, and eight-digit hex strings. Therefore
`#00000000` becomes `[0, 0, 0, 0]` through official code and allows zero-heat output to reveal the
real panel underneath. This changes the Default background composition but does not alter motion,
preprocessing, morphology, timing, coordinate transforms, or palette stops.

## Official Mount and Comparison Lifecycle

The published mount creates a WebGL2 canvas, prepends it to its wrapper, supplies Paper's own CSS,
owns resize/intersection/visibility observers and RAF, and disposes its resources on unmount. The
default WebGL2 context attributes are used when Ameow passes none; alpha is not disabled.

The official CSS keeps the canvas absolute and sized to its wrapper, inheriting wrapper radius.
An outer 200×200/r16 clipping host is therefore a composition boundary, not a Paper shader change.

Two official mounts are intentionally required for simultaneous A/B observation. Sharing a React
Suspense boundary can delay display until both processed inputs resolve and then mount both in one
commit. Each mount still has its own RAF/current frame, so exact phase synchronization must not be
claimed or manufactured.

## Minimum Feasible Mapping

| Scheme | Official inputs/props | External composition | Default deviation |
| --- | --- | --- | --- |
| A | full-frame black `image`; suspension; 200×200 size | r16 viewport only | image and outer crop |
| B | accepted r16 `image`; suspension; 200×200 size; transparent `colorBack` | real Ameow panel below, same r16 clip | background alpha and panel layer |

Both are possible without source modification. CSS blend modes, opacity/filter tuning, Paper source
copies, sizing-prop changes, and Ameow effects are broader deviations and are excluded from the
first comparison.
