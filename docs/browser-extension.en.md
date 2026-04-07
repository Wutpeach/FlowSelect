# Browser Extension

[中文](./browser-extension.md) | [English](./browser-extension.en.md)

The FlowSelect repository includes a Manifest V3 browser extension in [`browser-extension/`](../browser-extension). It targets Chromium-based browsers such as Chrome and Edge.

## 1. Install The Extension

You can load it from the repository source folder or from the packaged extension archive shipped in GitHub Releases.

### Load From The Source Folder

1. Open your browser's extensions page.
2. Enable Developer Mode.
3. Choose "Load unpacked".
4. Select the [`browser-extension/`](../browser-extension) folder.

### Load From The Release Archive

1. Download `FlowSelect_<version>_browser_extension.zip` from [GitHub Releases](https://github.com/Wutpeach/FlowSelect/releases).
2. Extract the archive.
3. Open your browser's extensions page and enable Developer Mode.
4. Choose "Load unpacked".
5. Select the extracted `browser-extension/` folder.

## 2. Connect To The Desktop App

1. Start the FlowSelect desktop app first.
2. Open the extension popup.
3. Confirm the extension status shows `Connected`.

The extension communicates with the desktop app over a local WebSocket connection at `127.0.0.1:39527`.

## 3. Current Capabilities

- Send selected video URLs into FlowSelect.
- Pass browser cookies into the desktop app for authenticated download flows.
- Sync download quality preferences.
- Sync AE-friendly conversion preferences.
- Provide helper actions such as in-player downloads or screenshots on supported sites.

## 4. Current Site Coverage

- YouTube
- Bilibili
- X / Twitter
- Douyin
- Xiaohongshu

Site coverage will continue to evolve. For the latest changes, see the relevant [Release Notes](../release-notes/).

## 5. If Something Is Wrong

If the extension stays disconnected, page-level actions do not appear, or site behavior looks incorrect, see:

- [FAQ](./faq.en.md)
