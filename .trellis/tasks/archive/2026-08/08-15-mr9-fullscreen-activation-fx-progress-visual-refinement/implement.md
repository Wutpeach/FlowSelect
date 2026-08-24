# MR9 Implementation Plan

## Preconditions and stop gates

1. Obtain GPT Architecture Lead approval of the latest planning artifacts. This document grants no approval.
2. Do not run `task.py start` in the planning session.
3. Create the implementation branch/worktree from `motion/presentation-integration` at or after `4de9c2e`, then bring the reviewed MR9 task directory onto that branch.
4. Confirm the worktree is clean and that no root dirty Trellis/runtime edits are bundled.
5. Keep meaningful Session Completion out of implementation unless a separate reviewed Product/Application contract supplies an authoritative semantic completion fact.
6. Treat the `acceptedTraceId`-paired transient Intake-origin sidecar as the first MR9 prerequisite. Fullscreen URL drop uses its synchronously captured point. Fullscreen paste uses a synchronously captured pointer only when it is currently valid and inside the surface; otherwise it uses center. Browser Extension and unproven sources use center. If same-emission pairing cannot be proven, stop and split the prerequisite rather than silently centering a proven local submission.

## Ordered implementation slices

### 1. Lock source contracts with tests

- Add focused tests that preserve MR8's `acceptedTraceId` occurrence authority, latest-only opportunity, primary replacement invalidation, deadline, terminal reconciliation, and stale guards.
- Capture a finite, clamped normalized origin synchronously at the full-surface URL-drop boundary before any await. At the fullscreen paste boundary, synchronously snapshot the existing live Pointer Field only when the Surface's current `pointerInside` fact is true; otherwise snapshot center. Carry either result as optional transient command/acceptance metadata separate from `RawDownloadInput` and Download task state.
- Attach the sidecar only to the same one-shot queue-detail payload as the accepted new membership's `acceptedTraceId`; validate it only when that marker is present; forward it into Presentation only after the existing absent-before / present-after proof succeeds.
- Add pairing/rejection tests for local URL drop, async resolver paths, paste with valid in-surface pointer, paste without a valid pointer, delayed acceptance after pointer movement, Browser Extension center, rejected/non-new membership, malformed/missing sidecars, no acceptance-time current/last-pointer sampling, no timing/ACK correlation, and advanced-quality no-reignite.
- Extend the existing Folder Presentation state/action with normalized origin and monotonic `startedAt`, then add a pure success-only Folder activation projection keyed by `requestId`.
- Add a negative completion contract test proving queue-empty and one terminal event do not produce an activation target.
- Do not add session/group state, counters, or inferred busy-period completion.

### 2. Extend the concrete Expanded target and policy

- Add the one `activation` target variant for `intake | folder`, with opportunity identity, neutral-or-causal normalized origin, and current Download progress underlay. Local URL-drop Intake, paste with a proven paste-time in-surface pointer, and successful Folder may be local; paste without a valid pointer, Browser Extension, and unproven Intake use center.
- Remove the `terminal` Expanded target variant, policy branch, App host input, terminal shader modes, and obsolete fullscreen terminal projection. Do not replace them with a dimmed same-salience recipe.
- Preserve MR4 terminal classification, exact post-reduction snapshot, bounded DOM outcome retention, diagnostic status/copy affordance, stale/new-primary invalidation, duplicate idempotence, and lifecycle boundary with focused regression tests.
- Write exhaustive Expanded policy tests for Folder, Intake, Progress, idle, defensive overlaps, and latest replacement, plus a source contract proving Terminal can never select or wake the host.
- Keep the renderer input a single resolved target, not parallel lanes or commands.

### 3. Add the canonical palette and shader recipe constants

- Add one Presentation-owned Thermal Palette module with the six named roles from `design.md`.
- Add concrete Intake and Folder phase/turbulence/distortion coefficient records. Do not expose a generic recipe/plugin API.
- Feed palette uniforms directly to the existing host. Do not install `@paper-design/shaders` or `@paper-design/shaders-react`.
- If any upstream shader source is copied, add Apache-2.0 license/NOTICE attribution and modification markers before proceeding.

### 4. Refine renderer-local runtime

