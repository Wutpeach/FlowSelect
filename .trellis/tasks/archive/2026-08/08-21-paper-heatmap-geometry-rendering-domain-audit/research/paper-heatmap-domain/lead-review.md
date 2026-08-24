# Cindy Lead Static Mechanics Spike Review

**Date:** 2026-08-21

**Overall verdict:** REJECT the current visual candidate and stop. The spike confirms the
processed-silhouette architecture mechanics, but it triggers visual/output/interaction stop
conditions. No parameter repair, native resize, production integration, commit, or archive was
performed.

## What the spike confirms

- The Lab canvas covers the 228×228 output domain.
- The only processed source is the exact 200×200/r16 panel mask at outer origin `(14,14)`.
- Source, broad inner/outer fields, and contour share one CPU-built RGBA texture.
- One `ExpandedPresentationSurface`, canvas, linked WebGL2 program, draw, and lazy Lab-only texture
  are retained; no framebuffer or second pass is introduced.
- Paper mode off allocates no processed texture.
- The Paper mechanics are static and Reduced Motion schedules no continuing frames.
- Apache-2.0/Paper NOTICE delivery and prominent modification notices are present; Ameow's MIT
  license is unchanged.

## Direct visual judgments

| Question | Lead verdict | Evidence |
|---|---|---|
| 1. Is the exact panel silhouette the sole processed source? | **PASS** | R is the exact mask; G/B/A are derived from it. Edge/corner samples match 228/200/14 geometry. |
| 2. Do inner/outer/contour read as one panel material system? | **REJECT** | Although they share one computational source, the orange interior and high-contrast blue rounded contour read as separate visual systems. |
| 3. Does the gutter let the halo extend naturally beyond the panel? | **REJECT** | The outer field enters the gutter, but remains opaque/high-energy at the 228 edge, so the window cuts it off instead of allowing a natural falloff. |
| 4. Is a second visible geometry present? | **REJECT** | There is no second DOM/canvas authority, but the bright blue rounded perimeter visually reads as a detached outline/second silhouette, an explicit stop condition. |
| 5. Is the 14px visible-output budget sufficient? | **REJECT** | At the final column alpha is 255 and broad response is 0.607; every last-2px sample remains non-zero. |

## Additional gate findings

- **CSS shadow coexistence: REJECT visually.** Source ownership remains singular, but the opaque
  outer field dominates the gutter and obscures the intended soft-shadow reading.
- **UI interaction: REJECT.** The Lab content clip uses `pointer-events:none`, and the delivered
  DOM evidence reports that descendants inherit the read-only behavior unless each child opts back
  in. This does not prove interaction/drag/hit-testing equivalence and is an explicit regression
  risk.
- **Windows transparent BrowserWindow compositing: NOT VERIFIED.** The checkerboard/alpha harness
  proves alpha-bearing WebGL output, not real Electron/DWM transparent-window compositing.
- **macOS runtime: NOT VERIFIED.** No macOS runtime host was available.
- **Context restore: PARTIAL.** Source lifecycle and deterministic reinstall are covered, but the
  actual `WEBGL_lose_context` restore did not complete in the automation environment.
- **Fallback resource equivalence: PASS.** Paper-off path creates no texture.
- **Fallback pixel equivalence: NOT VERIFIED directly.** The harness proves the Paper and fallback
  paths differ and that the fallback remains available; it does not provide a pre-candidate versus
  post-candidate pixel hash for the accepted Thermal + Refraction checkpoint.

## Evidence

- `capture-paper.html`: self-contained exact shader/preprocessing harness and numeric readouts.
- `evidence/channels-and-metrics.jpg`: source, inner, outer, contour, final, and metrics.
- `evidence/outer-domain-shadow-comparison.jpg`: 228 composite and shadow/UI comparison.
- `evidence/fx-on-off-layer-evidence.jpg`: corrected FX-on/off layer model.
- `implementation-report.md`: Worker implementation details and raw measurements.

## Lead simplify and validation

The Lead `/simplify` pass did not change visual parameters or derivative mechanics. It fixed only:

- nullable Lab style types rejected by TypeScript;
- provenance wording that accidentally violated the negative source contract;
- NOTICE formatting expected by the license contract test.

Validation after those fixes:

- `npm run type-check`: PASS.
- `npm run lint -- --quiet`: PASS.
- focused Vitest (`expandedPresentationSurface`, runtime, scenarios, renderer reuse): 77/77 PASS.
- full `npm test`: 1779/1780 PASS; sole failure is the reproduced pre-existing
  `browser-extension/architecture-guard.test.js:277` guard.
- `git diff --check`: PASS, with CRLF conversion warnings only.

## Phase gate

Stop with the candidate and evidence uncommitted. The exact panel mask and one-texture renderer
architecture are viable, but the current Paper-derived processed fields do not fit the 14px output
budget or meet the visual/no-second-silhouette gates. Any future blur/contour adjustment or native
domain decision requires a new GPT Architecture Lead direction.
