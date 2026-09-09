---
title: 环境变量
description: Ameow 中影响开发与诊断行为的真实环境变量，以及它们与消息标记常量的区别。
---

Ameow 使用 `AMEOW_` 前缀的环境变量来控制开发行为和诊断模式。以下变量通过 `process.env` 读取；其中大部分只能通过环境变量启用，`AMEOW_FORCE_DEV_PREFLIGHT` 也可在直接运行预检脚本时通过 `--force` 参数触发（见[本地开发环境](./local-development/)）。

## 环境变量

| 变量 | 用途 | 来源文件 |
| --- | --- | --- |
| `AMEOW_ELECTRON_DEV_SERVER_URL` | dev server URL 注入 Electron | `scripts/run-electron-dev.mjs` |
| `AMEOW_FRONTEND_URL` | 覆盖渲染层加载 URL（调试打包应用） | `electron/windowRouting.mts` |
| `AMEOW_FORCE_DEV_PREFLIGHT` | 强制预检重新验证 Python runtime（`1`/`true`/`yes`/`on`） | `scripts/dev-preflight.mjs` |
| `AMEOW_STARTUP_DIAGNOSTICS` | 开启启动诊断捕获（窗口截图+像素透明度分析） | `electron/windowVisibility.mts` |
| `AMEOW_FORCE_OPAQUE_WINDOW` | 强制不透明窗口（实验性，诊断透明窗口问题） | `electron/windowVisibility.mts` |
| `AMEOW_DOCS_SCREENSHOT_TARGET` | 文档截图：目标截图 ID | `electron/main.mts` |
| `AMEOW_DOCS_SCREENSHOT_OUTPUT` | 文档截图：输出路径 | `electron/main.mts` |
| `AMEOW_DOCS_SCREENSHOT_DEVICE_SCALE_FACTOR` | 文档截图：设备像素比 | `electron/main.mts` |
| `AMEOW_DOCS_SCREENSHOT_USER_DATA` | 文档截图：用户数据路径 | `electron/main.mts` |

`AMEOW_DOCS_SCREENSHOT_*` 四个变量是截图编排脚本向 Electron 子进程传递 target / output / DPR / userData 的内部环境协议，不是面向维护者的公共配置项。详见维护者 runbook。

## 消息标记常量不是环境变量

仓库中还有大量 `AMEOW_` 前缀的字符串，例如：

- `AMEOW_PINTEREST_DRAG`
- `AMEOW_WEIBO_VIDEO_VARIANTS`
- `AMEOW_XIAOHONGSHU_NOTE_LINKS`

这些是页面与进程之间的消息标记常量，用于内容脚本与 background script 通信，**不是**环境变量。它们不会从 `process.env` 读取，设置它们不会产生任何效果。
