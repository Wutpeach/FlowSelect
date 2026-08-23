# Compact Mascot implementation validation

## Implemented result

- Baseline: `motion/mr9-fullscreen-activation-fx` at `2f5f1a0`.
- Upstream source: `smontlouis/bible-strong-avatar-lab` at
  `175691ab32cefe5faec7828af62f3d50210a8eb2`.
- Runtime dependency: exact `@bible-strong/avatar-core@0.1.0`.
- Source visual: pinned Strobi definition reduced only to `neutral` plus the
  three official default `proud` expressions; the numeric body, eye, color,
  transition, hold, and blink values are unchanged.
- Production host: one `CompactMascot` SVG leaf under the existing
  `MainWindowPresentationSurface`. The former Flat Blob Cat host, recipe,
  spring/blink runtime, and tests were removed atomically.
- No Full/MR9, lifecycle, Product, native-window, IPC, Pointer Field writer,
  geometry, hotspot, shell motion, UI Lab structure, or Agentation authority
  was added or moved.

License/governance remains the separately approved formal distribution/release
gate. It did not redirect this implementation to custom recreation.

## Direct candidate and source fidelity

The exact `@bible-strong/avatar-react@0.1.0` package was mounted temporarily in
the real UI Lab Compact stage at 80/60/56 geometry, using the pinned definition
and its default `proud` animation. It remained legible and unclipped at 1x;
2x/3x exposed no scene or eye-path defect. The temporary React renderer and
package were removed before the derivative production integration.

All three pinned `proud` expressions declare `motion.eyes: "none"` and
`motion.body: "none"`. Source-fidelity ambient behavior therefore means no
additional independent drift or micro-saccade in this loop; motion comes from
the authored pose transitions and official blink. The adapter does not invent
ambient motion that the source definition does not contain.

Evidence under `research/evidence/` is cropped to the actual Compact stage:

- `direct-react-1x-step-{1,2,3}.png`: official direct package at three authored
  `proud` poses/transitions.
- `direct-react-3x.png`: official direct detail reference.
- `derivative-1x-step-{1,2,3}.png`: production adapter at the same source loop.
- `derivative-3x-dark.png`: derivative detail reference. Its SHA-256 is exactly
  the same as `direct-react-3x.png`:
  `5F1120CACF462059CFE30F7FDFF9A5A8A9D3C11C6CAECC7AD0E9BEBFEA09A18F`.
- `derivative-3x-blink.png`: official blink geometry detected at 2156ms, with
  eye-path height reduced to 14.22 viewBox units.
- `derivative-3x-{light,checkerboard}.png`: existing environment checks.
- `derivative-pointer.png`, `derivative-reduced.png`: bounded pointer and Ameow
  Reduced Motion policy.
- `full-mr9-regression.png`: tightly cropped existing Full production canvas.

## Browser runtime matrix

Playwright drove the UI Lab production leaf, not a test-only renderer:

- `sourceStepsDiffer: true`: all three sampled `proud` eye paths differ.
- `pointerChanged: true`: the existing Lab Pointer Field changed only the local
  core eye projection.
- `reducedStable: true`: the Reduced Motion eye path was byte-identical across
  1200ms; eyes stayed open and no frame loop was scheduled.
- `hiddenStable: true`: the normal-motion path remained unchanged while hidden.
- `visibleResumed: true`: source playback resumed after visibility returned.
- Full target: one production canvas, zero Compact mascot instances.
- Remount: exactly one Compact mascot instance with a valid eye path.
- Browser page errors: none.

## Automated validation

- `npm run lint`: PASS.
- `npm run type-check`: PASS.
- Focused Compact/Lab/import-guard suite: 9 files, 84 tests PASS.
- Full `npm test`: 208 files, 1821/1822 tests PASS. The sole failure is the
  pre-existing Windows CRLF-sensitive assertion in
  `browser-extension/architecture-guard.test.js` (`return false;\n});`); the
  identical failure reproduces at untouched baseline `2f5f1a0`.
- `npm run build`: PASS (renderer and Electron).
- `npm run docs:build`: PASS after installing the worktree-local `site`
  dependencies from its lockfile; 53 pages built.
- `git diff --check`: PASS.

Windows native hotspot/writer ownership is structurally covered by the
unchanged surface implementation plus import/surface tests. A separate macOS
environment was not available: macOS visual/native interaction is **NOT
VERIFIED**.

## Review closeout

GPT Architecture Lead passed the Implementation Architecture Review on
2026-08-23. Implementation and validation are complete for the first pinned
Strobi/default `proud` scope. Close out this task without beginning animation
mapping, avatar selection, a mascot framework, Full mascot work, or formal
release governance implementation.
