---
title: Developer Guide
description: Ameow developer documentation — how to set up a development environment, find key entry points, and run basic validation.
---

Ameow's developer documentation is for contributors who want to develop or maintain the project. It explains **how to develop, debug, and verify** — it does not carry architecture authority.

## What's Covered

- [Local Development](./local-development/): dev server startup chain, preflight, development ports
- [Environment Variables](./environment-variables/): environment variables that affect development and diagnostics
- [Testing & Validation](./testing/): unit tests, lint, type checking
- [Docs Site & Locales](./docs-and-locales/): docs site development, locales synchronization

## Boundary Statement

Developer docs **only** explain how to develop, debug, and verify. They **do not** carry:

- **Architecture contracts and invariants**: owned by canonical files in the repo — [Electron Runtime Foundation](https://github.com/Wutpeach/Ameow/blob/main/docs/electron-runtime-foundation.md) (runtime boundary contract) and [Electron Parity Verification](https://github.com/Wutpeach/Ameow/blob/main/docs/electron-parity-verification.md) (migration verification). Developer docs link to these, not duplicate them.
- **Maintainer runbooks** (packaging, release, diagnostics, capability validation): see `docs/maintainer/` in the repository.
- **User guides**: see other sections of this site.
- **Development agent tooling** (Trellis / Codex / AI agent workflow): maintainer-internal tooling, not included in contributor-facing docs by default.

## Lab Lifecycle

The following tools' documentation status is based on the current `main` branch state:

| Tool | Status | Documentation Policy |
| --- | --- | --- |
| UI Lab | Removed from main (former DEV-only route `/ui-lab` and its scenario-injection mechanism, removed in `30e0e5459`) | No long-term documentation |
| Browser Presentation Lab | Now on main (`lab.html` + `vite.lab.config.ts` + `src/lab/`), DEV-only pure-browser dev page, still actively evolving | Not published as stable; no long-term documentation |

UI Lab has been removed from current main; its scenario-injection mechanism (`dev_ui_lab_apply_scenario`) no longer exists, and docs screenshots are now captured directly by the Electron main process via the environment-variable protocol (see the maintainer runbook `docs/maintainer/docs-screenshots.md`). Browser Presentation Lab starts with `npm run dev:lab` — a pure browser page with no Electron bridge and no downloader runtime, used to preview shared presentation components without launching the desktop app. It is still under active development; building long-term workflows around it is not recommended.
