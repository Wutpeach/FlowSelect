# MR5 Planning Architecture Report

## Executive Decision

MR5 does **not** need a new production abstraction.

The existing consumers share architectural invariants—pure projection inputs,
consumer-local disposable execution, current-condition retargeting, stale-work
invalidation, Reduced Motion final-state behavior, and no completion authority.
They do not share one production runtime contract:

- Dot Field is one Canvas/rAF consumer with three internal visual lanes.
- Compact Character is an SVG/Motion consumer with pointer springs and one
  low-duty blink timer.
- Progress Field and Terminal Reveal are projections into Dot Field, not two
  additional schedulers or lifecycle owners.

The repository already expresses the stable common contract in frontend Motion
specs and import guards. Turning those principles into a shared scheduler,
runtime interface, state machine, or priority bus would add indirection without
removing duplicated implementation.

The smallest evidence-backed MR5 is one React-boundary correctness fix, one
focused regression, and deletion of an obsolete desktop icon asset path.

## Audit Baseline and Evidence Rules

- Authoritative implementation: `1c9db28445fa937921984999a57d30be1e7f5689`.
- Clean readable mirror used for line anchors:
  `.cindy-worktrees/mr1-dot-field` at exactly the same commit.
- Root `HEAD=a373d23...` is not a descendant of the baseline and the root
  worktree contains unrelated dirty Trellis/runtime work. Those files are not
  used as MR1–MR4 production evidence.
- Frozen old M3 is non-production historical evidence only, as recorded in
  MR0's `research/m3-intake-implementation-audit.md:1-3,34-36,50-53`.

## Responsibility and Dependency Map

```text
Download feature authority
  model/reducer/controller/selectors
       |
       +-> current primary task + progress
       |      -> resolveDownloadProgressTarget (pure MR3 projection)
       |
       +-> typed terminal listener + exact post-reduction snapshot
              -> centerOverlayState (Presentation retention/semantic carrier)
              -> resolveDotFieldTerminalTarget (pure MR4 projection)

Main Window lifecycle reducer (sole full/compact/transition authority)
  -> projections.ts (visual/interaction/native facts)
  -> MainWindowPresentationSurface (DOM composition and gesture wiring)
       +-> sole Pointer Field writer
       +-> DotFieldCanvas (always mounted; settled-full eligibility)
       |     -> one local dotFieldRuntime (Canvas/rAF)
       |          +-> MR1 acknowledgement transient
       |          +-> MR3 progress lane
       |          +-> MR4 terminal-priority lane
       +-> CompactCatCharacter (compact-only mount)
             -> local Motion values/springs + local blink timer
```

### Dot Field / MR1

- **Owner:** `DotFieldCanvas` owns one runtime for the Canvas lifetime and
  disposes it on unmount (`DotFieldCanvas.tsx:73-102`).
- **Eligibility:** Surface derives settled-full eligibility only from lifecycle
  projection (`MainWindowPresentationSurface.tsx:655-660`) and publishes it;
  the runtime never writes lifecycle.
- **Runtime:** `dotFieldRuntime.ts:1-39,147-180` owns grid state, one rAF slot,
  generations, transient/residual state, and local interpolation. Wake, sleep,
  and dispose are local (`:410-438,677-709`).
- **Inputs:** Surface owns click/context acknowledgement formation at the DOM
  boundary (`MainWindowPresentationSurface.tsx:828-854,945-954`); Canvas turns
  theme/size/eligibility/projection values into one baseline
  (`DotFieldCanvas.tsx:104-168`).

### Compact Character / MR2

- **Owner:** `CompactCatCharacter` is a compact-only SVG/Motion leaf; it accepts
  the existing Pointer Field read-only and has no lifecycle/native/Product/IPC
  collaborator (`CompactCatCharacter.tsx:1-19,49-63`).
- **Runtime:** Pointer attention is a pure recipe plus local stable-source
  springs (`:79-151`). Blink uses one local timer runtime and one stoppable
  Motion animation (`:153-215`; `characterBlinkRuntime.ts:1-98`).
- **Lifecycle:** Compact mount/unmount is owned by the Surface presence boundary
  (`MainWindowPresentationSurface.tsx:1197-1251`). Document visibility and
  Reduced Motion stop local blink work; unmount permanently disposes it.
