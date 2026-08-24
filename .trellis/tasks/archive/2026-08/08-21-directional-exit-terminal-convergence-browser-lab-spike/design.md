# Directional Exit / Terminal Convergence Design

## Architecture Boundary

The spike stays inside the existing Browser Lab heatmap/refraction shader path. The current renderer time remains the only motion authority. Production targets, Presentation policy, lifecycle state, Download state, and native window authority stay untouched.

## Architecture Decision Delta

The first spike used a moving trailing half-plane (`trailingFront`/`trailingD`) as the exit mechanism. GPT Architecture Lead inspection rejected it: it read as a hard diagonal moving mask/wipe over stationary material. The repair replaces the half-plane with a renderer-local coordinate transform and demotes coverage to soft containment.

## Convergence Causality

The accepted travelling phase `k` and diagonal field coordinate already determine entry and developed coverage. Extend that same scalar progression past the developed interval:

```text
existing time / Reduced Motion snapshot
        -> existing k and lower-left to upper-right diagonal coordinate
        -> exitProgress = (k - 0.58) / 0.42 (exactly zero at developed and RM)
        -> transformed material coordinate qExit:
             + translation toward upper-right terminal direction (- DIR * travel)
             + anisotropic resample scale about the terminal (along DIR > across)
        -> the SAME qExit feeds p/bend/d/body/warm/core and the Refraction
           grad/d2/topology samples, so Thermal and Refraction move and
           compress together
        -> broad soft elliptical containment (residue/terminal cleanup only)
        -> existing Thermal material + Refraction only inside that region
```

The leading edge continues beyond the upper-right while the whole field visibly slides and packs toward the terminal. No reverse phase, second clock, perimeter path, moving half-plane, or closure geometry is required.

## Soft Containment and Terminal Cleanup

Spatial coverage is a broad anisotropic elliptical falloff around the terminal that deepens and tightens as `exitProgress` grows; it stays a smooth falloff and never forms a hard edge or half-plane. Only when the field has converged to the upper-right terminal region may a short scalar cleanup (`terminalCleanup`) suppress the final subpixel residue. This cleanup multiplies the already-local remaining coverage and never fades a developed full field.

## Locked Material Path

Do not change the accepted seven-stop palette, 2D temperature coordinate field, material lifts, grain, Refraction displacement/envelope/strength, or boundary-contact formulas. The coordinate transform changes only WHERE the accepted field is resampled; at `exitProgress == 0` the accepted field and Reduced Motion snapshot are byte-identical.

## Reduced Motion

Reduced Motion keeps the existing pinned phase and zero continuing frames. It must not be forced through an animated exit. Source-contract tests continue to prove its static snapshot and single runtime authority.

## Rollback

Rollback is shader-local plus tests/evidence: set `exitProgress` to a constant zero (or remove the transform) and the soft containment, leaving the accepted Thermal + Refraction checkpoint unchanged.
