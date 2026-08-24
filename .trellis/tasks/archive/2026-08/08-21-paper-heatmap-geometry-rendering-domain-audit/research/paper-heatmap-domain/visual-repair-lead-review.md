# Cindy Lead Visual Review — Paper Processed Material Unity / 14px-Bounded Edge Treatment

- Date: 2026-08-21
- Scope: the single authorized bounded repair round
- Architecture hypothesis: **PASS (unchanged)**
- Current repaired visual candidate: **REJECT**
- Further repair in this round: **not authorized and not performed**

## Direct evidence reviewed

- Repaired composite / close-ups / FX comparison:
  `C:\Users\Administrator\AppData\Roaming\CindyGlobal\browser-runtime\media\browser\42d5057994ddd5ca.jpg`
- Rejected-versus-repaired comparison and processed-channel views:
  `C:\Users\Administrator\AppData\Roaming\CindyGlobal\browser-runtime\media\browser\56fb36d7a8b7878d.jpg`
- Reproducible repaired harness:
  `research/paper-heatmap-domain/capture-paper-repaired.html`
- Develop Worker report:
  `research/paper-heatmap-domain/visual-repair-report.md`

## Lead visual judgment

The repair successfully removes the rejected blue/purple outer ring and makes
the 228-domain outer edge transparent. It also restores normal Lab UI
pointer-event behavior without changing the single-canvas/single-renderer
authority.

However, the repaired final composition still presents a thin, continuous,
high-luminance gold rounded perimeter around a mostly flat orange interior.
In the full composite and the edge/corner close-ups, that perimeter is read as
a visible outline/frame, not merely as a continuous variation within one
multi-temperature Thermal material. Changing the ring from blue to gold does
not satisfy the visual stop condition.

The interior is also perceptually close to a uniform orange plate. Although
the shader routes inner, contour, and outer through one scalar and one palette,
the final visible result does not yet demonstrate the requested
multi-temperature interior-to-edge unity. Shader-path unity is not a substitute
for visual material unity.

## Required five answers

1. **Does the edge still read as an independent outline / second silhouette? YES.**
   The repaired candidate retains a clearly legible gold rounded perimeter.
2. **Are the interior and edge visually one Thermal material? NO.**
   The mostly flat orange interior and narrow bright gold perimeter separate
   perceptually into fill plus outline.
3. **Does the halo decay naturally inside the 14px budget? YES.**
   All four outer edges and the last two pixels are transparent; no 228-edge
   hard clipping is visible in the supplied evidence.
4. **Do the CSS shadow and FX coexist visually? YES.**
   FX ON/OFF evidence retains one shadow owner and does not show a duplicated
   shadow.
5. **Are interaction semantics preserved? YES.**
   The FX canvas remains non-interactive, the panel clip is normally
   interactive, descendants no longer require per-child opt-in, and the UI
   remains clipped to 200x200/r16.

Under the user-defined gate, Q1 = Yes and Q2 = No prohibit Visual PASS.

## Architecture and simplification review

- Geometry remains 228 outer / 200 panel / 14 gutter / radius 16.
- The exact panel mask remains the only processed source.
- One canvas, one linked program, one draw, at most one lazy Paper texture, and
  no framebuffer remain intact.
- Paper mode remains Lab-only; Refraction, motion, timing, native bounds, and
  production integration were not reopened.
- Paper-off fallback and Reduced Motion scheduling authority remain unchanged.
- Apache-2.0 / NOTICE / source provenance remain present.
- A simplification pass found no correctness-motivated edit worth making after
  the visual parameters were frozen. No additional abstraction or repair path
  was added.
- The repaired broad and narrow preprocessing fractions are both `0.03`.
  This does not break the one-source architecture, but it makes those two
  processed channels effectively the same scale in this candidate and weakens
  the visual evidence for distinct broad-versus-narrow mechanics. This is a
  review finding only; no second repair was performed.

## Host validation

- Focused Vitest:
  `expandedPresentationSurface.test.ts`, `scenarios.test.ts`,
  `rendererReuse.test.ts` — **63/63 PASS**.
- `npm run type-check` — **PASS**.
- `npm run lint -- --quiet` — **PASS**.
- `git diff --check` — **PASS**, with existing LF-to-CRLF warnings for
  `THIRD_PARTY_NOTICES.md` and `rendererReuse.test.ts`.
- Full `npm test` — **1780/1781 PASS**. The sole failure is the known,
  pre-existing `browser-extension/architecture-guard.test.js:277` guard.

## Phase-gate result

Stop here and return **Current Visual Candidate = REJECT** for GPT Architecture
Lead review. Do not commit, archive, integrate, bind Refraction, add motion, or
start another repair round.
