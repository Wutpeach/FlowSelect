# MR5 Motion Consolidation / Polish

## Goal

Audit the MR1–MR4 Motion / Presentation consumers at authoritative baseline
`1c9db28445fa937921984999a57d30be1e7f5689`, identify only repository-proven
consolidation seams or local polish/deletion opportunities, and define the
smallest safe MR5 implementation proposal without starting implementation.

## Background

- MR1 added the Expanded Dot Field substrate.
- MR2 replaced the compact desktop icon with the Flat Blob Cat Character.
- MR3 added Download Progress as a projection into the existing Dot Field.
- MR4 added Download Terminal Reveal as a sibling projection into the same
  Dot Field plus the existing semantic center outcome.
- The root worktree is not the authoritative source tree for this audit. Its
  current `HEAD` is on another history line and it contains unrelated dirty
  Trellis/runtime changes. All implementation conclusions must come from the
  clean `1c9db284...` tree.

## Requirements

1. Map ownership, lifecycle, runtime work, and dependency direction for Dot
   Field, Compact Character, Progress Field, Terminal Reveal, App, and
   `MainWindowPresentationSurface`.
2. Distinguish actual duplicated code/authority from shared architecture
   principles and visually similar but consumer-local behavior.
3. Audit scheduling and stale-generation invalidation, wake/sleep/dispose,
   current-condition retargeting, Reduced Motion, priority/interruption,
   visual recipes/materials, and bounded performance.
4. Identify duplicate authority, dead presentation state, obsolete branches,
   legacy compatibility paths, and safely removable structures.
5. Preserve the dependency direction:

   ```text
   Product / Application facts
     -> pure Presentation projection
       -> Main Window composition
         -> renderer-local execution
   ```

6. Do not move or share the Main Window lifecycle reducer, Download authority,
   or Pointer Field authority. Do not force Character and Dot Field onto one
   renderer or scheduling technology.
7. Do not introduce a universal animation runtime, Motion DSL, global motion
   bus, generic state machine, or shared scheduler unless at least two current
   production consumers prove the same stable contract.
8. Treat the frozen old M3 work only as historical evidence. Do not restore or
   adapt its implementation as part of MR5.
9. Treat Intake Reveal and Folder Confirmation motion as independent future
   phases. Their absence is not evidence for a present abstraction and MR5
   must not implement them to complete the roadmap by proxy.
10. Prefer deletion, corrected value wiring, existing small contracts, and
    local polish over new layers.

## Recommended MR5 Scope

If Planning Architecture Review approves implementation, limit MR5 to:

1. Correct the Dot Field terminal input signature so `success`, `failure`, and
   `cancelled` replacements all reach the already-capable local runtime.
2. Add a focused host/composition regression covering terminal-kind replacement
   across the React effect boundary.
3. Tighten lifecycle input ownership so Surface-owned `drag`/`drop` facts are
   not also mirrored from App as constant-false props; remove the unused
   `startup` lock path if focused lifecycle evidence confirms it is never set.
4. Remove the unused `compactReachabilityActive` native projection field while
   preserving the existing lifecycle effects that actually own reachability.
5. Delete the unused desktop `CatIcon` component and its now-unreferenced
   `src/assets/mascot.svg`, and update the frontend directory-structure spec
   that still names `CatIcon`; do not touch the separate browser-extension
   mascot.
6. Keep all other consumers and ownership boundaries local. Do not add a new
   production abstraction.

Reduced Motion timing alignment for the generic center-overlay outer fade is
classified as optional visual polish, not part of the minimal architecture
scope. It should enter MR5 only if Architecture Review explicitly wants the
visual-tuning slice.

## Out of Scope

- Production implementation, task activation, commit, archive, or release work.
- Intake Reveal, Folder Confirmation motion, Transcode Reveal, or restoration
  of frozen old M3 files.
- Lifecycle reducer, Download model/reducer/protocol, Pointer Field authority,
  native window policy, preload/IPC, or renderer convergence changes.
- Global scheduling, state-machine, priority-bus, material-system, or Motion
  framework work.
- Broad visual redesign or retuning of consumer-local palette, wave, spring,
  blink, progress, or terminal parameters.

## Acceptance Criteria

- [x] The current MR1–MR4 responsibility/dependency map is repository-grounded.
- [x] Every consolidation candidate names consumer evidence, proposed owner,
  dependency direction, and an abstract/do-not-abstract judgment.
- [x] The report explicitly lists similarities that must remain local.
- [x] Main Window composition inflation and authority erosion are assessed.
- [x] Reduced Motion, interruption, lifecycle, timing, and performance are
  audited with architecture inconsistencies separated from visual tuning.
- [x] Legacy/dead/removable structures and one concrete boundary defect are
  identified without modifying production code.
- [x] The report answers whether MR5 needs a new production abstraction.
- [x] Intake Reveal and Folder Confirmation remain future concrete consumers,
  not current abstraction evidence or MR5 scope.
- [x] Frozen old M3 remains historical evidence only.
- [x] No Product, lifecycle, renderer, or consumer-local disposable state is
  promoted into a second/global authority.
- [x] Planning artifacts are complete and the task remains `planning` pending
  GPT Architecture Lead Planning Architecture Review.

## Blocking Open Questions

None. Planning Architecture Review decides whether to approve the recommended
minimal implementation scope; this task must not be started from this turn.
