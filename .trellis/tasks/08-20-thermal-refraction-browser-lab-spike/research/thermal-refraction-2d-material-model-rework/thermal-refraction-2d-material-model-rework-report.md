# Thermal Refraction 2D Material Model Rework Report

Date: 2026-08-21  
Status: implementation and visual spike complete; stopped before commit/archive, timing tuning, or production integration; awaiting GPT Architecture Lead Review.

## Outcome

The Refraction-on Thermal material topology no longer uses `behind`, depth, or distance from the travelling frontier as its primary temperature coordinate. Coverage and temperature now have separate jobs:

```text
existing sweep / covered mask / energy
        -> where Thermal exists

three broad transformed heatmapBend samples, shared bendTime
        -> 2D base temperature topology
        + frontier warm bias
        + rounded-boundary contact hot bias
        -> existing seven-stop Thermal palette
```

The accepted motion, coverage progression, rounded-boundary contact, displacement direction, Refraction strength/envelope, Reduced Motion semantics, and renderer/runtime authority remain unchanged.

## Implementation

The material model is contained inside `if (uRefractionMode != 0)` in `ExpandedPresentationSurface.tsx`.

### Broad 2D base field

Three distinct coordinate frames feed the existing low-frequency `heatmapBend` with the same `bendTime`:

```glsl
vec2 pa = vec2(0.8 * q.x - 0.6 * q.y, 0.6 * q.x + 0.8 * q.y)
  * 2.2 + vec2(0.30, -0.20);
vec2 pb = vec2(q.x + 0.45 * q.y, q.y - 0.35 * q.x)
  * 2.8 + vec2(-0.25, 0.35);
vec2 pc = vec2(q.x * 1.7, q.y * 0.9)
  * 1.6 + vec2(0.10, 0.40);

float baseA = heatmapBend(pa, bendTime) * 16.0;
float baseB = heatmapBend(pb, bendTime) * 16.0;
float baseC = heatmapBend(pc, bendTime) * 16.0;
float baseT = clamp(
  baseA * 0.45 + baseB * 0.35 + baseC * 0.20,
  -1.0,
  1.0
);
float baseTemperature = clamp(0.5 + 0.5 * baseT + 0.24, 0.0, 1.0);
```

Rotation, shear/axis mixing, and anisotropic scale prevent the field from becoming another hidden sweep-aligned gradient. The samples remain broad and smooth; no new hash/noise primitive, clock, phase, oscillator, loop, texture, or framework was added.

### Palette projection and local hot biases

```glsl
float material2 = clamp(
  mix(0.08, 0.93, baseTemperature)
    + warm2 * 0.18
    + contact2 * 0.22,
  0.0,
  1.0
) * covered2;
```

The 2D field owns the base topology. `warm2` is a secondary frontier bias and `contact2` is the stronger localized boundary-contact bias. Both increase temperature locally without determining the color layout of the covered body. The existing seven-stop `HEAT_STOP` ramp remains the only palette.

### Material visibility versus displacement strength

The displacement still uses the locked envelope and strength:

```glsl
const float REFRACTION_STRENGTH = 0.16;
float env = clamp(
  contact + warm * 0.60 + bodyFloor * 0.30,
  0.0,
  1.0
) * energy;
float s = REFRACTION_STRENGTH * env;
```

Material visibility is separately gated by coverage and energy:

```glsl
float materialMix = covered2 * energy;
rgb = mix(rgb, rgb2, materialMix);
alpha = mix(alpha, alpha2, materialMix);
```

This separation is required because using the weaker body Refraction envelope as the material blend weight kept about 70% of the rejected blue baseline in the covered body. It does not increase distortion amplitude; it only lets the new material topology become visible wherever the active field exists. `energy == 0` leaves the baseline output unchanged.

## Matched visual evidence

The capture set fixes the same phases for the current rejected version and the 2D rework:

