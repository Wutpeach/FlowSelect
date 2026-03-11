# FlowSelect

<div align="center">
  <img src="./app-icon.png" width="112" alt="FlowSelect logo" />
  <p><strong>A floating desktop collector for files, images, web video, and browser-extension assisted capture.</strong></p>
  <p>
    <a href="./README.md">中文</a> |
    <a href="./README.en.md">English</a> |
    <a href="https://github.com/Wutpeach/FlowSelect/releases">Download Releases</a> |
    <a href="./browser-extension/">Browser Extension</a> |
    <a href="./release-notes/">Release Notes</a>
  </p>
  <p>
    <img alt="Latest release" src="https://img.shields.io/github/v/release/Wutpeach/FlowSelect?display_name=tag" />
    <img alt="Release workflow" src="https://img.shields.io/github/actions/workflow/status/Wutpeach/FlowSelect/release.yml?label=release" />
    <img alt="Platforms" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-111827" />
    <img alt="Tauri v2" src="https://img.shields.io/badge/Tauri-v2-24C8DB" />
    <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB" />
    <img alt="TypeScript 5.8" src="https://img.shields.io/badge/TypeScript-5.8-3178C6" />
  </p>
</div>

FlowSelect is a compact Tauri desktop collector for files, images, and web video. It gives you a small always-on-top window that can accept drag and drop, paste actions, and optional browser-extension picks, then save everything into a controlled output folder.

## Screenshots / Preview

The repository does not currently include recorded GIF assets, so this section uses lightweight visual previews based on the current product structure. They can be replaced later with real screenshots or motion captures.

<p align="center">
  <img src="./docs/readme/preview-desktop.svg" width="48%" alt="FlowSelect desktop floating window preview" />
  <img src="./docs/readme/preview-settings.svg" width="48%" alt="FlowSelect settings preview" />
</p>

<p align="center">
  <img src="./docs/readme/preview-browser.svg" width="98%" alt="FlowSelect browser extension preview" />
</p>

## At a glance

| Area | Current capabilities |
| --- | --- |
| Capture inputs | Drag files, drag folders, paste links, Windows clipboard files, browser-extension picks |
| Video workflow | Download queue, live progress, cancellation, up to 3 concurrent tasks, direct-route first, `yt-dlp` fallback |
| Browser sync | Cookie handoff, quality preference sync, AE preference sync, YouTube clip download, screenshot save |
| Desktop UX | Global shortcut, tray menu, launch at startup, theme switching, context-menu output folder actions |

## Good fit for

- Pulling files, images, and web video into one controlled desktop folder.
- Keeping a low-friction collector window available without disrupting the main workspace.
- Triggering downloads from the browser while preserving cookies and download preferences.
- Sending finished media into an After Effects workflow.

## Downloads by platform

All buttons below open the GitHub Releases page. Pick the matching artifact for your system.

### Windows

<p>
  <a href="https://github.com/Wutpeach/FlowSelect/releases/latest"><img alt="Windows MSI" src="https://img.shields.io/badge/Windows-MSI-0078D4?logo=windows&logoColor=white" /></a>
  <a href="https://github.com/Wutpeach/FlowSelect/releases/latest"><img alt="Windows NSIS EXE" src="https://img.shields.io/badge/Windows-NSIS_EXE-2563EB?logo=windows&logoColor=white" /></a>
  <a href="https://github.com/Wutpeach/FlowSelect/releases/latest"><img alt="Windows Portable ZIP" src="https://img.shields.io/badge/Windows-Portable_ZIP-0F6CBD?logo=windows&logoColor=white" /></a>
</p>

- `MSI`: best for a standard installer flow.
- `NSIS EXE`: alternate installer format for Windows distribution.
- `Portable ZIP`: unzip and run without installing.

### macOS

<p>
  <a href="https://github.com/Wutpeach/FlowSelect/releases/latest"><img alt="macOS Apple Silicon DMG" src="https://img.shields.io/badge/macOS-Apple_Silicon_DMG-111827?logo=apple&logoColor=white" /></a>
  <a href="https://github.com/Wutpeach/FlowSelect/releases/latest"><img alt="macOS Intel DMG" src="https://img.shields.io/badge/macOS-Intel_DMG-374151?logo=apple&logoColor=white" /></a>
</p>

- `Apple Silicon DMG`: for M-series Macs.
- `Intel DMG`: for Intel-based Macs.

## What FlowSelect does

- Floating desktop collector
  - Transparent 200x200 main window
  - Always-on-top behavior
  - Idle auto-minimize into a small cat icon
