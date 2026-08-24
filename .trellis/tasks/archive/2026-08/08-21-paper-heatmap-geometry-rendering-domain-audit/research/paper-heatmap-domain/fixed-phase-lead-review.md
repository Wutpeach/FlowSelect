# Cindy Lead Visual Review: Paper Internal Morphology / Fixed-Phase Composition

- Date: 2026-08-22
- Scope: the single bounded fixed-phase morphology spike
- Architecture / geometry / layering / interaction: **PASS**
- Paper mechanics adaptation: **implemented and evidenced**
- Current fixed-phase material visual: **REJECT**
- Further morphology repair in this sub-phase: **not authorized and not performed**

## Evidence reviewed directly

- Four fixed phases and processed channels:
  C:\Users\Administrator\AppData\Roaming\CindyGlobal\browser-runtime\media\browser\2586ece9a4f73ca3.jpg
- Subtractive-shadow intermediates and close-ups:
  C:\Users\Administrator\AppData\Roaming\CindyGlobal\browser-runtime\media\browser\d9afe63f5703ba26.jpg
- Shadow sweep, edge bands, and edge profile:
  C:\Users\Administrator\AppData\Roaming\CindyGlobal\browser-runtime\media\browser\575638ee3ddd0e7c.jpg
- Previous-versus-fixed-phase comparison:
  C:\Users\Administrator\AppData\Roaming\CindyGlobal\browser-runtime\media\browser\9c5f67cbd24c6e14.jpg
- FX OFF / ON layer evidence:
  C:\Users\Administrator\AppData\Roaming\CindyGlobal\browser-runtime\media\browser\98bb703bd7a1e8a4.jpg
  and
  C:\Users\Administrator\AppData\Roaming\CindyGlobal\browser-runtime\media\browser\457e839a047eb937.jpg
- Reproducible GPU harness:
  research/paper-heatmap-domain/capture-paper-morphology.html
- Develop Worker report:
  research/paper-heatmap-domain/fixed-phase-implementation-report.md

## Lead visual judgment

The spike resolves the earlier computational collapse: broad and narrow are
again distinct, the fixed phase changes the output, and the continuous gold
panel perimeter is broken. It also preserves the accepted 228/200/14 geometry,
bounded gutter, layer split, shadow, interaction, and one-renderer authority.

The visible material hypothesis does not pass. Across phases A-D, the output is
dominated by large transparent or near-black horizontal bands separating warm
orange regions. The phase-B live layer capture is especially clear: the panel
reads as two warm slabs divided by a dark belt with high-contrast blue/yellow
transition rims.

That result is not a complete 200x200 panel interior carrying broad,
multi-temperature Thermal morphology. It reads as subtractive void bands or a
horizontal wipe grammar. The cool portions are frequently alpha-zero shell
show-through rather than visibly continuous blue/cyan Thermal material. The
warm regions, internal transition rims, transparent voids, and subtle gutter
halo therefore do not read as one unified material system.

This is useful failure evidence: restoring the geometry-agnostic portion of
Paper's morphology without its excluded object-specific geometry does create
phase-varying structure, but the remaining structure is strongly
one-dimensional and does not satisfy Ameow's desired full-surface Thermal
material.

## Required six answers

1. **Are broad and narrow mathematically and visually distinct? YES.**
   Their preprocessing scales are 0.08 and 0.02, and the channel captures show
   different falloff widths.
2. **Is the interior no longer a mostly uniform orange plate? YES.**
   The fixed phases are visibly different and introduce large spatial
   variation.
3. **Do the fixed phases produce the requested Paper-like broad Thermal
   morphology rather than new noise/plasma? NO for the visual gate.**
   The implementation is derivative-adapted Paper mechanics and does not add
   noise/plasma, but the visible result is dominated by horizontal subtractive
   bands and wipe-like voids rather than broad filled Thermal morphology.
4. **Does the real panel edge stop reading as a continuous outline / second
   silhouette? YES.**
   The former continuous rounded gold perimeter is broken and phase-dependent.
5. **Do interior, edge, and halo read as one material system? NO.**
   Warm slabs, high-contrast internal rims, and alpha-zero/near-black bands
   separate perceptually instead of forming one continuous material.
6. **Do the 14px halo, shadow, interaction, and renderer authority retain
   PASS? YES, after the Lead scheduling correction below.**
   The outer edge remains transparent, the shadow has one owner, ordinary UI
   descendants remain interactive, the FX canvas is non-interactive, and the
   one canvas/program/draw/texture boundary remains intact.

Because Q3 and Q5 are No, the strict all-Yes gate requires **Visual REJECT**.

## Lead simplification and correctness corrections

No morphology equation, phase, palette, blur scale, contour weight, or halo
parameter was changed after evidence.

The Lead review made three non-visual corrections:

1. paper-static no longer forwards heatmapMode=true. The existing Heatmap
   runtime uses that flag to request continuous frames, so leaving it true
   violated the fixed-phase/no-scheduler contract even though paperOutput
   ignored uTime.
2. LabOverlayStage now forwards the optional paperPhase directly and relies
   on ExpandedPresentationSurface as the single default-value owner.
3. The phase readout uses the existing theme token instead of a local hardcoded
   color. Source-contract tests were corrected to inspect executable grammar
   rather than rejecting required provenance comments.

## Host validation

- Focused Paper/Lab tests: **64/64 PASS**.
- Expanded runtime tests: **15/15 PASS**.
- npm run type-check: **PASS**.
- npm run lint -- --quiet: **PASS**.
- git diff --check: **PASS**, with LF-to-CRLF warnings on existing dirty
  text files.
- Full npm test: **1781/1782 PASS**. The sole failure is the known,
  pre-existing browser-extension/architecture-guard.test.js:277 guard.

## Phase-gate result

Stop and return the fixed-phase morphology candidate as **hypothesis failure
evidence** for GPT Architecture Lead. Do not add another parameter repair,
carrier, mask, noise field, or motion model. Do not commit, archive, bind
Refraction, add A-to-B lifecycle/timing, integrate production behavior, or
resize the native window.
