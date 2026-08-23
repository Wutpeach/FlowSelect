# Agentation Integration Future Execution Plan

This checklist is dormant until a later user message explicitly approves the latest planning report and
the task is moved out of planning. It does not authorize implementation now.

## Phase 1: Dependency and official Lab mount

1. Install exactly `agentation@3.0.2` as a devDependency using npm's exact-save option.
2. Verify `package.json` and `package-lock.json` contain only the expected package/peer metadata changes
   and retain `PolyForm-Shield-1.0.0` package metadata.
3. Import `Agentation` only from `src/lab/lab-main.tsx` and mount one unconfigured `<Agentation />` sibling
   after `PresentationLab`.
4. Do not add endpoint, webhook, Agent Sync, callbacks, custom UI, Dev Tools status, placeholder, wrapper,
   custom state, or placement CSS.

## Phase 2: Minimum real-browser retention spike

1. Start `npm run dev:lab` and validate in the repository's real desktop browser harness at a normal
   desktop viewport.
2. Record the official default toolbar at viewport bottom-right, collapsed and expanded, and prove no
   collision with the final Lab.
3. Validate Full at 1x, Auto 2x, and 3x:
   - frame hover/select alignment;
   - area/draw annotation over WebGL;
   - frame identity rather than canvas/shader identity;
   - queue badge and open queue-popover descendant selection.
4. Validate Compact at 1x and 3x:
   - stage/shell selection;
   - area annotation over body/eyes;
   - pointer-transparent SVG internals remain a documented non-goal.
5. Validate Background, Reset, queue/runtime popovers, target switch, scale switch, animation pause, and
   Compact attention recover after annotation mode.
6. Capture actual annotation output proving selector/path, React component chain, and `sourceFile` results
   where available. Record missing source context honestly.

## Phase 3: Pointer-origin gate

1. Annotate a non-interactive Full pixel and compare pointer-origin state before/after.
2. If unchanged, add no guard.
3. If changed, prove React receives `event.defaultPrevented` and add only a Lab-local early return in
   `LabOverlayStage` plus one focused test.
4. If the minimal guard does not work, remove Agentation and return NO-GO. Do not add an Agentation mode
   bridge or touch production pointer/layering/renderer code.

## Phase 4: Isolation guards and quality gates

1. Extend `src/lab/rendererReuse.test.ts` to assert Agentation is Lab-entry-only and absent from production
   entries/config/sources.
2. Run focused Lab tests.
3. Run `npm run type-check`.
4. Run `npm run lint`.
5. Run `npm run build`.
6. Scan `dist/` and `dist-electron/` for package names, `data-agentation-*`, toolbar strings, and dedicated
   Agentation assets.
7. Build one unpacked production package and inspect files/asar for Agentation code/package content.
8. Run `git diff --check` and verify no production source, Lab layout, locale, or docs-site diff exists.

## Phase 5: Retain or roll back

- Retain only if license acceptance, browser behavior, pointer isolation, and production artifact isolation
  all pass.
- Otherwise uninstall Agentation, remove the Lab mount/test additions and optional Lab guard, preserve the
  evidence, and report the exact failed gate.
- Submit the retained result for GPT Architecture Lead Implementation Architecture Review. Do not grant
  Architecture PASS locally.

## Expected changed files

- `package.json`
- `package-lock.json`
- `src/lab/lab-main.tsx`
- `src/lab/rendererReuse.test.ts`
- optionally `src/lab/LabOverlayStage.tsx` and one focused test, only after reproduced origin mutation
- task-local research/evidence artifacts

## Explicitly forbidden changes

- production renderer/Presentation/lifecycle/Product/native-window/pointer modules
- MR9 visuals or Compact renderer internals
- current UI Lab visual layout or Dev Tools responsibility
- generic inspector, adapter, provider, registry, or production annotation state
- preview-only selection filtering built on custom document listeners
