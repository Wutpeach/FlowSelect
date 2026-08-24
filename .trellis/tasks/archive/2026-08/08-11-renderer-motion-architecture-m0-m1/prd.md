# Reconstruct Renderer Motion Architecture — M0 + M1

## Goal

Reconstruct Ameow's Main Window renderer presentation boundary around one authoritative lifecycle. Preserve externally observable startup, full/compact, interruption, drag, task, platform, reduced-motion, shortcut, and UI Lab behavior while replacing the flawed App-level ownership structure.

The result must be a long-term presentation architecture, not a mechanical extraction of the current `App.tsx` implementation.

## User Value

- Main Window behavior remains predictable when pointer, task, drag, UI Lab, and native events overlap.
- Renderer motion can evolve without coupling application state to BrowserWindow policy or continuous animation values.
- Later Pointer Field/Magnetic and Interaction Origin/Noise Reveal work has clean local seams without prebuilding those effects.

## Confirmed Facts

- `src/App.tsx:501-565` currently maintains competing lifecycle representations: `isMinimized`, `shellPhase`, transition mode, reducer state, native transition state, and mirror refs.
- The existing shell reducer and tests preserve valuable behavior, but App mutates additional visual/native state around reducer effects.
- Normal hover expansion and collapse are already renderer-visual-only and preserve native window size.
- `mainWindowShellGeometry.ts` currently mixes spatial geometry with renderer/native timing, while App independently assembles the Motion props used at runtime.
- Renderer code can request arbitrary x/y/width/height native animation through `animateBounds`; active presentation behavior only requires OS placement correction and existing focus, visibility, drag, and hit-test operations.
- `compactNativeSettledRef` is write-only. No current product behavior reads it.
- `mainWindowMode.ts` retains collapse predicates used only by their own tests; the active shell reducer has replaced them.
- The UI Lab preview forces visual full mode and ignores animation completion, allowing machine and visual truth to diverge.
- Production Electron startup is always full. The native compact-startup argument/resize path is dormant; plain-web compact appearance is derived separately from the actual environment.
- Pointer coordinates for Edge Glow currently update React application state on pointer movement.
- Repository evidence and the preserved behavior matrix live in `research/current-presentation-audit.md`.

## Requirements

### R1 — Preserve boundaries and behavior

- Preserve all P0–P6 application, domain, and runtime boundaries.
- Preserve production startup, plain-web startup appearance, full/compact hover behavior, the 80 ms collapse grace, interruption/reversal, locks, drag, foreground task forcing, Windows passthrough/hotspot behavior, compact visibility correction, reduced motion, shortcut behavior, and UI Lab scenarios.
- Keep Motion for React as the renderer animation engine.
- Do not redesign download intake, task execution, browser-extension behavior, or unrelated desktop commands/events.

### R2 — Establish one lifecycle authority

- Main Window presentation has one clearly identifiable authoritative lifecycle.
- Full, compact, pending, expanding, and collapsing are lifecycle states, not independently synchronized booleans.
- Visual, native, and interaction facts are projections of the lifecycle and current inputs.
- Mirrored refs may provide synchronous access to the same state object, but must not become independently writable authorities.
- Product/application state, presentation lifecycle state, and continuous Motion runtime values remain separate concerns.

### R3 — Establish a real presentation module

- Do not replace App's monolith with a monolithic `useMainWindowShell` hook.
- Separate pure lifecycle transition logic, projections/selectors, effect contracts, effect execution, and the thin React adapter.
- `App.tsx` may provide application facts and issue intent-level requests, but it must not own detailed lifecycle transitions, timers, completion handoff, native policy sequencing, hotspot evaluation, or Motion recipe assembly.

### R4 — Define completion before modeling acknowledgement state

- The compact transition completion contract must be explicit and tested.
- Repository baseline defines compact lifecycle completion as the matching Renderer Motion collapse completion.
- Native compact visibility correction is an independent, cancellable OS side effect and does not gate compact lifecycle completion or passthrough.
- Delete the dead `compactNativeSettledRef`; do not promote it into lifecycle state.
- If implementation evidence proves multiple acknowledgements are actually required, return to planning and define an explicit barrier before adding state.

