# Boundary-Driven Thermal Source — Implementation Report (FINAL)

Task: `.trellis/tasks/08-21-boundary-driven-thermal-source-edge-originated-field-hypothesis-spike`
Worktree: `D:\Ameow\.cindy-worktrees\mr9-fullscreen-activation-fx`
Worker: x4355jcnfl4kfwjp4fa8gcp5
Status: implementation + Lead repair + final real-Lab evidence complete; **no commit**.

## 1. Changed files (uncommitted)

1. `src/presentation/main-window/ExpandedPresentationSurface.tsx` — `heatmapOutput` rework +
   warm-strip repair (round 2) + final coolMass/interior-warm removal (round 3).
2. `src/presentation/main-window/expandedPresentationSurface.test.ts` — source-contract tests
   updated for the full vocabulary (23 `it()` blocks intact).
3. Task-local evidence under `research/boundary-driven-thermal-source/`:
   - `capture-log.md` (rounds 1–3 tables + verdict)
   - `implementation-report.md` (this file)
   - `capture-page.html` (standalone WebGL2 harness; pre-repair shader snapshot)

No other files touched. No commit / archive / dependency or docs changes.

## 2. Math causality

- **Source remap:** `sourcePosition = mix(-2.985, 4.122, k)`; window DIR projection spans
  xi ∈ [-0.785, +0.785]. k=0 → support fully off-window; k=1 → fully off the far side;
  RM k=0.42 → developed source-space center.
- **Signed distance:** `d = p + bend − sourcePosition` (bend ≈ ±0.09) feeds the two-sided
  influence and the Refraction Taylor resample `d2 = d + dShift`.
- **One broad finite support:** `sourceInfluence = 1 − smoothstep²(r)`, r = |d|/2.2, exactly 0 at
  r ≥ 1 → every fixed pixel reaches zero from source distance alone (void equivalence without
  any phase-wide fade/cleanup).
- **Visibility authority (final):** old `behind/body/energy/covered/bodyFloor/covered2/along2`
  removed. The SAME `sourceInfluence` gates everything; `warm` is EXCLUDED from baseline interior
  material — baseline `material = clamp(heat + coolLift, 0, 1)` =
  `sourceInfluence * 0.62` (uniform, continuous). `warm` acts only as exact-support-gated real
  boundary contact (`contact = boundaryBand·warm·sourceInfluence`, `capture`, `inwardCool`) and
  inside an envelope whose whole result is multiplied by `sourceInfluence`. The Lead's real-Lab
  review removed the final Refraction interior `warm2` bias; `warm2` now affects only real-boundary
  contact. 2D topology, palette, grain, yellowZone, Refraction
  strength/direction, RM, alpha floor unchanged.
- **Repair history (all within the one minimal thread):** round-1 REJECT = thin bright warm strip
  (material2 `warm2`·0.18); round-2 = warm weights down (heat 0.10/hotLift 0.08/env 0.25/warm2
  0.06) fixed the Refraction strip but left a baseline dark trough; round-3 (Lead decision) =
  `coolMass = sourceInfluence` and warm fully removed from baseline interior material → no marker
  in either path.

## 3. Phase / capture verdict (round 3, final)

Harness: standalone WebGL2 evaluate renderer (exact shader source; Lab navigation policy-blocked;
bash/playwright unavailable). Time pinning per archived `capture-thermal-refraction.mjs`
(`uTime = k/0.13`, RM k=0.42). Full tables in `capture-log.md`.

| check | Refraction ON | Refraction OFF (baseline) |
|---|---|---|
| compile/link | PASS | PASS |
| before-entry/post-exit void pixel-equivalent | PASS (meanL 2.21/minL 1.08/maxL 3.36 identical) | PASS (identical) |
| first contact localized at real lower-left rounded corner | PASS | PASS |
| entry = broad soft diagonal ramp, no wipe | PASS (bands 124→2.3 at k=0.15) | PASS (bands 62.7→2.3) |
| developed full-surface | PASS (active=1, multicolor 2D topology) | PASS (active=1, uniform tan field) |
| no bright/dark diagonal interior marker | PASS (no stripe, broad lobes) | PASS (monotonic band profile 140→163→147, no dip; uniform interior) |
| exit symmetric, exact zero | PASS | PASS |
| Reduced Motion pins developed, freezes bend | PASS | PASS |
| no global synchronized fade | PASS | PASS |

