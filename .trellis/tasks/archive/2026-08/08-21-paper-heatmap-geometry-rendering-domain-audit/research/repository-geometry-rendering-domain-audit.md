# Repository Geometry / Rendering Domain Audit

**Task:** `08-21-paper-heatmap-geometry-rendering-domain-audit`

**Worktree:** `D:\Ameow\.cindy-worktrees\mr9-fullscreen-activation-fx`

**Scope:** repository evidence only. No production/test edits, Browser Lab implementation, native
resize, task start, commit, or archive.

## Executive Findings

| Question | Repository truth |
|---|---|
| 228 = 200 + 14×2 | Confirmed on Windows and macOS |
| Native full window | 228×228, transparent, frameless, non-resizable, no native shadow |
| Visible panel | 200×200, radius 16, at `(14,14)` |
| Transparent gutter | 14px per side |
| Current canvas | 200×200 inside the panel; not the 228 outer domain |
| Effective canvas clip | Panel shell `overflow:hidden` plus radius 16 |
| Outer shadow | CSS box-shadow on a separate transparent panel-sized shell |
| Gutter WebGL output | Geometrically possible only after a DOM/layer change exposes 228 to the same canvas |
| Latent silhouette | Can exactly match the real panel; it is not current travelling `sourceInfluence` |
| Processed texture | Unneeded by the stable analytic fallback; recommended candidate for the new processed-silhouette spike |
| Native resize | Not needed to test within 14px; required only if the desired visible halo exceeds the existing output budget |

## 1. Native and Panel Geometry

### 1.1 Shared constants

`src/constants/windowMetrics.ts` is the native/panel size authority:

- `MAIN_WINDOW_PANEL_SIZE = 200` at line 1.
- `MAIN_WINDOW_FULL_SHADOW_GUTTER = 14` at line 4.
- the macOS full gutter aliases the same value at line 5.
- `getMainWindowFullShadowGutter` returns 14 for `darwin` and `win32` at lines 11–13.
- `getMainWindowFullOuterSize` computes `200 + 14×2 = 228` at lines 20–22.

There is no Windows/macOS asymmetry in full-state size.

### 1.2 BrowserWindow construction

`electron/main.mts:2109-2127` states that the Main Window keeps one stable full viewport and creates
it from `getMainWindowFullOuterSize`:

- width/height: 228 (`:2112,2119-2120`);
- `alwaysOnTop:true` (`:2122`);
- `skipTaskbar` on Windows (`:2123`);
- transparency allowed (`:2124`);
- frameless (`:2125`);
- non-resizable (`:2126`);
- prefers the zero-alpha background (`:2127`).

`createAmeowBrowserWindow` resolves the final native appearance at
`electron/main.mts:648-684`:

- `transparent:transparentWindow` at `:667`;
- `hasShadow:useNativeWindowShadow` at `:675`;
- `useNativeWindowShadow` is false on macOS and false for a transparent Windows window at `:658`;
- `roundedCorners` is requested on Windows at `:676`;
- initial `show:false` at `:677`.

Windows default transparent background is true zero alpha, `#00000000`, at
`electron/windowVisibility.mts:13`. `resolveMainWindowRevealBounds` normalizes and repositions the
existing bounds at `windowVisibility.mts:188-212`; it does not introduce a presentation-mode size.

### 1.3 Renderer geometry projection

`src/presentation/main-window/geometry.ts` confirms:

- full radius 16 at `:45`;
- full shell origin is the platform gutter and size is 200×200 at `:68-76`;
- viewport size is always `getMainWindowFullOuterSize(platform)` at `:93-112`, specifically `:102`;
- shadow shell and visual shell use the same frame at `:103-104`.

Therefore full state on both platforms is:

```text
outer/native/viewport: 228×228
panel:                 200×200 at (14,14), radius 16
gutter:                14px on every side
```

## 2. Current DOM, Canvas, and Backing Store

### 2.1 DOM chain

`src/presentation/main-window/MainWindowPresentationSurface.tsx` currently builds:

1. viewport root, 228×228, `overflow:"visible"` (`:980-988`);
2. magnetic wrapper spanning the viewport (`:993-1000`);
3. shadow backdrop (`:1002-1028`);
4. interactive panel shell (`:1029-1105`);
5. panel content wrapper (`:1106-1119`);
6. the sole `ExpandedPresentationSurface` mount (`:1120-1126`).

The panel shell applies `overflow:"hidden"` at `:1099`. This is the effective clip for the canvas
and all panel children.

### 2.2 Canvas size and position

`src/presentation/main-window/ExpandedPresentationSurface.tsx:791-805` renders one canvas:

- absolute `inset:0` (`:796-797`);
- `width:100%`, `height:100%` (`:799-800`);
- `pointerEvents:none` (`:801`).

Its containing wrapper is the 200×200 panel content wrapper, so its CSS domain is 200×200. It is
not a 228×228 canvas and cannot currently reach the gutter.

### 2.3 Backing store and WebGL domain

`ExpandedPresentationSurface.tsx`:

- clamps production DPR to `MAX_DPR=2` (`:14,569`);
- reads CSS dimensions from the canvas at `:566-575`;
- uses an absolute Lab backing-scale override or DPR at `:576-586`;
- sets `gl.viewport` to the full backing store at `:588`;
- passes the backing dimensions as `uResolution` at `:603`;
- clears to transparent and performs one draw at `:627-629`.

At DPR 2 the current 200×200 canvas becomes 400×400 backing pixels. A Lab 4× override becomes
800×800. The shader's normalized UV therefore maps to the 200×200 panel, not the 228 outer window.

## 3. Corners and Clipping

| Layer | Clip/corner behavior | Source |
|---|---|---|
| BrowserWindow | Full transparent 228 square; no repository-defined 200px native clip | `main.mts:660-684,2119-2127` |
| Viewport root | `overflow:visible` | `MainWindowPresentationSurface.tsx:980-988` |
| Shadow backdrop | transparent, `pointerEvents:none`, `overflow:visible` | `shared-styles.ts:106-122` |
| Panel shell | radius 16 continuous corner plus `overflow:hidden` | `MainWindowPresentationSurface.tsx:1095-1099`; `shared-styles.ts:80-104` |
| Canvas | no independent clip; inherits the panel-shell clip | `ExpandedPresentationSurface.tsx:791-805` |

`geometry.ts:68-76` and `ExpandedPresentationSurface.tsx:16-23,147-156` derive the same 200×200,
16px rounded geometry. The shader SDF is a renderer-local projection of the panel boundary, but the
DOM panel remains the visible and interactive geometry authority.

## 4. Shadow and Gutter Output

### 4.1 Shadow ownership

The Main Window does not use a native shadow (`main.mts:658,675`). A dedicated transparent shell
uses `getShadowBackdropStyle` (`shared-styles.ts:106-122`) and receives the theme's CSS box-shadow.
The dark full-panel shadow is defined at `ThemeContext.tsx:86`; the light variant is at `:89`.

The shadow is composited in the transparent area around the panel. The 14px gutter is therefore an
active visual-output region today.

The CSS shadow string does not mathematically prove the last non-zero composited pixel. Do not say
the full blur tail "fits exactly." Treat 14px as the available window budget and measure edge
clipping from real captures.

### 4.2 Can WebGL render outside the panel?

Yes at the BrowserWindow/viewport level, but not with the current mount:

- native and root DOM domains are 228×228;
- the root allows overflow;
- the canvas is non-interactive;
- the panel shell clips the current 200×200 canvas;
- the panel background is opaque (`shared-styles.ts:96-104`).

A future one-canvas spike needs a DOM/layer split that exposes 228×228 to the same canvas while
keeping real UI content clipped to the 200×200/r16 panel. This is not a native-size change.

## 5. Domain and Authority Separation

| Concept | Owner |
|---|---|
| Native/output bounds | Electron Main Window constants and BrowserWindow |
| Visible/interactive geometry | Real DOM panel shell and its content clip |
| Shadow | Existing CSS shadow backdrop |
| Travelling Thermal field | Current shader `sourceInfluence`; phase-driven and not the panel silhouette |
| Proposed latent silhouette | Exact static 200×200/r16 panel mask at outer offset `(14,14)` |
| Proposed processed fields | Renderer-owned inner/outer/contour channels derived only from that mask |
| Final FX | Existing single canvas/program/draw; pointer-events remain disabled |

The latent silhouette has no hit testing, layout, drag, lifecycle, or window authority. A second
visible inset rectangle remains prohibited.

## 6. Proposed Processed Domain

The repository can construct an exact source mask from existing constants:

```text
outer domain: 228×228
panel origin: (14,14)
panel size:   200×200
radius:       16
```

The new causality to test is:

```text
exact rounded-panel mask
    -> processed broad/narrow/contour channels
    -> inner / outer / contour scalar composition
    -> existing Ameow palette / output
```

This differs from the current travelling-source model. `sourceInfluence`
(`ExpandedPresentationSurface.tsx:167-204`) must not be relabeled as panel coverage.

Internal preprocessing may use padding wider than 14px for convolution correctness. Final visible
pixels are still clipped by the 228 BrowserWindow. If the desired halo exceeds 14px outside the
panel, that is first a visible-output-domain failure. A larger visible halo would ultimately need
larger native bounds, but this task and its future spike must not resize the window.

