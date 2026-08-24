# MR2 Compact Flat Blob Cat Character

## Goal

Replace the legacy compact `CatIcon` visual with a compact Flat Blob Cat whose Static Mark identity is complete at rest and whose minimal Living Character behavior remains a disposable, read-only Main Window Presentation consumer.

MR2 must preserve Product, Download, lifecycle, Pointer Field, interaction, and native-window authority while providing a reviewable implementation plan for Body + Ears + Eyes geometry, pointer attention, bounded local motion, replacement/disposal, Reduced Motion, and idle performance.

## Repository baseline

- The clean post-MR1 implementation baseline is `mr1/expanded-dot-field` at `b84e13c` in `D:/Ameow/.cindy-worktrees/mr1-dot-field`. Root `main` at `e40f5fe` does not yet contain the approved MR0/MR1 production architecture.
- MR2 implementation must begin from a clean target containing committed MR0 and MR1. It must not copy, reconcile, migrate, clean, or otherwise absorb paused M3 experimental work.
- The current post-MR1 compact visual is still `CatIcon`, an `<img>` backed by `src/assets/mascot.svg`, composed only when the visual projection is compact.
- The repository keeps a stable native Main Window viewport. The compact contract is an 80x80 reachable outer frame containing a centered 60x60 visible shell; MR2 must not reinterpret that contract as a request to resize the BrowserWindow.

## Requirements

### Ownership and dependency direction

- The dependency direction remains: Product/Application facts -> read-only Presentation Projection -> Character visual target -> renderer-local Character execution.
- `MainWindowPresentationSurface` remains the compact composition and DOM/native pointer-event boundary. The lifecycle reducer remains the sole writable full/compact/transition authority.
- Character modules may consume plain visual inputs, the existing Pointer Field, theme tokens, Reduced Motion, and compact eligibility. They must not dispatch lifecycle events, release locks, mutate Product/Download facts, own native geometry or placement, write Pointer Field coordinates, or call desktop/Electron/IPC/native-window APIs.
- Character animation completion, settlement, sleep, disposal, or loss of continuity has no application-visible correctness meaning and exposes no completion callback to lifecycle or Product code.

### Static Mark

- The Static Mark is inline vector geometry with three persistent primitive groups: a soft rounded body, pointed-but-soft ears, and minimal capsule/ellipse eyes.
- Ears are the primary cat-recognition feature. Their geometry must retain a readable apex and softened joins; two semicircular bumps are not acceptable.
- The Character may use most of the existing 60x60 visible compact shell. The legacy 38px `CatIcon` visual bound must not constrain the new Character visual bound.
- Hands are not required for Static Mark identity. MR2 may omit them. If visual validation proves one is useful, it remains one private, optional, short soft-pointed primitive with no generic gesture or expression API.
- Static identity remains complete when every animation is disabled, interrupted, reset, or unavailable.

### Minimal Living Character vocabulary

- MR2 includes clamped eye attention, a low-duty-cycle blink, and at most a tiny pointer/settle-coupled body deformation. This is sufficient for “quiet, but not static.”
- Continuous breathing, stochastic behavior, a gesture system, expression state machine, expression DSL, and always-running secondary motion are not required for MR2.
- Existing shell presence/settle choreography remains owned by the compact wrapper. Character-internal motion must not duplicate the shell morph or establish a second transition authority.

### Pointer Field consumption

- `pointerField.ts` remains the only continuous pointer-coordinate authority and `MainWindowPresentationSurface` remains its only writer.
- Character receives the existing `MainWindowPointerField` read-only. It derives eye targets from stable-root coordinates relative to the compact visual center, applies finite validation, a small dead zone, and hard x/y clamps, then executes the target locally.
- Current post-MR1 full/collapsing interactive paths already update Pointer Field from surface pointer events. On Windows settled compact passthrough, forwarded window `mousemove` currently drives hotspot evaluation but does not update Pointer Field. MR2 must adapt that existing Surface writer path to feed the same Pointer Field before hotspot evaluation; Character must not add a listener or a second x/y store.
- Sustained eye-follow inside the enter hotspot is not reachable under the current interaction contract: entering that hotspot immediately requests expansion. On Windows, forwarded pointer events over the stable transparent viewport can still provide a quiet bounded pre-hotspot glance; hotspot entry becomes a brief exit cue. MR2 must not delay expansion, enlarge the hotspot, or change passthrough to manufacture a longer Character hover state.
- Attention projection falls back to neutral outside a bounded compact response radius so the surrounding transparent viewport cannot pull the eyes indefinitely. Observable leave/loss, blur, hide, replacement, and invalid/missing coordinates project neutral through existing Surface/projection cleanup. Windows compact passthrough does not deliver `mouseleave`; after an unobservable exit the Character may hold its last bounded eye target, fully settled with zero work, until the next authoritative point or replacement. Character never owns a loss timer or pointer-presence authority.
- Compact -> expanding changes the visual projection to full and removes the Character through the existing presence boundary. Collapsing changes the target projection to compact and mounts it; no continuity across that replacement is required.

### Lifecycle, retarget, and disposal