| Phase | `k` | Rejected version | 2D rework |
| --- | ---: | --- | --- |
| Early frontier | 0.10 | `evidence/refraction-k010.png` in previous evidence root | `evidence/refraction-k010.png` |
| Developed | 0.25 | `evidence/refraction-k025.png` in previous evidence root | `evidence/refraction-k025.png` |
| Developed later | 0.35 | `evidence/refraction-k035.png` in previous evidence root | `evidence/refraction-k035.png` |
| Late sweep | 0.50 | `evidence/refraction-k050.png` in previous evidence root | `evidence/refraction-k050.png` |
| Reduced Motion | 0.42 | `evidence/refraction-reduced.png` in previous evidence root | `evidence/refraction-reduced.png` |

Evidence roots:

- Rejected distance-driven version: `../thermal-refraction-material-distribution-repair/`
- Current 2D rework: `./`
- Direct matched comparison sheet: `before-vs-repair.png`
- Accepted baseline versus current Refraction: `baseline-vs-refraction.png`
- Runtime/resource capture log: `evidence/capture-log.json`
- Pixel comparison summaries: `evidence/analysis.json` and `evidence/repair-analysis.json`

Direct developed/later/late frames now show large curved blue/cyan lobes embedded in yellow/orange regions, rather than a temperature ramp that necessarily cools with distance from a thin warm frontier. Orange/red-orange is present in the covered body but is not a full-frame uniform hot wash; the negative lobes remain blue. The transition is broad and smooth, with no small speckle, checkerboard, stripe, ripple, or inset geometry.

## Cindy Lead visual judgment

1. **Is temperature topology no longer distance-from-frontier-driven? Yes.** The shader contains no `behind2` or `depthT` material coordinate, and matched phases show curved 2D temperature boundaries that do not follow the travelling frontier.
2. **Is the covered region genuinely a 2D multi-temperature field? Yes.** Developed, developed-later, late-sweep, and Reduced Motion direct frames show broad blue/cyan/yellow/orange regions within the same covered area, with localized hotter peaks.
3. **Is a visible warm-frontier / blue-body division still present? No as the governing topology.** The frontier/contact remains locally hotter as required, but warm material also occupies broad swept-body regions and the body is no longer a uniform blue fill separated by one warm stripe.

Preliminary Cindy Lead verdict: **Visual PASS for this bounded spike**, pending GPT Architecture Lead Review. This is not a production approval or final timing/material sign-off.

## Reduced Motion and architecture evidence

- Moving captures: `uHeatmapMode=1`, `uRefractionMode=1`, linked WebGL program.
- Reduced Motion capture: `uReducedMotion=1`, `uTime=0`, and `timeFrozen=true` after 500 ms.
- Every capture: one canvas, 400x400 backing buffer for the 200x200 preview, no bound 2D texture, no framebuffer.
- Source contracts retain one `<canvas>`, one `gl.drawArrays`, one WebGL2 program, and no sampler/texture/framebuffer/multipass path.
- Refraction stays Browser Lab-only. Production callers, targets, lifecycle, policy, and timing were not changed.

## Validation

| Check | Result |
| --- | --- |
| Focused Vitest (`surface`, `runtime`, `scenarios`, `rendererReuse`) | 70/70 passed |
| `npm run type-check` | passed |
| `npm run lint -- --quiet` | passed |
| `git diff --check` | passed; CRLF conversion warnings only |
| Full `npm test` | 1772/1773 passed |

The only full-suite failure remains the pre-existing source-shape assertion at `browser-extension/architecture-guard.test.js:277` (`return false` listener-tail expectation). No browser-extension file was touched by this spike. Browser capture also retains the known React shorthand/longhand `border`/`borderColor` console warning; it is unrelated to Thermal rendering.

## Execution channels

- **Orca Worker `develop`** (Pi / `deepseek-v4-flash` / MAX): shader and source-contract test implementation, bounded constant iterations, focused verification.
- **Cindy Lead**: decision override in Trellis task docs, simplify/diff review, five matched phase captures, direct-image visual judgment, final validation, and this report.

## Stop state

No commit, Trellis archive, timing tuning, production integration, Perimeter Chase, Opposite Closure, Mask/Noise Dissolve, or generic material framework work was performed. The worktree remains intentionally uncommitted for GPT Architecture Lead Review.
