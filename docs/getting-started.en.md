# Getting Started

[中文](./getting-started.md) | [English](./getting-started.en.md)

This page is for first-time FlowSelect installation and first-time use.

## 1. Download

Go to [GitHub Releases](https://github.com/Wutpeach/FlowSelect/releases) and download the build for your platform.

### Windows

- `Installer EXE`: standard installer build.
- `Portable ZIP`: unzip and run without installing.

### macOS

- `Apple Silicon DMG`: for M-series Macs.
- `Intel DMG`: for Intel Macs.
- The current macOS package is distributed as an unsigned open-source DMG.

## 2. Install And First Launch

### Windows

1. Run the installer, or extract the Portable ZIP.
2. Launch `FlowSelect`.
3. After first launch, a small floating window will appear on the desktop.

### macOS

1. Open the DMG and drag `FlowSelect.app` into `Applications`.
2. Launch FlowSelect from `Applications`.
3. If macOS blocks the app on first launch, first try right-click `Open`, or allow it from `System Settings > Privacy & Security`.
4. If quarantine still blocks the app, run:

```bash
xattr -dr com.apple.quarantine "/Applications/FlowSelect.app"
```

## 3. Collect Your First Assets

You can send content into FlowSelect in several ways:

- Drag local files into the floating window to copy them into the current output folder.
- Drag a folder into the floating window to make it the new output folder.
- Copy an image URL, video URL, or another supported page URL, then paste with `Ctrl+V` or `Cmd+V`.
- On Windows, copied files from the clipboard can also be pasted directly.

## 4. Output Folder And Settings

- The default output folder is `Desktop/FlowSelect_Received`.
- Double-click the empty area of the main window to quickly open the current output folder.
- Right-click the main window to open the current output folder or choose a new one.
- In Settings, you can manage:
  - theme
  - global shortcut
  - launch at startup
  - rename rules
  - After Effects integration
  - downloader runtime update entry points

## 5. Browser Extension Handoff

If you want to trigger downloads directly from web pages or pass browser cookies into the desktop app, continue here:

- [Browser Extension](./browser-extension.en.md)

## 6. Common Questions

For launch, download, or connection issues, see:

- [FAQ](./faq.en.md)
