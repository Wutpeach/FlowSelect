# 浏览器扩展

[中文](./browser-extension.md) | [English](./browser-extension.en.md)

FlowSelect 仓库中包含一个 Manifest V3 浏览器扩展，位于 [`browser-extension/`](../browser-extension)。它面向 Chromium 内核浏览器，例如 Chrome 和 Edge。

## 1. 安装扩展

你可以使用仓库源码目录，也可以使用 GitHub Releases 附带的扩展压缩包。

### 从源码目录加载

1. 打开浏览器扩展管理页面。
2. 启用开发者模式。
3. 选择“Load unpacked”。
4. 选中 [`browser-extension/`](../browser-extension) 目录。

### 从 Release 压缩包加载

1. 从 [GitHub Releases](https://github.com/Wutpeach/FlowSelect/releases) 下载 `FlowSelect_<version>_browser_extension.zip`。
2. 解压压缩包。
3. 打开浏览器扩展管理页面并启用开发者模式。
4. 选择“Load unpacked”。
5. 选中解压后的 `browser-extension/` 目录。

## 2. 连接桌面应用

1. 先启动 FlowSelect 桌面应用。
2. 打开扩展弹窗。
3. 确认扩展状态显示为 `Connected`。

扩展通过本地 WebSocket 与桌面端通信，默认地址为 `127.0.0.1:39527`。

## 3. 当前能力

- 把选中的视频链接发送给 FlowSelect。
- 透传浏览器 Cookies，帮助桌面端处理需要登录态的下载流程。
- 同步下载质量偏好。
- 同步 AE 兼容格式偏好。
- 在部分站点提供播放器内下载或截图辅助能力。

## 4. 当前接入站点

- YouTube
- Bilibili
- X / Twitter
- Douyin
- Xiaohongshu

站点支持会继续演进，最新变化请参考对应版本的 [Release Notes](../release-notes/)。

## 5. 遇到问题时

如果扩展显示未连接、网页中没有出现联动入口，或站点行为异常，请查看：

- [FAQ](./faq.md)
