# Frontend Development Guidelines

> Best practices for frontend development in FlowSelect.

---

## Overview

FlowSelect is an Electron desktop application with a React frontend. The UI is a compact 200x200px floating window that handles file/image/video collection via drag-drop and paste operations.

---

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.1.0 | UI framework |
| TypeScript | 5.8.3 | Type safety |
| Vite | 7.0.4 | Build tool |
| Motion for React | 12.35.2 | Animations |
| TailwindCSS | 4.1.18 | Styling |
| Lucide React | 0.563.0 | Icons |
| React Router DOM | 7.13.0 | Routing |
| Electron preload bridge | custom | Backend/window communication |

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Done |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props, composition | Done |
| [Design System](./design-system.md) | Core visual language, semantic tokens, and UI state patterns | Done |
| [Motion Guidelines](./motion-guidelines.md) | `motion/react` usage, compact surface motion rules, and transparent child-window animation contracts | Done |
| [Character Motion](./character-motion.md) | Compact Character ownership, attention, lifecycle, Reduced Motion, and Motion 12 stable-source contract | Done |
| [Hook Guidelines](./hook-guidelines.md) | Custom hooks, Electron bridge event patterns | Done |
| [State Management](./state-management.md) | Local state, ThemeContext, config flow | Done |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | Done |
| [Type Safety](./type-safety/index.md) | Layered type patterns and validation contracts | Done |
| [Docs Site Contract](./docs-site.md) | Single-repo public docs-site ownership, i18n, deploy, and validation contract | Done |

---

## Key Constraints

- **Window Size**: Fixed 200x200px, non-resizable
- **Always-on-top**: Window stays above other applications
- **Desktop Bridge**: Renderer-to-desktop communication must go through `window.ameow` via `src/desktop/runtime.ts`
- **Compact Hover Contract**: Entering the compact icon expands immediately; leaving an unlocked full shell collapses through a short grace path, not a 3-second idle timer
- **Public Docs Contract**: User-facing docs live in `site/` as normal root-repository files. Product behavior changes that affect users should update the docs site in the same task and pass `npm run docs:build`.

---

**Language**: All documentation should be written in **English**.