- **Authority:** Surface is the sole Pointer Field writer, enforced by
  `import-guard.test.ts:900-919`; Character only projects it.

### Progress Field / MR3

- **Owner:** Download selectors own current facts. `resolveDownloadProgressTarget`
  maps current primary Download + progress to `idle | indeterminate |
  determinate(traceId,target)` without history or storage
  (`downloadProgressProjection.ts:4-49`).
- **Runtime:** It is a lane inside the existing Dot Field runtime, not a new
  consumer. Local rendered level/phase are disposable interpolation only
  (`dotFieldRuntime.ts:176-180,477-582`).
- **Interruption:** Trace replacement rebases immediately; same-trace downward
  revision clamps to avoid overstatement; upward revision converges; Reduced
  Motion resolves directly (`dotFieldRuntime.ts:527-582`).
- **Accessible behavior:** Existing center ring/text/cancel remains authoritative
  and live (`App.tsx:3622-3715`). Dot Field is supplemental pixels.

### Terminal Reveal / MR4

- **Owner:** Download remains terminal authority. App receives the typed first
  terminal with the controller's exact post-reduction snapshot, suppresses a
  background terminal when another primary Download remains, and creates
  request-ID guarded center Presentation retention
  (`App.tsx:1364-1411`; `downloadTerminalProjection.ts:62-76`).
- **Projection:** `resolveDotFieldTerminalTarget` maps current center terminal
  Presentation + current primary Download to `none | terminal(status)`; it owns
  no classification, trace, retention, or lifecycle command
  (`downloadTerminalProjection.ts:4-60`).
- **Runtime:** Terminal is a priority lane in the same Dot Field. Progress
  supersedes it; terminal absorbs acknowledgement; same kind does not restart;
  kind change replaces one bounded slot; Reduced Motion snaps to final level
  (`dotFieldRuntime.ts:551-621,623-632`).
- **Lifecycle:** Retention does not wait for Canvas eligibility. Sleep clears
  local lane state; wake reconstructs from the current projection
  (`dotFieldRuntime.ts:422-438,677-709`).

### App and Main Window Composition

- **App:** owns Application facts, derives MR3/MR4 projection values, owns
  semantic center Presentation retention, and passes coarse values to the
  Surface (`App.tsx:487-492,549-554,2892-2913`). Its request-ID/ref path is an
  imperative current snapshot for synchronous listener/timer correctness, with
  writes centralized through `updateCenterOverlayState`
  (`App.tsx:609-646,785-868`); it is not a second terminal authority.
- **Surface:** owns DOM gesture normalization, local panel drag/hover, lifecycle
  event dispatch, the sole Pointer Field writer, and composition eligibility.
  These are coherent surface-boundary responsibilities despite the file's size.
  MR1–MR4 did not move Download facts, retention, or per-frame execution into it.

## Duplication and Consolidation Candidates

