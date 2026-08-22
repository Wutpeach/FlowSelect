# MR9 Localized Boundary Interaction: Production Integration Planning Report

Date: 2026-08-22  
Worktree: `D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx`  
Branch / baseline: `motion/mr9-fullscreen-activation-fx` at `4db7722`, plus the frozen uncommitted localized-boundary Browser Lab candidate and evidence.

Status: **Planning ready for GPT Architecture Lead Planning Review. This is not Architecture PASS and does not authorize implementation.**

## Executive Decision

Production already owns the required native 228x228 transparent outer window on Windows and macOS. The minimum integration is therefore a renderer composition change, not a native resize, new Presentation mode, or new lifecycle/state flow.

Keep the existing 200x200/r16 `motion.div` as the only panel interaction owner. Change only its child composition:

1. let the panel shell overflow visibly;
2. host the sole `ExpandedPresentationSurface` in a non-stacking, non-interactive 228x228 layout wrapper positioned `-14px` from the 200px panel origin;
3. place every non-canvas child inside a new 200x200/r16 overflow clip that creates no stacking context and owns no background or shadow;
4. enable the accepted Thermal interior, Refraction, and localized boundary/halo gates as fixed renderer capabilities at the sole production mount;
5. leave Electron bounds, geometry, Product/Application facts, target policy, lifecycle reducer, runtime scheduling, and accepted shader parameters unchanged.

This maps the already-falsified Lab pixels onto the existing production geometry without changing their units: panel UV remains 200px, corner radius remains `16/200`, halo support remains `0.06 * 200 = 12px`, and the final `14 - 12 = 2px` remains strict zero.

## Repository Findings

| Concern | Current production authority | Evidence | Integration consequence |
|---|---|---|---|
| Native outer domain | Electron Main creates one stable, transparent, frameless, non-resizable full viewport using `getMainWindowFullOuterSize`; full/compact never resizes it | `electron/main.mts:2103-2128`; `src/constants/windowMetrics.ts:1-22` | No Electron or native bounds change. Windows and macOS already resolve to 228px. |
| Spatial policy | Full visual shell is 200x200/r16 at the platform gutter; viewport is always the full outer size | `src/presentation/main-window/geometry.ts:45-76,93-112` | Production already has the exact `(14,14)` panel inside 228 on Windows/macOS. |
| Real panel and gestures | The 200px shell `containerRef` owns pointer capture, manual window drag, double-click, context menu, drag/drop, hover, and panel hit tests | `MainWindowPresentationSurface.tsx:153-493,793-890,1029-1104` | Keep handlers and `containerRef` on the same 200px element. The FX gutter must never become the gesture surface. |
| Current canvas domain | The sole `ExpandedPresentationSurface` is a child of the 200px shell, whose `overflow: hidden` clips all exterior pixels | `MainWindowPresentationSurface.tsx:1083-1126`; `ExpandedPresentationSurface.tsx:885-897` | Release only the canvas into the already-existing outer viewport; do not widen the interactive panel. |
| CSS shadow | One dedicated shadow backdrop owns the exterior drop shadow. The panel shell owns only its surface and inset border/highlight/accent treatment | `MainWindowPresentationSurface.tsx:925-966,993-1028,1095-1103`; `shared-styles.ts:96-122` | Keep the backdrop as the sole exterior CSS shadow authority. Canvas and new clip get no CSS shadow. |
| Stacking contract | Activation canvas uses z=2 to cover coverable center material, while protected controls use z=3 | `expandedPresentationSurface.test.ts:99-116`; `ExpandedPresentationSurface.tsx:889-896` | The outer layout wrapper and new clip must not create a stacking context. Otherwise all clipped content would incorrectly sit above the activation surface. |
| Expanded eligibility | A read-only projection wakes graphics only in settled Full mode | `MainWindowPresentationSurface.tsx:620-625` | During expand/collapse the outer canvas is clear; no new transition phase or completion is needed. |
| Semantic target | App resolves current Progress/Intake/Folder priority into one `ExpandedPresentationTarget` | `src/App.tsx:545-559`; `expandedPresentationPolicy.ts:8-37`; `expandedPresentationTargets.ts:13-30` | Keep target shape, priority, retention, and activation ownership unchanged. |
| Runtime | One consumer-local runtime owns wake/sleep/dispose, at most one pending rAF, continuous Thermal frames in ordinary motion, and zero continuing frames under Reduced Motion | `expandedPresentationRuntime.ts:13-21,103-165,247-305`; `ExpandedPresentationSurface.tsx:788-866` | Boundary/halo consumes the existing draw and time. No second scheduler, clock, target, or lifecycle input. |
| Native interaction mode | Full mode sets `setIgnoreMouseEvents(false)`; compact passthrough alone ignores the full window | `electron/main.mts:3264-3291`; `projections.ts:65-134` | Transparent alpha does not mean OS click-through. Preserve the current native rectangular full-window hit policy. |
| Native pointer fallback | Pointer-boundary polling classifies the complete native BrowserWindow bounds, not the 200px panel | `electron/mainWindowPointerBoundary.mts:30-66` | Preserve this fallback exactly. DOM panel hits remain 200px; native lifecycle fallback remains 228px. Do not invent per-pixel hit testing in this integration. |
| Lab proof | The actual component passed compile/link, one-canvas/program/draw/resource, localized-contact, <=12px support, outer-2px-zero, shadow, interaction, and Reduced Motion gates | `../../08-22-directional-thermal-traversal-boundary-to-boundary-event-planning/research/implementation-report.md`; `../../08-22-directional-thermal-traversal-boundary-to-boundary-event-planning/research/localized-boundary/measurements.json` | Reuse the candidate unchanged. Production integration must not tune morphology or visual constants. |

