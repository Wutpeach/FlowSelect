# Paper-Derived Mechanics Browser Lab Spike Plan

This is a future implementation plan only. Do not execute it until GPT Architecture Lead approves
the planning artifacts and the task is explicitly started.

## Minimal Scope

1. Add source-contract tests for the proposed authority split before changing rendering:
   - one `ExpandedPresentationSurface`, canvas, WebGL2 program, and draw;
   - no framebuffer, second renderer, second pass, ShaderMount, Paper logo/diamond, inset carrier,
     entry/exit/timing model, or native resize;
   - default mode allocates no processed texture.
2. Add an explicit Browser Lab-only processed-silhouette mode. Production/default selection and
   the accepted Thermal + Refraction path remain unchanged.
3. Expose the 228×228 domain to the same canvas using the approved layer split:
   - real panel remains 200×200/r16 at `(14,14)` and keeps interaction authority;
   - canvas becomes 228×228 and non-interactive;
   - real UI content remains clipped to the panel and above the canvas;
   - existing CSS shadow remains a separate backdrop.
4. Generate the exact rounded panel source at outer-domain coordinates. Do not use travelling
   `sourceInfluence`, an inset rectangle, or a Paper shape.
5. Lazily build one RGBA processed texture for source, broad field, narrow field, and contour.
   Reuse the validated renderer-owned context-restore/dispose lifecycle. Do not add a framebuffer
   or GPU preprocessing pass.
6. Compose Paper-derived inner/outer/contour scalar mechanics in the existing shader, then use the
   existing Ameow palette/output. Keep equations local to the mode; do not add a generic field API.
7. If any Paper source is copied or near-verbatim adapted, add Apache-2.0, Paper NOTICE,
   `THIRD_PARTY_NOTICES.md`, and a prominent source modification header in the same candidate diff.
8. Capture debug and final frames at static time only. Do not tune lifecycle timing or design new
   entry/exit/convergence behavior.

## Expected Candidate File Boundary

- `src/presentation/main-window/ExpandedPresentationSurface.tsx`
- `src/presentation/main-window/MainWindowPresentationSurface.tsx` only for the Lab-gated outer-domain layer split
- focused source-contract and presentation tests
- existing Browser Lab scenario/preset wiring and task-local capture evidence
- license/NOTICE files only if the source-provenance gate is triggered

No expected changes to Electron native size, product lifecycle/policy/targets, runtime scheduling,
public docs, dependencies, package metadata, or production mode selection.

## Falsifiable Evidence Set

1. 228×228 composite with an overlay of the real panel edge and latent source at eight probes.
2. Separate source, inner, outer, contour, and final-composite frames.
3. A gutter crop showing panel edge through window edge on all four sides, including last-2px alpha
   samples to expose clipping.
4. Matched FX-off/on captures proving CSS shadow and UI content survive the layer change.
5. WebGL resource log: one canvas, one linked program, one draw, no framebuffer, one Lab-only
   texture, correct context restore, and correct dispose.
6. Paper mode-off pixel/resource equivalence against the accepted Thermal + Refraction fallback.
7. Reduced Motion evidence: frozen time and zero continuing scheduled frames.
8. Windows transparent-window capture; macOS runtime capture when a macOS host is available, or an
   explicit `NOT VERIFIED` validation debt paired with the source-confirmed geometry table.

## Pass / Reject Gate

Pass only if all observable gates in `design.md` and the planning report pass without repair
geometry or a new framework. Reject and restore the candidate if it produces any inset/second
silhouette, perimeter frame, halo clipping that defeats the target look, shadow conflict,
transparent-compositing defect, extra renderer/draw, resource leak, or fallback regression.

## Validation

1. Direct full-resolution visual review before broad test claims.
2. Focused presentation/source-contract/runtime/Lab tests.
3. `npm run type-check`.
4. `npm run lint -- --quiet`.
5. Full `npm test`, separating reproduced pre-existing failures.
6. `git diff --check` and explicit diff-boundary audit.
7. Stop with an uncommitted Browser Lab spike report for Cindy visual review, then GPT Architecture
   Lead review. Do not integrate or commit the candidate without a new phase decision.