### R5 — Avoid speculative synchronization

- Do not add pointer-boundary transition tokens in M0 + M1.
- Consolidate lifecycle authority, gate events against current lifecycle state, and guard subscription generations first.
- Add pointer event synchronization only if a focused failing test or live reproduction demonstrates stale native events remain afterward.

### R6 — Separate presentation responsibilities

- Geometry owns spatial policy only; it contains no Motion timing, reduced-motion choice, lifecycle epoch, monitor lookup, or native side effect.
- Renderer Motion recipes own visual choreography only; they contain no BrowserWindow calls or native timing.
- Native surface policy owns placement, visibility, focus, hit-testing/passthrough, dragging, and necessary platform correction only.
- Normal full↔compact morphing keeps a stable BrowserWindow and never sends per-frame bounds updates from the renderer.
- Narrow or remove the generic renderer-facing `animateBounds` contract where current callers can be replaced by semantic native operations.

### R7 — Keep continuous motion outside application state

- Pointer coordinates and comparable high-frequency values use local Motion values or equivalent feature-local runtime values.
- Preserve Edge Glow behavior while removing pointer-driven App renders.
- Keep the M0 + M1 pointer migration temporary and minimal: Edge Glow is only a compatibility consumer, not the foundation of a new pointer subsystem.
- Defer formal Pointer Field ownership, API, MotionValue model, and Magnetic integration to M2; do not add unused APIs, providers, events, or state now.

### R8 — Remove confirmed dead presentation code

- Remove write-only presentation refs and superseded collapse helpers/tests when no active behavior depends on them.
- Remove the dormant native compact-startup argument/normalization branch rather than inventing a future startup mode to justify it.
- Preserve actual production full startup and actual plain-web compact presentation behavior.
- UI Lab must request presentation state explicitly through the authoritative lifecycle; it must not force visual overrides or skip lifecycle completion.

### R9 — Keep infrastructure minimal

- Do not introduce XState, Zustand, GSAP, a global animation bus, an animation DSL, or another framework.
- Prefer pure functions, small local modules, injected effect dependencies, and existing Motion/Electron capabilities.

## Acceptance Criteria

- [ ] Production and plain-web startup behavior remains externally equivalent without the dormant native compact-startup branch.
- [ ] Compact enter, 80 ms leave grace, re-entry cancellation, leave-during-expand handoff, reversal, and stale Motion completion behavior remain correct.
- [ ] All presentation locks, drag behavior, task/foreground forcing, shortcut behavior, and post-lock collapse remain correct.
- [ ] Windows passthrough has one owner, activates only after matching collapse completion, and never flips during collapse.
- [ ] Windows hotspot, native pointer-boundary input, compact visibility correction, and reduced-motion behavior remain correct.
- [ ] UI Lab scenarios use the authoritative lifecycle and cannot create machine/visual divergence.
- [ ] `App.tsx` no longer owns detailed Main Window lifecycle/effect orchestration.
- [ ] Lifecycle, projections/selectors, effect contracts, effect execution, and React adaptation are separately identifiable and independently testable.
- [ ] There is one writable presentation lifecycle authority; visual/native/interaction values are projections.
- [ ] Compact completion is defined and tested without dead or speculative `nativeSettled` state.
- [ ] No pointer-boundary token is added without new repository evidence and a focused failing test.
- [ ] Geometry, Motion recipes, continuous Motion runtime, and native surface policy have non-overlapping dependencies.
- [ ] Renderer code cannot arbitrarily animate BrowserWindow width/height for Main Window presentation.
- [ ] Confirmed dead refs/helpers/branches are removed.
- [ ] Edge Glow remains visually equivalent while pointer coordinates no longer live in React application state.
- [ ] Existing regression tests, type-check, lint, and build remain green; focused lifecycle/effect/race tests cover newly formalized semantics.

## Out of Scope

- Magnetic or Pointer Field implementation.
- Edge Glow removal.
- Interaction Origin or Noise Reveal implementation.
- Download intake transitions.
- Noise, wave, shader, or Rive effects.
- Broad visual styling redesign.
- Application/domain/runtime redesign outside the presentation-facing native boundary required here.