## Selected Production Layer Model

```text
Electron BrowserWindow, stable 228x228 transparent native bounds
└─ Main Window viewport, 228x228
   └─ existing Magnetic wrapper, moves shell + shadow + FX together
      ├─ existing shadow backdrop, 200x200 at (14,14)
      │  └─ sole exterior CSS drop-shadow authority
      └─ existing interactive panel shell, 200x200/r16 at (14,14)
         ├─ existing surface background + inset border/accent
         ├─ outer FX layout host, 228x228 at (-14,-14)
         │  └─ sole ExpandedPresentationSurface / canvas / WebGL program / draw
         └─ inner panel clip, 200x200/r16 at (0,0)
            └─ drag glow + semantic DOM + overlays + controls + Compact Character
```

### Non-negotiable composition details

- The interactive panel shell changes from `overflow: hidden` to `overflow: visible` only so the sole canvas can paint into the gutter.
- The new inner clip restores `overflow: hidden` for every existing non-canvas descendant. It has transparent background, no border, no box shadow, and no `z-index`, transform, opacity, isolation, or other stacking-context trigger.
- The outer FX host also has no `z-index` or other stacking-context trigger. Its canvas keeps the existing z=0/z=2 behavior in the panel's stacking context.
- The outer FX host and canvas remain `aria-hidden` and `pointer-events:none`.
- The real event owner remains `containerRef`; pointer capture therefore keeps the same `currentTarget`, window-drag threshold, screen-coordinate writes, and lock release path.
- The dedicated shadow backdrop stays below the canvas. The panel clip never copies the shadow. The shader never becomes a generic shell/drop-shadow authority.

## Ownership Matrix

| Fact / behavior | Owner after integration | Explicit non-owner |
|---|---|---|
| 228 native bounds, transparency, focusability, compact passthrough | Electron Main and existing native interaction effects | Shader, clip, Product/Application |
| 228 DOM viewport and 14px full gutter | Existing geometry projection and Main Window viewport | Lab-only layout state, shader clock |
| 200x200/r16 visible interactive panel | Existing `containerRef` shell and inner clip | Outer canvas, gutter |
| Exterior CSS drop shadow | Existing shadow backdrop | Panel clip, canvas, shader halo |
| Inset border/highlight/task accent | Existing panel shell | Shadow backdrop, panel clip |
| Thermal interior, Refraction, localized response, subordinate halo | Sole `ExpandedPresentationSurface` program/draw | CSS shell, Product/Application, second renderer |
| Pointer field, manual window drag, panel click/double-click/context menu | Existing Main Window Surface gesture code | FX host/canvas/gutter |
| File/URL drop acceptance | Existing 200px panel handlers | FX host/canvas/gutter |
| Activation/Progress/Intake/Folder priority and lifetime | Existing App/Application/Presentation target policy | Boundary/halo capability |
| Frame time, wake/sleep/dispose, Reduced Motion | Existing Expanded runtime | Boundary/halo capability, CSS, lifecycle reducer |

## Pointer, Drag, Hit-Test, And Transparent-Gutter Semantics

The integration preserves two existing scopes and must document them separately:

1. **DOM/Product interaction scope:** only the real 200x200/r16 panel accepts pointer gestures, manual window drag, double-click, context menu, paste-origin sampling, and file/URL drops. The 14px gutter is FX-only and returns no panel descendant from `elementFromPoint`.
2. **Native window scope:** the full 228x228 transparent BrowserWindow remains interactive in Full mode. Alpha-zero gutter pixels are not claimed to be OS click-through. Existing native pointer-boundary polling continues to observe the full window bounds as a fallback, while compact mode retains its current whole-window passthrough policy.

Observable consequences:

