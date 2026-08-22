# Proposed Implementation Plan: MR9 Localized Boundary Production Integration

Planning artifact only. Do not run `task.py start` until GPT Architecture Lead approves the planning artifacts and the user later authorizes implementation.

## Entry Gates

1. Preserve the current accepted Browser Lab candidate, evidence, and unrelated dirty files. Do not restore, reset, clean, or fold in the rejected Unified candidate.
2. Re-read `prd.md`, `design.md`, `research/repository-grounded-planning-report.md`, the selected frontend specs, and the localized-boundary Implementation Report.
3. Confirm the production baseline still has stable 228 native bounds, 200/r16 panel geometry, the dedicated shadow backdrop, and one sole Expanded mount.
4. Record a pre-integration Windows Main Window baseline for geometry, hit targets, shadow ownership, and panel/gutter behavior.

## Implementation Sequence

1. **Pin focused contracts before composition changes**
   - extend `expandedPresentationSurface.test.ts` for the production 228 host, fixed capability gates, 200/r16 panel interaction clip, no wrapper stacking context, sole exterior shadow owner, one canvas/program/draw, and unchanged resource/runtime authority;
   - add the smallest focused interaction assertion proving the gutter is not a panel drag/drop target and protected z=3 controls stay above activation pixels.

2. **Integrate the sole canvas into the existing outer domain**
   - in `MainWindowPresentationSurface.tsx`, derive the full gutter from existing viewport/panel metrics;
   - add one pointer-transparent, aria-hidden, non-stacking outer layout host sized to the existing full viewport and offset around the real panel;
   - keep the sole `ExpandedPresentationSurface` mounted there;
   - pass the accepted Thermal interior, Refraction, and boundary/halo capabilities without adding a Product/Application prop or state field.

3. **Restore the real panel clip without changing event ownership**
   - change only the interactive shell's overflow to visible;
   - wrap every non-canvas child in one transparent, shadowless, non-stacking 200/r16 overflow clip;
   - leave all pointer/drag/drop/context-menu/double-click handlers and `containerRef` on the original 200px shell;
   - preserve existing child z-index behavior, especially coverable material versus protected controls.

4. **Promote comments, not visual parameters**
   - update `ExpandedPresentationSurface.tsx` Lab-only wording to production-capability wording;
   - leave all accepted shader equations, palette, Refraction constants, halo support/alpha, uniforms, resources, and runtime scheduling unchanged.

5. **Keep public docs accurate with the smallest copy delta**
   - update the existing intake-response sentence in Chinese and English downloads docs to mention the restrained localized boundary response;
   - do not create a new guide or document shader internals.

## Focused Automated Validation

```text
npm test -- src/presentation/main-window/expandedPresentationSurface.test.ts src/presentation/main-window/expandedPresentationRuntime.test.ts src/lab/rendererReuse.test.ts src/lab/scenarios.test.ts
npm test -- src/utils/mainPanelInteractions.test.ts src/presentation/main-window/panelHover.test.ts src/presentation/main-window/lifecycle.test.ts src/presentation/main-window/projections.test.ts electron/mainWindowPointerBoundary.test.mts
npm test -- src/architecture/import-guard.test.ts
npm run type-check
npm run lint -- --quiet
npm run build
npm run docs:build
git diff --check
```

Then run full `npm test`. Record unrelated baseline failures separately; no relevant broken gate may be waived.

## Windows Production Validation

1. Build and launch the actual Windows Electron Main Window, preferably from `npm run package:win:dir`; do not use the Browser Lab as the production-host substitute.
2. Capture compact native-alpha and OS-composite evidence for 228 outer bounds, 200/r16 panel at `(14,14)`, <=12px halo support, strict zero outer 2px, and unclipped transparent corners.
3. Record JSON measurements for DOM rectangles, computed styles, `elementFromPoint`, canvas/program/texture/framebuffer counts, exterior shadow owner, and rAF counts.
4. Exercise panel drag, gutter pointer-down, panel and gutter file/URL drop, context menu, double-click, queue/protected controls, paste origin, hover/Magnetic, collapse/compact passthrough/re-expand, and context loss/restore.
5. Prove ordinary motion has at most one pending frame and Reduced Motion has zero continuing frames over at least 500ms.
6. Produce only tightly cropped evidence or a compact landscape sheet.

macOS remains `NOT VERIFIED` unless an actual macOS host runs the equivalent transparent-window matrix.

## Rollback Point

The production composition in `MainWindowPresentationSurface.tsx` and its focused contracts are one isolated rollback unit. Boundary-only fallback restores the original 200px clipped mount, omits `boundaryHalo`, and retains accepted Interior+Refraction. No Electron, state, lifecycle, runtime, or migration rollback is required.

## Stop Gate

After one implementation and Windows evidence round, write an Implementation Report and stop for GPT Architecture Lead Implementation Architecture Review. Do not self-grant PASS, tune a second visual candidate, start traversal/Entry/Exit work, commit, archive, or merge before that review.
