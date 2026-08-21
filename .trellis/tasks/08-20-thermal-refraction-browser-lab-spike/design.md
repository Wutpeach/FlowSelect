# Thermal Refraction Browser Lab Spike Design

## Authoritative Baseline

Work against the clean checkpoint `d4a5aea` in `D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx`. The accepted Thermal implementation is committed at `e01be01` and its MR9 task is archived at `a846c64`. Do not move the spike to `main` or fold unrelated changes into this work.

## Boundaries

The spike stays inside the current Browser Lab projection and the existing `ExpandedPresentationSurface` renderer. The Lab adds only a boolean Refraction choice to its synthetic heatmap preset. Production continues to omit the optional flag, so its shader uniform remains false. No semantic target or runtime state is added.

## Shader Data Flow

```text
existing k/front/bendTime
        |
existing d/body/warm/core/energy/capture
        +--> accepted material and palette path (unchanged)
        +--> local haze envelope (warm strongest, cool weaker, energy zero = off)
existing heatmapBend(q, bendTime)
        +--> low-frequency finite-difference direction
        +--> small analytic coordinate displacement
        +--> local blend only when Lab Refraction is true
```

### 2D Material Model Decision (2026-08-21)

Visual Review rejected both the former trailing-residual model and the later widened depth ramp. `behind`, depth, and distance from the frontier are formally dropped as the primary temperature/material coordinate. Motion and coverage answer only where the effect exists; a separate analytic 2D temperature field answers what temperature each covered point has.

The base temperature must be composed from a small bounded number of broad, smooth, low-frequency samples of the existing `heatmapBend` signal at transformed/offset 2D coordinates, all sharing the accepted `bendTime`. The result remains covered/energy gated and maps through the existing seven-stop palette. Frontier warmth and rounded-boundary contact are additive local biases over this base field, not its source of truth. No direct high-frequency noise/hash field, sampling loop, texture, hidden sweep-aligned gradient, or new clock is allowed.

The displacement shares the accepted `bendTime`, so moving mode has one temporal authority and Reduced Motion pins the entire deformation to the existing static snapshot. The maximum UV offset stays around one to two CSS pixels on the 200x200 preview at the warm frontier and lower in the cool body.

## Baseline Preservation Strategy

- Keep accepted scalar calculations, material ramp, alpha, grain, and edge repair unchanged in the Refraction-off path.
- Add a bounded analytic re-evaluation only for Refraction mode, then locally blend its material value into the accepted value.
- Do not alter `k`, `front`, `bendTime`, direction, body/warm/core constants, energy gate, rounded boundary, capture, palette stops, material lifts, or edge halo.
- Keep the baseline moving and Reduced Motion presets for A/B evidence.
- Preserve the Refraction-off production baseline, but do not preserve either rejected depth-driven distribution inside the Lab-only Refraction gate.
- Keep displacement strength/envelope unchanged while reworking only the displaced material scalar and its palette projection.

## Lab and Runtime Contract

Extend the existing heatmap preset model with a `refraction` boolean and add moving/static Refraction presets in the same category. The one `LabOverlayStage` forwards it to the one surface. No runtime change is expected: the existing heatmap flag owns moving frames, while Reduced Motion keeps `k = 0.42`, `bendTime = 0.0`, and zero pending frame loop.

## Validation

- Source-contract tests assert the Lab-only gate, causal signal use, fixed amplitude bound, unchanged baseline formulas, and architecture negatives.
- Scenario tests assert the two new presets and Reduced Motion composition.
- Runtime tests retain zero-loop Reduced Motion and one-pending-frame bounds.
- A Playwright harness records matched baseline/refraction phases and live WebGL resource evidence from the one canvas.

## Risks and Rollback

| Risk | Containment / rollback |
| --- | --- |
| Refraction is too weak to read | Adjust only the fixed displacement amplitude after captures. |
| Refraction looks like water/jelly/wobble | Reduce amplitude/frequency and tighten the warm/frontier envelope. |
| Baseline shifts when disabled | Require A/B capture and source assertions for the false path. |
| Shader cost increases unexpectedly | Keep one bounded analytic re-evaluation, one draw, and no sampling loop. |

Rollback removes only Refraction preset plumbing, uniform, shader block, tests, and new evidence.
