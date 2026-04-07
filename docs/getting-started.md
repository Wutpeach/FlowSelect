# 快速上手

[中文](./getting-started.md) | [English](./getting-started.en.md)

本页面面向第一次安装和第一次使用 FlowSelect 的用户。

## 1. 下载

前往 [GitHub Releases](https://github.com/Wutpeach/FlowSelect/releases) 下载对应平台的版本。

### Windows

- `Installer EXE`：常规安装包。
- `Portable ZIP`：免安装版本，解压即可运行。

### macOS

- `Apple Silicon DMG`：适用于 M 系列芯片 Mac。
- `Intel DMG`：适用于 Intel Mac。
- 当前 macOS 发行包采用开源 unsigned DMG 分发。

## 2. 安装与首次启动

### Windows

1. 运行安装包，或解压 Portable ZIP。
2. 启动 `FlowSelect`。
3. 首次启动后，应用会在桌面上显示一个小型悬浮窗口。

### macOS

1. 打开 DMG，把 `FlowSelect.app` 拖到 `Applications`。
2. 从 `Applications` 启动 FlowSelect。
3. 如果首次启动被 macOS 拦截，先尝试右键应用后选择“打开”，或前往 `系统设置 > 隐私与安全性` 放行。
4. 如仍被 quarantine 阻止，可执行：

```bash
xattr -dr com.apple.quarantine "/Applications/FlowSelect.app"
```

## 3. 第一次收集素材

你可以用下面几种方式把内容交给 FlowSelect：

- 把本地文件拖进悬浮窗口，文件会复制到当前输出目录。
- 把文件夹拖进悬浮窗口，把它设为新的输出目录。
- 复制图片链接、视频链接或其他支持的网页链接后，使用 `Ctrl+V` 或 `Cmd+V` 粘贴到应用中。
- 在 Windows 上，也可以直接粘贴剪贴板里的文件。

## 4. 输出目录与设置

- 默认输出目录为 `Desktop/FlowSelect_Received`。
- 双击主窗口空白区域，可快速打开当前输出目录。
- 右键主窗口，可打开当前输出目录或重新选择新的输出目录。
- 打开设置页后，可以管理：
  - 主题
  - 全局快捷键
  - 开机启动
  - 重命名规则
  - After Effects 集成
  - 下载运行时更新入口

## 5. 浏览器扩展联动

如果你希望直接在网页中触发下载或把浏览器 Cookies 透传给桌面端，请继续阅读：

- [浏览器扩展](./browser-extension.md)

## 6. 常见问题

遇到启动、下载或连接问题时，请查看：

- [FAQ](./faq.md)
