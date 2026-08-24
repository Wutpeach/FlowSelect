# MR0 — Motion / Presentation Architecture Foundation

## Outcome

MR0 establishes only the repository-level contracts that MR1–MR4 need in common: authority and dependency direction, renderer-local disposable runtime semantics, persistent/transient/terminal composition, interruption/retarget/disposal, reduced motion, sleep/wake policy, and validation. It does not implement a visual effect, choose one renderer technology, or create a shared animation framework.

This task remains **planning** until GPT Architecture Lead approval. Do not run `task.py start`, change product code, commit, archive, or enter MR1–MR4 during this phase.

## Repository provenance

| Tree | State | MR0 use |
| --- | --- | --- |
| `D:/Ameow`, `main` at `e40f5fe` | committed; does not contain the reconstructed M0–M2 presentation architecture | pre-M0 reference only |
| `D:/Ameow/.cindy-worktrees/auto-o3p8cr`, `cindy/auto-o3p8cr` at `69d0ff8` | committed M0/M1 (`e8b09d8`) and M2 (`daad4bc`) plus approvals | **target architecture baseline** |
| same worktree, dirty uncommitted files | paused M3 and ordered-bootstrap candidate work | evidence/candidate assets only; not shipped authority or a required visual baseline |

All implementation anchors in this task refer to the worktree baseline unless explicitly labelled otherwise.

## Fixed architecture constraints

1. Product/Application facts, Main Window Presentation Lifecycle state, and continuous renderer Motion state remain separate authorities.
2. `lifecycle.ts` remains the only writable full/compact/transition authority. Feature animation never owns or gates collapse.
3. M2 Pointer Field remains the sole continuous pointer-geometry authority. Interaction Origin remains a discrete snapshot.
4. Reveal is a presentation recipe family (`fact -> recipe -> propagation + material response -> local execution -> pixels`), not a manager, bus, DSL, state machine, or business framework.
5. Renderer motion owns only disposable, reconstructible visual state. Losing it cannot change tasks, progress, terminal outcome, lifecycle, or collapse correctness.
6. A transient response composes over the current persistent presentation baseline and restores to that current baseline. It never writes the baseline.
7. Terminal projected presentation has priority over ordinary transients and may interrupt, absorb, or suppress them, but owns neither the terminal fact nor collapse.
8. Transient concurrency is bounded locally; there is no unbounded animation queue and no universal scheduler.
9. New targets are accepted without waiting for old completion. Where appropriate, execution retargets from current rendered condition rather than replaying a canonical start.
10. Any terminal visibility opportunity is lifecycle/presentation-policy-owned. Animation completion never releases locks or dispatches collapse; new active work re-evaluates collapse eligibility from authoritative facts.
11. Reduced motion preserves deterministic semantic feedback while removing or shortening travel, deformation, propagation, and displacement. It does not fake completion to advance lifecycle.
12. Execution remains heterogeneous. Motion + DOM/SVG and local Canvas/rAF are both allowed; renderer technology is not selected in MR0.
13. Information-bearing geometry may smooth/lag but cannot visually overshoot its authoritative value. Expressive geometry may use spring, lag, small overshoot, squash, or settle.
14. A future Character presentation target is a projection, never a second Product/Download/Lifecycle authority.
15. Continuous work is renderer-local, does not use per-frame React state or Main/IPC traffic, and sleeps when settled.
16. No shared animator, global runtime, recipe framework, renderer hierarchy, DSL, graphics dependency, worker/offscreen infrastructure, or heavy graphics stack is introduced without later evidence from real consumers.

## Current ownership and dependency requirements

The preserved dependency direction is:

```text
Download/Application facts
  -> Download reducer/selectors
  -> presentation projections (center overlay + main-window projections)
  -> Presentation Surface wiring/composition
  -> renderer-local disposable motion
  -> pixels

Main Window lifecycle authority
  -> phase/lock/recipe projections
  -> shell and feature eligibility
  X no feature-motion completion may write lifecycle progression
```

- `src/presentation/main-window/lifecycle.ts` remains the sole lifecycle writer.
- Download reducer/selectors remain Product authority.
- `MainWindowPresentationSurface.tsx` remains a wiring/composition boundary; it must not accumulate recipe algorithms, Download reconciliation, or generic motion orchestration.
- `pointerField.ts` remains the one continuous pointer runtime; `magnetic.ts` is a consumer.
- Shell `visualTransitionCompleted` is an epoch-matched acknowledgement inside the existing lifecycle-owned shell protocol. It is not a general motion API and does not authorize feature animation callbacks to collapse the window.