- Derive activation phase from the Presentation-provided monotonic `startedAt` plus the capture-tuned bounded personality duration selected for the build; do not expose that tuning value as a lifecycle or correctness contract.
- Preserve one pending frame maximum, generation guards, fail-closed render behavior, sleep/wake/dispose reconstruction, and zero idle frames.
- Preserve immediate same-trace downward revision and trace-replacement reset.
- Normal motion stops activation frames after dissipation even if a longer-lived Folder outcome remains current.
- Reduced Motion renders static semantic states and schedules no travelling/chase loop.
- Add fake-clock tests for every phase boundary, replacement, ineligible/sleep time without replay, reduced motion, context failure, sleep/wake, and completion-callback absence.

### 5. Replace Download quantitative field with one WebGL circular arc

- Change Progress shader geometry from the current horizontal fill to a centered circular SDF track and arc.
- Clamp all thermal accent to the authoritative angular frontier.
- Keep determinate, indeterminate, downward revision, trace replacement, and reduced-motion behavior distinct and testable.
- Remove the SVG arc only from the primary Download center path. Keep DOM percent/stage/status/cancel UI and keep existing `CircularProgressIndicator` uses for Transcode, processing, and outcome loading.
- Add a source/composition test that finds exactly one Download circular arc authority.

### 6. Implement one-pass activation grammar

- Add procedural origin field, thermal sweep, edge capture, dual-front perimeter chase, opposite closure, short convergence, and dissipation to the existing fragment program.
- Use one draw call and no texture/post-process pass.
- Limit UV distortion to early Intake ignition; Folder uses lower turbulence and no prominent distortion.
- Compose activation and the optional progress underlay in the same fragment output.
- Add one explicit normal-motion stacking rule on `MainWindowPresentationSurface`: the existing canvas may temporarily occlude coverable central/read-only material, while primary cancel, hide/close, queue/quality/cancel controls, runtime indicator, and terminal/error diagnostics remain protected above it.
- Keep the DOM mounted, accessible, and enabled throughout; keep the canvas pointer-transparent. Reduced Motion uses ordinary non-occluding stacking and a bounded static state.
- Preserve transparent blending, pointer transparency, DPR cap, resize behavior, and context-loss recovery.

### 7. Wire concrete opportunities through App and the Surface

- Normalize Folder Confirmation's local full-surface drop origin from the event and never from current/last pointer position.
- Add a narrow Surface paste-submission callback that snapshots the live in-surface pointer before delegating to App; thread that immutable origin, or center when absent, through `queuePastedDownload` and the same accepted-membership sidecar as URL drop. Browser Extension remains center. Never read Pointer Field during acceptance/reduction or correlate a later acknowledgement.
- Pass Folder success projection and Intake opportunity into the pure policy.
- Keep lifecycle eligibility read-only. Do not add shader completion callbacks or await animation in Product/UI flows.
- Assert Compact Mascot props/state remain independent.

### 8. Reduced Motion, user docs, and visual fixtures

- Implement the static/bounded Reduced Motion mappings from `design.md`.
- Update the relevant Chinese and English Download/user-feedback pages under `site/src/content/docs/` in the same implementation commit.
- Create deterministic dark-neutral visual fixtures/captures for local URL-drop Intake, paste with valid in-surface pointer, paste without one at center, Browser Extension center Intake, Folder local lock, terminal restrained DOM outcome with no fullscreen recipe, thermal occlusion and protected controls, determinate 0/25/50/100, downward revision, replacement trace, indeterminate, and Reduced Motion.
- Do not add a white/light shader palette.
- Tune against the frozen medium-fast, roughly one-second perceived direction. Treat 600-750 ms only as an initial capture candidate, never as an Architecture or correctness constant.

## Validation matrix

### Focused automated tests

```powershell
npx vitest run `
  src/presentation/main-window/downloadIntakePresentation.test.ts `
  src/presentation/main-window/expandedPresentationPolicy.test.ts `
  src/presentation/main-window/expandedPresentationRuntime.test.ts `
  src/presentation/main-window/expandedPresentationSurface.test.ts `
  src/presentation/main-window/downloadProgressProjection.test.ts `
  src/presentation/main-window/presentationCompositionContract.test.ts `
  src/utils/centerOverlayState.test.ts `
  src/features/download/useDownloadQueue.test.ts
```

Add new focused test files for causal Intake-origin sidecar validation, Folder activation projection, thermal palette/recipe constants, the shared full-surface normalized-origin helper, and Terminal's absence from Expanded targets.

