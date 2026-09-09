---
title: 本地开发环境
description: Ameow 的开发服务器启动链、预检流程、开发端口与渲染层 URL 覆盖。
---

## 快速启动

```bash
npm install        # 安装根目录依赖
npm run dev        # 启动完整开发环境
```

`npm run dev` 等同于 `npm run electron:dev`，二者都通过 `predev` / `preelectron:dev` 钩子先执行预检。

## 开发服务器启动链

`npm run dev` 的实际执行流程（`scripts/run-electron-dev.mjs`）：

1. **预检**（`scripts/dev-preflight.mjs`）：检查 locales 是否过期（过期才运行 `locales:sync`），确保托管 Python runtime 已缓存。
2. **Vite 渲染层**：在 `127.0.0.1:1420` 启动 Vite dev server（`strictPort`，端口被占用即报错）。
3. **TypeScript 编译**：首次运行 `tsc -p tsconfig.electron.json`，等待编译产物生成。
4. **Electron 启动**：注入 `AMEOW_ELECTRON_DEV_SERVER_URL=http://127.0.0.1:1420`，启动 Electron 主进程加载渲染层。
5. **tsc watch**：进入 watch 模式，TypeScript 重建成功后自动重启 Electron。

如果你改了 Electron 代码（`electron/` 目录）但没看到效果，很可能是因为 tsc watch 还在重建中——等待控制台出现重建成功提示，Electron 会自动重启。

## 仅渲染层开发

如果只需要调试前端（React 渲染层），不涉及 Electron 主进程：

```bash
npm run dev:renderer    # 仅启动 Vite，端口 1420
```

## 开发端口

| 端口 | 用途 | 来源 |
| --- | --- | --- |
| 1420 | Vite 渲染层 dev server（strictPort，仅 127.0.0.1） | `vite.config.ts` |
| 39527 | 扩展↔桌面 loopback WebSocket（架构契约，非开发配置项） | `electron/main.mts` |

端口 39527 是浏览器扩展与桌面端通信的 loopback WebSocket 端口。它由 Electron 主进程在启动时创建，不是你需要手动配置的项。如果排障"扩展连不上桌面"，检查这个端口是否被占用。架构细节见 [Electron Runtime Foundation](https://github.com/Wutpeach/Ameow/blob/main/docs/electron-runtime-foundation.md)。

## 渲染层 URL 覆盖

在调试打包后的应用时，可以用 `AMEOW_FRONTEND_URL` 覆盖 Electron 加载的渲染层地址：

```bash
AMEOW_FRONTEND_URL=http://localhost:3000 npm run electron:build && electron .
```

Electron 解析渲染层 URL 的优先级（`electron/windowRouting.mts`）：

1. `AMEOW_FRONTEND_URL`（显式覆盖）
2. `AMEOW_ELECTRON_DEV_SERVER_URL`（dev server 注入）
3. `http://127.0.0.1:1420`（默认 dev server）

## 预检流程

预检在每次 `npm run dev` 前自动运行，做两件事：

1. **Locales 同步**：检查 `locales/` 源文件与扩展资源目录的时间戳，仅在过期时运行 `locales:sync`。
2. **Python runtime 缓存**：确保托管 Python runtime 已下载并缓存。如果已缓存则跳过。

强制重新验证 Python runtime：

```bash
AMEOW_FORCE_DEV_PREFLIGHT=1 npm run dev
```

这是完整 dev 流程中强制预检的唯一入口。`--force` 在 `dev-preflight.mjs` 内部通过 `process.argv` 检测，但 `npm run dev -- --force` 会将 `--force` 传给 `run-electron-dev.mjs`（不读取该参数），而非 preflight 钩子——因此**不能**通过 `npm run dev -- --force` 生效。如需单独运行预检并强制重新验证：

```bash
node ./scripts/dev-preflight.mjs --force
```

## Browser Presentation Lab（dev:lab）

`npm run dev:lab` 通过 `vite.lab.config.ts` 启动一个独立的开发用浏览器页面（入口 `lab.html`，源码在 `src/lab/`）。它是纯浏览器环境：不加载 Electron bridge、不包含下载运行时，用于在不启动桌面的情况下预览和调试共享的呈现组件与素材。

这个 Lab 仍在活跃开发中，工具与场景会频繁变化，不建议围绕它构建长期工作流。历史上的 UI Lab（DEV-only 路由 `/ui-lab`）及其场景注入机制已从 main 移除（`30e0e5459`）。
