# Agentation Spike Implementation Report

Status: spike and final placement repair complete. GPT Architecture Lead's Spike Architecture Review remains PASS; this report does not grant any new Architecture PASS.

## Technical result

**GO** for retaining exact-pinned `agentation@3.0.2` as a UI Lab-only devDependency.

The official component integrates without production Presentation, pointer, lifecycle, Product, native-window, MR9, Compact renderer, Dev Tools, or layout changes. The only repair required was the explicitly approved Lab-local `event.defaultPrevented` guard for Full origin clicks.

The recommendation has three recorded limits:

1. Full WebGL and Compact SVG internals remain coarse visual regions; use Area selection, not DOM identity.
2. Agentation 3.0.2 does not expose freehand Draw mode. Area selection is available and verified.
3. React component and DOM context are useful, but `sourceFile` misattributes nested shared targets to `ThemeContext.tsx`; treat it as a hint rather than authority.

## Retained implementation

- `package.json` / `package-lock.json`: exact `agentation@3.0.2`, `dev: true`, PolyForm Shield 1.0.0 metadata.
- `src/lab/lab-main.tsx`: one official `<Agentation className="lab-agentation-toolbar" />` sibling mount; the documented placement prop is the only configuration.
- `src/lab/lab.css`: one Lab-only fixed-position override that places the official portal toolbar near the Preview lower-right in the normal desktop viewport.
- `src/lab/PresentationLab.tsx` / `PreviewEnvironmentPicker.tsx`: existing Background and Reset controls grouped at Preview lower-left; their state and semantics are unchanged.
- `src/lab/rendererReuse.test.ts`: exact pin, Lab-only import, production-entry absence, and origin-guard ordering assertions.
- `src/lab/LabOverlayStage.tsx`: one early return when the React click is already default-prevented.

No wrapper, adapter, provider, callback bridge, Inspector state, Preview filter, endpoint, webhook, custom toolbar, geometry measurement, resize synchronization, production source, or production layout change was added.

## Final placement repair

- Full Preview: official toolbar right/bottom inset about 12 px; zero Dev Tools or left-control overlap across 1× / Auto / 3×.
- Compact: fixed toolbar remains in the Preview lower-right region with about 56 px bottom inset; this is the documented CSS-only limitation, not a collision or behavior regression.
- Background + Reset: one 99 × 28 lower-left group, equal 28 px control height, 6 px gap, 13 px Preview inset.
- Background menu: upward, left-aligned, 0 overlap with Reset.
- Agentation selection/annotation and the existing Full origin `defaultPrevented` guard both re-passed unchanged.

## Inspection granularity measured

| Surface | Measured result |
| --- | --- |
| Ordinary DOM | Exact element geometry, DOM path, nearby text, React component chain; `sourceFile` is best-effort |
| Full 1× / Auto 2× / 3× | Frame outline aligned at 200 / 400 / 600 px with 0 px delta |
| Full WebGL pixels | Full frame identity only; 48 × 48 Area selection works; no canvas/shader identity |
| Shared queue DOM | Exact 228 × 24 row label with `MainWindowQueuePopover` context |
| Shared runtime DOM | Real indicator selectable and recoverable using the existing fixture; current visible strip has no runtime entry |
| Compact stage / shell | Centre hit resolves to 180 × 180 shell at 3× with 0 px delta |
| Compact SVG internals | SVG remains pointer-transparent; 45 × 45 Area selection works |

## Source and component context

- Full: component and source context were correct (`PresentationLab → LabOverlayStage`, `src/lab/LabOverlayStage.tsx`).
- Queue: component chain identified `MainWindowQueuePopover`; `sourceFile` incorrectly returned `src/contexts/ThemeContext.tsx:173:14`.
- Compact: component chain identified `PresentationLab → CompactPreviewStage`; `sourceFile` returned the same incorrect ThemeContext location.
- Runtime: the DOM target was selectable; the filtered component chain was Motion-heavy and the same ThemeContext location was returned.

No context was inferred or synthesized. These are the actual copied/local annotation values from Agentation 3.0.2 under Ameow Vite + React 19.

## Origin guard

Required: **yes**.

- Before guard: an off-centre Full annotation click moved the Lab origin marker.
- After guard: the same click left the marker rectangle exactly unchanged.
- Reset and ordinary non-prevented Preview clicks still work.
- No Agentation active-state bridge or production pointer/layer change was needed.

## Production isolation

- `dist/`: 0 Agentation filename/content hits across 5 files.
- `dist-electron/`: 0 hits across 150 files.
- Windows unpacked package: 0 filename/content hits across 3,810 files; no shipped Agentation package.
- Builder has `asar: false`; the actual raw `resources/app` package was scanned and no asar exists.

The normal worktree output path hit a reproducible Windows rename `EPERM`; overriding only the builder output directory produced the unpacked package successfully. This does not change package inputs or the isolation result.

## Validation

- Focused Lab test: 24/24 passed.
- `npm run type-check`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Real-browser proof script: passed after the allowed guard.
- Final placement browser proof: passed for Full Auto/manual, Compact, menu, target/scale switching, annotations, and origin guard; no new console errors.
- Trellis task manifests: 4 implementation + 4 check entries, valid.
- Full repository test run: 1,824/1,825 passed. The sole failure is the pre-existing `browser-extension/architecture-guard.test.js` listener-ending assertion in unmodified browser-extension files; it is outside this spike.

## Retention recommendation

Retain the exact dependency and minimal mount for Architecture Review. Do not promise freehand Draw or authoritative `sourceFile` output. Communication should lead with the captured DOM target and React component chain, using Area selection for WebGL/SVG visuals.

The dependency remains recommended. Finalization is authorized by the user's approved placement-repair instruction; do not extend Agentation or begin Compact Mascot.