## Minimal MR0 implementation requirements

After approval, implement the smallest changes needed to make these contracts executable and testable:

- Codify authority/import boundaries and the renderer-local runtime lifecycle in Trellis specs and focused contract tests.
- Add only small projection/composition types or helpers proven necessary by two real consumers. Prefer consumer-local types until duplication exists.
- Define a presentation-target composition shape, not a framework: projected persistent baseline + bounded transient intents + optional terminal-priority target.
- Ensure consumer runtimes can mount from current projection, retarget, sleep and invalidate active work on collapse, permanently dispose on replacement/unmount, reject stale continuations, and rebuild/wake without correctness loss.
- Add validation guards for reduced motion, sleep/wake, interpolation classes, and absence of high-frequency React/Main loops.
- Do not migrate any existing authority. If a real defect requires a lifecycle/Product/native contract change, stop for Architecture Lead review.

## M0/M1/M2 and M3 treatment

Preserve directly:

- M0/M1 lifecycle reducer, projections, declarative effects/executor, shell epoch acknowledgement, position-only native reachability policy, and center-overlay request identity.
- M2 Pointer Field ownership and Magnetic consumption; no second pointer state.

Reusable M3 assets/concepts:

- ordered queue observation bootstrap and logical cut;
- Interaction Origin normalized discrete snapshot and fallback-at-presentation behavior;
- Download/progress correctness independent of Reveal completion;
- presentation-only epochs/generation guards, bounded latest-replaces behavior, and reduced-motion final-state direction.

Superseded or re-evaluated rather than adopted as a visual baseline:

- radial Impact/noise/wave geometry and current reveal timings;
- `DownloadIntakeTransitionSurface` as a foundation or shared runtime;
- current Progress materialization and central-surface coexistence (logical progress facts remain reusable; MR3 chooses presentation);
- current intake eligibility/composition details where they conflict with the approved composition contract.

MR1 is Expanded Dot Field, MR2 Character, MR3 Progress Field, and MR4 Intake/Confirmation/Terminal Reveal. MR0 does not move current M3 visuals into any of those stages automatically.

## Windows correctness dependencies

Both observed issues remain reachable and are **not** automatically removed by replacing Reveal/Progress visuals:

1. Electron native argument conversion path: `App.tsx:377-403 -> src/desktop/runtime.ts:69-76 -> electron/preload.mts:95-102 -> electron/main.mts:3417-3473 -> electron/mainWindowSurfacePolicy.mts:192-250`. It is on the existing native compact/reachability path and needs focused bridge/native tests plus Windows manual validation. Startup argv and dead size/position channels are secondary findings, not substitutes for this reported risk.
2. Terminal-not-compact path: terminal event `App.tsx:1366-1398 -> showForegroundTaskOutcome App.tsx:796-842 -> centerOverlayState.ts:7-56,84-111 -> locks App.tsx:577-594 -> lifecycle.ts:251-258,161-178`. It remains a later repair dependency unless an approved MR0 change touches and proves this exact path.

MR0 planning does not repair either issue.

## Acceptance criteria

- [ ] Provenance distinguishes main, committed M0–M2 worktree, and dirty M3 candidates.
- [ ] The three authority layers and one-way dependency graph are documented with repository anchors.
- [ ] Lifecycle and Pointer Field authority remain unique; Interaction Origin remains discrete.
- [ ] Minimal MR0 work supports Dot Field and Character without a shared engine or renderer lock-in.
- [ ] Runtime mount/target/retarget/replacement/collapse/dispose/rebuild semantics are explicit and testable.
- [ ] Persistent/transient/terminal composition restores the current baseline and enforces terminal priority without duplicate authority.
- [ ] Bounded interruption and no-unbounded-queue behavior are consumer-local.
- [ ] Reduced-motion responsibility is split between semantic target selection and local execution, with no lifecycle callback dependency.
- [ ] Settled sleep/wake and no per-frame React/Main/IPC work are validated.
- [ ] Information-bearing and expressive interpolation policies coexist without a duplicate runtime authority.
- [ ] Both Windows risks remain recorded as reachable repair dependencies with explicit gates.
- [ ] Existing M0/M1/M2 focused suites and full quality gates remain in the validation plan.
- [ ] Task status remains `planning`; no product code is changed in this phase.

## Non-goals

No Dot Field, Canvas renderer, Reveal recipe, Progress Field, terminal animation, Character, SVG morph, branding/icon work, visual tuning, M3 jitter repair, Download architecture refactor, shared animator/framework/DSL, new graphics dependency, MR1–MR4 work, commit, or release action.
