# MR9 Ripple Source-Fidelity Browser Lab — Implementation Report

Status: **implemented for Architecture Review and user visual judgment; STOP**

## Location and changed files

- Branch: `lab/mr9-ripple-source-fidelity`
- Isolated worktree: `D:/Ameow/.cindy-worktrees/mr9-ripple-source-fidelity`
- Baseline: `motion/compact-mascot-visual` at `2bb9a221708c211bdec8721e02d0e469de44ef89`
- Changed implementation files:
  - `src/lab/lab-main.tsx`
  - `src/lab/ripple/RippleLab.tsx`
  - `src/lab/ripple/RippleCanvas.tsx`
  - `src/lab/ripple/rippleController.ts`
  - `src/lab/ripple/rippleResourceCleanup.ts`
  - `src/lab/ripple/rippleTextureUpload.ts`
  - `src/lab/ripple/rippleSource.ts`
  - `src/lab/ripple/rippleController.test.ts`
  - `src/lab/ripple/rippleSource.test.ts`
  - `src/lab/ripple/rippleIsolation.test.ts`

## Implementation architecture

`lab.html?ripple` is an opt-in, mutually exclusive Browser Lab route. The normal Lab remains on `PresentationLab`; Ripple mode mounts one 200×200 CSS / r16 WebGL1 canvas and no `ExpandedPresentationSurface`.

The candidate-local controller owns fixture ordering, origin, raw phase, one rAF, generation invalidation, forward/reverse/cancel/replacement, and final committed fixture. `RippleCanvas` receives immutable frames and owns pixels/resources only. It has no pointer listener, GSAP, animation lock, semantic callback, Product import, or state commit.

The visual kernel carries the full MIT notice, Mick Cesanek 2026 copyright, `m1ckc3s/ripple` repository + pinned commit + original path modification header, and Minsang inspiration credit. It uses Ameow-drawn deterministic square A/B fixtures only.

The user baseline is defaulted to Pinch ON / Pinch Strength `.14`. Pinch OFF is a labelled pure-wavefront comparison. No blend-strength parameter, no-op, or mapping exists.

## Fidelity / adaptation record

- Retained source visual math: WebGL1, aspect/off-center normalization, two fBm fields, coverage/wavefront, Gaussian/cosine envelope, displacement, RGB split, reversed-edge reveal `smoothstep`, glow, and pinch field.
- Pinned user controls: 1.4 s / 1.00×, sigma `.15`, `waveFreq=5`, `pushAmt=.155`, `caStrength=.0225`, glow `.37`, noise warp `.70`, `power3.out`, Pinch ON / `.14`.
- Host-only adaptations: deterministic square fixtures, r16 clipping, Ameow-owned raw phase/origin/from/to/generation, source-timed pinch projection, DPR/resize/context/disposal handling.
- No shader tuning or visual derivative was introduced.

## Lead-review repairs

- Partial WebGL initialization now tracks vertex, fragment, program, buffer, and each texture as they are allocated; the candidate-local cleanup helper releases every successfully allocated handle if a later allocation/link/upload step fails. Its focused fake-WebGL test proves the former partial-allocation leak path fails.
- Source fidelity now normalizes all GLSL whitespace and checks complete SHA-256 digests without a network fetch: vertex `d5732e0bee6c81cef132f12d9778652d06ce47b16c3f962d8e68a7e21a08d579`; fragment `09d02c4b0c0e7c36533982adaeba851b71b359ab4d22c1fea96f9b3f359ca3fa`. The guard also pins representative complete-token facts (vertex declaration and six `texture2D` reads).
- Pinch evidence was regenerated at the shared meaningful raw phase `.16`, which drives `u_progress=.407296` through `power3.out`. Pinch ON uses `u_pinch=.126546`; the otherwise identical Pinch OFF comparison uses `u_pinch=0`. Capture entries record origin, fixture pair, raw phase, linked-program uniform values, eased progress, and effective pinch.

## Validation

Passed:

- `npx vitest run src/lab/ripple/rippleController.test.ts src/lab/ripple/rippleSource.test.ts src/lab/ripple/rippleIsolation.test.ts` — 9/9
- `npx vitest run src/lab/rendererReuse.test.ts` — 25/25
- `npm run type-check`
- `npm run lint`
- `npm run build:renderer`
- `git diff --check`

Focused coverage pins source/provenance/formulas/parameters, no fictional blend semantics, authority boundary, raw-phase controls, one pending frame, stale replacement generation, reverse, cancellation settlement, context lifecycle hooks, DPR/resize/disposal hooks, one r16 canvas, and production-entry isolation.

Runtime probes in Chromium:

- exactly one WebGL1 candidate canvas, CSS and backing size `200×200` at DPR 1;
- full r16-mask final settlement: direct raw-phase-1 target frame is recorded as `settlement.png`; the default WebGL back buffer is not preserved after browser presentation, so the companion intentionally records the visual target frame rather than an invalid delayed pixel readback;
- `WEBGL_lose_context` available; loss and restoration returned to a `200×200` WebGL1 canvas; route teardown after restoration completed without a page error;
- Production build artifact scan found no `RippleLab`, `rippleSource`, or `RIPPLE_FRAGMENT_SOURCE` identifiers.

## Evidence

- Compact labelled sheet: `D:/Ameow/.cindy-worktrees/mr9-ripple-source-fidelity/evidence/mr9-ripple/contact-sheet.png`
- Tight 200×200 crops: `center-pinch-on.png`, `off-center-pinch-on.png`, `near-corner-pinch-on.png`, and `center-pinch-off.png` in the same directory.
- Machine-readable companion: `runtime-facts.json` in the same directory.

Visual observation: at the center, off-center, and near-corner origins, the pinned control produces one readable noisy radial/cloud-like frontier and completes to the target; the corner case shows the expected source-formula asymmetry/flattening rather than a repaired normalization. The ON/OFF center comparison is now phase-aligned at raw `.16` / eased `.407` with transient pinch provably active only in the ON frame.

## Product isolation and remaining debt

No Product source, imports, renderer, build input, Paper, Thermal, Color, Hot Edge, Refraction, Halo, DOM capture, compositor, GSAP, or generic effect framework was changed or added. The dirty root Product worktree was not modified; planning artifacts only were corrected there.

Remaining risks: only Chromium/this Windows runtime was visually exercised; the pinned reversed `smoothstep` remains a GLSL portability risk and off-center normalization remains intentionally uncorrected. Static fixtures prove source motion, not future Production before/after texture ownership. No macOS evidence exists.

## Stop condition

Do not commit, archive, push, open a PR, start Color/Hot Edge, or integrate Production. Await GPT Architecture Lead Architecture Review and explicit user visual judgment.
