# MR9 Ripple Single-Texture Browser Lab Repair

Status: **implementation complete; visual feasibility GO for review; STOP**

## Why this repair exists

The prior dual-fixture source-fidelity control remains engineering-valid, but its abstract A/B fixture images were rejected as a Product-judgment visual basis. This repair preserves that evidence history and does not reinterpret it as Product readiness.

## Approved scope

- Capture one deterministic offline 200×200/r16 still from the existing standard Browser Lab rendering of real Ameow Production UI components/scenario.
- Bind that one scene texture to both pinned Ripple sampler roles, keeping the existing complete normalized GLSL digest guard and visual math unchanged.
- Keep Ameow/Lab ownership of origin, raw phase, lifecycle, generation, and control semantics. Start and end present the same scene.
- Prove visual feasibility only through Browser Lab evidence. Product integration, runtime capture, Electron capturePage, DOM capture, compositor/live scene source, Color, Hot Edge, Thermal, Paper, Refraction, Halo, replacement shaders, and framework work remain forbidden.

## Decision gate

If one-scene binding makes Ripple identity materially disappear, record a visual NO-GO without tuning or compensating effects. Otherwise, return an implementation repair report and stop for review.

## Implemented repair

Status: **implementation complete; visual feasibility GO for review; STOP**

### Fixture provenance

- Fixture: `src/lab/ripple/ameow-download-active-200.png`
- Captured offline on 2026-08-23 from the existing standard Browser Lab `lab.html` route, deterministic `下载进行中` / `download-active` scenario, with the Lab’s `1×` scale selected.
- Product baseline: `motion/compact-mascot-visual` commit `2bb9a221708c211bdec8721e02d0e469de44ef89`.
- Capture: exact `200×200` CSS pixels, radius-16 clipped preview frame. It shows actual Ameow Download-active components: task-count badge, blue status text, and circular progress surface.
- It is an implementation-time static Lab fixture only. No runtime DOM capture, Electron capture, live scene source, or Product dependency was added.

### Contract and source result

`lab.html?ripple=scene` selects the candidate-only one-scene lane. The controller’s single-scene option preserves the same fixture identity for both logical ends, so start/end/cancel/replacement never create an A/B semantic or visible swap. `RippleCanvas` uploads the fixture once and binds the same WebGLTexture to both sampler units. `u_swap` remains zero and the pinned shader source/digests are unchanged.

The standard baseline is unchanged: 1.4 s / 1.00×, sigma `.15`, wave frequency `5`, push `.155`, chromatic separation `.0225`, glow `.37`, noise `.70`, `power3.out`, Pinch ON / `.14`.

### Evidence

- Compact phase sheet, center and off-center, raw/eased labels: `D:/Ameow/.cindy-worktrees/mr9-ripple-source-fidelity/evidence/mr9-ripple/single-scene-contact-sheet.png`
- Final repaired 200×200 WebM: `single-scene-center-full-duration.webm` (`3.24s`) and `single-scene-off-center-full-duration.webm` (`3.32s`) in the same evidence directory. Each includes the complete 1.4-second Ripple motion plus before/after review holds; the original encoded white frame 0 was removed as a post-review evidence-only repair. See `closure-report.md` and `white-flash-closure-verification/`.
- Before/after target still: `single-scene-before.png` and `scene-center-1.png`.
- Machine companion: `single-scene-runtime-facts.json`.
- Mobile-reviewable self-contained page: `single-scene-review.html` (embedded image data; no same-directory dependency for still evidence).

The before (`single-scene-before.png`) and phase-1 (`scene-center-1.png`) stills have the identical SHA-256: `a0f0b1a1177351bc951f92f14300cbcb1175f351c79ee09e9d27db76bb574669`.

### Result

Visual **GO for review**: at the center and off-center origin, the full 1.4-second motion keeps the genuine Ameow scene legible while a localized cloudy ripple, displacement, RGB split, glow, noise, and pinch pass through the badge, status text, and progress surface. Phase 0 and phase 1 are the same still. The effect remains visibly identifiable without a second scene or compensating adaptation.

### Validation and remaining risks

- Focused Ripple tests: 10/10; `rendererReuse`: 25/25; type-check, lint, renderer build, and `git diff --check` pass.
- The phase runtime probe records the same bound WebGLTexture at sampler units 0 and 1, exact 200×200 backing canvas, baseline uniforms, and center/off-center frames. Existing candidate lifecycle checks cover one pending rAF, stale generation, reverse/cancel, cleanup, and context restoration.
- Production artifact scan passes; the Production build remains `index.html` only.

The scene is a static representative fixture, so this does not solve future live Product scene ownership. Only Chromium/Windows Lab evidence exists; macOS and cross-GPU behavior remain unverified. Do not start Color, Hot Edge, or Product integration without a new decision.
