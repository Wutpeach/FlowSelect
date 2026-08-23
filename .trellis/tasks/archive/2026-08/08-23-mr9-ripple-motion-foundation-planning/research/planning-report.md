# Ameow MR9: Ripple Motion Foundation Planning Report

Status: **ready for GPT Architecture Lead Planning Review**  
Decision: **conditional GO for one isolated Browser Lab source-fidelity control; NO Production integration authorization**

## Executive conclusion

Ripple is a credible MR9 motion-foundation candidate because its visual core is a real point-origin, aspect-correct radial field whose organic frontier, displacement, RGB separation, glow, and A/B reveal are all driven by one normalized progress value. It can fit Ameow's one-way Presentation architecture only after separating that visual core from the upstream demo's pointer, GSAP, animation lock, completion, and swap ownership.

The next smallest experiment is one candidate-specific, Lab-only WebGL1 control at 200x200/r16 using the pinned upstream shader and the user's proven parameter mappings. It must be mutually exclusive with the existing Production preview and contain no Paper/Thermal effects. This experiment proves motion/source fidelity only.

The source baseline's `1.00x` is a 1.4-second visual duration. It is preserved for control fidelity, not adopted as Product interaction latency. Any later Product use must remain non-blocking, keep essential controls available, and separately review whether that duration is compatible with Ameow's compact task flow.

Production fit remains deliberately unresolved because upstream Ripple requires two input textures while Ameow's current Expanded canvas is a transparent procedural overlay and cannot sample the DOM beneath it. No scene capture/compositor route is selected here.

## Source-fidelity baseline

