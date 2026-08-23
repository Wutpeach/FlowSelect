# Paper Source-Level Interior Adaptation Implementation Report

## Outcome

The single approved Paper 0.0.80 derivative candidate was implemented and
validated only in the isolated Browser Lab. Automated source-fidelity,
runtime, disposal, license, and Production-isolation gates pass.

The selector inversion does move Paper's native animated field into the
central 200x200/r16 panel interior. However, the resulting morphology is
predominantly a broad horizontal hot/cold band sweeping vertically through
the panel. This strongly matches the explicit Hard Stop condition `generic
scrolling band`.

**Minimum adaptation result: NO-GO / CLOSED.** GPT Architecture Lead Review
accepted the implementation and validation as valid, confirmed the broad
generic scrolling-band failure, and closed this candidate. No second source
change, tuning pass, visual compensation, custom carrier, or Production
proposal was attempted.

The committed result is a **research checkpoint**, not a Production candidate
or an integration baseline.

## Implemented Boundary

Only the following source expression differs from the pinned official
fragment:

```glsl
// Paper 0.0.80 official
float outerBlur = 1. - mix(1., img[1], shape);

// Isolated Ameow derivative
float outerBlur = 1. - mix(1., img[1], 1. - shape);
```

The Lab-local derivative module copies the complete official fragment and
carries a prominent Apache-2.0 modified-file and provenance notice. Restoring
the selector produces an exact string match with the installed official
fragment.

Authority:

- `@paper-design/shaders-react@0.0.80`
- `@paper-design/shaders@0.0.80`
- npm gitHead `60467401863c1917dd02016d0c1ff2f791d0b3c8`
- core integrity
  `sha512-pcabvt5xDlFoEhpjUj4b1tGJMfqb0i5mXifWMNQf6z7FoOJYxYDo7F8R6k0JAh5D/7ouxjX5+N0cIq5WURyQ1Q==`
- official extracted fragment SHA-256
  `aed7c0431d3c2830db271e43309d21f58e71b85fb0d7531d7e8879d5c208d131`

## Source-Faithful Surface

The derivative adapter continues to use package-owned:

- `toProcessedHeatmap`
- `getShaderColorFromString`
- `defaultObjectSizing` and `ShaderFitOptions`
- React `ShaderMount`, including its RAF, observers, textures, mipmaps, and
  disposal

It mirrors Paper Default values for scale, speed, frame, contour, angle,
noise, inner glow, outer glow, palette, and sizing. It also follows the
official non-suspending wrapper's `useLayoutEffect` image-processing path.
The initial empty image is resolved by Paper `ShaderMount` to Paper's own
transparent pixel. Object URL handling is left source-faithful to the pinned
official wrapper.

Untouched behavior includes the complete preprocessing grammar, coordinates,
`shadowShape`, time multiplier and phases, animated mask, amplitudes, heat
sum, noise, palette interpolation, alpha/background composition, and runtime
lifecycle.

## Browser Lab Boundary

The new `paperInterior` category mounts exactly two side-by-side candidates:

1. Published Paper 0.0.80 `Heatmap` control.
2. The one-selector derivative.

Each candidate occupies one real 200x200/r16 Ameow panel. Both use the
accepted r16 computational silhouette and transparent `colorBack`. The mode
adds no filter, blend mode, mask, output postprocess, Thermal, Refraction, or
Production preview.

## Runtime and Central-Interior Evidence

Samples were taken after a 6.5-second preprocessing settle, then at observed
wall-clock offsets 0.000, 3.013, 6.010, 9.016, and 12.013 seconds.

| Offset | Official central RGB mean / hash | Derivative central RGB mean / hash |
| --- | --- | --- |
| 0s | `41.97 / abec4f05` | `182.39 / 8e662d44` |
| 3s | `41.97 / abec4f05` | `184.98 / 78c92d75` |
| 6s | `41.97 / abec4f05` | `172.97 / ea232ffa` |
| 9s | `41.97 / abec4f05` | `150.32 / 1ea4ed9d` |
| 12s | `41.97 / abec4f05` | `124.94 / f2714fff` |

The official control's central 40% remains visually dark while its exterior
field moves. Every derivative central hash differs, and the derivative's
native frame advances from `6901.7` to `18917.9`. This proves sustained
central-interior change rather than a static center or perimeter-only result.

Runtime topology:

- settled: 2 Paper mounts, 2 Paper canvases, 2 panels, 0 Production previews
- both viewport CSS sizes: exactly `200x200`, radius `16px`
- switch away: both original canvases disconnected, 0 Paper mounts, 1
  Production preview restored
- switch back: exactly 2 fresh Paper mounts and canvases, 0 Production
  previews

## Visual Hard Stop Assessment

The derivative retains Paper's blue, cyan, yellow, and orange palette and the
official source timing. It visibly fills the center and changes continuously.
The five-frame sequence nevertheless reads mainly as a wide, horizontally
stratified band traversing vertically. The source-fidelity reviewer reached
the same conclusion independently.

Changing that morphology would require a prohibited second source/material
change or tuning. The experiment therefore stops at NO-GO under the approved
Hard Stop. GPT Architecture Lead Review confirmed that assessment and closed
the candidate.

## License and Provenance

- The derivative file identifies Paper 0.0.80, upstream source path, npm
  gitHead, integrity, retrieval date, and Ameow's exact modification.
- `THIRD_PARTY_NOTICES.md` records active dev-only derivative status and the
  modified file.
- Paper's NOTICE is reproduced readably.
- The full Apache License 2.0 text is reproduced.
- Attribution states that the derivative is not official Paper work and does
  not imply endorsement.

## Production Isolation

- Changed implementation paths are confined to `src/lab/` and
  `THIRD_PARTY_NOTICES.md`.
- The packaged renderer entry remains `index.html`; `lab.html` is excluded.
- Production `dist` contains zero matches for derivative module names, the
  modified shader expression, Paper package identifiers, or Paper branding.
- The stable Thermal checkpoint worktree remains clean and unchanged.

## Validation

| Gate | Result |
| --- | --- |
| Focused Paper/Lab tests | PASS, 39/39 |
| Type check | PASS |
| ESLint quiet | PASS |
| Renderer build | PASS |
| Production identifier scan | PASS, 0 matches |
| Browser runtime and disposal probe | PASS |
| Visual 0/3/6/9/12s capture | COMPLETE |
| `git diff --check` | PASS, CRLF conversion warnings only |
| Full test suite | 1822/1823; one unrelated baseline failure |

The sole full-suite failure is
`browser-extension/architecture-guard.test.js` at line 277. The exact failure
reproduces in the clean stable Thermal checkpoint, so it is not introduced by
this derivative.

## Evidence

- `artifacts/implementation/paper-interior-0-12s-contact-sheet.png`
- `artifacts/implementation/official-00s.png` through `official-12s.png`
- `artifacts/implementation/derivative-00s.png` through `derivative-12s.png`
- `artifacts/implementation/comparison-00s.png` through `comparison-12s.png`
- `artifacts/implementation/browser-validation.json`
- `artifacts/implementation/validate-paper-interior.mjs`

## Stop State

Implementation, validation, and Architecture Review are complete. Closure is
authorized only to commit the isolated Browser Lab research checkpoint,
archive the Trellis task, and record the journal. No Production integration,
branch integration, Paper adaptation continuation, or Ripple implementation
is authorized.