- Fast capture flows
  - Drag local files into the window to copy them into the output folder
  - Drag a folder onto the window to set the output folder
  - Paste video URLs, image URLs, and data URLs
  - Paste clipboard file lists on Windows
- Video download workflow
  - Queue-based downloads with progress and cancellation
  - Up to 3 concurrent video tasks
  - Direct download pipelines for Douyin and Xiaohongshu when direct media URLs are available
  - `yt-dlp` for generic video pages and fallback routing
- Output control
  - Default save path: `Desktop/FlowSelect_Received`
  - Change output folder from settings or the right-click context menu
  - Optional rename rules for downloaded media:
    - descending sequence
    - ascending sequence
    - prefix + sequence
- Desktop integrations
  - Global shortcut to show or hide the app near the cursor
  - Launch at startup
  - System tray menu
  - Black and white themes
  - Built-in `yt-dlp` version check and updater
- After Effects workflow
  - Optional auto-import into After Effects after download
  - Optional AE-friendly conversion preference for extension-triggered video downloads

## Companion browser extension

This repository also contains a Manifest V3 browser extension in [`browser-extension/`](./browser-extension). It is designed for Chromium-based browsers such as Chrome and Edge.

Current site integrations include:

- YouTube
- Bilibili
- X / Twitter
- Douyin
- Xiaohongshu

Extension capabilities include:

- Local WebSocket connection to the desktop app at `127.0.0.1:39527`
- Sending selected video URLs and browser cookies to FlowSelect
- Syncing download quality preference:
  - `Highest`
  - `Balanced`
  - `Saver`
- Syncing AE-friendly conversion preference
- Site-specific helpers such as:
  - player-side download actions
  - YouTube clip IN/OUT points
  - YouTube and Bilibili screenshot capture and save

## Architecture at a glance

- [`src/`](./src): React frontend for the floating window, settings window, and context menu window
- [`src-tauri/`](./src-tauri): Rust and Tauri backend for file handling, downloads, queue management, tray integration, shortcuts, and the extension WebSocket server
- [`browser-extension/`](./browser-extension): Companion browser extension sources
- [`scripts/`](./scripts): repo automation such as version bumps, dev startup helpers, and portable packaging
- [`release-notes/`](./release-notes): versioned release notes used by the release workflow

## Quick start

### Requirements

- Node.js 18+
- npm
- Rust stable toolchain
- Tauri system dependencies for your platform

### Install dependencies

```bash
npm install
```

### Run in development

```bash
npm run tauri dev
```

### Build the desktop app

```bash
npm run build
npm run tauri build
```

### Useful checks

```bash
npm run lint
npm run type-check
npm run test
```

## Using FlowSelect

1. Start the desktop app.
2. Drag files, image URLs, or video URLs into the floating window.
3. Paste with `Ctrl+V` or `Cmd+V` to submit a URL.
4. On Windows, copied files in the clipboard can also be pasted into FlowSelect.
5. Double-click the empty area of the window to quickly open the current output folder; right-click still lets you open the current output folder or choose a new one.
6. Open Settings to manage theme, shortcut, startup behavior, rename rules, After Effects integration, and `yt-dlp` updates.

## Typical workflow

1. Launch FlowSelect and keep the floating window on the edge of your desktop.
2. Copy links, drag assets in, or pick a video directly from the browser extension.
3. FlowSelect saves the result into the output folder and queues video work automatically.
4. If rename rules or After Effects integration are enabled, the app continues with those steps after download.

## Load the browser extension

### Browser extension install diagram

<p align="center">
  <img src="./docs/readme/extension-install.svg" width="100%" alt="FlowSelect browser extension install diagram" />
</p>

1. Open your browser's extensions page.
2. Enable Developer Mode.
3. Choose "Load unpacked".
4. Select the [`browser-extension/`](./browser-extension) folder.
5. Start the FlowSelect desktop app.
6. Open the extension popup and confirm it shows `Connected`.

## Repo layout

```text
FlowSelect/
|-- src/                React UI
|-- src-tauri/          Rust backend and Tauri config
|-- browser-extension/  Chromium extension
|-- scripts/            Dev and packaging helpers
|-- release-notes/      Versioned release notes
|-- README.md
`-- README.en.md
```

## Maintainer notes

- Use `npm run version:set -- <version>` for version bumps.
- Add `release-notes/v<version>.md` before pushing a release tag.
- GitHub Releases are created from tags and expect the matching release-note file in the tagged commit.
