# Upstream Paper Heatmap Evidence

Checked: 2026-08-22.

## Reproducible Anchors

- npm latest: `@paper-design/shaders-react@0.0.80`
- npm React package gitHead: `60467401863c1917dd02016d0c1ff2f791d0b3c8`
- exact dependency: `@paper-design/shaders@0.0.80`
- current upstream main: `7002061d8389781a45e479584deeca0cf538474e`
- live demo: <https://shaders.paper.design/heatmap>
- React component at published commit:
  <https://github.com/paper-design/shaders/blob/60467401863c1917dd02016d0c1ff2f791d0b3c8/packages/shaders-react/src/shaders/heatmap.tsx>
- core shader/preprocessing at published commit:
  <https://github.com/paper-design/shaders/blob/60467401863c1917dd02016d0c1ff2f791d0b3c8/packages/shaders/src/shaders/heatmap.ts>
- official mount/lifecycle at published commit:
  <https://github.com/paper-design/shaders/blob/60467401863c1917dd02016d0c1ff2f791d0b3c8/packages/shaders/src/shader-mount.ts>
- current demo source:
  <https://github.com/paper-design/shaders/blob/7002061d8389781a45e479584deeca0cf538474e/docs/src/app/(shaders)/heatmap/page.tsx>

## Package and Compatibility

`@paper-design/shaders-react@0.0.80` has one dependency,
`@paper-design/shaders@0.0.80`. The core package has no dependencies. React `^18 || ^19` is the
runtime peer and optional `@types/react ^18 || ^19` is the type peer. Ameow's React 19.1.0 and type
packages satisfy these ranges. Both packages are ESM, side-effect-free, and Apache-2.0.

The current upstream main still declares 0.0.80. A targeted diff from published gitHead to current
main found no change to `packages/shaders-react/src/shaders/heatmap.tsx` or
`packages/shaders/src/shader-mount.ts`. The core Heatmap change removes an unused
`u_imageAspectRatio` uniform and updates comments; the current demo raises only the scale control's
minimum from 0.01 to 0.1. Preset, preprocessing, fragment behavior, and timing are unchanged.

## Official Demo and Defaults

Current demo source selects `heatmapPresets[0]`, initializes
`image='/images/logos/diamond.svg'`, and renders:

```tsx
<Suspense fallback={null}>
  <Heatmap {...params} colors={colors} image={image} suspendWhenProcessingImage />
</Suspense>
```

The official diamond is a transparent 1000×1000 SVG containing one black polygon. The live page
was inspected and Default was selected. Controls showed contour 0.50, angle 0, noise 0.00,
innerGlow 0.50, outerGlow 0.50, speed 1.00, scale 0.75, rotation 0, offsets 0, background black,
and seven cool-to-hot colors. Some live color-control hex strings differ by one or two RGB values
from the preset source (for example `#112069` versus `#11206a`). The current demo converts preset
colors through integer-rounded HSLA in `docs/src/helpers/use-colors.ts` and `color-utils.ts`, which
accounts for that display round-trip. It is not evidence of a different preset. Published package
source is authoritative for the exact input hex values:

`#11206a`, `#1f3ba2`, `#2f63e7`, `#6bd7ff`, `#ffe679`, `#ff991e`, `#ff4c00`.

Other sizing defaults are `fit='contain'`, origin `(0.5,0.5)`, world size `(0,0)`, and frame 0.

## Preprocessing and Composition

The React component resolves the image URL, calls official `toProcessedHeatmap`, converts the
result blob to an object URL, and passes it as `u_image` with mipmaps. `suspendWhenProcessingImage`
moves the same work into the official Suspense cache rather than changing the algorithm.

The core preprocessor:

- creates a 2D canvas using a 1000px source dimension;
- computes `maxBlur=floor(1000*0.15)` and padding `ceil(maxBlur*2.5)`;
- fills white, draws the image, and converts RGB luminance to gray;
- performs three-pass broad blur at `maxBlur`;
- performs three-pass inner blur at `round(0.12*maxBlur)`;
- performs one contour blur at radius 5;
- writes contour/broad/inner into R/G/B and alpha 255, then emits PNG.

The fragment shader keeps Paper's fixed image-coordinate transform, uses contour/inner/outer
morphology, drives three phase-shifted `shadowShape` evaluations from `t=0.1*u_time-0.3`, applies
the outer moving mask, then maps heat through the preset palette and background composition.

## Canvas and Animation Lifecycle

Official `ShaderMount` creates and prepends its own WebGL2 canvas and injects Paper's mount style.
It owns program, textures, mipmaps, resolution, minimum pixel ratio 2, maximum pixel count,
ResizeObserver, IntersectionObserver, visibility pausing, requestAnimationFrame, and disposal.
At speed 1, its `currentFrame` advances by real frame delta and `u_time` receives seconds. Speed 0
stops recurring RAF. This control experiment must not replace any of those behaviors.

## License

Both package tarballs ship Apache-2.0 LICENSE and the package NOTICE:

```text
Paper Shaders
Copyright 2026 Paper

Powered by Paper Shaders:
https://shaders.paper.design
```

Direct unmodified package use requires accurate third-party attribution. There is no need for a
prominent “modified file” notice because Ameow will not edit or vendor Paper source.