| Candidate | Consumer evidence | Proposed owner / direction | Judgment |
| --- | --- | --- | --- |
| Disposable stale-work invalidation | Dot runtime generation + one rAF (`dotFieldRuntime.ts:155-175,677-709`); blink generation + one timer (`characterBlinkRuntime.ts:36-55,66-89`) | Keep in each renderer-local runtime; specs/import guards express the cross-cutting invariant | **Do not abstract.** Different scheduler types, wake conditions, state, and stop semantics; shared code would be a wrapper around two unlike implementations. |
| Wake / sleep / dispose | Dot explicitly sleeps while still mounted and reconstructs current projections; Character mounts only compact and separately stops blink on document hidden | Lifecycle projection -> Surface -> consumer-local execution | **Do not normalize method names.** Character has no useful `wake(baseline)` contract and Dot has no visibility-only blink contract. |
| Current-condition retarget | Dot folds acknowledgement residuals, clamps/rebases progress, and replaces terminal lanes; Character springs follow pointer values and blink interruption restores open eyes | Pure current input -> renderer-local interpolation | **Shared principle only.** The semantic discontinuities are different and must stay local. |
| Reduced Motion | Dot changes travel, convergence, terminal frames, and transient duration; Character keeps smaller direct attention but removes spring tail, squash, and blink | Existing `reducedMotion: boolean` projection into each leaf | **Reuse existing primitive; no abstraction.** Final visual policy is consumer-specific. |
| Priority / interruption | Within Dot: terminal > acknowledgement and current progress > retained terminal; Character is mutually exclusive by compact/full composition | Projection values set semantic priority; Dot runtime executes pixel priority | **Do not create a bus.** There is one multi-lane renderer, not multiple peer consumers competing for global authority. |
| Pure visual recipe boundary | `dotFieldRecipe.ts` and `characterRecipe.ts` are import-free deterministic leaves | Continue enforcing via existing spec/import guards | **Stable architecture seam, not a production API.** Shared types/functions would erase meaningful geometry/material differences. |
| Theme/material mapping | Surface passes `colors.dotDormant/dotAck` and `characterBody/characterEye`; terminal material is mapped per dot in the Dot recipe | Theme tokens -> Surface -> local recipe | **No new material system.** Similar palette usage is not shared state ownership. |
| MR3/MR4 projection shape | Both are pure current-value projections passed App -> Surface -> Dot runtime | Keep separate projection modules and Dot baseline fields | **No generic projection/state machine.** Progress is trace/quantity; terminal is typed outcome/retention priority. |
| Settled-full eligibility predicate | Magnetic and Dot eligibility both begin with `mode === "full" && transitionEpoch === null` in adjacent Surface code (`MainWindowPresentationSurface.tsx:644-660`) | Keep inline beside composition, or reuse only if a third non-trivial consumer appears | **Stable concept, not worthwhile abstraction.** The two-line adjacency is clearer than a helper/type and Magnetic immediately adds different policy. |
| Surface composition adapter | Surface currently carries dot intent, eligibility, materials, and Character composition | Keep at the DOM/composition boundary | **No extraction now.** A hook/component wrapper would mostly move props and refs without removing authority or duplication. Reassess only when a future concrete consumer repeats the whole boundary. |

## Proven Boundary Debt and Safe Deletions

### 1. Terminal kind is lost at the React effect signature

`DotFieldCanvas.tsx:112-116` value-signatures its coarse inputs to avoid App
identity churn. Progress includes kind, trace, and determinate target. Terminal
currently computes:

```ts
terminal.kind === "none" ? "none" : `terminal:${terminal.kind}`
```

For all non-none values `terminal.kind` is literally `"terminal"`; `status`
is omitted. The host therefore violates its declared value-input contract:
if the projected status changes without another effect dependency changing,
the already-capable runtime (`dotFieldRuntime.ts:596-621`) will not receive it.
Current Download wiring normally invalidates a retained outcome when new
primary work arrives, so a user-visible status replacement is not proven on
today's primary path; this is a **latent boundary defect masked by current
composition**, not a claim of a reproduced product bug. Runtime tests
(`dotFieldRuntime.test.ts:968+`) deliberately support kind replacement but do
not cover the React host. The fix is still a one-line contract correction plus
one host regression, not a shared abstraction.

### 2. Legacy desktop Cat icon path is dead

At the baseline, `src/components/CatIcon.tsx` imports only
`src/assets/mascot.svg`. Git-indexed production search finds no consumer of
either after MR2; Character composition tests explicitly assert the Surface no
longer contains `CatIcon`. Delete both desktop files. The browser-extension
`browser-extension/mascot.svg` and injected icon system are separate and must
remain. `.trellis/spec/frontend/directory-structure.md:40` still documents
`CatIcon` as the compact icon, so the same deletion slice should correct that
spec drift.

### 3. App mirrors Surface-owned locks as constant false

`App.tsx:573-581` constructs a complete `Record<MainWindowPresentationLock,
boolean>` with `drag`, `drop`, and `startup` hardcoded to `false`. The Surface
then dispatches every entry on prop changes (`MainWindowPresentationSurface.tsx:
662-673`), while Surface gesture/drop paths independently dispatch real
`drag`/`drop` events and lock values (`:242-303,322-471,888-943`). This is
duplicate input authority, not just dead syntax: an unrelated App lock change
can re-publish constant false for Surface-owned facts.

