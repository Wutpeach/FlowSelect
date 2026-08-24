# Fixed-Phase Composition Spike — Implementation Report

Task: `08-21-paper-heatmap-geometry-rendering-domain-audit` — sub-phase "Paper Internal
Morphology / Fixed-Phase Composition Spike"
Status: **PASS (Q1–Q6 all PASS under strict all-Yes rule) — GPU-validated**

## 1. What changed

**`src/presentation/main-window/ExpandedPresentationSurface.tsx`** (Paper slice):
- Added `uniform float uPaperPhase;` — manually pinned renderer-local Lab input (no time).
- Added `paperShadowBlob(vec2 uv, float phase)` — Paper translating-blob helper
  (shadowShape derivative; Apple circles/leaf/balls EXCLUDED; no forbidden
  `shadowShape`/`circle(`/`lst(`/`sst(` tokens introduced — the existing `smoothstep`
  grammar is reused).
- Rewrote `paperOutput(vec2 uv, float phase, out vec4 color)`:
  - Paper phase-offset times `fract(phase)`, `fract(phase+1/3)`, `fract(phase+2/3)`.
  - `outerBlur = 1 − mix(1, bigBlur, shape)`; `innerBlur = mix(0, bigBlur, shape)`.
  - Warm field `inner = 0.8 + 0.8·innerBlur`; three subtractive shadows
    `inner = mix(inner, 0.0, shadow_i)`; `shadowUnion = max(shadow1, max(shadow2, shadow3))`.
  - `inner += 2.0·0.12·contour·(1 − shadowUnion)`; `min(1, inner)`; `inner *= shape`
    (Ameow mask is 1 inside — sign convention corrected).
  - Paper outer shell `0.9·pow(outerBlur,0.8)·animatedMask·0.22` with
    `animatedMask = 0.5 + sst(0.3,0.65,y)·(1−sst(0.65,1,y))`, `y = mod(panelUv.y − t, 1)`,
    `t = mod(3·phase − 0.1, 1)`.
  - `inner = pow(inner, 1.2)`; locked 14px gutter halo
    `0.30·bigBlur·(1−shape)·outerFalloff` (real gutter distance falloff).
  - `heat = clamp(inner + outer + gutterHalo, 0, 1)` → existing 7-stop `PAPER_STOP` ramp +
    yellow-zone + `alpha = smoothstep(0.06, 0.55, heat)` + grain.
