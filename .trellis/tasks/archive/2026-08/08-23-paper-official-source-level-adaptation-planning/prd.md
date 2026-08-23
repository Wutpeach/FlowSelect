# Paper Source-Level High-Fidelity Adaptation

## Goal

Implement and validate the single approved source-level adaptation of Paper's official Heatmap that mirrors its native animated outer field into Ameow's 200×200/r16 panel interior. The prototype must remain grounded in Paper 0.0.80 source, preserve every non-domain semantic, stay isolated in Browser Lab, and stop before Production integration.

## Background

- Paper's official Heatmap source is the fidelity baseline.
- The accepted official baseline, panel-mapping A/B comparison, and final public-prop C0-C4 calibration all remain isolated from the stable Thermal Production checkpoint.
- The public-prop route is closed: native frames advanced, but the strongest C4 candidate remained visually static in the panel interior and its start/end 200×200 crops were byte-identical.
- GPT Architecture Lead Planning Review approved the one-selector candidate, and the user explicitly authorized isolated implementation on 2026-08-23.

## Requirements

### R1. Official source responsibility map

- Trace the official React wrapper, preprocessing, coordinate transforms, fragment-domain split, motion/morphology, heat/palette composition, and `ShaderMount` lifecycle.
- Identify the exact semantics that define object, interior, exterior, and the heat field's active domain.

### R2. Perimeter root boundary

- Locate the smallest causal boundary responsible for the current perimeter-oriented result.
- Distinguish upstream source semantics from Ameow input geometry, wrapper composition, clipping, and Production behavior.

### R3. Minimum derivative adaptation

- Recommend only a local source adaptation that preserves Paper motion, timing, morphology, preprocessing/coordinates, heat/palette behavior, and lifecycle.
- Explain why the result is a Paper derivative rather than a clean-room rewrite.
- If upstream evidence does not support a single bounded seam, return NO-GO without proposing a custom motion system.

### R4. Isolated Browser Lab feasibility

- Define the minimum prototype boundary, visual/runtime/source-fidelity validation, risks, and hard stop conditions.
- Keep the stable Thermal Production checkpoint and all Production integration closed.

### R5. License and provenance

- Separate mandatory Apache-2.0 redistribution duties, conditional NOTICE/notice-retention duties, and recommended provenance hygiene.
- Account for copied or modified source, modified-file notices, Paper NOTICE, and trademark/endorsement limits.

## Architecture Constraints

- Do not design a new motion system or an entry/exit/traversal carrier.
- Do not mix in Ameow Thermal, Refraction, or prior independently authored Paper-like renderer work.
- Do not refactor toward Production or weaken Paper fidelity for Production architecture.
- Keep the stable Thermal Production checkpoint untouched.
- Limit any future prototype to the isolated Browser Lab.
- Prefer the smallest adaptation and create no extension framework or premature abstraction.
- Implementation is limited to the approved Lab-local derivative selector and necessary provenance/wiring/tests/evidence. Production remains closed.

## Acceptance Criteria

- [x] AC1: The derivative differs from pinned official source only at the approved interior-domain selector plus necessary Lab-local wiring/provenance.
- [x] AC2: Browser Lab renders official Scheme-B control and derivative side by side over one real 200×200/r16 panel per cell.
- [x] AC3: The derivative's Paper-native dynamic field visibly enters and continues changing in the central panel interior rather than only the perimeter.
- [ ] AC4: Source fidelity is mechanically verified, but final visual recognition is reserved for the user; the current broad-band morphology triggered NO-GO review.
- [x] AC5: Runtime evidence proves native frame advancement, one Paper-owned canvas per candidate, clean disposal/remount, and zero simultaneous Production preview.
- [x] AC6: Apache-2.0, Paper NOTICE, modified-file notice, and pinned 0.0.80/gitHead provenance are complete.
- [x] AC7: Production bundle and stable Thermal checkpoint remain isolated and unchanged.
- [x] AC8: The report records minimum-adaptation NO-GO at the generic-scrolling-band Hard Stop and stops without tuning or an alternative implementation.

## Out of Scope

- Modifying Production presentation, Thermal, native-window, renderer, lifecycle, or stable integration branches.
- Designing a replacement motion, palette, carrier, or morphology system.
- Any second selector/formula change, prop sweep, palette/motion tuning, visual compensation, or generic shader patch/fork framework.
- Commit, push, PR, release, or public-documentation work.

## Confirmed Decision

The selector-inversion prototype is authorized and active. The user owns the final visual judgment; this task may report evidence and Hard Stop status but may not grant Architecture PASS.
