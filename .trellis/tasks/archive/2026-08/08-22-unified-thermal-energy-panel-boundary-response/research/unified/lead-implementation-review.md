# Cindy Lead Implementation Review — Unified Thermal Energy → Panel Boundary Response

Date: 2026-08-22  
Verdict: **HYPOTHESIS REJECT**  
Architecture status: **NOT GRANTED**  
Action: stop, preserve candidate/evidence, no repair, commit, archive, or production integration

## Outcome

The one-round Browser Lab candidate is rejected. Three independent stop conditions fired during
host review:

1. **Renderer/fallback regression:** the real production component shader does not compile.
2. **Automated validation regression:** the new focused source-contract suite fails.
3. **Continuous-perimeter visual failure:** the developed S4 state illuminates 97.9% of the
   sampled rounded boundary and reads as an almost closed bright edge.

The worker's standalone harness results remain useful evidence for the T/A/H/E hypothesis, the
12px compact halo falloff, and layer/hit-testing mechanics. They cannot establish a component PASS
because the harness did not reproduce the actual component shader defect and interpreted the
near-complete S4 perimeter too permissively.

## Stop Condition 1 — Actual Component GLSL Compile Failure

In `ExpandedPresentationSurface.tsx`, the function signature was changed to:

```glsl
float roundedBoundary(vec2 panelUv)
```

but its body still contains:

```glsl
vec2 qb = abs(uv - 0.5) - halfSize;
```

`uv` is not in function scope. The one shared WebGL program therefore fails fragment-shader
compilation before either unified-on or unified-off can render. TypeScript and source-string tests
cannot detect this class of GLSL error. This violates:

- unified-off fallback equivalence;
- accepted interior availability;
- one working WebGL renderer/program authority;
- the explicit fallback/resource regression stop rule.

Per the user's one-round falsification contract, Lead did not repair `uv` to `panelUv` and rerun.

## Stop Condition 2 — Focused Test Regression

Host focused command:

```text
npx vitest run src/presentation/main-window/expandedPresentationSurface.test.ts
  src/lab/scenarios.test.ts src/lab/rendererReuse.test.ts
```

Result: **61 passed, 1 failed**. The new negative regex
`/boundaryTime|boundaryPhase|secondTemperature|T2\b/i` matches the accepted identifier `contact2`
because the expression is case-insensitive and `t2` appears at its end. The test therefore fails
the candidate it was intended to lock.

This is a new task-local failure, not the known repository baseline failure.

## Stop Condition 3 — Continuous Perimeter

The task required boundary response to remain local and visibly broken, with immediate rejection
for a continuous perimeter. Worker measurements report:

```text
S4 k=0.50:
top    1.000
left   1.000
bottom 0.983
right  0.933
overall boundary-lit fraction 0.979
```

Only a far-corner gap remains. This is functionally an almost complete rounded outline, not a
localized boundary response. The screenshots also show a thin high-contrast edge surrounding most
of the panel. The worker's “not a closed ring” interpretation used literal closure as the bar;
the user's acceptance bar is stricter: the response must not **read** as a complete perimeter or
second silhouette. S4 fails that visual bar.

No threshold, response weight, or falloff adjustment was attempted after review.

## Host Validation

| Check | Result |
| --- | --- |
| Focused Vitest | **FAIL**, 61/62; new unified test failure |
| Type-check | PASS |
| Lint (`--quiet`) | PASS |
| Full Vitest | **FAIL**, 1778/1780; one new unified failure plus the known `browser-extension/architecture-guard.test.js:277` baseline failure |
| `git diff --check` | PASS |
| Actual component fragment shader | **FAIL by source inspection**, undefined `uv` in `roundedBoundary(panelUv)` |
| macOS | NOT VERIFIED, no host |

The full-suite baseline has grown from the earlier archived count because additional tests now
exist; the extension guard failure remains the same known unrelated failure.

## Evidence Review

Task-local copies:

- `evidence/unified-full-and-channels.jpg`
- `evidence/unified-edge-halo-evidence.jpg`
- `evidence/unified-layer-interaction.jpg`
- `unified-measurements.json`
- `capture-unified.html`

Useful non-PASS findings retained:

- analytic halo support reaches zero in the final 2px in the standalone harness;
- halo alpha is subordinate to interior/edge in sampled states;
- the proposed layer model preserves a non-interactive FX canvas and interactive UI clip in the
  standalone evidence;
- no texture or framebuffer is required by the proposed math;
- Reduced Motion harness frames are static.

Limitations:

- captures are from a standalone copied harness, not the failing actual component program;
- screenshots are whole-page evidence with small visual probes, not review-grade per-state crops;
- the layer screenshot is too small to independently certify drag behavior or CSS-shadow unity;
- a source-string assertion is not GPU compile/link evidence for the component shader.

## Simplification Review

The candidate adds 476 lines across nine source/test files for a Lab-only spike. The core scalar
experiment is much smaller than its UI/evidence plumbing. This alone is not the rejection reason,
but a future authorized attempt should avoid visible Lab-only pill styling, repeated object
defaults on each render, and source-string assertions that approximate runtime shader validity.
No simplification edits were applied because the stop rule freezes the rejected candidate as
evidence.

## Boundary Compliance

- Candidate and all evidence are preserved uncommitted.
- No shader/test/parameter repair was made after a stop condition fired.
- No production integration, entry/exit, timing, native resize, commit, archive, or Architecture
  PASS occurred.
- The accepted Thermal + Refraction checkpoint remains recoverable at HEAD; the rejected diff is
  isolated in the worktree.

## Final Judgment

**REJECT this implementation candidate and stop.** The result does not establish that the unified
energy architecture is impossible; it establishes that this single authorized candidate failed
the renderer correctness and localized-boundary visual gates. Any new attempt requires explicit
GPT Architecture Lead direction and a newly authorized phase. Do not repair or continue from this
turn automatically.
