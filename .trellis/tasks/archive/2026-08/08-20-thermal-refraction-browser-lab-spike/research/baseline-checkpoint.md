# Accepted Thermal Baseline Checkpoint

- Authoritative branch/worktree: `motion/mr9-fullscreen-activation-fx` at clean journal checkpoint `d4a5aea`.
- Accepted implementation commit: `e01be01 feat(presentation): complete MR9 activation and progress refinement`.
- Accepted MR9 Trellis archive commit: `a846c64`.
- Locked shader signals/constants: `k`, `front`, `bendTime`, `DIR`, `d`, `body`, `warm`, `core`, `energy`, `boundaryBand`, `capture`, `heat`, material lifts, seven-stop palette, yellow transition, inward edge treatment, grain, and alpha.
- Locked architecture: one `ExpandedPresentationSurface`, one canvas, one WebGL2 program, one draw, no texture/sampler/framebuffer/multipass, one renderer-local runtime.
- Reduced Motion baseline: `k = 0.42`, `bendTime = 0.0`, static render, zero continuing frame loop.
- Refraction may add only a Lab-gated analytic displacement derived from existing Thermal signals and the same `bendTime`; the false path must preserve the accepted baseline.
- Source evidence remains in the archived MR9 task at `research/mr9-edge-repair.md`; this summary exists only to satisfy bounded task-context injection.

