---
title: Environment Variables
description: Real environment variables that affect Ameow's development and diagnostics behavior, and how they differ from message marker constants.
---

Ameow uses `AMEOW_`-prefixed environment variables to control development behavior and diagnostic modes. These variables are read from `process.env`; most can only be enabled via the environment, while `AMEOW_FORCE_DEV_PREFLIGHT` can also be triggered by passing `--force` when running the preflight script directly (see [Local Development](./local-development/)).

## Environment Variables

| Variable | Purpose | Source File |
| --- | --- | --- |
| `AMEOW_ELECTRON_DEV_SERVER_URL` | Dev server URL injected into Electron | `scripts/run-electron-dev.mjs` |
| `AMEOW_FRONTEND_URL` | Override renderer load URL (debug packaged apps) | `electron/windowRouting.mts` |
| `AMEOW_FORCE_DEV_PREFLIGHT` | Force preflight to re-verify Python runtime (`1`/`true`/`yes`/`on`) | `scripts/dev-preflight.mjs` |
| `AMEOW_STARTUP_DIAGNOSTICS` | Enable startup diagnostics capture (window screenshot + pixel transparency analysis) | `electron/windowVisibility.mts` |
| `AMEOW_FORCE_OPAQUE_WINDOW` | Force opaque window (experimental, for diagnosing transparency issues) | `electron/windowVisibility.mts` |
| `AMEOW_DOCS_SCREENSHOT_TARGET` | Docs screenshot: target screenshot ID | `electron/main.mts` |
| `AMEOW_DOCS_SCREENSHOT_OUTPUT` | Docs screenshot: output path | `electron/main.mts` |
| `AMEOW_DOCS_SCREENSHOT_DEVICE_SCALE_FACTOR` | Docs screenshot: device pixel ratio | `electron/main.mts` |
| `AMEOW_DOCS_SCREENSHOT_USER_DATA` | Docs screenshot: user data path | `electron/main.mts` |

The `AMEOW_DOCS_SCREENSHOT_*` variables are an internal environment protocol — the screenshot orchestration script passes target / output / DPR / userData to the Electron child process. They are not maintainer-facing configuration. See the maintainer runbook.

## Message Markers Are Not Environment Variables

The repository also contains many `AMEOW_`-prefixed strings, such as:

- `AMEOW_PINTEREST_DRAG`
- `AMEOW_WEIBO_VIDEO_VARIANTS`
- `AMEOW_XIAOHONGSHU_NOTE_LINKS`

These are message marker constants used for communication between content scripts and the background script. They are **not** environment variables — they are not read from `process.env`, and setting them has no effect.
