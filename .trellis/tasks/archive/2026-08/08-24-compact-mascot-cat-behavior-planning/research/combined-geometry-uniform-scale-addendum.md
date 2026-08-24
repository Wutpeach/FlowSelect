# Combined geometry + uniform-scale study

Date: 2026-08-24  
Scope: research only; no product/spec/test changes and no Architecture PASS.
The study uses installed `@bible-strong/avatar-core@0.1.0`, the existing
`COMPACT_MASCOT_DEFINITION`, full current-pose projection, the unchanged
240/80/60/56 geometry, and exactly two legal diamond nodes.

## Result

The inverse-order experiment is not sufficient to clear the gate. Larger,
higher ears can recover a recognizable neutral forehead, but the full 3D idle
plus `surprised`, `curious-short`, and `playful-short` envelope forces a
uniform fit scale of roughly `.70–.75` even after a small positive vertical
translation. At that scale the head is only about 31–34px in the 56px host.
The best spacing candidate (`A`) is `.701`; the best size-preserving candidate
(`C`) is `.748` but has only `.493` tip-spacing/head-width versus the reference
`.675`. No tested candidate simultaneously matches the reference spacing,
retains a product-legible 1x head, and clears the circular shell.

This keeps the blocker as a genuine two-node/avatar-core capability + host-fit
constraint under the stated full-pose rules. It is not permission to import a
renderer/schema or to change host bounds.

## Parameter study

The task-local runner and outputs are:

- `research/parameter-study-combined-scale.mjs`
- `research/evidence/combined-geometry-scale-study.json`
- `research/evidence/combined-geometry-scale-study.svg`
- `research/evidence/combined-geometry-scale-study.png`

The SVG/PNG sheet is a compact, reviewable crop: supplied reference, four
larger-ear candidates, and the current rejected candidate. All mascot cards
are direct avatar-core current-pose paths at their calculated shell-fit scale;
the dashed circle is the existing 60px shell. No product renderer or OneWorks
asset is used.

The neutral metrics below use projected core path coordinates. Tip spacing is
the distance between the two topmost ear boundary centers. Ear width is the
per-ear boundary span remaining outside the neutral 240-sphere disk (a stable
geometry metric, not an anti-aliased screenshot pixel count). Ratios are
normalized by the projected head width `244.62`.

| Candidate | Legal geometry (`w×h×d`, x, y, z, mirrored z tilt) | Tip/head | Ear width/head | Max shell-fit scale | Best y translation | Neutral / envelope bounds (`x`, `y`) |
|---|---|---:|---:|---:|---:|---|
| **A** | `125×205×110`, `±78`, `-78`, `-80`, `0°` | `.565` | `.382` | `.701` | `+15.5` | neutral `±124.4`, `-159.9..21.7`; envelope `-178.1..161.9`, `-203.7..54.7` |
| **B** | `120×200×108`, `±72`, `-76`, `-80`, `0°` | `.521` | `.363` | `.726` | `+14.5` | neutral `±116.9`, `-155.9..21.3`; envelope `-169.5..153.2`, `-197.8..53.0` |
| **C** | `115×195×105`, `±68`, `-74`, `-80`, `0°` | `.493` | `.339` | `.748` | `+13.4` | neutral `±111.2`, `-151.9..20.8`; envelope `-162.9..146.5`, `-192.4..51.6` |
| **D** | `125×205×110`, `±74`, `-78`, `-80`, mirrored `±8°` | `.437` | `.399` | `.711` | `+15.0` | neutral `±120.6`, `-159.5..21.1`; envelope `-174.9..158.4`, `-199.0..55.8` |
| **Current rejected** | `125×195×105`, `±42`, `-82`, `-80`, `0°` | `.304` | `.369` | `.774` | `+20.9` | neutral `±92.6`, `-159.4..14.1`; envelope `-144.5..127.3`, `-194.9..39.2` |

