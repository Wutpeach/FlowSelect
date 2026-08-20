# Paper Shaders Heatmap — Visual Spike Research & Clean-Room Determination

Date: 2026-08-19
Scope: narrow MR9 "Paper Shaders Heatmap Visual Spike" — first minimal full-surface
Heatmap prototype in the existing Browser Lab, evaluated against the actual upstream
source/package (not the demo page).

## 1. Package identity and version (verified from the real npm artifact)

- npm package: `@paper-design/shaders`
- version inspected: `0.0.80` (the `latest` dist-tag at inspection time; the
  registry also lists `0.0.0-canary.a9965bd0`, `0.0.58-next.7`,
  `0.0.31-backbuffer-experiment.2`, `0.0.10-debug.4`)
- tarball: `paper-design-shaders-0.0.80.tgz` (215,971 bytes, 124 files) —
  downloaded from the npm registry and unpacked locally for this review
- package.json: `"license": "Apache-2.0"`, `"type": "module"`, zero runtime
  dependencies (`"dependencies": {}`), `files: ["dist", "LICENSE", "NOTICE"]`
- project banner in the shipped source header comment:
  `https://github.com/paper-design/shaders`

## 2. Verifiable source file

The published package is prebuilt ES modules under `dist/`. The embedded
sourcemap pins the exact upstream source file for Heatmap:

- `dist/shaders/heatmap.js` → sourcemap `sources: ["../../src/shaders/heatmap.ts"]`
- upstream repo: `https://github.com/paper-design/shaders`, path
  `src/shaders/heatmap.ts` (the packaged `dist/shaders/heatmap.js` is the
  compiled form of that file)
- related packaged files: `dist/shaders/heatmap.d.ts`, `heatmap.js.map`,
  `dist/shaders/lens-distortion.js` (recorded for completeness; the spike does
  not use Lens Distortion)

The LICENSE (`dist/../LICENSE`) is the full Apache License 2.0 text. The NOTICE
(`dist/../NOTICE`) reads:

```text
Paper Shaders
Copyright 2026 Paper

Powered by Paper Shaders:
https://shaders.paper.design
```

## 3. Actual upstream Heatmap mechanics (read from `heatmap.js`)

The effect is **image/mask driven**, not procedural:

1. **Preprocessing (CPU, `toProcessedHeatmap`)** — a source image is rasterized
   at up to 1000px and separated into three grayscale channels stored in one
   texture (`R = contour`, `G = outer blur`, `B = inner blur`) using
   `multiPassBlurGray` (box blur via summed-area table, 3 passes for the outer
   blur, 1 for contour).
2. **Fragment shader**:
   - `u_image` is sampled; `img.a == 0.` immediately outputs `u_colorBack`.
   - `shadowShape(uv, t, contour)` builds an animated procedural **shadow**
     silhouette from hard-coded circles — the shapes are explicitly an **Apple
     logo** (apple right circle, apple top circle, leaf mask, apple bottom
     circle, plus decorative balls). Three phase-offset copies run at
     `t = .1*u_time - .3`, `t+1/3`, `t+2/3`.
   - A 3×3 `blurEdge3x3` (weights 1/2/4/16) smooths the outer-blur channel via
     `textureGrad`.
   - `inner` heat = `0.8 + 0.8*innerBlur`, erased by the shadow copies, scaled
     by `u_innerGlow`; `outer` heat = `0.9*pow(outerBlur, .8)` times an animated
     vertical band, scaled by `u_outerGlow`. `heat = clamp(inner + outer, 0, 1)`.
   - A **hash-noise grain** is added:
     `heat += (.005 + .35*u_noise) * (fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453123) - .5)`
   - **Palette mapping**: up to ten RGBA colors (`u_colors[10]`), each
     premultiplied (`c.rgb *= c.a`), blended with
     `mixer = heat * u_colorsCount` and a per-stop `mix(gradient, c, m)` loop;
     output composites over `u_colorBack`.
   - `ShaderMount` / `ShaderSizingUniforms` supply the vertex sizing system
     (fit/scale/rotation/offset) — a whole runtime not present in Ameow.

### Reusable ideas (inspiration only)

- a single **scalar heat field** is the master driver of the whole look;
- **inner/outer/contour energy separation** (core energy vs. wide glow);
- a smooth **heat→color ramp** with multiple named stops;
- small **grain/noise** so flat gradients read as material.

### Structurally wrong for Ameow's one-pass host (not adopted)