- Upstream repository: <https://github.com/m1ckc3s/ripple>
- Fixed revision: [`99ee6e4412bcab34bcb4337f5f21845ae87c12d5`](https://github.com/m1ckc3s/ripple/tree/99ee6e4412bcab34bcb4337f5f21845ae87c12d5)
- Revision date: `2026-06-06 05:19:41 -0400`
- Key visual-source blob: `src/components/RippleTransition.tsx` = `b4dfb79972a3b56f622d7ce67368bd91a80af829`
- Live demo checked on 2026-08-23: <https://ripple-gl.vercel.app/>, asset `index-D6zHpvaO.js`
- License: MIT, copyright 2026 Mick Cesanek
- Inspiration provenance: Minsang (`@radiofun8`), "Ripple with Noise" Metal shader, credited by upstream README

The Git commit is authoritative. The live bundle corroborates identifiers/defaults but does not expose a deploy commit, so it is supporting evidence rather than revision authority.

Detailed upstream evidence: [upstream-ripple-source-analysis.md](./upstream-ripple-source-analysis.md).

## What upstream actually does

```text
pointerdown / Replay
        |
        v
trigger(cx, cy) + animating lock
        |
        +--> optional GSAP pinch timeline
        |
        v
GSAP progress 0 -> 1 with selected ease
        |
        v
u_center + u_progress + visual uniforms
        |
        v
aspect-correct distance
  + animated large/small fBm warp
  + coverage-scaled radial wavefront
        |
        v
Gaussian x cosine ripple envelope
        |
        +--> radial displacement
        +--> RGB split
        +--> glow
        +--> noisy A/B reveal
        |
        v
onComplete toggles demo swap and resets progress
```

The organic character is not a single noise knob. It comes from two animated fBm fields, their different scales/velocities, the Gaussian/cosine envelope, radial UV displacement, noisy reveal feather, RGB separation, and glow. The plan preserves that whole grammar. `noiseWarp=.70` is a positive baseline value, not an instruction to remove noise.

## Baseline parameter disposition

| Requested control | Control value | Pinned-source mapping |
| --- | ---: | --- |
| Transition speed | `1.00x` | `duration=1.4s` |
| Wavelength | `.15` | `sigma=.15`; upstream label is **Wave Width** |
| Ripple density | `5` | `waveFreq=5` |
| Displacement | `.155` | `pushAmt=.155` |
| RGB split | `.0225` | `caStrength=.0225` |
| Glow | `.37` | `glow=.37` |
| Noise warp | `.70` | `noiseWarp=.70` |
| Ease Out (strong) | n/a | GSAP-equivalent `power3.out` |
| Pinch | `ON` | `pinch=true` baseline |
| Pinch Strength | `.14` | `pinchStrength=.14` |

All listed controls are source-grounded. `.14` is Pinch Strength, not blend strength; the control must not expose, invent, or map a fictional blend-strength control to reveal feather, texture mix, displacement, glow, alpha, or any other uniform.

The user baseline defaults Pinch ON with Pinch Strength `.14`. Pinch OFF remains a clearly labelled pure-wavefront comparison, not the default lane. Pinch is not added to Product scope by this plan.

## Architecture fit with Ameow

Ameow's current Product descendant is `motion/compact-mascot-visual` at `2bb9a221708c211bdec8721e02d0e469de44ef89`, which contains the MR9/UI Lab ancestor `2f5f1a01ade572fcf06e2d5df1e9fec8da941511`. The root `main` worktree is a Trellis/journal line and is not the Product source baseline.

The current architecture already establishes the needed direction:

- Application/Product facts create bounded Intake/Folder opportunities.
- pure Presentation policy resolves one target before rendering;
- settled Full lifecycle state only gates renderer eligibility;
- one consumer-local runtime and one pointer-transparent WebGL2 host draw pixels;
- renderer failure, sleep, disposal, or context loss cannot change semantic state.

Ripple fits this direction as a visual leaf. The upstream component itself does not fit because it owns event capture, clock/easing, re-entry policy, completion, and swap.

Detailed repository evidence: [ameow-architecture-fit.md](./ameow-architecture-fit.md).

## Reuse / derivative / adapter boundary

### Suitable for direct source reuse in the control

- vertex and fragment visual math at the pinned commit;
- radial/aspect coordinate model;
- `hash21`, value noise, both fBm fields;
- coverage/wavefront, warped distance, ripple envelope, displacement, RGB split, reveal, and glow;
- uniform parameter meanings and upstream-default reference values.

### Explicit derivative surface

- fixed 200x200/r16 host instead of upstream responsive portrait sizing;
- deterministic square fixtures instead of treating the portrait demo images as Ameow scenes;
- any later WebGL2 syntax port;
- later Color, then Hot Edge;
- any fictional blend-strength semantics;
- any correction to off-center distance normalization or reversed `smoothstep`.

Every derivative must be measured against the frozen source control. None belongs in the first source-fidelity slice unless required merely to host the exact shader at 200x200.

### Ameow-owned adapter / authority

- normalized origin capture and validation;
- ordered `from`/`to` textures and committed state;
- transition generation, start, raw phase, end, reverse, cancel, and replacement;
- source-equivalent easing projection into `u_progress`;
- rAF scheduling, stale-frame cancellation, resize/DPR/context cleanup, and fail-closed behavior;
- Reduced Motion policy in a later Product task.

Forbidden upstream semantics are `pointerdown` inside the visual leaf, `animating`, GSAP-owned lifecycle, pinch timeline as transition authority, `onComplete` state commit, and internal `swap` toggling.

## Ameow control contract

The candidate needs only a concrete current-frame input: stable from/to textures, normalized origin, authoritative phase `[0,1]`, and the source parameters. It does not need a general shader/effect interface.

- Ameow starts by fixing generation/from/to/origin and phase 0.
- Ameow advances or decreases phase; the visual projection applies the selected easing and renders.
- Ameow cancels by stopping frames and choosing settlement at from or to.
- Ameow commits the target only after phase 1 renders target-stable pixels throughout the r16 mask.
- Replacement invalidates stale frame generations.
- Ripple emits no semantic completion callback.

“Boundary reached” means the expanding/noisy transition has fully settled the clipped panel to the target. It is not the first noise tendril touching an edge.

## Minimum isolated Browser Lab control

One new `Ripple source-fidelity` scenario, mutually exclusive with the existing standard preview:

- exactly one Lab-only WebGL1 canvas in a 200x200/r16 logical host;
- Ameow-owned deterministic square A/B fixtures; do not copy the Pinterest demo images that upstream marks as demonstration-only;
- click-to-set point origin and numeric normalized origin facts;
- fixed phase scrub plus Forward, Reverse, Cancel-to-from, and Cancel-to-target;
- default-selected Pinch ON user baseline and a clearly labelled Pinch OFF pure-wavefront comparison from the same visual leaf;
- one concise provenance block with repo, commit, source blob, license, and live-demo observation;
- advanced uniform/resource diagnostics only;
- no Paper, Thermal, Refraction, Halo, Production canvas, Electron bridge, generic shader editor, or effect registry.

The existing dedicated Lab server and Production single-entry build provide the isolation boundary. One current architecture test that forbids all Lab-local shaders must be narrowed only enough to recognize this named mutually exclusive candidate; ordinary scenarios must continue to use the one Production host.

## Source-fidelity validation

### Automated/source gates

- pinned commit/blob and attribution header;
- normalized shader source/formula diff;
- exact uniform/default/baseline mapping assertions;
- exact Pinch ON / Pinch Strength `.14` mapping and explicit negative assertion for fictional blend-strength semantics;
- one 200x200/r16 canvas, one program/draw, no Paper/Thermal imports;
- no upstream authority code in the visual leaf;
- Production build graph/artifact contains no Ripple candidate;
- phase reversal equivalence: rendering a decreased phase matches direct scrub to that phase;
- phase 1 target settlement across the radius-16 mask;
- one-pending-frame, stale generation, stop/cancel, context loss, resize/DPR, and disposal checks.

### Visual gates

- tightly cropped 200x200 frames at fixed phases and one compact labelled contact sheet;
- center plus representative off-center/near-corner origins;
- Pinch ON user-baseline versus Pinch OFF pure-wavefront captures from the same leaf;
- clear single expanding circular/cloud-like frontier;
- organic/noise character remains present;
- no dominant full-frame liquefaction/folding and no loss of wavefront readability;
- arrival/settlement at every r16 boundary region without stale source pixels;
- state change remains legible without making the whole panel read as decorative spectacle or delaying task controls;
- companion numeric probes remain machine-readable files, never screenshots of raw JSON.

The live demo is a morphology/control sanity reference, not a pixel oracle: its viewport is portrait, timing is interactive, and its deploy commit is not exposed.

## Visual adaptation order

After a source-fidelity PASS only:

1. **Color:** change color response while freezing motion/noise/reveal/displacement geometry.
2. **Hot Edge:** use the existing `delta/envelope` as one narrow warm frontier; no second wavefront/time source.
3. **Refraction / Halo:** deferred and absent unless later visual evidence identifies a concrete deficiency.

Paper/Thermal checkpoints remain review knowledge and visual reference material. No prior code, palette, shader block, or effect list is mandatory. If reuse compromises Ripple identity, do not reuse it.

## Main risks and stop conditions

1. **Production scene-source gap:** static Lab textures do not solve live DOM before/after texture ownership. Stop before Production design.
2. **Off-center radial flattening:** upstream's center-based normalized-distance clamp may reduce far-side radial readability. Characterize before changing.
3. **GLSL portability:** reversed-edge `smoothstep` is undefined by spec. Preserve it in the control; require browser/GPU evidence before a named derivative repair.
4. **Dependency reproducibility:** pinned upstream `npm ci` fails due an out-of-sync lockfile. Pin source/blob provenance; do not adopt the lockfile as authority.
5. **GSAP licensing/authority:** GSAP has separate terms and would duplicate Ameow's control. Do not add it for the recommended adapter.
6. **Texture/aspect confound:** upstream images are 490x980; use square deterministic fixtures for the 200x200 motion decision.
7. **Visual over-adaptation:** any second shader change before source-fidelity review is a stop.
8. **Architecture creep:** any generic renderer/effect framework, second Production host, DOM capture/compositor, Paper restart, or Ripple+Thermal fusion is a stop and requires a new Architecture review.
9. **Product-duration mismatch:** upstream `1.00x` means 1.4 seconds, longer than ordinary compact UI feedback. Keep it as a source reference; do not let it block semantic completion or essential controls, and require a later Product timing decision before integration.

## License / provenance requirements

- retain Mick Cesanek's 2026 copyright and full MIT notice with copied/substantial source;
- add a modified-source header naming repository, exact commit, original path, MIT license, and Ameow changes;
- do not copy upstream `image-a.png` / `image-b.png`; their original creators retain copyright and upstream includes them only for demonstration;
- retain the upstream inspiration credit to Minsang's "Ripple with Noise" while deriving only the pinned Mick Cesanek GLSL/WebGL source; any direct Metal-source reuse requires separate license/provenance review;
- do not treat Ripple's MIT license as covering GSAP;
- include provenance/source-diff checks in review evidence and eventual third-party notices if code ships.

## Review gate

This report completes planning only. The task remains `planning`; no `task.py start`, Product edit, Browser Lab implementation, Production integration, branch operation, or release action is authorized. Wait for GPT Architecture Lead Planning Review.