The boundary should accept only Application-owned lock facts. Keep `drag` and
`drop` solely Surface-owned. Repository search finds no `startup` lock set true;
startup presentation uses the distinct `startupSettle` lifecycle event
(`MainWindowPresentationSurface.tsx:675-686`). Remove the unused startup lock
member/wiring if focused reducer tests confirm the search. This tightens the
existing lifecycle boundary; it does not migrate or share lifecycle authority.

### 4. `compactReachabilityActive` is dead projection state

`projections.ts:32-40,70-153` produces `native.compactReachabilityActive`, but
the only indexed reads are assertions in `projections.test.ts`; no production
consumer reads it. Actual reachability behavior is already emitted as lifecycle
effects (`lifecycle.ts:112-158` and completion handling) and executed through
the existing effect boundary. Remove the unused projection field/tests without
changing lifecycle effects or native policy.

### 5. Frozen old M3 negative guard is historical, not production state

`import-guard.test.ts:922-960` still lists old M3 candidate paths to ensure
authority modules never import them. The candidates are absent from production,
so there is no compatibility runtime or duplicated source of truth. The guard
is conservative architecture documentation rather than dead Presentation
state; deleting it is optional test cleanup, not part of minimal MR5.

### 6. Other apparent repetition is local and not worth extraction

- Surface has separate one-rAF slots for native window drag position and
  compact-hotspot pointer input (`MainWindowPresentationSurface.tsx:200-223,
  777-803`). Their cancellation conditions and side effects differ; a shared
  scheduler would hide two simple event-boundary throttles.
- `clamp01` is a one-line private helper in Dot recipe and runtime. Exporting it
  would couple a pure visual recipe and stateful runtime to save one line.
- Progress and terminal convergence loops live inside one Dot runtime but carry
  different information-safety, priority, and Reduced Motion rules. Local
  factoring may be considered only if it deletes code without weakening those
  branches; it is not a cross-consumer contract.
- Identical `0.42` progress/terminal bloom radii are visual tuning coincidence,
  not shared ownership or a material contract.
- Lifecycle completion contains symmetric full/compact epoch guards. They are
  intentionally readable terminal branches in the sole lifecycle reducer;
  local refactoring would not consolidate consumers and is outside MR5.
- Repeated easing/duration literals span pre-existing App/component styling,
  shell recipes, and renderer-local recipes. A global token migration would be
  broader than MR1–MR4 consolidation and would blur semantic retention timing
  with visual animation timing.
- `src/utils/secondaryWindowPlacement.ts` appears test-only at this baseline,
  but it is unrelated pre-existing utility debt outside the MR1–MR4 Motion /
  Presentation consumer scope. Do not bundle its deletion into MR5.

`dotFieldSurface.ts` is deliberately described as Presentation/DOM wiring, not
a renderer-local motion leaf (`dotFieldSurface.ts:1-5`). Its focused source
guard is therefore not evidence of a missing motion-leaf import guard. Keep the
current classification unless a later boundary review changes the module's
responsibility.

### 7. No other duplicate authority or legacy visual branch was proven

- Progress has no terminal member and no retained copy.
- Terminal classification remains in Download/Application; Dot receives a
  typed target only.
- Dot progress/terminal levels are reconstructible renderer state.
- Character carries no second pointer pair or lifecycle acknowledgement.
- Existing center progress/outcome UI is intentional accessible semantics, not
  a duplicate of decorative Dot pixels.

## Main Window Composition Assessment

`MainWindowPresentationSurface` is large and coordinates many event-boundary
details, but the MR1–MR4 additions remain coherent:

- it derives eligibility from lifecycle projection;
- it forms normalized click/context origin snapshots;
- it writes the one Pointer Field;
- it selects compact Character versus expanded Dot composition;
- it passes coarse theme/Reduced Motion/projection values downward.

It does not classify Download progress/terminal facts, retain outcomes, run
per-frame Dot geometry, or own Character motion. There is **composition density
but no demonstrated boundary erosion**. MR5 should not move these responsibilities
into App, lifecycle, or a new orchestrator. A future extraction is justified
only when it removes a coherent independently testable DOM concern without
creating another authority; file length alone is insufficient.

One narrow erosion does exist in the Surface/App prop contract: the full lock
record lets App write constant values for Surface-owned facts. Fix that prop
shape/dispatch ownership locally; it does not justify extracting a new
orchestration component.

