# MR9 Ripple Motion Foundation: Technical Design

## Decision

Plan one isolated Browser Lab source-fidelity control based on Ripple commit `99ee6e4412bcab34bcb4337f5f21845ae87c12d5`. Do not integrate Production, reuse the current Thermal shader, combine effects, or introduce a generic rendering abstraction.

## Boundaries

```text
Lab transition authority
  generation / from / to / origin / phase / settle decision
                         |
                         v
candidate-specific Ripple visual leaf
  easing projection / pinned uniforms / WebGL1 draw
                         |
                         v
pixels only
```

The visual leaf has no pointer listener, product state, `animating` lock, GSAP timeline, semantic completion callback, or internal swap commit.

## Lab composition

- Add one named Ripple source-fidelity scenario to the existing dev-only Lab entry.
- Render it mutually exclusively from ordinary `LabOverlayStage` scenarios.
- Ripple mode owns one Lab-only 200x200/r16 canvas; ordinary modes keep the one Production `ExpandedPresentationSurface`.
- Keep Production Vite input pinned to `index.html`; the candidate is reachable only from `lab.html` / `src/lab/`.
- Narrow the existing “no Lab shader” architecture guard only for the one named candidate module and assert the mutual-exclusion/build-isolation invariants.

## Candidate-specific inputs

- two Ameow-owned deterministic square texture fixtures; the upstream Pinterest demo images are prohibited;
- normalized top-left point origin, finite-checked and clamped to `[0,1]`;
- authoritative phase `[0,1]` supplied by the Lab controller;
- pinned source parameters plus the mapped user baseline;
- selected preset: Pinch ON user baseline or Pinch OFF pure-wavefront comparison.

The user baseline defaults to duration `1.4s`, sigma `.15`, wave frequency `5`, displacement `.155`, chromatic separation `.0225`, glow `.37`, noise warp `.70`, source-equivalent `power3.out`, Pinch ON, and Pinch Strength `.14`. `.14` is Pinch Strength, never a blend-strength value: the candidate must not expose, invent, or map a fictional blend-strength uniform or no-op.

The 1.4-second duration is a source-fidelity control value, not a Product responsiveness commitment. A later Product integration must keep semantic state and essential controls non-blocking while motion runs and must review final timing separately.

## Runtime behavior

- Forward and Reverse change the same authority-owned phase; progress-animated noise follows the same deterministic path.
- Cancel stops the current generation and lets the controller settle explicitly to source or target.
- Completion commits only after phase 1 is rendered and the entire r16 mask is target-stable.
- Replacement invalidates stale scheduled callbacks through a local generation token.
- At most one animation frame may be pending.
- Compile/link/render/context failure fails closed and never changes authority state.
- Resize/DPR/context restoration/disposal follow the bounded patterns already proven by `ExpandedPresentationSurface`, without importing its Thermal program.

## Source fidelity

Keep the WebGL1 shader and formulas exact for the control. Host changes required by 200x200/r16, fixture selection, and external phase ownership are documented adapters. Preserve upstream off-center normalization and reversed-edge `smoothstep`. WebGL2 conversion, Color, Hot Edge, and fictional blend-strength semantics are derivative changes and remain outside the first source-fidelity slice.

## Production compatibility

The current Product path resolves semantic priority before one pointer-transparent Expanded host and keeps lifecycle/product facts outside the renderer. A future Ripple host can follow that direction, but direct Production integration is blocked by missing ownership of the two before/after textures. No DOM capture, GPU scene compositor, second host, or envelope-only rewrite is selected here.

## Visual adaptation sequence

1. source-fidelity control and review;
2. Color-only derivative, freezing all motion geometry and keeping strong color localized to state/frontier feedback rather than turning the whole panel into decoration;
3. Hot Edge from the existing frontier mask;
4. Refraction/Halo only after a new evidence-backed decision.

## Provenance

Copied or modified source retains the full MIT notice and a file header with upstream repository, commit, original path, modifications, and the upstream inspiration credit to Minsang's "Ripple with Noise". GSAP is excluded from the recommended adapter and its separate license is not inherited through Ripple's MIT license. The Pinterest demo images are not copied. Direct reuse of Minsang's original Metal source is outside this plan and would need separate license/provenance review.

## Rollback

The future control is removable as a Lab-local slice: delete its scenario/module/fixtures/tests/evidence and restore the narrow Lab guard. Production has no change to roll back.

## Architecture escalation triggers

Return to GPT Architecture Lead if the control appears to require Production source changes, a second simultaneous renderer, a general shader/effect API, Paper/Thermal code, scene/DOM capture, multipass composition, GSAP, an inferred blend-strength mapping, or more than the one pinned-source host adaptation before fidelity review.
