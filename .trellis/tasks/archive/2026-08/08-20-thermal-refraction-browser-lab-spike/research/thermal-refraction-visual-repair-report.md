# Thermal Refraction Visual Repair Report

**Date:** 2026-08-21  
**Status:** repair, evidence, and validation complete; stopped before GPT Architecture Lead Review  
**Authoritative worktree:** `D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx`

## 1. Scope

This was a bounded visual repair of the existing Browser Lab-only Thermal Refraction spike. It did not reopen the effect architecture, accepted motion grammar, timing, palette system, lifecycle, or production integration.

The Orca Develop Worker changed only:

- `src/presentation/main-window/ExpandedPresentationSurface.tsx`;
- `src/presentation/main-window/expandedPresentationSurface.test.ts`.

## 2. Expanded refraction envelope

The former envelope concentrated most visible displacement at the warm frontier. The repaired gate uses the accepted signed field distance, contact signal, warm signal, and energy gate:

```glsl
float covered = 1.0 - smoothstep(0.0, 0.05, d);
float bodyFloor = covered * (1.0 - smoothstep(0.20, 0.85, warm));
float env = clamp(contact + warm * 0.60 + bodyFloor * 0.30, 0.0, 1.0) * energy;
```

This produces the intended hierarchy:

1. localized rounded-boundary contact is strongest;
2. the warm frontier remains strong;
3. the entire covered cool body retains a weaker, depth-independent `0.30` floor;
4. the effect is exactly absent when the accepted energy gate is zero.

The body floor is gated away from the warm frontier, so it extends the disturbance inward without turning the whole field into a uniform wobble or creating a perimeter ring.

## 3. Covered-body material layering

The displaced analytic sample now retains low-frequency structure through the covered body:

```glsl
float material2 = clamp(
  heat2 + coolLift2 + hotLift2 + bodyFloor * bend * 0.30,
  0.0,
  1.0
);
```

This reuses the accepted low-frequency `bend` value. It introduces no new palette, noise field, clock, phase, oscillator, or material authority. The contribution is small and body-gated, so the swept blue region gains gradual internal variation without becoming a high-temperature block.

`REFRACTION_EPS = 0.02` and `REFRACTION_STRENGTH = 0.16` were not changed in this repair.

## 4. Baseline and architecture preservation

- Accepted Thermal motion, contact, palette, material, edge, grain, alpha, and timing constants remain unchanged.
- Refraction-off still skips the additive gate and preserves the accepted baseline path.
- The implementation remains one `ExpandedPresentationSurface`, one canvas, one WebGL2 renderer/program, and one `gl.drawArrays` call.
- No texture, sampler, framebuffer, multipass, post-processing framework, second renderer, or second runtime was added.
- Refraction remains Lab-only and continues to use the existing Heatmap frame authority and `bendTime`.
- Reduced Motion remains a static pinned snapshot with `uTime = 0` and no continuing animation loop.

## 5. Visual evidence

Primary comparison sheets:

- `research/thermal-refraction-repair/baseline-vs-refraction.png`;
- `research/thermal-refraction-repair/before-vs-repair.png`.

Matched early, developed, developed-later, late-sweep, and Reduced Motion frames are stored in `research/thermal-refraction-repair/evidence/`. Every moving pair uses the same pinned time. `capture-log.json` records one canvas, one linked program, no bound texture, no framebuffer, and the expected Refraction uniform state for every frame.

Mean RGB delta between the accepted baseline and repaired Refraction confirms that displacement extends through the cool body while remaining weaker than the warm region:

| Phase | Warm delta | Cool-body delta | Dark/energy-free delta |
| --- | ---: | ---: | ---: |
| k 0.10 | 7.06 | 4.75 | 0.02 |
| k 0.25 | 4.16 | 2.83 | 0.01 |
| k 0.35 | 3.61 | 2.35 | 0.08 |
| k 0.50 | 3.89 | 1.78 | 0.79 |
| Reduced Motion | 5.55 | 2.40 | 0.49 |

The late-phase dark-mask numbers rise slightly because the accepted field approaches the mask threshold near the frame boundary, not because a full-screen effect was introduced. The difference sheets show the changed pixels following the travelled field rather than filling the inactive surface.

## 6. Cindy Lead visual judgment

**Preliminary PASS for the bounded repair.**

The repaired difference field is now continuous from localized contact and warm frontier into the lower-left covered blue body. The cool body disturbance is visible in amplified comparison evidence and remains deliberately subtle in the direct render, while contact/frontier deformation stays strongest. The covered region also retains more gradual low-frequency material variation instead of reading as a uniformly collapsed blue plane.

The effect remains secondary to the Thermal identity. Direct inspection found no full-screen wobble, concentric ripple, visible wave line, jelly deformation, fisheye/zoom, high-frequency shimmer, or uniformly hot covered block. No second tuning round was entered.

## 7. Validation

- Focused suite: **4 files / 70 tests passed**.
- `npm run type-check`: **pass**.
- `npm run lint -- --quiet`: **pass**.
- `git diff --check`: **pass**, with existing LF-to-CRLF conversion warnings only.
- Full suite: **199 / 200 files passed; 1772 / 1773 tests passed**.
- The sole failure remains the pre-existing `browser-extension/architecture-guard.test.js:277` source-shape assertion. No browser-extension file was changed by this spike or repair.
- Capture console output contained only the pre-existing React `borderColor`/`border` shorthand warning; no shader compile, link, or WebGL resource error occurred.

## 8. Stop condition

The repair, matched phase evidence, visual review, and validation are complete. No timing tuning, production integration, commit, Trellis archive, or further visual round was performed. Await GPT Architecture Lead Review.