App is also large, and its center Presentation retention/timers are dense. That
logic predates and serves multiple semantic center outcomes. MR4 correctly
reuses it rather than creating terminal-specific storage. A generic global
Presentation store would increase authority risk; MR5 should leave it local.

## Consistency Audit

### Lifecycle and interruption

- **Consistent architecture:** both renderers stop obsolete local work, ignore
  stale callbacks, reconstruct from current facts, expose no correctness-bearing
  completion, and never write lifecycle/Product state.
- **Intentional local differences:** Dot remains mounted and sleeps on non-settled
  full projection; Character is compact-mounted and blink sleeps on document
  visibility/Reduced Motion. Progress trace replacement sacrifices continuity
  for information correctness; pointer attention preserves spring continuity.
- **No inconsistency requiring consolidation:** these differences follow
  different semantics and eligibility boundaries.

### Reduced Motion

- Dot acknowledgement becomes a short non-travelling bloom; determinate and
  terminal targets resolve directly; indeterminate becomes static; pending
  frame work ends.
- Character keeps a smaller direct eye response but removes body squash, blink,
  lag, overshoot, and hidden spring work.
- Shell recipes receive the same Application-derived preference and retain
  lifecycle ownership.
- The generic center overlay outer presence token remains a fixed 0.2-second
  opacity fade (`components/ui/motion.ts:38-43`), while
  `ForegroundOutcomeOverlay` shortens or removes transform travel under Reduced
  Motion (`ForegroundOutcomeOverlay.tsx:62-102`). This is a **visual tuning
  inconsistency**, not an architecture/authority defect. Opacity-only presence
  does not justify a shared runtime; optionally make the outer recipe
  preference-aware in a separately approved polish slice.

### Timing and priority

- Dot acknowledgement `480ms/90ms`, progress convergence, a low-duty 3600ms
  indeterminate sweep, and terminal convergence are local readability/perf
  choices (`dotFieldRecipe.ts:20-21,202-217` and terminal constants below).
- Character's 3600ms blink interval and 160ms blink animation are unrelated
  biological/idle cadence (`characterBlinkRuntime.ts:16`;
  `CompactCatCharacter.tsx:65-68`). Equal numeric values do not prove a shared
  clock or policy.
- App outcome retention (success/cancelled 1500ms, failure 5000ms) is semantic
  Presentation readability, not renderer animation duration
  (`App.tsx:1377-1405`).
- Within Dot, current Download progress supersedes terminal, terminal absorbs
  acknowledgements, and no FIFO exists. Character is compact-only and therefore
  does not compete with expanded Dot lanes. No global priority model is needed.

### Performance

- Dot: bounded grid (`DOT_COUNT_MAX=400`), DPR cap 2, at most one rAF, zero
  pending frames at rest; indeterminate normal mode is duty-limited to 33ms.
- Character: no Character-owned rAF, no CSS infinite animation, one future
  timer only while eligible, and Motion springs only for live pointer response;
  Reduced Motion parks them.
- Surface compact hotspot uses a separate one-rAF input throttle
  (`MainWindowPresentationSurface.tsx:777-803`). It is Pointer Field/DOM input
  scheduling, not evidence for an animation scheduler shared with Dot.
- These policies are consistent in bounded-work outcome while intentionally
  different in mechanism.

## Similarities That Must Not Be Abstracted

- Both features are “animations.”
- Both accept a Reduced Motion boolean.
- Both use a generation counter to make late callbacks stale.
- `wake/sleep/dispose` and `start/stop/dispose` have similar English meanings.
- Dot progress convergence and Character springs both retarget from a current
  rendered condition.
- Dot's 3600ms indeterminate period and Character's 3600ms blink interval share
  a number.
- Character body/eye colors and Dot dormant/ack/terminal colors come from the
  same theme object.
- Center outcome, Progress Field, and Terminal Reveal can be visible around the
  same task lifecycle.
- Folder outcome already uses `ForegroundOutcomeOverlay`; that shared semantic
  component does not make Folder Confirmation motion an implemented Dot/Reveal
  consumer.

None of these similarities establishes shared state ownership, scheduler
semantics, renderer technology, or interruption policy.

## Intake Reveal and Folder Confirmation

