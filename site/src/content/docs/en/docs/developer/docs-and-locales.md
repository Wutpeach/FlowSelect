---
title: Docs Site & Locales
description: Local development, build, and preview of the Ameow docs site, and the locales synchronization mechanism.
---

Ameow's public documentation site is built with [Astro](https://astro.build/) + [Starlight](https://starlight.astro.build/). Source lives in the `site/` directory.

## Docs Site Commands

```bash
npm run docs:dev       # Local dev server
npm run docs:build     # Build for production
npm run docs:preview   # Preview the build
```

These commands run Astro in the `site/` directory via `--prefix site`. `site/` has its own `package.json` and dependencies.

## Directory Structure

```
site/src/content/docs/
├── docs/              # Simplified Chinese (root locale)
│   ├── developer/     # Developer Guide
│   ├── desktop/       # Desktop usage
│   └── ...
└── en/docs/           # English
    ├── developer/     # Developer Guide
    ├── desktop/
    └── ...
```

- Simplified Chinese is the root locale, served at `/docs/...`
- English is served at `/en/docs/...`
- Both languages must stay factually synchronized

## Sidebar Configuration

Sidebar groups are defined in the `sidebar` array in `site/astro.config.mjs`. Each group has a `label` (Chinese), `translations` (other language labels), and `items` (a list of content IDs).

Content IDs omit the language prefix — Starlight resolves them to the correct locale automatically.

## Locales Sync

```bash
npm run locales:sync
```

`scripts/sync-locales.mjs` reads `locales/contract.json` and syncs `locales/` source files to `browser-extension/_locales/` (extension resources). Sync rules:

- Fully replaces the target directory (delete then rebuild)
- Copies `contract.json` to the target directory
- Copies each file per the contract's `supportedLanguages` and `namespaces`

`locales:sync` runs automatically in the `prebuild` hook. Dev preflight also triggers it when locales are stale.

## Deployment

The docs site auto-deploys from `main` to GitHub Pages:

- Trigger: push to `main` with `site/**` changes (or manual dispatch)
- Workflow: `.github/workflows/deploy-docs.yml`
- Build command: `npm ci --prefix site && npm run docs:build`
- URL: https://wutpeach.github.io/Ameow/
