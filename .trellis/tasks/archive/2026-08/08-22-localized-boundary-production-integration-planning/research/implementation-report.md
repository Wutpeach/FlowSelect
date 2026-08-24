# MR9 Localized Boundary Interaction / Production Integration — Implementation Report

Date: 2026-08-22  
Worktree: `D:\Ameow\.cindy-worktrees\mr9-fullscreen-activation-fx`  
Baseline: `motion/mr9-fullscreen-activation-fx` at `4db7722` plus the preserved accepted Browser Lab candidate

Status: **implementation and Windows Electron Main Window validation complete; awaiting GPT Architecture Lead Implementation Architecture Review. This report does not grant Architecture PASS.**

No commit, archive, merge, Entry/Exit/traversal work, shader retuning, native resize, or new lifecycle/runtime authority was performed. macOS is **NOT VERIFIED** because no macOS host was available.

## Implementation

The production delta is limited to the reviewed composition, focused contracts, and restrained public copy:

1. `MainWindowPresentationSurface.tsx`
   - derives the outer FX size and offset from the existing `geometry.viewportSize` and `geometry.visualShell` authority;
   - mounts the sole `ExpandedPresentationSurface` in one 228x228, `aria-hidden`, pointer-transparent, non-stacking outer host;
   - keeps `containerRef` and every pointer, drag/drop, pointer-capture, double-click, context-menu, paste, hover, and Magnetic handler on the existing 200px shell;
   - makes the shell overflow visible and moves every non-canvas descendant into one transparent, shadowless, non-stacking 200/r16 clip;
   - enables accepted Thermal, Refraction, and the fixed boundary/halo capability at the sole production mount. The boundary capability is read-only geometry derivation; 0-gutter platforms retain the 200-domain Interior+Refraction fallback.
2. `ExpandedPresentationSurface.tsx`
   - promotes the already-frozen accepted Browser Lab candidate to production-capability wording;
   - retains one canvas, one WebGL program, one draw path, zero texture/FBO, and the existing runtime;
   - leaves the accepted Thermal, Refraction, localized contact, halo equations, units, and visual constants unchanged. The Lead simplification pass removed one unused GLSL local only.
3. `expandedPresentationSurface.test.ts`
   - pins geometry derivation, the sole production mount, fixed capability gates, wrapper non-stacking behavior, 200/r16 interaction clip, sole exterior shadow ownership, handler placement, protected z-order, and one-renderer/resource authority.
4. Chinese and English downloads documentation
   - adds one restrained sentence describing the localized boundary response without exposing shader internals.

`expandedPresentationRuntime.ts`, Electron bounds and interaction code, geometry/metrics, Product/Application state, Presentation targets/policy/lifecycle, IPC, locks, callbacks, scheduling, Progress/Intake/Folder semantics, and semantic DOM were not changed.

## Windows Production Evidence

Evidence is under `research/production-evidence/`:

- `review-sheet.png` / `review-sheet.html` — compact reviewable evidence sheet;
- `windows-os-composite.png` — exact 228x228 Win32 screen crop of the real Electron Main Window;
- `native-alpha.png` — exact 228x228 WebGL readback;
- `measurements.json` — native/DOM/canvas geometry, computed styles, hit targets, WebGL resources, frame counters, lifecycle/interaction results, and context recovery;
- `capture-production.mjs` — reproducible Windows production instrumentation.

The runner launched the real Electron main process and production Main Window route with the built production renderer. Browser Lab was not used as a production-host substitute.

### Geometry, alpha, and composition

- native window, DOM viewport, outer FX host, and canvas: 228x228;
- real panel and inner interaction clip: `(14,14,200,200)`, radius 16;
- outermost 2px maximum alpha on all sides: 0;
- all four outer corners maximum alpha: 0;
- measured exterior support: 8.5 CSS px in the captured Reduced Motion state, below the locked 12px maximum;
- measured subordinate halo maximum alpha: 19/255;
- direct OS-composite review: no square backing, halo clipping, or second silhouette.

### Shader and graphics authority