### Repository gates

```powershell
npm run type-check
npm run lint
npm test
npm run build
npm run docs:build
```

### Deterministic Windows Electron/WebGL validation

Adapt the MR8 archived Windows validation harness rather than inventing another runtime. Capture and assert:

- exactly one `canvas` and one WebGL2 context/program under the Expanded host;
- causal fullscreen URL-drop Intake uses the captured drop origin; paste with a valid paste-time in-surface pointer uses its immutable snapshot; paste without one and Browser Extension use neutral center;
- rejected/non-new membership produces no Intake FX; delayed acceptance after pointer movement preserves the paste-time snapshot; malformed/unpaired origin metadata is rejected; advanced-quality continuation does not re-ignite; and no acceptance-time pointer/timing/ACK heuristic exists;
- Folder success Anchor / Lock and no Folder-error activation;
- no Expanded terminal target/shader recipe on single-task terminal or queue-empty alone, while restrained MR4 DOM diagnostics remain correct;
- Activation thermally occludes coverable central material, protected controls remain visible/operable, and WebGL failure leaves authoritative DOM visible;
- authoritative arc at 0/25/50/100, immediate downward revision, and trace replacement reset;
- no energy ahead of the quantitative angular frontier using pixel probes;
- indeterminate has no numeric frontier;
- Reduced Motion has no travel/chase/distortion and no pending frame loop;
- shader failure/context loss leaves real UI and lifecycle state correct;
- DPR/resize remains correct on the settled full shell.

### Performance and scheduling

- Record average and worst frame cost on the 200x200 CSS surface at DPR 1 and capped DPR 2.
- Confirm one draw call, no texture preprocessing, no multi-sample Lens Distortion loop, and no secondary canvas.
- Assert one pending rAF maximum and zero pending frames when idle, settled determinate, activation-dissipated, Reduced Motion static, sleeping, context-lost, or disposed.

### Platform coverage

- Windows Electron visual validation is required because the current baseline has a reusable harness.
- macOS transparent-window/WebGL visual validation is recommended before release. If no host is available, record it explicitly as validation debt; do not claim it passed.

## Risk and rollback points

| Risk | Containment / rollback |
| --- | --- |
| Local Intake sidecar is not paired with the accepted membership | Stop local FX and split the transient same-emission contract as a reviewed prerequisite; never guess or silently center a proven local drop |
| Shader becomes a de facto scene framework | Keep one target union, two concrete personalities, one program, and fixed constants |
| Thermal accent overstates progress | Pixel-probe the angular frontier; clip material before glow shaping |
| Fullscreen effect hides essential action or diagnostics | Keep a fixed protected-control set above the pointer-transparent canvas; only cover non-interactive central/read-only material, and test fail-closed visibility |
| GPU cost from Heatmap/Lens reference | No image preprocessing, no texture post-process, no Paper runtime, no multi-sample dispersion |
| Reduced Motion still travels | Static phase selection and zero-loop test |
| Root branch regresses MR8 | Branch only from `motion/presentation-integration`; verify ancestry before edits |
| Session Completion invented in Presentation | Negative contract test and explicit implementation gate |

Rollback is file-local: revert the activation variant, palette/recipe constants, shader changes, and Download-specific DOM arc suppression while retaining MR0-MR8 host/runtime contracts. No Product or Download migration is planned.

## Final review checklist before any implementation approval

- [ ] GPT Architecture Lead reviewed the architecture gaps and local-Intake / Folder causal-origin contracts.
- [ ] Local URL-drop and paste-time proven in-surface origins are paired with the same `acceptedTraceId` emission and never enter Download/durable state; paste-without-pointer and Browser Extension center fallbacks are explicit.
- [ ] Single-task Terminal has no Expanded target/policy/shader recipe, while MR4 DOM semantics and diagnostics remain intact.
- [ ] Thermal occlusion and the fixed protected-control stacking contract are reviewed without introducing a scene/layer system.
- [ ] Future branch ancestry includes `4de9c2e`.
- [ ] Session Completion is either backed by a separately reviewed authoritative fact or remains excluded.
- [ ] No dependency, secondary canvas, runtime, scheduler, queue, scene graph, or priority bus was added to the plan.
- [ ] Planned docs and Windows visual validation are assigned.