- image/mask preprocessing pipeline (`toProcessedHeatmap`, CPU box blurs,
  multi-channel texture);
- Apple-logo-specific procedural shapes;
- `textureGrad`/`textureSize` scene-texture sampling;
- `ShaderMount` React/runtime + `ShaderSizing` vertex system;
- the exact sine hash expression
  `fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453123)`.

## 4. Copied vs clean-room determination

**Determination: CLEAN-ROOM inspiration. No upstream GLSL was copied, adapted,
or ported into this repository.**

- The Ameow spike shader is a self-contained branch in the existing single
  production fragment program. It builds its field from analytic moving
  sources + a sine-free polynomial hash/value-noise (a standard public GLSL
  folklore primitive, different expression family from Paper's sine hash), and
  maps it through a fixed piecewise stop ramp.
- No Paper expressions, helper functions, uniforms, texture channels, runtime,
  or React mount are present in this repository.
- The only shared high-level idea is "scalar heat → thermal color ramp", which
  is an unprotectable visual technique, not a copyrightable expression.

## 5. Adopted / not adopted and why

| Paper Heatmap feature | Adopted in spike | Reason |
| --- | --- | --- |
| scalar heat field as master driver | yes (analytic, clean-room) | the core of the required look: moving field, full-surface |
| heat→multi-stop color ramp | yes (fixed 7-stop ramp, clean-room) | required deep-blue/blue/cyan halo, yellow/orange frontier, pale-white core |
| grain/noise on flat areas | yes (mild, sine-free hash) | makes the field read as material without turbulence |
| inner/outer energy separation | partially (Gaussian core + broad halo term) | broad cool halo + restrained hot core |
| image preprocessing / texture channels | no | would need a second pass / texture — forbidden one-host constraint |
| Apple logo shapes | no | irrelevant; no border/arc/fire decorations |
| `ShaderMount` / `ShaderSizing` / React runtime | no | forbidden (no Paper React runtime mount) |
| Lens Distortion | no | out of spike scope; image post-process, 50 samples |

## 6. License risk

- `@paper-design/shaders@0.0.80` is Apache-2.0 with NOTICE ("Paper Shaders,
  Copyright 2026 Paper", https://shaders.paper.design). Apache-2.0 permits
  derivative works provided the license/NOTICE are retained and modifications
  are marked.
- Because the spike copies **no** upstream source (clean-room, per §4), no
  Apache-2.0 license/NOTICE distribution obligation is triggered.
- If a later MR9 slice decides to copy or closely adapt any Paper GLSL, the
  implementation gate stands: add the Apache-2.0 LICENSE text + NOTICE
  attribution + a prominent modification marker in the shader before shipping.
  This spike does not cross that line and therefore does not need them.

## 7. Repository-grounded anchors used for this round

- Browser Lab: `src/lab/` (entry `lab.html` → `src/lab/lab-main.tsx` →
  `PresentationLab.tsx` → `LabOverlayStage.tsx`), served by
  `vite.lab.config.ts` on `127.0.0.1:1421`.
- Single WebGL2 host: `src/presentation/main-window/ExpandedPresentationSurface.tsx`
  (one canvas, one `FRAGMENT_SHADER_SOURCE` program, `createGraphicsRenderer`).
- Single consumer-local runtime: `src/presentation/main-window/expandedPresentationRuntime.ts`.
- Existing lab validation harness: `research/run-browser-lab-validation.mjs`
  (Playwright Chromium against the Lab server).
- Existing thermal palette (unchanged by the spike):
  `src/presentation/main-window/thermalPalette.ts`.

## 8. Prototype & validation status (actual, end of spike)

### What was built (lab-only, single shader authority)

- Heatmap is a **lab-gated branch inside the existing single production
  fragment program** of `ExpandedPresentationSurface.tsx`: `uniform int
  uHeatmapMode;` (1 = heatmap on). Production never sets it; the surface prop
  and the runtime input both default to off, so production behavior is
  byte-for-byte unchanged.
- Lab scenario: `LAB_HEATMAP_PRESETS` (`heatmap-moving` with motion,
  `heatmap-reduced` forcing Reduced Motion), plus a Clear action. Heatmap mode
  keeps a valid progress/idle underlay and forces reduced-motion off/on as
  selected.
- Runtime: while `inputs.heatmap === true` the single runtime keeps at most
  **one** pending rAF (bounded scheduling); Reduced Motion heatmap renders one
  static snapshot with **zero** frames; removing the flag stops scheduling.

### Final shader design (after visual iteration)

- Field: two low-frequency drifting value-noise lobes
  (`0.62*n(q*1.15 + t*0.06) + 0.38*n(q*2.1 − t*0.05)`), contrast-curved via
  `clamp((lobe − 0.30) * 2.1, 0, 1)`, so ~1–2 soft lobes span the 200×200
  surface and read as one smooth moving heat material (not a ring/blob).
- Core: a small wandering bump (`0.32 * exp(−d²·45)`, orbit radius 0.15) that
  only raises the local peak; it never draws a second ring.
- Ramp: 7 stops — near-black navy → deep blue → blue → cyan (broad cool halo)
  → yellow → orange (thin frontier) → pale white (small core).
- Alpha: `mix(0.18, 0.95, smoothstep(0.0, 0.82, heat))` — only the hot core is
  near-opaque; large dark areas stay dim but covered.
- No perimeter/edge glow, no arcs/fire/lava/smoke, no lens distortion, no
  second canvas/renderer/runtime.

### Validation results

- `npx vitest run src/lab/scenarios.test.ts
  src/presentation/main-window/expandedPresentationRuntime.test.ts
  src/presentation/main-window/expandedPresentationSurface.test.ts
  src/lab/rendererReuse.test.ts` → **4 files / 58 tests passed** (incl. the 3
  new runtime scheduling tests: heatmap keeps ≤1 pending frame and stops when
  the flag is removed; turning the flag on starts scheduling; Reduced Motion
  renders once with 0 frames).
- `npm run type-check` → **PASS** (tsc --noEmit + tsconfig.electron.json).
- `npm run lint -- --quiet` → **PASS** (0 problems).
- Browser Lab run (standalone Playwright Chromium vs `127.0.0.1:1421/lab.html`;
  the throwaway spike script was deleted at close-out per instruction, results
  preserved here):
  - Load: `canvasCount === 1`, production WebGL2 program linked, no page
    errors.
  - `heatmap-moving`: `uHeatmapMode=1`, `uReducedMotion=0`; screenshot pixel
    buckets — large dark areas **65%**, broad cool (deep-blue/blue/cyan) halo
    **6%** and clearly larger than the warm frontier, yellow/orange frontier
    present, warm/core buckets shift over 800 ms (field animates).
  - `heatmap-reduced`: `uHeatmapMode=1`, `uReducedMotion=1`; static snapshot
    identical across 600 ms (no travel).
  - **Known nuance:** the strict "restrained pale core" bucket (pixels with
    r>230, g>210, b>185) read **0%** at the captured moment — visual review of
    `mr9-heatmap-moving.png` shows the smooth lobe field with a pale cream
    core that at that instant sat near the right edge (partially clipped by the
    frame), i.e. still larger/more peripheral than ideal. Tuning was stopped at
    close-out; a later slice should cap the lobe contribution so pale-white
    only forms at the small wandering core.
- Screenshots: `research/mr9-heatmap-moving.png`, `research/mr9-heatmap-reduced.png`.

### How to run in the Browser Lab

```
npm run dev:lab          # serves http://127.0.0.1:1421/lab.html
```

Open the Lab → **Heatmap Spike / 热力图实验** category → try the
`heatmap-moving` / `heatmap-reduced` presets and Clear.

### Composition (no new authority)

- Exactly one `<canvas>` and one `gl.drawArrays(` in the host; Lab contains no
  shader/canvas/renderer sources (rendererReuse tests enforce this).
- Production files untouched outside the listed heatmap additions; the uniform
  defaults off in production.

### Changed files (uncommitted, kept for review)

- `src/presentation/main-window/ExpandedPresentationSurface.tsx`
  (shader branch + lab-only `heatmap?: boolean` prop + uniform plumbing)
- `src/presentation/main-window/expandedPresentationRuntime.ts`
  (`heatmap?: boolean` input, bounded rAF scheduling)
- `src/presentation/main-window/expandedPresentationRuntime.test.ts` (3 new
  scheduling tests)
- `src/presentation/main-window/expandedPresentationSurface.test.ts`
- `src/lab/scenarios.ts`, `src/lab/scenarios.test.ts` (presets/actions/state)
- `src/lab/LabOverlayStage.tsx` (passes `heatmap`)
- `src/lab/PresentationLab.tsx` (Heatmap Spike category UI + readout)
- `src/lab/locales/en.json`, `src/lab/locales/zh-CN.json` (heatmap keys only)
