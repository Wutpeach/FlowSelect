# Research: OneWorks Avatar renderer-only entry revalidation

- Query: Revalidate whether the published OneWorks Avatar packages or upstream repository now expose a renderer-only JavaScript and CSS entry suitable for Ameow production, and classify Gate A.
- Scope: mixed (npm registry, upstream GitHub, isolated Vite consumer, Ameow planning artifacts)
- Date: 2026-09-07

## Findings

### Registry and upstream release

- npm now has `@oneworks/avatar-react@1.0.0-rc.9` and `@oneworks/avatar@1.0.0-rc.9`, both published 2026-09-05 (the `rc` dist-tag points to rc.9; `latest` still points to the unrelated `0.0.0-onboarding.0`). Ameow is unchanged: `package.json:57-58` and `package-lock.json:1255-1274` still pin rc.6 as dev dependencies.
- React rc.9 metadata adds independent exports (`@oneworks/avatar-react/package.json:16-44` in the immutable package tarball):
  - `./renderer` → `dist/renderer.js` + `dist/renderer.d.ts`;
  - `./renderer.css` → `dist/renderer.css`;
  - `./editor`/`./editor.css` remain separate; root `.` and `./style.css` remain compatibility exports.
  The package is MIT, depends exactly on `@oneworks/avatar@1.0.0-rc.9`, and peers React/ReactDOM `>=18.3.0 <20` (React 19 is compatible). Core rc.9 remains MIT, `sideEffects:false`, with a root ESM entry.
