# Thermal Refraction Trailing Residual Repair Report

**Date:** 2026-08-21  
**Status:** bounded repair, matched evidence, and validation complete; stopped before GPT Architecture Lead Review  
**Authoritative worktree:** `D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx`

## 1. Repair focus

This round did not increase Refraction displacement. It repaired the displaced analytic material carrier inside the existing Lab-only Refraction gate so the swept body keeps a longer residual heat gradient instead of quickly collapsing into a broad uniform blue plane.

The source repair changed only:

- `src/presentation/main-window/ExpandedPresentationSurface.tsx`;
- `src/presentation/main-window/expandedPresentationSurface.test.ts`.

## 2. Covered-body residual heat

One smooth scalar term was added before `material2`:

```glsl
float trailing = bodyFloor * (1.0 - smoothstep(0.15, 0.45, warm2))
  * exp(-behind2 * 0.30) * (1.0 + bend * 2.0) * energy;
float material2 = clamp(
  heat2 + coolLift2 + hotLift2
    + bodyFloor * bend * 0.30
    + trailing * 0.12,
  0.0,
  1.0
);
```

The slower `exp(-behind2 * 0.30)` falloff preserves residual material much farther behind the frontier than the accepted `body2` falloff of `exp(-behind2 * 1.1)`. The existing low-frequency `bend` adds only bounded local variation. The existing `bodyFloor` and `energy` keep the contribution inside the covered active field.

The `warm2` gate suppresses this residual at the orange/red-orange frontier and contact peak. The frontier therefore keeps its accepted identity while the swept body gains a longer deep blue, vivid blue, cyan/light-blue, subordinate yellow, and localized warm-residue transition.

## 3. Frontier and body balance

- Frontier/contact formulas and peak colors were not increased.
- Refraction displacement remains `REFRACTION_STRENGTH = 0.16` with `REFRACTION_EPS = 0.02`.
- The accepted envelope remains `contact + warm * 0.60 + bodyFloor * 0.30`, multiplied by `energy`.
- Only the displaced `material2` sample receives the new trailing contribution.
- The existing seven-stop `HEAT_STOP` palette is reused without new stops or a second palette.

This changes the material distribution rather than hiding the problem behind stronger distortion.

## 4. Architecture and baseline preservation

- Accepted Thermal motion, timing, palette, material, edge, grain, alpha, and contact constants remain unchanged outside the Refraction gate.
- Refraction-off preserves the accepted baseline path.
- The implementation remains one `ExpandedPresentationSurface`, one canvas, one WebGL2 renderer/program, and one draw.
- No texture, sampler, framebuffer, multipass, second runtime, clock, phase, oscillator, noise field, inset shape, UI frame, or internal geometry was added.
- The effect remains Lab-only.
- Reduced Motion remains a static pinned snapshot with `uTime = 0` and no continuing frame authority.

## 5. Matched visual evidence

Primary sheets:

- `research/thermal-refraction-trailing-repair/baseline-vs-refraction.png`;
- `research/thermal-refraction-trailing-repair/before-vs-repair.png`.

The second sheet compares this round directly against the preceding covered-body envelope repair. Matched early, developed, developed-later, late-sweep, and Reduced Motion PNGs plus `capture-log.json` are under `research/thermal-refraction-trailing-repair/evidence/`.

The previous-to-current comparison shows the largest material change in the cool swept body. Cool-body luminance spread increases at every sampled phase:

| Phase | Previous cool luma spread | Repaired cool luma spread |
| --- | ---: | ---: |
| k 0.10 | 16.05 | 18.68 |
| k 0.25 | 17.15 | 18.54 |
| k 0.35 | 22.27 | 22.85 |
| k 0.50 | 23.34 | 23.79 |
| Reduced Motion | 23.26 | 23.65 |

Capture readout confirms one canvas, one linked program, no bound texture, no framebuffer, identical pinned time for each moving pair, and frozen time for Reduced Motion.

## 6. Cindy Lead visual judgment

**Preliminary PASS for this bounded repair.**

Direct matched captures now show a longer and more legible thermal gradient through the swept body. The covered region reads as layered deep/vivid blue into lighter blue-cyan with a restrained trailing warm presence, instead of a single blue fill. The amplified delta makes the continuous active-region carrier and low-frequency local variation clear.

The strongest orange/red-orange remains at frontier/contact. The direct render does not become a large orange slab, and the material transitions remain soft rather than hard-banded. Because the existing whole-region Refraction gradient is unchanged, its presence is easier to perceive through the richer material carrier without making distortion itself more dominant.

No full-screen wobble, ripple, wave line, jelly deformation, fisheye, high-frequency shimmer, perimeter ring, inset shape, UI frame, or internal geometry was observed. No further tuning round was entered.

## 7. Validation

- Focused suite: **4 files / 71 tests passed**.
- `npm run type-check`: **pass**.
- `npm run lint -- --quiet`: **pass**.
- `git diff --check`: **pass**, with existing LF-to-CRLF conversion warnings only.
- Full suite: **199 / 200 files passed; 1773 / 1774 tests passed**.
- The sole failure remains the pre-existing `browser-extension/architecture-guard.test.js:277` source-shape assertion. No browser-extension file was changed.
- Capture console output contained only the pre-existing React `borderColor`/`border` shorthand warning; no shader compile, link, or WebGL resource error occurred.

## 8. Execution channels and stop condition

- Orca Worker `develop`: two-file shader/test repair and focused validation.
- Cindy Lead: diff and simplification review, capture harness comparison update, matched captures, visual judgment, full validation, and report.

No timing tuning, production integration, commit, Trellis archive, or further visual round was performed. Await GPT Architecture Lead Review.