Round-3 visual evidence:
- Refraction OFF developed-middle: "smooth uniform tan/beige interior; no visible diagonal
  dark/bright stripe or line"; boundary-contact glow at the real rounded edges (intended).
  `.../browser-runtime/media/browser/ea4a08b7855b6b95.png`
- Refraction ON developed-middle: full-surface multicolor broad lobes, no stripe, no hard edges.
  `.../browser-runtime/media/browser/a9fc31b20b22cdc1.png`
- Prior rounds preserved: pre-repair strip `.../f6fa34636efcc137.png`, pre-repair sheet
  `.../6440df445828ccc8.png`, round-2 sheet `.../208074e0a7eb02d7.png`, round-2 clean frame
  `.../ab36b2e001c35e25.png`, round-2 baseline trough `.../f7636eea25c8821e.png`.

## 4. Source-contract tests

Assert the new vocabulary: `sourcePosition = mix(-2.985,4.122,k)`, `SOURCE_SUPPORT_HALF = 2.2`,
`sourceInfluence = 1 - smoothstep²`, `coolMass = sourceInfluence`, `heat = coolMass*0.44 + capture`,
`coolLift = coolMass*0.18`, `material = clamp(heat + coolLift,0,1)`, no `hotLift`, no
`smoothstep(0.12,0.45,warm)` suppression, no interior `warm2` material term, an
influence-multiplied Refraction envelope, negative vocabulary
(`behind/body/energy/covered/bodyFloor/core/front/trailing/qExit/terminal/wipe/cleanup/convergence`,
no `sourceMarker|interiorMarker|warmLine|hotStrip|coreHighlight`), single canvas + single draw.
String assertions cross-checked against the shader text.

## 5. Worker validation — partial (historical tooling constraint)

`bash`/`git`/`node` unavailable in this session, so focused Vitest, `npm run type-check`,
`npm run lint -- --quiet`, full `npm test`, and `git diff --check` could NOT be run here; the real
Browser Lab page was navigation-policy-blocked. These remain for the Lead/host in the worktree
(baseline expectation from the archived accepted report: focused 61/61; full 1773/1774 with the
sole pre-existing `browser-extension/architecture-guard.test.js:277`; type-check/lint/diff clean).

## 6. Final verdict & known follow-ups

- Hypothesis PASS on both paths after the final minimal repair: one broad finite-support source
  contour produces localized boundary-originated entry → full-surface developed (Refraction 2D
  topology / uniform baseline) → symmetric exit, with pixel-equivalent pre/post void and no
  wipe/fade/strip/trough/blob.
- The worker's standalone evidence is superseded by the Lead's real-Lab rerun and validation in
  §7 below.

## 7. Cindy Lead final verification (2026-08-21)

The Lead reviewed the tracked diff, performed the required simplify pass, and found two source
contract gaps plus one real visual residual:

- `contact` and the full Refraction `env` now multiply `sourceInfluence`, so all activated
  boundary/Refraction terms reach mathematical zero outside finite support instead of relying on
  the exponential warm tail becoming imperceptible.
- A real Browser Lab full-resolution capture exposed a faint interior line that the standalone
  harness review had missed. Its root cause was the remaining `warm2 * 0.06` material term. That
  interior term was removed; `warm2` remains only for real rounded-boundary contact.

Final evidence was re-shot from the repository's actual `/lab.html` surface with pinned phases in
`final-evidence/` (20 PNGs plus SHA-256/resource log). Direct review passes both Refraction paths:
localized lower-left entry, broad developed coverage, upper-right exit, no hard wipe, no moving
blob, no interior bright/dark strip, and no terminal choreography. Before-entry, post-boundary,
and exact-zero PNGs have the same SHA-256 in both modes:
`9a81140b7d7f7dcf83df8a2466248af7b27d98ec558e7c09dcecde31155cea1f`.

Resource evidence: one canvas, linked WebGL2 program, no bound texture, and no bound framebuffer
for all 20 captures. The Lab emitted one pre-existing React style warning about mixing `border`
and `borderColor`; it is outside this shader/test spike and did not affect capture or rendering.

Lead validation:

- focused Vitest: 79/79 PASS;
- `npm run type-check`: PASS;
- `npm run lint -- --quiet`: PASS;
- full `npm test`: 1773/1774, with only the reproduced pre-existing
  `browser-extension/architecture-guard.test.js:277` failure;
- `git diff --check`: PASS, with only Git's existing LF-to-CRLF working-copy warnings.

Final status: uncommitted hypothesis spike ready for GPT Architecture Lead Implementation Review.