- Mount initializes persistent SVG primitives from the current compact projection, theme, Reduced Motion, and current Pointer Field value.
- Target changes retarget from the current rendered eye/body condition. No canonical-pose reset, replay queue, or generic animation framework is allowed.
- A settled Character has no Character-owned `requestAnimationFrame` loop. Motion/compositor work runs only while an eye/body target is changing or a brief discrete expression is active.
- Blink uses at most one low-duty-cycle timer and one short renderer-local Motion animation. It uses a deterministic interval in MR2; randomness is deferred.
- Expanded/hidden/ineligible state cancels blink work and Character-local in-flight animation. Re-entry rebuilds from current authoritative inputs. Unmount/surface replacement permanently disposes the local runtime and makes stale timer, animation-finish, and callback generations no-ops.
- React publishes coarse eligibility/theme/preference inputs and stable MotionValues only. React state is not updated per frame.

### Reduced Motion

- Static Body + Ears + Eyes identity remains fully visible.
- Small eye attention remains available because it is direct attention feedback, but uses a smaller clamp and no spring overshoot or lag.
- Body deformation, travelling motion, bounce, repeated settle pulses, and automatic blink are removed or made static. A discrete externally selected hand/semantic pose, if ever present, may remain without animated travel.
- Reduced Motion never changes lifecycle state, fabricates transition completion, or becomes a correctness signal.

### Native compact contract

- Preserve the existing 80x80 compact reachable-frame metric, centered 60x60 visible shell, current hotspot radii/platform behavior, passthrough timing, pointer-boundary policy, reachability correction, placement, and renderer-only compact/full morph.
- MR2 may decouple Character visual size from the legacy 38px icon recipe. It must not change the independent hotspot geometry merely because the Character occupies more of the 60x60 shell.
- Main, preload, IPC, BrowserWindow, and native placement policy never participate in Character frame or timer execution.

### Windows native argument-conversion dependency

- The chain `App.tsx -> desktop/runtime.ts -> preload.mts -> main.mts -> mainWindowSurfacePolicy.mts` remains statically reachable and is explicitly pinned by `src/architecture/windows-risk-path.test.ts`; MR2 cannot claim a visual replacement fixes it.
- Repository evidence does not prove the historical conversion failure currently reproduces: the chain validates/coerces plain numeric data, the MR0 Windows manual matrix passed, and the risk guard intentionally asserts reachability rather than failure.
- Therefore the risk is not an MR2 code-entry gate. It is a mandatory Windows manual-validation readiness gate: run focused bridge/native checks and a clean compact-collapse smoke before Character visual debugging.
- If the native error reproduces, stop MR2 Windows validation and repair it in a separate native-correctness prerequisite phase owning the bridge/policy chain. Resume MR2 only after that repair is independently verified. Do not mix the repair into Character implementation.

## Acceptance criteria

- [ ] The Character is owned by the current Main Window Presentation Surface and local renderer modules; Product, Download, lifecycle, native, and Pointer Field authorities remain unique.
- [ ] Legacy `CatIcon` leaves the compact composition path; no competing static image remains mounted behind or beside the new Character.
- [ ] Inline vector Body + Ears + Eyes form a complete recognizable Static Mark within the 60x60 visible shell, with pointed-soft ears and no dependency on the old 38px visual bound.
- [ ] The implementation adds no graphics/motion dependency and no shared renderer, scheduler, state machine, gesture system, or expression engine.
- [ ] Character reads the existing Pointer Field only; the Surface remains the sole continuous writer, including the Windows compact forwarded-mouse adapter.
- [ ] Eye projection has finite validation, response-radius/dead-zone/clamp bounds, current-condition retarget, neutral behavior after observable leave/loss/replacement, and bounded zero-work freeze after an unobservable Windows passthrough exit.
- [ ] Settled Character work has zero pending Character rAF callbacks; blink has at most one timer; hidden/expanded/disposed states have neither timer nor active Character animation.
- [ ] Sleep/rebuild/dispose and generation invalidation make every stale timer/callback/animation continuation a no-op.
- [ ] Reduced Motion preserves Static Mark and small direct attention while removing overshoot, deformation, repeated decorative motion, and autonomous blinking.
- [ ] Hands are omitted or remain one private optional primitive; no public gesture/expression abstraction is introduced.
- [ ] Geometry, projection, pointer, lifecycle, import-guard, compact hotspot, native reachability, bridge-contract, and Windows risk-path tests demonstrate preservation of MR0/MR1 invariants.
- [ ] Windows manual evidence covers compact approach/attention, hotspot expansion, collapse/replacement, passthrough, reachability, placement, Reduced Motion, idle work, and the separate native-risk preflight.

## Out of scope

- Download Progress, Progress Field, Dot Field progress semantics, Intake/Folder/Success/Failure/Cancelled Reveal, progress-to-terminal continuity, terminal hold redesign, terminal-not-compact repair, MR1 redesign, Dot Field renderer consolidation, shared Character/Dot renderer, shared motion/runtime infrastructure, generic scheduler/state machine/expression engine, app/taskbar/dock asset production, native window-policy refactoring, Windows argument-conversion repair, macOS claims without manual evidence, MR3/MR4 work, and any M3 migration or cleanup.

## Planning status

- Blocking product decisions: none. The user supplied geometry, motion, authority, scope, and risk-decision constraints.
- Architecture review required: GPT Architecture Lead must approve this plan and explicitly open the next phase gate.
- Implementation activation: intentionally not authorized. Keep task status `planning`; do not run `task.py start` or archive the task.