- **Intake Reveal:** no current production consumer exists. Frozen old M3
  contains useful lessons about epoch guards, disposal, exact-origin capture,
  and Reduced Motion final-state convergence, but its reconciliation adapter,
  ordered bootstrap, radial mask, noise, wave, extracted progress surface, and
  composition are explicitly superseded historical candidates. Intake must be
  planned later against then-current queue/Application facts.
- **Folder Confirmation:** the current product has semantic folder success/error
  center outcomes and reuses `ForegroundOutcomeOverlay`, but the roadmap's
  dedicated Folder Confirmation motion consumer is not implemented. Existing
  semantic reuse is not evidence for a renderer/runtime abstraction.
- Each should remain an independent later phase. Once one is concrete, compare
  it against existing consumers. Only two *implemented* consumers with identical
  ownership, lifecycle, interruption, and scheduler needs can justify extraction.
- MR5 must not implement either feature merely to manufacture abstraction
  evidence or “complete” the roadmap.

## Recommended Minimal MR5 Implementation Scope

1. In `DotFieldCanvas`, include terminal `status` in the value signature.
2. Add focused host/composition coverage proving `success -> failure ->
   cancelled` updates reach `setBaseline` without remount/replay, while same
   status identity churn remains a no-op.
3. Narrow Surface lock props/dispatch so App supplies only Application-owned
   locks; preserve Surface-only drag/drop writes. Remove the never-set startup
   lock path after focused lifecycle regression coverage.
4. Remove the unused `compactReachabilityActive` projection field and update
   projection tests; do not touch reachability lifecycle effects/native policy.
5. Delete unused `src/components/CatIcon.tsx` and
   `src/assets/mascot.svg`, verifying no desktop imports remain and browser
   extension assets are untouched; update the stale frontend directory spec.
6. Run focused Dot host/runtime/terminal projection, lifecycle/projection, and
   ownership tests, architecture guards,
   type-check, lint, build, and the existing full test gate.
7. Do not introduce any production abstraction or move App/Surface ownership.

Optional, review-gated polish: make generic center overlay outer presence honor
Reduced Motion consistently. Keep that change in existing motion tokens/props;
do not create a policy service or animation runtime.

## Residual Risks and Validation Debt

- MR1 real Windows smoke passed, but human raster quality, native context
  acknowledgement placement, drag/control exclusion feel, live OS Reduced
  Motion switching, visibly active replacement, and mixed-monitor DPR changes
  remain not human-verified (`dot-field-windows-validation.md:19-42`).
- MR2 accepted debt remains: macOS manual validation, live OS Reduced Motion
  toggle, white-theme contrast/polish, full display-scale/monitor-edge matrix,
  and the independent historical Windows native argument-conversion risk
  (`research/implementation-validation.md:45-56`).
- MR3 indeterminate readability and no-overstatement behavior have strong unit
  coverage but still need human interpretation/tuning evidence; MR1 contrast/DPR
  debt carries forward (`MR3 design.md:150-156`).
- MR4 has focused automated authority/runtime coverage, but no dedicated human
  terminal visual report or committed Windows evidence file was found.
  Terminal-kind replacement is specifically under-covered at the React host
  boundary and should be the MR5 regression.
- App/Surface lock narrowing needs reversal/drag/drop regression coverage so a
  prop refresh cannot clear an active Surface-owned lock.
- macOS remains unverified for the combined MR1–MR4 presentation line.
- Both previously pinned Windows risks remain open validation dependencies:
  native argument conversion and terminal presentation not collapsing back to
  compact. MR5 must not claim its local repair/deletion work fixes either.
- The root/main history divergence means any later MR5 implementation must be
  based on or integrate the authoritative `1c9db284...` line deliberately; do
  not implement against the unrelated dirty root tree by accident.

## Architecture Review Gates

Stop and return to GPT Architecture Lead if implementation evidence appears to
require any of the following:

- Download model/reducer/protocol/controller changes;
- lifecycle reducer/projection/native-policy changes;
- a second Pointer Field writer or renderer authority;
- Intake/Folder/Transcode scope;
- a shared scheduler/runtime/state machine/priority bus/material system;
- moving center Presentation retention into Dot or Character;
- making animation completion control correctness or retention.

Planning conclusion: **approve no new production abstraction; approve only the
minimal repair/deletion scope if the Lead wants MR5 implementation.**
