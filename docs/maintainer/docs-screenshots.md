# Documentation Screenshots

Maintainer runbook for the documentation screenshot capture mechanism.

## Overview

Docs screenshots are captured by the Electron main process through an internal environment-variable protocol: launch the app with `AMEOW_DOCS_SCREENSHOT_TARGET` set, and the main process captures the requested window, writes the PNG, and quits. There is no orchestration script on current `main` — the former `scripts/capture-docs-screenshots.mjs` (Playwright extension captures + UI Lab scenario injection) was removed in commit `30e0e5459` together with UI Lab.

## Supported targets (`electron/main.mts`)

| Target | Captured window |
| --- | --- |
| `desktop-floating-window-idle` | Main window, idle floating state |
| `desktop-main-window-expanded` | Main window, expanded (pointer boundary injected before capture) |
| `desktop-settings-hub` | Settings window, hub page |
| `desktop-settings-appearance` | Settings window, appearance page |
| `desktop-settings-saving` | Settings window, saving page |
| `desktop-settings-sites` | Settings window, sites page |
| `desktop-settings-plugins` | Settings window, plugins page |
| `desktop-settings-system` | Settings window, system page |

Any other target raises `Unsupported docs screenshot target` at startup.

## Internal Environment Protocol

| Variable | Purpose |
| --- | --- |
| `AMEOW_DOCS_SCREENSHOT_TARGET` | Target screenshot ID; setting it enables capture mode |
| `AMEOW_DOCS_SCREENSHOT_OUTPUT` | Output PNG path; required when the target is set |
| `AMEOW_DOCS_SCREENSHOT_DEVICE_SCALE_FACTOR` | Device pixel ratio (default `3`) |
| `AMEOW_DOCS_SCREENSHOT_USER_DATA` | User-data directory override |

These variables are an internal protocol read by `electron/main.mts` at startup — they are not user-facing configuration. After a successful capture the app quits automatically. Captures that appear blank (transparent-pixel ratio above 99%) raise an error instead of writing an empty image.

## Notes

- Browser-extension popup/launcher screenshots, previously produced by the removed orchestration script, currently have no in-repo capture path.
- The former UI Lab scenario-based targets (which relied on `dev_ui_lab_apply_scenario`) no longer exist.

Source: `electron/main.mts` (`resolveDocsScreenshotRequest`, `captureDocsScreenshotAndQuit`, `captureDocsSettingsScreenshotAndQuit`, `DOCS_SCREENSHOT_*` constants).
