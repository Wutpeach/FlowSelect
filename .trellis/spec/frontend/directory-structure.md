# Directory Structure

> How frontend code is organized in FlowSelect.

---

## Overview

The frontend follows a flat, feature-light structure suitable for a small desktop application. Components are organized by type rather than feature.

---

## Directory Layout

```
src/
├── App.tsx                 # Application facts + business content; issues presentation intents
├── main.tsx               # React entry point + router setup
├── index.css              # Global styles (TailwindCSS)
├── vite-env.d.ts          # Vite type declarations
│
├── presentation/          # Main Window presentation module (feature-scoped)
│   └── main-window/
│       ├── lifecycle.ts            # Pure lifecycle reducer (only writable authority)
│       ├── projections.ts          # Pure visual/interaction/native projections
│       ├── effectContracts.ts      # Effect discriminated union
│       ├── effectExecutor.ts       # Injected timer/native/focus execution
│       ├── reactAdapter.ts         # Thin React reducer binding
│       ├── MainWindowPresentationSurface.tsx  # DOM/Motion host + pointer/drop/drag wiring
│       ├── geometry.ts             # Spatial policy only
│       ├── motionRecipes.ts        # Renderer choreography only
│       ├── pointerField.ts         # Continuous pointer coordinate authority
│       └── magnetic.ts             # Full-mode Magnetic visual consumer
│
├── pages/                 # Route-level components
│   └── SettingsPage.tsx   # Settings window UI
│
├── lab/                   # Browser-only dev visual/state playground
│   ├── lab-main.tsx       # zh-CN-first Vite entry; no desktop bridge
│   ├── PresentationLab.tsx # Three-pane scenario/preview/Inspector shell
│   ├── stateFixtures.ts   # Typed synthetic preview fixtures only
│   └── exportPng.ts       # Lab-local 4x center-preview export
│
├── components/            # Reusable components
│   └── ui/                # Custom UI primitives
│       ├── shared-styles.ts
│       ├── index.ts       # Barrel export
│       └── ...
│
├── contexts/              # React Context providers
│   └── ThemeContext.tsx   # Theme state management
│
└── utils/                 # Pure utility functions
    ├── mainPanelInteractions.ts    # Panel drag/double-click helpers
    ├── compactPointerHotspot.ts    # Hotspot hysteresis
    ├── centerOverlayState.ts       # Center overlay reducer (application)
    ├── startupWindowState.ts       # Startup environment detection
    └── ...
```

---

## Module Organization

### Pages (`src/pages/`)
- One file per route/window
- Named with `Page` suffix: `SettingsPage.tsx`

### Browser Lab (`src/lab/`)
- Dev-only plain-browser entry served through `vite.lab.config.ts` and `lab.html`
- Must not be registered as an Electron route/window or imported by the production entry
- Synthetic fixtures use production state/payload types and flow through the applicable production selectors/helpers/projections and shared production presentation components; visual fixtures do not replay event ingestion merely to simulate authority
- Must not import `src/desktop/**` or `electron/**`, write product state, or recreate a renderer/runtime/shader

### Components (`src/components/`)
- Reusable UI components
- UI primitives in `ui/` subdirectory
- PascalCase naming: `MaterialGrid.tsx`

### Contexts (`src/contexts/`)
- React Context providers
- Named with `Context` suffix: `ThemeContext.tsx`

### Utils (`src/utils/`)
- Pure utility functions
- camelCase naming: `videoUrl.ts`

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `NeonButton.tsx` |
| Pages | PascalCase + Page | `SettingsPage.tsx` |
| Contexts | PascalCase + Context | `ThemeContext.tsx` |
| Utils | camelCase | `videoUrl.ts` |
| CSS | kebab-case | `index.css` |

---

## Examples

**Well-organized component**: `src/components/ui/neon-button.tsx`
- Single responsibility
- Props interface defined
- Uses ThemeContext for theming
## Motion / Presentation Foundation (MR0)

### Renderer-local motion modules

Renderer-local motion leaves live flat in `src/presentation/main-window/` — one focused module per concern, with a matching `*.test.ts`:

- `lifecycle.ts` — sole full/compact/transition writer (reducer)
- `projections.ts` — read-only phase/interaction/native projections
- `effectContracts.ts` / `effectExecutor.ts` — declarative effects and their injected executor
- `geometry.ts` — spatial policy
- `motionRecipes.ts` — shell/compact choreography
- `pointerField.ts` — sole continuous pointer runtime
- `magnetic.ts` — renderer-only Magnetic consumer
- `panelHover.ts` / `presentationCompletion.ts` — focused input/completion helpers

There is NO shared runtime hierarchy: no `motion/runtime/`, no `animators/`, no manager/bus directory. Future stages add consumer-local modules the same way:

- MR7 Expanded Presentation: one concrete `ExpandedPresentationSurface` WebGL2
  host plus consumer-local frame execution and neutral Progress/Terminal target
  types. The retired Dot Field modules must not return; there is no shared
  engine or alternate graphics backend.
- MR2 Character: a consumer-local expressive module consuming the Pointer Field values (never a second pointer authority).

### Composition and projection modules

- `src/utils/centerOverlayState.ts` — center presentation policy (request-id guarded transients/terminal opportunity).
- `src/components/ui/motion.ts` — shared MOTION tokens leaf (easing/duration/presence presets only; no recipe or scheduling logic).
- Test-only contract vocabulary lives in `src/presentation/main-window/presentationCompositionContract.test.ts`; production types are added only when two real consumers share a data contract.

### Placement rules

- Motion leaves may import: react, `motion/react`, sibling pure helpers, shared token constants.
- Motion leaves must not import: `src/features/**`, `src/desktop/**`, `electron/**`, lifecycle/pointer authority modules (except the designated Pointer Field consumer), or `centerOverlayState` (guarded by `src/architecture/import-guard.test.ts`).
- `MainWindowPresentationSurface.tsx` is the single wiring/composition boundary that may touch the desktop runtime and lifecycle shapes.
