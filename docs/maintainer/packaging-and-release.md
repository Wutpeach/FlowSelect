# Packaging & Release

Maintainer runbook for Ameow's packaging scripts, release workflow, and version management.

## Packaging Scripts

All packaging commands are defined in the root `package.json` and run via `scripts/`.

| Command | Purpose | Script |
| --- | --- | --- |
| `npm run package` | Default package (current platform) | `scripts/run-electron-package.mjs` |
| `npm run package:dir` | Unpacked dir only | `run-electron-package.mjs --dir` |
| `npm run package:win` | Windows NSIS installer (x64) | `run-electron-package.mjs --win nsis --x64` |
| `npm run package:win:dir` | Windows unpacked dir (x64) | `run-electron-package.mjs --win --x64 --dir` |
| `npm run package:mac:zip` | macOS ZIP | `run-electron-package.mjs --mac zip` |
| `npm run package:browser-extension` | Browser extension ZIP | `scripts/package-browser-extension.mjs` |
| `npm run package:macos-open-source-dmg` | macOS open-source DMG | `scripts/package-macos-open-source-dmg.mjs` |
| `npm run package:portable` | Windows portable ZIP (PowerShell) | `scripts/package-portable.ps1` |
| `npm run package:portable:skip-build` | Portable ZIP, skip rebuild | `package-portable.ps1 -SkipBuild` |

### Packaging Flow

`run-electron-package.mjs` executes in order:

1. `scripts/ensure-python-runtime.mjs` — ensures the bundled Python runtime is ready
2. `npm run build` — builds renderer + Electron
3. `electron-builder --config ./electron-builder.config.mjs --publish never` — packages

### electron-builder Configuration

Defined in `electron-builder.config.mjs`:

- **Output directory**: `dist-release/`
- **Windows**: NSIS installer, x64, non-one-click, allows install directory change
- **macOS**: ZIP, no code signing (`identity: null`, `hardenedRuntime: false`)
- **asar**: `false`
- **Packaged binaries**: bundled Python runtime + manifest

## Version Management

```bash
npm run version:set -- <version>    # e.g. 0.4.0
```

`scripts/update-version.mjs` is the single entry point for version bumps. It updates:

1. `package.json`
2. `package-lock.json`
3. `browser-extension/manifest.json` (via `browser-extension-versioning.mjs`)
4. `src/constants/appVersion.ts`

It also scaffolds `release-notes/v<version>.md` from `release-notes/TEMPLATE.md` if it doesn't exist.

> **Note**: `AGENTS.md` lists `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` as update targets, but the `src-tauri/` directory does not exist and `update-version.mjs` does not touch them. This is obsolete residue from the Tauri→Electron migration.

## Release Workflow

### Tag-Triggered CI

Pushing a tag `v*` triggers `.github/workflows/release.yml`:

**build-windows** (windows-latest):
- Extracts version from tag
- Runs `update-version.mjs` with the tag version
- Builds Windows NSIS installer (`npm run package:win`)
- Packages Windows portable ZIP (`package-portable.ps1`)
- Uploads both as artifacts

**build-macos** (macos-15, arch matrix):
- Extracts version from tag
- Runs `update-version.mjs`
- Installs `create-dmg` via Homebrew
- Packages macOS ZIP + open-source DMG (`npm run package:macos-open-source-dmg`)
- Runs runtime package verification (`npm run runtime:verify:macos-package`)
- Uploads DMG, ZIP, and runtime verification artifacts

### Code Signing

Releases are **not code signed**:
- `CSC_IDENTITY_AUTO_DISCOVERY=false` (CI env)
- `identity: null`, `hardenedRuntime: false` (electron-builder config)

Users will see OS security warnings on first launch (macOS Gatekeeper, Windows SmartScreen). This is expected for unsigned releases.

### Release Notes Convention

- Written in Chinese by default
- Use `release-notes/TEMPLATE.md` as the starting point
- Summarize user-facing changes in plain language
- Keep a `Full Changelog` compare link at the bottom
- The versioned release-note file must exist in the tagged commit — missing notes block the release

## CI Workflows Reference

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `release.yml` | Push tag `v*` | Build + upload Windows/macOS artifacts |
| `deploy-docs.yml` | Push to `main` with `site/**` changes | Build + deploy docs site to GitHub Pages |
| `verify-macos-runtime-package.yml` | Manual `workflow_dispatch` | Verify macOS runtime package on macos-15 arm64 |

> **Note**: `update-capabilities-probes.yml` and `update-capabilities-seed.yml` workflows were removed (commit `5619ba03`). Capability probes are now run manually.