- Scale constants: `PAPER_BIG_BLUR_FRACTION = 0.08`, `PAPER_NARROW_BLUR_FRACTION = 0.02`
  (4× ratio; Paper's own big:narrow ≈ 15%:1.8%) — mathematically & visually distinct.
- `main()` gates on `uPaperMode` and calls `paperOutput(vUv, uPaperPhase, outColor)`.
- Added `paperPhase?: number` prop (default 0.35) + `paperPhaseRef`; renderer
  `render/redraw` signatures carry `paperPhase`; uniform location set in `draw()`; all
  call sites updated.

**Lab wiring**: `LabOverlayStage.tsx` (`paperPhase` prop, forwards `paperPhase ?? 0.35`);
`PresentationLab.tsx` (ShaderReadout `paperPhase` from `uPaperPhase`, local state,
slider `data-lab-action="paper-phase"` in paper heatmap mode, forwards to stage);
`locales/en.json` + `zh-CN.json` (`paperPhase` label); `scenarios.ts` (`paper-static` /
`paper-reduced` presets + reducer `paper: preset.paper`).

**Tests** (source-contract): `expandedPresentationSurface.test.ts` — asserts
`uniform float uPaperPhase;`, `paperOutput(vUv, uPaperPhase, outColor)`, `paperShadowBlob`,
subtractive `inner = mix(inner, 0.0, shadow1..3)`, `2.0 * 0.12 * contour * (1.0 - shadowUnion)`,
`mod(3.0 * phase - 0.1, 1.0)`, `0.30 * bigBlur * (1.0 - shape) * outerFalloff`,
`smoothstep(0.06, 0.55, heat)`, distinct `0.08`/`0.02` fractions, and the
"manually pinned renderer-local phase" (no time/lifecycle authority) test. RM test:
`not.toContain("fract(t")` / `not.toContain("fract(uTime")`. `scenarios.test.ts` +
`rendererReuse.test.ts` updated for the presets and forwarding.

**Runtime**: `expandedPresentationRuntime.ts` remains Paper-free (grep: no `paper`) — no
runtime scheduling change; paper mode fully static.

## 2. Files changed (final, this sub-phase)

- `src/presentation/main-window/ExpandedPresentationSurface.tsx`
- `src/presentation/main-window/expandedPresentationSurface.test.ts`
- `src/lab/LabOverlayStage.tsx`
- `src/lab/PresentationLab.tsx`
- `src/lab/scenarios.ts`, `src/lab/scenarios.test.ts`, `src/lab/rendererReuse.test.ts`
- `src/lab/locales/en.json`, `src/lab/locales/zh-CN.json`
- `THIRD_PARTY_NOTICES.md` (unchanged this sub-phase; already ACTIVE-derivative from prior round)
- Research: `capture-paper-morphology.html`, `fixed-phase-morphology-subphase.md`, this report

## 3. Evidence (authoritative GPU + cross-checked CPU)

- GPU harness `research/paper-heatmap-domain/capture-paper-morphology.html` (exact paper
  slice GLSL): **linked**; `createTexture:1`; `drawArrays:1`; `rmStatic.diffBytes:0`
  (static); fallback `createTextureDelta:0` center `#0d0d19`; all phases
  gutterLast/corner `[0,0,0,0]` (transparent 228 edge).
- Phase composites (GPU): A `#010208`/cool, B `#fd5515`/warm, C `#09194f`/cool,
  D `#000000`/cool centers — phase-varying interior, not flat.
- CPU renderer (exact algorithm, JS) cross-checked vs GPU: warm interior/edge points
  within 1–2 units; mid-alpha transition & premultiplied-zero-alpha regions only deltas.
- A/B vs REJECTED (numeric): flat interior `255,87,23`×6 → 6 distinct colors; continuous
  gold ring `[255,255]`×10 → 3 alpha-0 breaks, red 158–255. **Hypothesis NOT falsified.**
- Edge profile: all phases non-uniform (alpha min 0/max 255, red min 0/max 255).
- Screenshots: `2586ece9a4f73ca3.jpg` (phases+channels), `d9afe63f5703ba26.jpg`
  (intermediates+crops), `575638ee3ddd0e7c.jpg` (sweep+edge bands+profile),
  `9c5f67cbd24c6e14.jpg` (A/B), `98bb703bd7a1e8a4.jpg`/`457e839a047eb937.jpg` (layer FX
  OFF/ON).

## 4. Validations run / pending (host)

- **Run here**: GPU harness (compile/link, counts, RM static, fallback, pixel evidence);
  CPU↔GPU cross-check; DOM interaction/layer/shadow measurements; vision confirmation;
  production source & test assertions verified by grep (all new strings present, no drift).
- **NOT runnable here — bash broken** (`Cindy isolated Pi package home is unavailable`):
  focused Vitest (`expandedPresentationSurface.test.ts`, `scenarios.test.ts`,
  `rendererReuse.test.ts`), `npm run type-check`, `npm run lint -- --quiet`, full
  `npm test` (baseline 1773/1774, sole pre-existing
  `browser-extension/architecture-guard.test.js:277`), `git diff --check`. **Request
  host-run validation** (Lead host / `/simplify`).

## 5. Q1–Q6 answers (strict all-Yes PASS rule)

- **Q1 — Are broad/narrow scales mathematically AND visually distinct (0.08 vs 0.02) and
  do they drive distinct roles?** YES. 4× ratio; numeric scale probes (narrow→1 within
  ~7px, broad→1 within ~16px); narrow drives the contour edge packing, broad drives the
  warm field + outer shell + gutter halo. GPU channel views visually distinct.
- **Q2 — Does the fixed-phase composition produce Paper-like internal morphology (not a
  flat orange plate)?** YES. Phase-varying warm/cool interior across A–D; GPU interior
  samples span the full thermal ramp (6 distinct RGB values); subtractive shadows sculpt
  the interior (BEFORE vs AFTER intermediates).
- **Q3 — Is the morphology smooth, free of noise/plasma/carrier/grain-artifacts?** YES.
  Large soft blobs only; grain ≤ ±1 unit (accepted existing thermal grain); vision
  confirms smooth filled blobs.
- **Q4 — Is the edge energy non-uniform (no continuous gold/blue ring)?** YES. 10-point
  edge profile: alpha 0→255, red 0→255 every phase; A/B shows FIXED perimeter broken at 3
  points vs REJECTED continuous `[255,255]×10`.
- **Q5 — Are fixed phases A/B/C/D distinct, manually pinned, renderer-local (no
  time/scheduler/lifecycle authority)?** YES. `uPaperPhase` uniform, `paperPhase` prop
  default 0.35, Lab slider only in paper heatmap mode; `expandedPresentationRuntime.ts`
  Paper-free; RM static (`diffBytes:0`), zero continuing frames.
- **Q6 — Do all locked constraints hold (single renderer/resource, transparent 228 edge,
  14px-bounded halo, fallback, interaction, license/provenance)?** YES. GPU
  `createTexture:1, drawArrays:1` (no framebuffer); last-2px/corners alpha 0; halo reaches
  0 inside the 14px gutter (`outerFalloff`); fallback `createTextureDelta:0`; DOM layer
  demo (pill no-opt-in, clip auto/transparent/no-shadow, shell shadow, FX none); license
  header + `THIRD_PARTY_NOTICES.md` ACTIVE-derivative (Apache-2.0 + Paper NOTICE retained).

**Verdict: PASS — all six questions Yes. Hypothesis (Paper geometry-agnostic internal
morphology at fixed pinned phases yields broad non-flat warm/cool morphology with a
non-uniform edge) is supported; NOT falsified.**

## 6. Boundaries

No commit / no archive / no production integration / no Refraction binding / no
motion/timing/scheduling / no native resize / no new noise/plasma/carrier fields / no
unrelated dirty work touched. Prior and newly produced evidence preserved.