- a pointer-down or drop in the gutter cannot start the panel's manual drag or invoke `onDrop`;
- a drag/drop session ending in the gutter may still reach the existing global cleanup listeners, which is correct;
- the halo cannot intercept clicks because both layout host and canvas are `pointer-events:none`;
- moving through the gutter must not leave `drag`/`drop` locks, pointer capture, Magnetic displacement, or Full/Compact lifecycle state stuck;
- no per-pixel native hit-test region, `setShape`, extra `setIgnoreMouseEvents` switching, or gutter-specific lifecycle event is added.

## Renderer Capability And State Decision

No new Product, Application, Presentation target, lifecycle phase, lock, persistence field, IPC, or native command is justified.

- Production passes the accepted Thermal interior and Refraction gates as fixed props at the sole mount.
- Boundary/halo is also a fixed renderer capability wherever the existing full geometry exposes the exact 14px gutter. This is a read-only geometry capability, not user/product state.
- Windows and macOS use the 228-domain path because current geometry already resolves the 14px gutter. A platform that resolves a 0px gutter keeps the 200-domain Interior/Refraction fallback and does not pretend that the halo can exist outside native bounds.
- `expandedPresentationRuntime.ts` remains unchanged. The accepted Thermal input already requests ordinary-motion frames; Reduced Motion makes `needsFrames()` false and must stay at zero continuing frames.
- Refraction, Interior, and halo remain branches of the same fragment program and draw. No new texture, framebuffer, pass, canvas, program, renderer, or scheduler is allowed.

### Production activation clarification

- The accepted Thermal branch is a fixed Expanded renderer material and currently returns before the legacy activation/progress shader composite. Promoting it to production is therefore a locked visual replacement inside the existing host, not a new `ExpandedPresentationTarget` lane.
- In ordinary motion, the existing `heatmap` runtime input keeps one continuous renderer-local phase while the settled Full surface is eligible, including an idle semantic target. This is the already-falsified candidate behavior and uses the existing single rAF authority.
- Existing Progress/Intake/Folder priority, activation opportunity lifetime, Full eligibility, collapse sleep, and semantic DOM remain authoritative. Boundary/halo neither observes nor creates a semantic completion.
- If coexistence with the legacy shader activation/progress pixels is later required, that is a new visual/composition design and is outside this minimum integration. It must not be improvised by adding boundary Product/Application/lifecycle state.

## Minimum Integration Delta

### Product source

1. `src/presentation/main-window/MainWindowPresentationSurface.tsx`
   - derive the stable full-panel gutter from the existing viewport and panel metrics;
   - add the non-stacking outer FX layout host;
   - change the panel shell overflow to visible;
   - add the non-stacking inner 200/r16 clip around all non-canvas descendants;
   - enable accepted Interior, Refraction, and boundary/halo at the sole production mount only where the 14px outer domain exists.
2. `src/presentation/main-window/ExpandedPresentationSurface.tsx`
   - retain the accepted frozen shader/runtime implementation and all visual constants;
   - update Lab-only comments/API wording to describe a production-fixed renderer capability plus Lab inspection gate;
   - no morphology, unit, uniform, draw, resource, or scheduling change.
3. Focused tests
   - extend `expandedPresentationSurface.test.ts` to pin the sole production mount, fixed capabilities, 228 host mapping, no stacking-context wrapper, 200/r16 interaction clip, one exterior shadow owner, and unchanged one-canvas/program/draw/resource contracts;
   - extend the smallest existing interaction/composition guards only where needed to pin panel-only drag/drop/hit behavior and protected z=3 control ordering;
   - keep runtime, geometry, lifecycle, pointer-boundary, and architecture guard suites unchanged unless a failing relevant assertion needs a test-only expectation update.
4. Public docs
   - update the existing Chinese and English intake-response sentence in `site/src/content/docs/docs/downloads.mdx` and `site/src/content/docs/en/docs/downloads.mdx` to mention the restrained localized boundary response without documenting shader parameters; do not add a new guide.

### Explicit non-delta

- `electron/main.mts`, `electron/mainWindowPointerBoundary.mts`, preload, and desktop bridge;
- `windowMetrics.ts` and `geometry.ts`;
- `App.tsx`, Download/Application state, target types, target policy, lifecycle, locks, or effects;
- `expandedPresentationRuntime.ts` and runtime scheduling contracts;
- shader morphology, palette, Refraction constants, halo falloff/alpha, contact equations, 228/200/14 geometry;
- traversal, Entry, Exit, Paper, or absolute `E × boundaryBand` work.

## Windows Production Transparent-Window Validation

Browser Lab evidence remains a parameter/falsification prerequisite, but it is not sufficient for Production Integration. The implementation must validate an actual Windows Electron Main Window, preferably the unpacked packaged build, not the Lab route.

### Geometry and alpha

