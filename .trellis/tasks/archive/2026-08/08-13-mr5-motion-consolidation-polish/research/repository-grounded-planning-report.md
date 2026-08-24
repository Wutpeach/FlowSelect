# Repository-Grounded Planning Evidence

The authoritative Planning Report is `../design.md`. This file records the
compact evidence index used to reach it.

## Baseline

- Commit: `1c9db28445fa937921984999a57d30be1e7f5689`.
- Clean mirror: `.cindy-worktrees/mr1-dot-field` at the same commit.
- Root dirty worktree and divergent `HEAD` excluded from implementation facts.

## Primary Code Anchors

- `src/App.tsx:487-492,549-554,609-646,785-868,1327-1411,2892-2913,3622-3790`
- `src/presentation/main-window/MainWindowPresentationSurface.tsx:521-673,696-854,945-968,1165-1251`
- `src/presentation/main-window/DotFieldCanvas.tsx:58-168`
- `src/presentation/main-window/dotFieldRuntime.ts:1-39,147-180,410-438,440-621,623-709`
- `src/presentation/main-window/dotFieldRecipe.ts:1-68,84-217`
- `src/presentation/main-window/CompactCatCharacter.tsx:1-19,49-215`
- `src/presentation/main-window/characterBlinkRuntime.ts:1-98`
- `src/presentation/main-window/characterRecipe.ts:1-12,50-170`
- `src/presentation/main-window/downloadProgressProjection.ts:4-49`
- `src/presentation/main-window/downloadTerminalProjection.ts:4-99`
- `src/components/ui/motion.ts:38-43`
- `src/components/ForegroundOutcomeOverlay.tsx:21-102`
- `src/architecture/import-guard.test.ts:900-960`

## Primary Task / Spec Anchors

- MR1 design: consumer-specific Canvas, no generic runtime abstraction,
  fake-scheduler tests and manual Windows debt (`design.md:28-32`).
- MR2 design: no shared Character/Dot renderer or scheduler (`design.md:50`),
  local disposal (`:100-102`), Windows/manual validation (`:124-166`).
- MR3 design: projection data path and local runtime (`design.md:30-43`), no
  shared composition type without another real consumer (`:114`), frozen M3
  rejection matrix (`:137-148`), risks (`:150-160`).
- MR4 design: sibling projection/priority ownership (`design.md:3-25`) and no
  shared infrastructure before another real consumer (`:25`).
- MR0 frozen M3 audit: historical candidate status (`:1-3`), reusable lessons
  versus superseded visuals (`:34-36,50-53`).

## Key Proven Findings

1. Progress and Terminal are lanes inside Dot Field, not independent runtimes.
2. Character and Dot use unlike schedulers/lifecycle semantics; commonality is
   an architecture invariant already captured in specs, not reusable code.
3. Surface composition remains on the correct DOM/renderer boundary.
4. `DotFieldCanvas` terminal signature omits status and can suppress a real
   retained terminal-kind replacement.
5. App mirrors Surface-owned drag/drop locks as constant false, and startup is a
   never-set lock alongside the real `startupSettle` lifecycle event.
6. `compactReachabilityActive` is produced/tested but not consumed in production;
   lifecycle effects already own real reachability behavior.
7. Desktop `CatIcon.tsx` and `src/assets/mascot.svg` are unreferenced after MR2.
8. Adjacent settled-full predicates, rAF throttles, clamp helpers, convergence
   loops, and equal radii do not justify a shared production abstraction.
