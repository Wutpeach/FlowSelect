# FlowSelect

<div align="center">
  <img src="./app-icon.png" width="112" alt="FlowSelect logo" />
  <p><strong>A floating desktop collector for files, images, web video, and browser-extension assisted capture.</strong></p>
  <p>
    <a href="./README.md">中文</a> |
    <a href="./README.en.md">English</a> |
    <a href="https://github.com/Wutpeach/FlowSelect/releases">Download Releases</a> |
    <a href="./docs/getting-started.en.md">Getting Started</a> |
    <a href="./docs/browser-extension.en.md">Browser Extension</a> |
    <a href="./docs/faq.en.md">FAQ</a> |
    <a href="./release-notes/">Release Notes</a>
  </p>
  <p>
    <img alt="Latest release" src="https://img.shields.io/github/v/release/Wutpeach/FlowSelect?display_name=tag" />
    <img alt="Release workflow" src="https://img.shields.io/github/actions/workflow/status/Wutpeach/FlowSelect/release.yml?label=release" />
    <img alt="Platforms" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-111827" />
  </p>
</div>

FlowSelect is a lightweight Electron desktop collector with a small always-on-top window for gathering files, images, and web video into a controlled output folder. It supports drag and drop, paste flows, and browser-extension assisted capture so desktop and browser assets can flow into the same workspace.

## Good Fit For

- People who want files, images, and web video to land in one controlled folder.
- People who need a low-friction collector window that stays available on the desktop.
- People who trigger downloads from the browser and want them to continue on the desktop side.

## Core Capabilities

- A floating desktop collector that supports file drag and drop, folder drag and drop, pasted links, and Windows clipboard files.
- A video download queue with live progress, cancellation, up to 3 concurrent tasks, and extractor fallback when direct media is unavailable.
- Browser-extension assisted capture that can pass selected video URLs, cookies, and preferences into the desktop app.
- Settings for output folder management, rename rules, shortcuts, launch at startup, and After Effects integration.

## Downloads

FlowSelect ships through GitHub Releases, including desktop builds and the browser-extension package.

<p>
  <a href="https://github.com/Wutpeach/FlowSelect/releases/latest"><img alt="Windows Installer EXE" src="https://img.shields.io/badge/Windows-Installer_EXE-2563EB?logo=windows&logoColor=white" /></a>
  <a href="https://github.com/Wutpeach/FlowSelect/releases/latest"><img alt="Windows Portable ZIP" src="https://img.shields.io/badge/Windows-Portable_ZIP-0F6CBD?logo=windows&logoColor=white" /></a>
  <a href="https://github.com/Wutpeach/FlowSelect/releases/latest"><img alt="macOS Apple Silicon DMG" src="https://img.shields.io/badge/macOS-Apple_Silicon_DMG-111827?logo=apple&logoColor=white" /></a>
  <a href="https://github.com/Wutpeach/FlowSelect/releases/latest"><img alt="macOS Intel DMG" src="https://img.shields.io/badge/macOS-Intel_DMG-374151?logo=apple&logoColor=white" /></a>
</p>

For installation, first launch, and platform-specific help, see [Getting Started](./docs/getting-started.en.md).

## Docs

- [Getting Started](./docs/getting-started.en.md): install, first launch, basic collection flows, and settings entry points.
- [Browser Extension](./docs/browser-extension.en.md): extension install flow, desktop connection, supported sites, and handoff behavior.
- [FAQ](./docs/faq.en.md): macOS gatekeeper notes, download failures, output-folder issues, and connection troubleshooting.

## Development

### Requirements

- Node.js 20+
- npm

### Common Commands

```bash
npm install
npm run dev
npm run build
npm run lint
npm run type-check
npm run test
```

### Main Directories

- [`src/`](./src): React frontend for the floating window, settings, and context menu windows.
- [`electron/`](./electron): Electron main-process code and preload bridge.
- [`browser-extension/`](./browser-extension): companion browser extension source.
- [`scripts/`](./scripts): development, packaging, and version-management helpers.
- [`release-notes/`](./release-notes): versioned release notes.

## Acknowledgements

Some of FlowSelect's core capabilities are built on top of excellent open-source projects. Special thanks to `yt-dlp`, `gallery-dl`, and `FFmpeg` for providing the foundation for web media extraction, resource downloading, and downstream media processing.

We also appreciate the maintainers of the many other open-source projects used throughout this repository.