- actual vertex/fragment compile: 2/2 PASS, empty logs;
- actual program link: 1/1 PASS, empty log;
- settled live authority: one DOM canvas and one valid WebGL program;
- maximum renderer draws in one observed rAF callback: 1;
- textures: 0; framebuffers: 0;
- context loss fails closed; restore recompiles/relinks successfully and leaves exactly one `gl.isProgram()`-valid program;
- the backdrop is the only exterior CSS shadow owner. Panel shadows are inset-only; outer host, inner clip, and canvas have no CSS shadow.

The page-wide instrumentation observed `rafMaxPending: 3` during wake/morph transitions because it counts every React/Motion/page `requestAnimationFrame`, not only the Expanded graphics runtime. This is not used as a graphics-runtime authority count. The relevant evidence is the unchanged runtime `frameHandle` guard, one steady-state graphics request, at most one renderer draw in any observed callback, and the Reduced Motion result below.

### Interaction and lifecycle

- panel center resolves to a panel descendant; gutter resolves to neither the panel nor canvas;
- blank-panel pointer drag moves the native window and acquires pointer capture;
- gutter pointer drag does not move the window;
- panel drop is prevented/handled by the existing panel owner; gutter drop is not accepted;
- Full → Compact settles at 60px while native bounds remain 228px;
- the existing Windows compact passthrough/hotspot path re-expands to 200px using the real native cursor plus the renderer-forwarded window mousemove;
- re-expanded native bounds remain 228px;
- context loss/restore produces no stuck or duplicate graphics authority.

Focused unit suites also cover the existing panel hover/Magnetic, lifecycle, projection, native pointer-boundary, and interaction contracts. No relevant regression was observed.

### Reduced Motion

After the deterministic snapshot settled:

- draw count stayed `6 → 6` over 600ms;
- page rAF fire count stayed `27 → 27`;
- pending rAF count remained 0;
- shader/program/resource authority remained one canvas, one valid program, zero texture/FBO.

This satisfies zero continuing frames for longer than the required 500ms.

## Automated Validation

- renderer/Lab/runtime focused Vitest: **81/81 PASS**;
- interaction/lifecycle/native-boundary focused Vitest: **54/54 PASS**;
- architecture import guard: **23/23 PASS**;
- `npm run type-check`: **PASS**;
- `npm run lint -- --quiet`: **PASS**;
- `npm run build`: **PASS** (renderer and Electron build; existing bundle/externalization warnings only);
- `npm run docs:build`: **PASS**;
- `git diff --check`: **PASS** (existing LF→CRLF conversion warnings only);
- full Vitest: **1783/1784 PASS**. The sole failure remains the known unrelated baseline at `browser-extension/architecture-guard.test.js:277`.

`npm run package:win:dir` was attempted twice. Both attempts built the renderer and Electron sources, then electron-builder was blocked by host-level `EPERM` while renaming `dist-release\win-unpacked.tmp` to `win-unpacked`. The incomplete staging directory contains only Electron's default app and was not used or represented as packaged evidence. Therefore packaged-directory validation is **BLOCKED / NOT VERIFIED**, while the actual Windows Electron development main process plus built production renderer validation above is PASS.

## Rollback / Fallback Boundary

The boundary-only rollback remains isolated:

1. remove the outer 228 FX host and inner clip composition;
2. restore the original shell-owned 200px overflow clip;
3. omit `boundaryHalo` while retaining accepted Interior+Refraction in the original 200-domain canvas;
4. leave Electron bounds, App, target policy, lifecycle, runtime, semantic DOM, and Browser Lab evidence untouched.

No state migration, native rollback, scheduler cleanup, persistence change, or feature flag is required.

## Execution Channels

- **Orca Worker (`develop`, Pi / `deepseek-v4-flash` / MAX):** production composition, focused contracts, dual-language docs, and final static spec/task consistency review. Worker command execution was unavailable, so it made no validation claims.
- **Cindy Lead (Windows host):** simplification review, automated validation, actual Electron Main Window instrumentation, Win32/native-alpha capture, visual evidence review, evidence runner, and this Implementation Report.

## Stop Gate

Implementation and the one Windows production evidence round are frozen here. Await GPT Architecture Lead Implementation Architecture Review. Do not infer Architecture PASS, commit/archive/merge, retune a second candidate, or enter Entry/Exit/traversal redesign from this report.
