# FlowSelect

<div align="center">
  <img src="./app-icon.png" width="112" alt="FlowSelect logo" />
  <p><strong>桌面悬浮素材收集器，面向文件、图片、网页视频与浏览器扩展联动。</strong></p>
  <p>
    <a href="./README.md">中文</a> |
    <a href="./README.en.md">English</a> |
    <a href="https://github.com/Wutpeach/FlowSelect/releases">下载 Releases</a> |
    <a href="./docs/getting-started.md">快速上手</a> |
    <a href="./docs/browser-extension.md">浏览器扩展</a> |
    <a href="./docs/faq.md">FAQ</a> |
    <a href="./release-notes/">Release Notes</a>
  </p>
  <p>
    <img alt="Latest release" src="https://img.shields.io/github/v/release/Wutpeach/FlowSelect?display_name=tag" />
    <img alt="Release workflow" src="https://img.shields.io/github/actions/workflow/status/Wutpeach/FlowSelect/release.yml?label=release" />
    <img alt="Platforms" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-111827" />
  </p>
</div>

FlowSelect 是一个基于 Electron 的轻量桌面素材收集工具，提供常驻桌面的悬浮窗口，用于快速接收文件、图片与网页视频，并把内容统一保存到可控的输出目录。它支持拖拽、粘贴，以及浏览器扩展协同，适合把分散在桌面和浏览器中的素材快速汇总到同一个工作流里。

## 适合谁用

- 想把文件、图片和网页视频快速收集到同一个目录的人。
- 需要一个低打扰、常驻桌面的下载与收集入口的人。
- 会在浏览器里选视频，并希望把下载动作同步到桌面端的人。

## 核心能力

- 桌面悬浮收集窗口，支持拖拽文件、拖拽文件夹、粘贴链接，以及 Windows 剪贴板文件。
- 视频下载队列，支持实时进度、取消任务、最多 3 个并发，以及直链优先与提取器回退策略。
- 浏览器扩展联动，可把选中的视频链接、Cookies 与偏好同步到桌面端。
- 输出目录、重命名规则、快捷键、开机启动与 After Effects 集成都可以在设置页管理。

## 下载

FlowSelect 通过 GitHub Releases 分发桌面应用与浏览器扩展包。

<p>
  <a href="https://github.com/Wutpeach/FlowSelect/releases/latest"><img alt="Windows Installer EXE" src="https://img.shields.io/badge/Windows-Installer_EXE-2563EB?logo=windows&logoColor=white" /></a>
  <a href="https://github.com/Wutpeach/FlowSelect/releases/latest"><img alt="Windows Portable ZIP" src="https://img.shields.io/badge/Windows-Portable_ZIP-0F6CBD?logo=windows&logoColor=white" /></a>
  <a href="https://github.com/Wutpeach/FlowSelect/releases/latest"><img alt="macOS Apple Silicon DMG" src="https://img.shields.io/badge/macOS-Apple_Silicon_DMG-111827?logo=apple&logoColor=white" /></a>
  <a href="https://github.com/Wutpeach/FlowSelect/releases/latest"><img alt="macOS Intel DMG" src="https://img.shields.io/badge/macOS-Intel_DMG-374151?logo=apple&logoColor=white" /></a>
</p>

安装、首次启动与常见平台问题请查看 [快速上手](./docs/getting-started.md)。

## 文档

- [快速上手](./docs/getting-started.md)：安装、首次启动、基础收集流程与设置入口。
- [浏览器扩展](./docs/browser-extension.md)：扩展安装、连接桌面端、支持站点与联动方式。
- [FAQ](./docs/faq.md)：macOS 放行、下载失败、输出目录与连接问题。

## 开发

### 环境要求

- Node.js 20+
- npm

### 常用命令

```bash
npm install
npm run dev
npm run build
npm run lint
npm run type-check
npm run test
```

### 主要目录

- [`src/`](./src)：React 前端，包含主悬浮窗、设置页和右键菜单窗口。
- [`electron/`](./electron)：Electron 主进程与 preload bridge。
- [`browser-extension/`](./browser-extension)：配套浏览器扩展源码。
- [`scripts/`](./scripts)：开发、打包与版本更新脚本。
- [`release-notes/`](./release-notes)：版本化发布说明。

## 致谢

FlowSelect 的部分核心能力建立在优秀的开源项目之上。特别感谢 `yt-dlp`、`gallery-dl` 和 `FFmpeg`，它们为网页媒体提取、资源下载与后续媒体处理提供了重要基础。

也感谢所有被本项目使用到、但未在此一一列出的开源项目与维护者。