- native BrowserWindow and DOM viewport are 228x228;
- real panel and interaction clip are `(14,14,200,200)` with r16;
- outer FX host and canvas are 228x228 and aligned to native origin;
- visible panel UV maps exactly to `[0,1]`; 16px radius and 12px halo support keep their accepted panel units;
- native-alpha canvas/readback shows max alpha 0 in the outermost 2px on all sides and all four corners;
- OS-level desktop composite has no square backing, clipped halo, or second silhouette.

### Layer and authority

- exactly one live production canvas/program/runtime and one `gl.drawArrays` call per render;
- zero textures and framebuffers;
- exactly one **exterior** CSS drop-shadow owner, the existing backdrop;
- inner clip has no background/shadow/stacking context; FX host and canvas have no CSS shadow;
- FX on/off comparison leaves the shell, inset border, shadow, content, and interaction layer intact.

### Interaction and lifecycle

- panel center hits a panel descendant; gutter hits neither panel nor canvas;
- blank-panel pointer drag still moves the native window and releases capture/`drag` lock;
- gutter pointer-down does not move the window;
- panel file/URL drop is accepted once; gutter drop is not accepted and cleanup leaves no `drop` lock;
- double-click, context menu, queue controls, protected cancel controls, paste origin, hover, and Magnetic behavior remain reachable;
- outside, panel, gutter, collapse, compact passthrough, and re-expand transitions do not get stuck;
- context loss fails closed to the normal shell/DOM and restore recreates one program/runtime.

### Scheduling and motion

- ordinary motion never has more than one pending rAF;
- collapse/sleep and unmount/dispose leave zero pending frames;
- Reduced Motion renders the deterministic accepted snapshot and frame count stays unchanged over at least 500ms;
- activation/Progress/Intake/Folder target changes still flow through the existing one target/runtime path and create no boundary-specific state or callback.

### Evidence format

- compact element/canvas crops or a compact landscape review sheet;
- native-alpha PNGs plus a small JSON measurement record for geometry, alpha, hit targets, resources, shadow ownership, and frame counts;
- no tall full-page screenshots, blank-space-dominated captures, or raw JSON screenshots.

## macOS Boundary

Repository geometry indicates the same 228/200/14 code path on Darwin, but without an actual macOS host the following remain **NOT VERIFIED**:

- transparent BrowserWindow compositing and square-corner leakage;
- CSS shadow plus WebGL alpha composition;
- native gutter hit behavior and pointer-boundary transitions;
- context creation/restoration and DPR behavior on macOS displays.

Type checks, unit tests, and geometry assertions are code-level evidence only. They must not be reported as macOS visual, interaction, or integration PASS.

## Rollback And Fallback Boundary

The boundary/halo production delta is isolated to the Main Window composition around the sole surface and its focused contracts.

Immediate boundary-only fallback:

1. remove the 228 outer FX host and inner clip composition;
2. restore the original 200px panel `overflow:hidden` mount;
3. omit `boundaryHalo` in production while retaining the accepted Interior and Refraction gates inside the original 200px canvas;
4. leave App, target policy, lifecycle, runtime, Electron bounds, and Lab evidence untouched.

WebGL compile/context failure already fails closed to decorative absence, with the CSS shell and semantic DOM still usable. No runtime feature flag, migration, persistence rollback, native resize rollback, or state cleanup is needed.

## Risks And Focused Gates

1. **Stacking regression:** a z-index or stacking context on the new clip can put coverable content above the activation surface. Gate through source contract and actual protected-control hit tests.
2. **Interaction expansion:** placing handlers on the 228 host would make the invisible gutter draggable/droppable. Handlers remain on `containerRef` only.
3. **Unclipped descendant leak:** changing panel overflow without moving every non-canvas descendant into the inner clip can leak UI during shell motion. Gate all child composition.
4. **Duplicate shadow/silhouette:** copying the Lab panel shadow onto production clip or canvas would compete with the existing backdrop. Gate non-inset exterior shadow ownership.
5. **Unit drift:** rendering 228 pixels without the current panel origin/size uniforms would change morphology. Gate exact 14/228 and 200/228 mapping plus 2px zero-alpha measurements.
6. **Platform overclaim:** a 0-gutter platform cannot show a 12px exterior halo without a native geometry change. Keep its 200-domain fallback; macOS stays NOT VERIFIED without a host.

## Architecture Decisions Requested

1. Approve the composition-only 228 host around the existing 200 interactive panel.
2. Approve the existing shadow backdrop as the sole exterior CSS shadow authority.
3. Approve fixed renderer capability gates with no new Product/Application/Presentation/lifecycle state.
4. Approve preservation of current native rectangular gutter hit semantics, with DOM/Product interaction remaining panel-only.
5. Approve the boundary-only rollback to the 200-domain Interior+Refraction fallback.

No Architecture PASS is inferred here.
