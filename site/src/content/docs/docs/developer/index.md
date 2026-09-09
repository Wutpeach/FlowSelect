---
title: 开发者指南
description: Ameow 的开发者文档——如何启动开发环境、找到主要开发入口、运行基本验证。
---

Ameow 的开发者文档面向希望参与开发或维护的贡献者。它只解释**如何开发、调试和验证**，不承担架构权威职责。

## 覆盖范围

- [本地开发环境](./local-development/)：开发服务器启动链、预检流程、开发端口
- [环境变量](./environment-variables/)：影响开发与诊断行为的环境变量
- [测试与验证](./testing/)：单元测试、lint、类型检查
- [文档站点与本地化](./docs-and-locales/)：文档站点开发、locales 同步

## 边界声明

开发者文档**只**解释如何开发、调试和验证，**不**承担以下职责：

- **架构契约与不变量**：由仓库内权威文件承担——[Electron Runtime Foundation](https://github.com/Wutpeach/Ameow/blob/main/docs/electron-runtime-foundation.md)（运行时边界契约）和 [Electron Parity Verification](https://github.com/Wutpeach/Ameow/blob/main/docs/electron-parity-verification.md)（迁移校验）。开发者文档不复制这些不变量，只链接到它们。
- **维护者操作手册**（打包、发布、诊断、能力验证）：见仓库 `docs/maintainer/` 目录下的 runbook。
- **用户使用指南**：见本站其他章节。
- **开发代理工具链**（Trellis / Codex / AI agent workflow）：属于维护者内部工具，不默认写入面向人类贡献者的文档。

## Lab 生命周期

以下工具的文档状态基于当前 `main` 分支的实际情况：

| 工具 | 状态 | 文档策略 |
| --- | --- | --- |
| UI Lab | 已从 main 移除（原 DEV-only 路由 `/ui-lab` 与场景注入机制，随 `30e0e5459` 移除） | 不建立长期文档 |
| Browser Presentation Lab | 已进入 main（`lab.html` + `vite.lab.config.ts` + `src/lab/`），DEV-only 纯浏览器开发页面，仍在活跃演进 | 不作为 stable 能力发布；不建立长期文档 |

UI Lab 已从当前 main 移除，其场景注入机制（`dev_ui_lab_apply_scenario`）不再存在；文档截图改由 Electron 主进程通过环境变量协议直接完成（见维护者 runbook `docs/maintainer/docs-screenshots.md`）。Browser Presentation Lab 通过 `npm run dev:lab` 启动，是一个不加载 Electron bridge、不含下载运行时的纯浏览器页面，用于在不启动桌面的情况下预览共享呈现组件；它仍在活跃开发中，不建议围绕它构建长期工作流。
