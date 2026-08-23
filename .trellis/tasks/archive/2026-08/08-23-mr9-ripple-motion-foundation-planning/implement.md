# MR9 Ripple Motion Foundation: Post-Review Execution Plan

This checklist is activated by the approved implementation instruction. Run `task.py start` only after the corrected artifacts, manifests, and review gate have been confirmed.

## Slice 1: Pin the control source and isolate the route

- Record Ripple commit `99ee6e4412bcab34bcb4337f5f21845ae87c12d5`, the key shader blob, MIT text, original path, and a modified-source header in the candidate files.
- Add one mutually exclusive `Ripple source-fidelity` Lab scenario reachable only from the dedicated Lab entry.
- Keep ordinary Lab scenarios on the one Production `ExpandedPresentationSurface`; assert that Ripple mode mounts one candidate canvas and zero Production canvases.
- Keep the Production build input on `index.html` and add a build-graph/artifact assertion that no Ripple candidate module ships.

Rollback point: the route and candidate files can be removed without touching Production source.

## Slice 2: Establish the exact visual kernel

- Port the pinned WebGL1 vertex/fragment source without changing distance, noise, wavefront, envelope, displacement, RGB split, reveal, glow, or gate formulas.
- Use one 200x200 CSS canvas clipped by one r16 host and Ameow-owned deterministic square A/B fixtures. Do not copy upstream's Pinterest demo images.
- Implement bounded texture/program/buffer creation, DPR resize, context loss/restoration, and disposal around the pinned kernel.
- Add source/formula/blob checks and compile/link/resource tests.

Stop if the exact kernel cannot render at 200x200 without a second visual alteration. Report the failure instead of tuning.

## Slice 3: Put Ameow/Lab in control

- Add one candidate-local controller that owns generation, from/to fixtures, normalized origin, raw phase, scheduling, reverse, cancel settlement, and replacement.
- Map raw phase through the selected source-equivalent easing before setting `u_progress`.
- Keep `u_swap` derived/stable; do not copy the upstream animation lock, GSAP timeline, pointer listener, completion toggle, or semantic callback.
- Prove one pending frame maximum, stale-generation no-op, reverse/direct-scrub equivalence, and cancel-to-from/cancel-to-target behavior.

Rollback point: remove the controller and retain a static fixed-phase shader fixture for diagnosis.

## Slice 4: Lock the control baselines

- Add the default-selected user baseline with every proven mapping, including Pinch ON and Pinch Strength `.14`.
- Add a clearly labelled Pinch OFF pure-wavefront comparison from the same leaf.
- Never render, infer, no-op, or map a fictional `blend strength` control; `.14` is Pinch Strength.
- Add click origin and numeric facts plus fixed progress scrub, Forward, Reverse, and the two Cancel settlements.

## Slice 5: Produce source-fidelity evidence

- Capture tightly cropped 200x200 frames at fixed phases and a compact labelled contact sheet.
- Capture center, off-center, and near-corner origins; measure target settlement across the full r16 mask at phase 1.
- Compare Pinch ON user-baseline and Pinch OFF pure-wavefront morphology from the same leaf.
- Record WebGL program/resource counts, backing size, phase/uniform facts, context-loss recovery, and disposal in machine-readable artifacts.
- Run the Lab isolation/source guards plus type-check, lint, focused tests, renderer build, and a Production artifact scan.

Visual PASS requires one readable circular/cloud-like frontier, retained organic character, no dominant full-frame liquefaction/folding, and no stale source pixels at final settlement.

## Review gate and stop

- Submit the source-fidelity control and compact evidence to GPT Architecture Lead.
- Stop after the control review. Do not start Color automatically.
- A source-fidelity NO-GO closes the candidate or returns to planning; it does not authorize noise removal, Thermal fusion, or a custom substitute motion.

## Later separately approved slices

1. Color-only derivative with motion geometry frozen.
2. Hot Edge derived from the existing frontier mask.

Refraction, Halo, Production scene-texture ownership, Production integration, and a generic effect framework remain outside this execution plan.
