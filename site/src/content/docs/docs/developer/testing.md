---
title: 测试与验证
description: Ameow 的单元测试、lint、类型检查命令与测试文件组织方式。
---

## 基本命令

```bash
npm run test          # 运行单元测试（vitest run --passWithNoTests）
npm run lint          # ESLint 检查（src/ + vite.config.ts，.ts/.tsx）
npm run type-check    # TypeScript 类型检查（tsc --noEmit × 2：renderer + electron）
```

`type-check` 运行两次 `tsc --noEmit`：一次检查渲染层（`tsconfig.json`），一次检查 Electron 主进程（`tsconfig.electron.json`）。

## 测试框架

测试使用 [Vitest](https://vitest.dev/)。测试文件与源码同目录存放（co-located），命名模式为 `*.test.ts` / `*.test.mts` / `*.test.js`，分布在：

- `src/` — 渲染层与核心逻辑
- `electron/` — Electron 主进程
- `scripts/` — 构建/工具脚本
- `browser-extension/` — 浏览器扩展

`vitest run` 以非 watch 模式运行，适合 CI。`--passWithNoTests` 确保没有测试文件时不报错。

## 架构守护测试

`browser-extension/architecture-guard.test.js` 是一个特殊的架构守护测试，强制以下不变量：

- WebSocket transport 只能由 desktop-client 文件构造
- 运行时中立性约束
- 端口边界约束

这是架构级约束，不属于常规单元测试范畴。架构细节见 [Electron Runtime Foundation](https://github.com/Wutpeach/Ameow/blob/main/docs/electron-runtime-foundation.md)。

## Runtime Smoke 验证

Runtime smoke 测试验证托管 Python runtime 和下载器能力。这些是维护者操作，见维护者 runbook。
