# Directional Exit / Terminal Convergence Repair Report

Date: 2026-08-21  
Status: **REJECTED — abandoned visual experiment.** The GPT Architecture Lead rejected the visual result; the failed product-code prototype was restored to the accepted checkpoint `8a80474` and was NOT accepted into product code. All planning, reports, captures, validation, and failure evidence are retained in this task directory.

## Final disposition: GPT Architecture Lead REJECT

The GPT Architecture Lead performed the final visual review of the full-resolution recapture (all eight states, including upper-right-terminal and just-before-zero). **Decision: REJECT.** This is the authoritative outcome for this task and **supersedes the earlier Cindy Lead Visual PASS** recorded below (that section is retained only as historical evidence).

- **Failure reason:** the visual result was not accepted by the GPT Architecture Lead for product integration.
- **Restoration decision:** the prototype was restored and not accepted into product code. Only the two product/test files were restored from the accepted stable checkpoint `8a80474`:
  - `src/presentation/main-window/ExpandedPresentationSurface.tsx`
  - `src/presentation/main-window/expandedPresentationSurface.test.ts`
- **No implementation commit:** no Directional Exit implementation commit exists or was created; the worktree diff for the task was limited to the two files above plus the untracked task directory.
- **Retained evidence/validation:** all eight full-resolution captures, capture log, sequence sheet, and validation results (focused Vitest 61/61, `npm run type-check`, `npm run lint -- --quiet`, `npm test` 1773/1774 with the sole pre-existing `browser-extension/architecture-guard.test.js:277` assertion failure, `git diff --check`) are preserved under `research/directional-exit/` and in this task directory.
- **Disposition metadata:** `outcome=rejected`, `disposition=abandoned_visual_experiment`, `architecture_lead_review=reject`, `restored_checkpoint=8a80474`.

---

The sections below are retained verbatim as the historical record of the experiment, its evidence, and the superseded Cindy Lead review.

## Architecture decision delta

The rejected spike used a travelling trailing half-plane as the primary exit mechanism. It cleared pixels from lower-left to upper-right while the remaining Thermal material stayed largely fixed, so direct inspection read it as a diagonal wipe.

The repair removes `trailingFront`, `trailingD`, `leadingCoverage`, `remainingCoverage`, and `activeCoverage`. The existing `k`, `DIR`, and `bendTime` now drive a renderer-local material-coordinate transform:

```glsl
float exitProgress = clamp((k - 0.58) / 0.42, 0.0, 1.0);
float exitTravel = exitProgress * 0.5;
float exitScaleAlong = mix(1.0, 3.0, exitProgress);
float exitScaleAcross = mix(1.0, 2.2, exitProgress);
vec2 qExit = EXIT_TERMINAL
  + DIR * (exitAlong * exitScaleAlong)
  + DIR_ACROSS * (exitAcross * exitScaleAcross)
  - DIR * exitTravel;
```

The same `qExit` feeds the accepted Thermal body/frontier, the 2D multi-temperature topology, and Refraction finite-difference/resample paths. Remaining material therefore translates toward upper-right and compresses anisotropically as one field.

Coverage is subordinate soft containment. Its center continues along the same travelling direction and passes outside the upper-right rounded boundary:

```glsl
vec2 exitCenter = EXIT_TERMINAL + DIR * (exitProgress * 0.16);
vec2 containRel = q - exitCenter;
float containAlong = dot(containRel, DIR);
float containAcross = dot(containRel, DIR_ACROSS);
```

The containment edge uses the existing `heatmapBend` grammar for a soft irregular boundary. Because its center moves outside the window, the terminal is a partial field fragment clipped by the real rounded boundary, not a closed ellipse/icon shrinking at an interior point. `terminalCleanup = 1.0 - smoothstep(0.95, 0.99, k)` only removes final subpixel residue.

At `exitProgress == 0`, including the Reduced Motion snapshot at `k=0.42`, `qExit == q` and containment is inactive. The accepted developed/RM material is unchanged.

