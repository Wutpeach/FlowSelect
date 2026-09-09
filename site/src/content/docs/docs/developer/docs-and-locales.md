---
title: 文档站点与本地化
description: Ameow 文档站点的本地开发、构建、预览，以及 locales 同步机制。
---

Ameow 的公开文档站点使用 [Astro](https://astro.build/) + [Starlight](https://starlight.astro.build/) 构建，源码位于 `site/` 目录。

## 文档站点命令

```bash
npm run docs:dev       # 本地开发服务器
npm run docs:build     # 构建生产版本
npm run docs:preview   # 预览构建结果
```

这些命令通过 `--prefix site` 在 `site/` 目录下运行 Astro。`site/` 有独立的 `package.json` 和依赖。

## 目录结构

```
site/src/content/docs/
├── docs/              # 简体中文（root locale）
│   ├── developer/     # 开发者指南
│   ├── desktop/       # 桌面端使用
│   └── ...
└── en/docs/           # English
    ├── developer/     # Developer Guide
    ├── desktop/
    └── ...
```

- 简体中文是 root locale，URL 路径为 `/docs/...`
- 英文在 `/en/docs/...`
- 两种语言的页面内容必须保持事实同步

## 侧边栏配置

侧边栏分组在 `site/astro.config.mjs` 的 `sidebar` 数组中定义。每个分组有 `label`（中文）、`translations`（其他语言标签）和 `items`（内容 ID 列表）。

内容 ID 不含语言前缀——Starlight 自动解析到对应 locale 的文件。

## Locales 同步

```bash
npm run locales:sync
```

`scripts/sync-locales.mjs` 读取 `locales/contract.json`，将 `locales/` 源文件同步到 `browser-extension/_locales/`（扩展资源目录）。同步规则：

- 完全替换目标目录（删除后重建）
- 复制 `contract.json` 到目标目录
- 按契约中声明的 `supportedLanguages` 和 `namespaces` 逐一复制

`locales:sync` 在 `prebuild` 钩子中自动运行。dev 预检也会在 locales 过期时触发它。

## 部署

文档站点从 `main` 分支自动部署到 GitHub Pages：

- 触发条件：push 到 `main` 且 `site/**` 有变更（或手动触发）
- 工作流：`.github/workflows/deploy-docs.yml`
- 构建命令：`npm ci --prefix site && npm run docs:build`
- 部署地址：https://wutpeach.github.io/Ameow/