## 7. Paper Mechanics Adaptation

| Paper concept | Ameow decision |
|---|---|
| Source/image silhouette | Replace with the exact Ameow panel mask |
| Inner processed response | Adapt from the exact mask, not `sourceInfluence` |
| Outer processed response | Adapt into the real gutter and measure 228-edge clipping |
| Contour | Derive from the same mask; reject inset/perimeter readings |
| Scalar-to-color | Keep Paper-style causality, then use Ameow's accepted palette/output |
| React ShaderMount/sizing | Do not use |
| Paper logo/diamond/image-frame geometry | Do not use |
| Second renderer/canvas/pass/framebuffer | Do not use |

Current analytic fields are useful Ameow signals, not proof that Paper's processed inner/outer/
contour causality already exists. The new hypothesis requires direct debug evidence for each
channel.

## 8. Texture and Preprocessing Lifecycle

The accepted analytic Thermal fallback allocates no boundary texture
(`ExpandedPresentationSurface.tsx:545-546`), and current tests lock that baseline.

For the new hypothesis, one renderer-owned RGBA processed texture is the recommended minimal
candidate. Prior evidence already established a usable lifecycle:

- lazy Lab-only creation;
- CPU preprocessing;
- one sampler input to the existing draw;
- recreation after context restore;
- deletion on dispose;
- no default-path allocation;
- no framebuffer or second draw.

Evidence: archived `mr9-literal-reuse-map.md` §A4/C and `mr9-latent-carrier.md` §2.2/§7.

The old latent-carrier visual result was rejected for inset/moving-column morphology and weak real-
boundary participation. Its resource lifecycle is reusable; its geometry is not. The reopened exact
panel silhouette was not tested by that result.

An analytic substitute is acceptable only if debug views prove equivalent source → inner/outer/
contour channel causality.

## 9. License / NOTICE

Prior `mr9-literal-reuse-map.md` §D and `mr9-mechanics-adaptation.md` §6 remain authoritative.

- Current independently authored analytic Thermal code does not create a new Paper Apache-2.0
  delivery obligation.
- Copying or near-verbatim adapting Paper GLSL or preprocessing does require the Apache-2.0 license
  text, Paper NOTICE attribution, a prominent modification notice, a root
  `THIRD_PARTY_NOTICES.md` entry, and a source provenance/modification header.
- Ameow's root MIT license remains intact.
- Paper logo/diamond geometry remains prohibited regardless of licensing.

## 10. Minimal Falsifiable Spike Gates

| Gate | Falsification |
|---|---|
| Exact alignment | Source differs from the panel by >1 CSS px at edge probes or >0.5px in corner radius; any inset silhouette appears |
| Outer output | Halo remains clipped at 200px or target halo is visibly truncated at the 228 edge |
| Shadow/layering | Shadow disappears/doubles, panel content is hidden, or UI clip/hit behavior changes |
| Processed causality | Source, inner, outer, contour cannot be independently inspected or are driven by `sourceInfluence` |
| Renderer ownership | More than one canvas/program/draw, any framebuffer, default-path texture allocation, failed restore, or leak |
| Stable fallback | Paper mode off differs in pixels/resources from the accepted Thermal + Refraction checkpoint |
| Reduced Motion | Static spike continues time or schedules continuing frames |
| Platform composition | Windows transparent alpha is corrupt; macOS geometry differs, or unavailable macOS runtime evidence is reported as a pass |

## 11. Recommendation

**Continue, bounded, to one static Browser Lab spike after Architecture Lead approval.**

The repository proves that an exact panel-aligned latent mask and a 228 outer-domain experiment can
fit inside the existing renderer/native authority. It does not prove that the visual result will
work or that 14px is enough for the desired halo.

Abandon the direction if the spike produces an inset/second silhouette, perimeter frame, visible
halo truncation, shadow conflict, transparent-compositing failure, second renderer/draw, native
resize requirement, resource leak, or fallback regression. Do not add repair geometry or a generic
field/choreography framework.

## Acceptance Mapping

- AC1–AC2: §§1–4 establish outer/panel/gutter/canvas/clip/shadow truth and the required DOM change.
- AC3: §§5–6 separate the exact latent mask from UI authority and from `sourceInfluence`.
- AC4: §§7–9 cover Paper mechanics, preprocessing lifecycle, and licensing.
- AC5: §6 separates internal padding from the 14px visible-output budget and native resizing.
- AC6: §10 defines observable confirm/falsify gates.
- AC7: §11 recommends a bounded spike and stops before implementation.