## Locked invariants

Unchanged:

- travelling `k`, `DIR`, and `bendTime` causality;
- accepted seven-stop palette and 2D multi-temperature topology;
- accepted Refraction strength, envelope, and displacement model;
- rounded-window boundary and Reduced Motion semantics;
- one `ExpandedPresentationSurface`, canvas, WebGL2 program, draw call, and renderer-local runtime;
- Browser Lab-only scope and production call sites.

No clock, lifecycle authority, renderer, scheduler, dependency, scene/layer system, or choreography framework was added.

## Evidence

Evidence directory: `research/directional-exit/evidence/`

The sequence sheet contains all eight required states in order:

| State | `k` | Active | Lower-left active | Active bounds |
| --- | ---: | ---: | ---: | --- |
| Developed | 0.55 | 100.00% | 40,000 | (0,0)-(399,399) |
| Convergence onset | 0.62 | 100.00% | 40,000 | (0,0)-(399,399) |
| Exit early | 0.70 | 44.58% | 1,087 | (134,40)-(399,399) |
| Exit middle | 0.78 | 19.27% | 0 | (220,182)-(399,399) |
| Exit late | 0.86 | 9.78% | 0 | (268,255)-(399,399) |
| Upper-right terminal | 0.92 | 5.16% | 0 | (306,297)-(399,399) |
| Just before zero | 0.96 | 2.50% | 0 | (338,327)-(399,399) |
| Zero | 1.00 | 0% | 0 | none |

Every capture reports one 400x400 backing canvas for the 200x200 preview, one linked program, Heatmap and Refraction enabled, no bound 2D texture, and no framebuffer. The known React `border`/`borderColor` shorthand warning remains unrelated to this shader repair.

## Cindy Lead Visual Review

The Lead inspected the full-resolution eight-frame sheet plus the representative early, middle, late, terminal, just-before-zero, and zero PNGs.

1. **Does it still read as a moving mask / diagonal wipe?** No. No straight travelling coverage edge remains; the visible material itself advances and the containment boundary is soft and irregular.
2. **Does the remaining material visibly move toward upper-right and compress?** Yes. Thermal features translate along `DIR`, densify under the anisotropic resample, and the occupied bounds converge monotonically toward upper-right.
3. **Does the terminal look like a converged field rather than an undeleted remnant?** Yes. Late frames retain the accepted blue/gold Thermal structure, become a partial field fragment at the rounded upper-right edge, pass through that real boundary, and reach zero. It no longer reads as an interior fixed dot/icon.

**Cindy Lead Visual PASS: No / Yes / Yes.**

## Validation

| Check | Result |
| --- | --- |
| Focused Vitest: surface + runtime + Lab scenarios | 61/61 passed |
| `npm run type-check` | passed |
| `npm run lint -- --quiet` | passed |
| `npm test` | 1773/1774 passed; sole failure is the pre-existing `browser-extension/architecture-guard.test.js:277` listener-tail source-shape assertion |
| `git diff -- browser-extension` | empty; this task did not touch browser-extension |
| `git diff --check` | passed; only the known CRLF conversion warning was emitted |

## Changed scope

Product code/tests:

- `src/presentation/main-window/ExpandedPresentationSurface.tsx`
- `src/presentation/main-window/expandedPresentationSurface.test.ts`

Task-only artifacts include the updated PRD/design/implementation notes, this report, capture script/log, eight PNGs, and the corrected four-column-by-two-row sequence-sheet composer/output.

## Stop state (final)

The failed product-code prototype was restored to the accepted stable checkpoint `8a80474`; only `src/presentation/main-window/ExpandedPresentationSurface.tsx` and `src/presentation/main-window/expandedPresentationSurface.test.ts` were restored, and no Directional Exit implementation commit exists. The task is archived as rejected/abandoned with all evidence retained. No production integration, public docs, packaging, or new Thermal Source planning was started.