Candidate A is the neutral likeness leader because it restores the most
forehead/ear-tip separation while keeping the broad-ear family. Candidate C is
the shell/size leader but is visibly closer to the weak-bump direction that
was rejected. Candidate D demonstrates the OneWorks-inspired mirrored tilt;
its local rotation reduces neutral tip separation and does not improve the
uniform-fit scale, so it is not preferred.

The reference target remains approximately tip spacing `.675`, individual ear
width `.264`, center notch `.046`, and valley depth `.151` of head width from
the prior silhouette measurement. The legal x range requested for this study
(`±55..±80`) tops out at candidate A's `.565` projected tip ratio; moving to
the exact `.675` target would require centers beyond the requested range and
would further reduce shell-fit scale. The boundary-span ear-width metric is
not a final visual acceptance metric because depth occlusion and SVG raster
coverage alter the 1x pixel span; use the supplied sheet for the neutral gate.

## Circular shell proof

At 56px rendering, the 60px shell radius is
`(60/56)×150 = 160.714` avatar units. The runner samples neutral, all idle
source phases, and the hold/transition checkpoints `0, 800, 2300, 2550,
2800, 3050, 3700, 5100, 5600` for each retained action. For each frame it
reduces each core path to its conservative projected bounds, adds the four
cardinal points of the 240-sphere head, and takes the union. It then binary
searches the largest uniform scale `s` for which every transformed point obeys
`sqrt((s*x)^2 + (s*y + t_y)^2) ≤ 160.714`; `t_y` is optimized in a bounded
small-translation interval `[-100,+100]` and stays in `+13..+21` for the
reported candidates. The fit clearance is zero by definition at the maximum
scale; rounded values in the sheet are display labels only.

This is stricter than rectangular y/viewBox checks and includes head bounds.
The 80px outer frame remains larger (`±214.286` units), so it is not the
limiting host. No native/window-bound change is proposed.

## Legibility lower bound

The accepted Compact geometry renders the 240 sphere to
`240×56/300 = 44.8px` at 1x. A conservative operational lower bound of
`s=.75` preserves at least `33.6px` head diameter and `8.5px` for the pinned
60-unit neutral eye height. This is evidence-based against the existing
accepted 1x geometry and the 56px host, not a generic aesthetic preference.

- A `.701` fit produces a ~31.4px head and ~7.9px neutral eyes: below the
  lower bound, despite the strongest spacing.
- B `.726` is also below the bound.
- C `.748` is effectively at but technically below the bound after exact
  circular fitting; it still misses reference spacing substantially.
- The current rejected candidate can retain `.774` only because its ears are
  too close (`.304` spacing), so that scale is not a valid shape solution.

Thus there is no evidence-backed product-legible candidate in this bounded
family. A future visual review may deliberately relax the `.75` threshold,
but that would be a user/product decision and must be accompanied by a new
1x acceptance criterion rather than silently accepting a tiny mascot.

## Recommendation and boundary

Do not implement A–D yet. If one last visual probe is authorized, use **A** as
the neutral-likeness probe at `s≈.70, t_y≈+15`, and **C** as the size/clearance
probe at `s≈.75, t_y≈+13`; both must be reviewed at actual 1x before any
acceptance. Whole-mascot scaling is therefore a measured tradeoff, not a free
fix: it repairs shell clipping only by making the already-small Compact head
smaller.

Keep the exact two-node avatar-core seam, full upstream poses/actions,
pointer/lifecycle/native authority, and 80/60/56 host. OneWorks contributes
only normalized spacing, mirrored local tilt, and face-occlusion ideas. No
schema, renderer, custom mesh, extra node, frozen path, or host-bound change
is within this repair.

**Verdict:** no viable local repair was proven. The original geometry blocker
remains, now strengthened by the combined shell-fit/legibility proof. Stop at
the blocker unless the user changes one of the fixed constraints or accepts a
new visual-size/pose policy. Keep the prior repair report acceptance status
unchanged.