- Upstream main is commit [`abce277ee9a9d846ef6964766d3be8938d787ffc`](https://github.com/oneworks-ai/avatar/commit/abce277ee9a9d846ef6964766d3be8938d787ffc), released as [`sdk-v1.0.0-rc.9`](https://github.com/oneworks-ai/avatar/releases/tag/sdk-v1.0.0-rc.9) on 2026-09-05. The commit is explicitly “Split Avatar React into renderer and editor exports.” Its Vite config has separate `index`, `renderer`, and `editor` entries and emits `renderer.css` from `src/renderer-style.scss` ([source](https://github.com/oneworks-ai/avatar/blob/abce277ee9a9d846ef6964766d3be8938d787ffc/packages/react/vite.config.ts#L12-L70)). The release notes and developer-integration guide instruct React consumers on rc.9+ to import only `renderer` and `renderer.css`.

### Published artifacts

- npm tarball: [`avatar-react-1.0.0-rc.9.tgz`](https://registry.npmjs.org/@oneworks/avatar-react/-/avatar-react-1.0.0-rc.9.tgz), SHA-512 `HqxGcmweaIyS1ppM+uJuUJ6NyZWdZnJHGTYyOm385tw21hcYYeFLUqu+l45D0XtsrPlPRA34h3mYdrgnRmDXUQ==`, shasum `54a48d1625558f3331501bea9ea076f3fe3b5c65`; npm reports 394 files / 14,882,175 B unpacked. The package intentionally still contains editor files and the full preset SVG asset set, so consumers must use the subpath rather than the root export.
- Relevant rc.9 files measured from the tarball:

  | entry | raw bytes | gzip | observation |
  | --- | ---: | ---: | --- |
  | `dist/renderer.js` | 148 | 132 | imports React/JSX and `@oneworks/avatar`, re-exports `Avatar` |
  | `dist/chunks/renderer-zvYJYQTe.js` | 534,283 | 101,968 | shared renderer chunk; no `AvatarEditor`/`createRoot` symbols |
  | `dist/renderer.css` | 1,669 | 578 | renderer selectors only (`.interactive-avatar`, `.oneworks-avatar`) |
  | `dist/editor.js` | 1,092,204 | 183,835 | separate editor entry |
  | `dist/style.css` / `dist/editor.css` | 141,316 | 18,828 | compatibility/editor stylesheet |

- The raw shared renderer chunk still carries dead helper definitions from `src/savedAvatarPresets` (`loadSavedAvatarPresets`, `persistSavedAvatarPresets`, key `oneworks-avatar-saved-presets-v1`) and the `avatar-controls__entity-preset-icon` string. The source cause is visible in [`packages/react/src/renderer.tsx:30-33`](https://github.com/oneworks-ai/avatar/blob/abce277ee9a9d846ef6964766d3be8938d787ffc/packages/react/src/renderer.tsx#L30-L33), which imports `InteractiveAvatar` and capture helpers from `savedAvatarPresets`; that module defines storage at [`src/savedAvatarPresets.ts:7-54`](https://github.com/oneworks-ai/avatar/blob/abce277ee9a9d846ef6964766d3be8938d787ffc/src/savedAvatarPresets.ts#L7-L54). The renderer chunk has no `AvatarEditor`, picker, `oneworks-avatar-editor`, `avatar-app`, `createRoot`, or authoring-locale strings.

### Consumer build proof

- An isolated consumer using exact npm rc.9 packages, React 19.2.3, Vite 8.0.13, `base:'./'`, `import { Avatar } from '@oneworks/avatar-react/renderer'`, and `import '@oneworks/avatar-react/renderer.css'` built successfully. The emitted graph was 305,819 B JS / 86,649 B gzip and 1,682 B CSS / 580 B gzip.
- Emitted JS scan: zero `AvatarEditor`, `AvatarAnimationPicker`, `AvatarPresetPicker`, `oneworks-avatar-editor`, `avatar-app`, persistence key, `localStorage`, `persistSavedAvatarPresets`, `loadSavedAvatarPresets`, `createRoot`, `react-dom/client`, authoring/locale/editor strings; one `avatar-controls__entity-preset-icon` selector remains. Emitted CSS contains `.interactive-avatar` and `.oneworks-avatar`, no `.avatar-app`, and no external `url()` assets.
- Upstream’s new [`scripts/check-react-package-entries.mjs`](https://github.com/oneworks-ai/avatar/blob/abce277ee9a9d846ef6964766d3be8938d787ffc/scripts/check-react-package-entries.mjs#L43-L56) validates the installed tarball, no compatibility/editor entry in the renderer graph, no inline preview SVGs, renderer CSS under 16 KB, and no `.avatar-app`. It does **not** assert Ameow’s stricter no-persistence-key/localStorage/editor-selector rule; the residual selector therefore remains relevant to Gate A.

### Gate A classification

**Gate A remains blocked under the existing Ameow contract, with a narrowly defined relaxation available.** Package-level availability is now substantially improved: rc.9 provides the requested renderer JS/CSS subpaths and a consuming Vite build removes the editor runtime and persistence code. However, the task’s `design.md:111-124` and `implement.md:7-14` require an Avatar-only emitted scan with zero editor selectors and zero persistence/localStorage paths. The emitted graph still contains the editor-named `avatar-controls__entity-preset-icon` selector, while the installed shared renderer artifact contains the storage helper definitions.

- If Product/Lead explicitly accepts inert editor-named selector residue and package-internal dead helpers (while keeping the consuming-bundle scan), record that decision and pin exact rc.9; this flips Gate A to unblocked without production code changes in this research.
- If the no-editor rule is non-negotiable, request an upstream follow-up that removes `EntityPresetPreview`/editor selector and isolates capture helpers from saved-preset storage in the renderer graph, then rerun the exact Ameow scan. Do not start production rewire yet.

## Related specs and files

- Existing decision boundary: `.trellis/tasks/08-25-oneworks-mascot-production-adoption-planning/design.md:109-124`.
- Existing entry gate and required scan: `.trellis/tasks/08-25-oneworks-mascot-production-adoption-planning/implement.md:3-14,74-80`.
- Previous baseline: `.trellis/tasks/08-25-oneworks-mascot-production-adoption-planning/research/production-adoption-research.md` (2026-08-25; rc.6 root-only artifact).
- Current Ameow dependency state: `package.json:49-59`, `package-lock.json:1255-1274`.

## Caveats / Not Found

- No Ameow dependency, production source, lockfile, task status, or spec was changed. The isolated Vite consumer and npm tarball extraction were temporary research fixtures; they are removed after this report.
- This validates package/export/build shape only. Electron `file://`, Windows/macOS packaged behavior, browser lifecycle, mechanism-equivalence, and final Ameow bundle/package deltas remain later implementation gates.
- Npm `latest` is not the SDK release; any adoption must use an exact rc.9 pin and preserve the upstream renderer chunk plus relative assets.
