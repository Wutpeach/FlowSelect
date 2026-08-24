# Directional Exit / Terminal Convergence Browser Lab Spike

## Goal

Replace the accepted Thermal checkpoint's full-field opacity exit with a bounded Browser Lab-only directional spatial exit. The same field that enters from lower-left and travels toward upper-right must continue through the window: the lower-left clears first, the remaining Thermal/Refraction region converges toward the upper-right terminal area, and the last active material leaves the real rounded boundary.

## Architecture Decision Delta (GPT Architecture Lead, 2026-08-21)

- **REJECTED** the first spike mechanism: a moving trailing half-plane driven by `trailingFront`/`trailingD` that produced a hard diagonal coverage edge. Direct inspection showed it read as a **diagonal moving mask/wipe** over otherwise stationary material, not as the field itself moving. The assumption that shrinking coverage alone creates convergence was dropped.
- **LOCKED** (unchanged): existing travelling `k` / `DIR` / `bendTime`, lower-left -> upper-right causality, accepted 2D multi-temperature Thermal topology/palette/material identity, accepted Refraction model/strength, rounded boundary, Reduced Motion semantics, and single surface/canvas/WebGL program/runtime authority.
- **ACCEPTED** the repair: a renderer-local shader coordinate transform driven by the existing `exitProgress` derived from `k`. The sampled material coordinates translate toward the upper-right terminal direction and compress directionally/anisotropically (the field is resampled with an increasing scale factor about the terminal, so Thermal and Refraction visibly densify and bunch as they travel up-right). Coverage is relegated to a broad soft elliptical containment for residue/terminal cleanup only.
- **8-frame acceptance sequence** (captured under `research/directional-exit/evidence/`): `developed` (k=0.55), `convergence-onset` (k=0.62), `exit-early` (k=0.70), `exit-middle` (k=0.78), `exit-late` (k=0.86), `upper-right-terminal` (k=0.92), `terminal-just-before-zero` (k=0.96), `zero` (k=1.00).

## Authoritative Baseline

- Worktree: `D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx`
- Branch: `motion/mr9-fullscreen-activation-fx`
- Checkpoint: `8a80474`
- Accepted Thermal + Refraction + 2D multi-temperature material implementation: `046f228`
- Existing single `ExpandedPresentationSurface`, canvas, WebGL2 program, renderer-local runtime, travelling direction, rounded-boundary contact, and Reduced Motion contract remain authoritative.

## Requirements

### R1. Directional spatial disappearance

- The primary exit mechanism is a renderer-local material-coordinate transform, not global material alpha and not a hard coverage edge: the sampled field translates toward the upper-right terminal direction and compresses directionally/anisotropically, so the material itself visibly moves and bunches.
- Once the field is developed, the active lower-left region must clear first while remaining coverage continues shrinking toward the upper-right.
- Developed, exit, and terminal coverage must be continuous extensions of the existing travelling field and its lower-left to upper-right direction.
- The final local terminal region must naturally leave through the real rounded upper-right boundary.

### R2. Soft containment and terminal alpha cleanup only

- Global opacity must not drive the visible exit.
- Coverage is allowed only as a broad soft elliptical containment that follows the converging field (no hard edge or moving half-plane) plus a very short terminal alpha cleanup for the final subpixel residue.
- The cleanup must be subordinate enough that representative exit frames do not read as a synchronized full-screen fade.

### R3. Preserve accepted material and architecture

- Keep the accepted 2D multi-temperature topology, palette, material identity, Refraction model/strength, diagonal travelling grammar, and rounded-boundary contact unchanged within the remaining active region.
- Keep one `ExpandedPresentationSurface`, one canvas, one WebGL2 renderer/program, one draw call, and one renderer-local runtime authority.
- Reuse the existing travelling phase/time. Add no exit clock, scheduler, oscillator, lifecycle state, generic choreography framework, or new semantic authority.
- Keep the spike Browser Lab-only and do not change production call sites.

### R4. Reduced Motion

- Preserve the current Reduced Motion authority and pinned snapshot semantics.
- Add no continuing animation path or accessibility lifecycle expansion.

### R5. Evidence and report

- Capture representative Browser Lab frames for developed/near-full, exit early, exit middle, exit late, and terminal/just-before-zero.
- Report where the old global-opacity exit was replaced or reduced to terminal cleanup, how coverage shares the existing travelling causality, whether authority changed, whether material/refraction changed, validation results, and Cindy Lead's visual verdict.

## Acceptance Criteria

- [ ] AC1: Exit reads as the accepted Thermal/Refraction field translating toward upper-right and converging, with the lower-left visibly empty before the upper-right terminal region leaves.
- [ ] AC2: Lower-left entry and upper-right exit form one continuous travelling causality.
- [ ] AC3: Developed to exit to terminal remaining coverage is continuous and visually natural; the material visibly moves and compresses rather than sitting still under a mask.
- [ ] AC4: No obvious synchronized full-screen fade, reverse collapse, perimeter chase, opposite closure, moving mask/wipe, symmetric scale-down, centered shrinking rectangle, internal geometry, or new UI-like shape appears.
- [ ] AC5: Accepted 2D Thermal material and Refraction identity remain intact wherever coverage remains active.
- [ ] AC6: Renderer, motion, lifecycle, and Reduced Motion authority invariants do not regress.
- [ ] AC7: Focused tests, type-check, lint, full tests, and `git diff --check` are run; any pre-existing failure is reproduced and documented.
- [ ] AC8: The 8-frame acceptance sequence PNGs plus a written spike report are stored under this task for GPT Architecture Lead Review.

## Out of Scope

- Fast-slow-fast timing tuning.
- Production integration, public docs, packaging, release work, commit, or Trellis archive.
- Perimeter Chase, Opposite Closure, Mask/Noise Dissolve, reverse playback, or a generic transition/choreography framework.
- Palette/material topology retuning, Refraction retuning, or new accessibility lifecycle semantics.
