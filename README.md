# FlowSelect

一款轻量级桌面悬浮窗素材收集工具，支持快速收集图片、视频和文件。

## 功能特性

- **拖拽收集** - 将文件、图片或视频链接拖拽到悬浮窗即可保存
- **粘贴收集** - 支持粘贴剪贴板中的文件、图片URL或视频URL
- **视频下载** - 集成 yt-dlp，支持 YouTube、Bilibili 等主流视频平台
- **智能命名** - 自动序号命名（99-1倒序），保持文件夹整洁
- **悬浮窗口** - 始终置顶、透明背景、可拖拽移动
- **系统托盘** - 最小化到托盘，不占用任务栏
- **全局快捷键** - 自定义快捷键快速显示/隐藏窗口
- **开机自启** - 可选开机自动启动

## 支持的内容类型

| 类型 | 支持格式 |
|------|----------|
| 图片 | JPG, PNG, GIF, WebP, BMP, SVG |
| 视频 | YouTube, Bilibili, Twitter/X, 抖音等 (通过 yt-dlp) |
| 文件 | 任意文件类型 |

## 安装

### 从 Release 下载

前往 [Releases](https://github.com/Wutpeach/FlowSelect/releases) 页面下载最新版本的安装包。

### 从源码构建

#### 环境要求

- Node.js 18+
- Rust 1.70+
- npm

#### 构建步骤

```bash
# 克隆仓库
git clone https://github.com/Wutpeach/FlowSelect.git
cd FlowSelect

# 安装依赖
npm install

# 开发模式运行
npm run tauri dev

# 生产构建
npm run tauri build
```

## 使用方法

### 基本操作

1. **收集文件** - 将文件拖拽到悬浮窗，或复制文件后在悬浮窗按 `Ctrl+V`
2. **收集图片** - 拖拽图片或图片URL到悬浮窗
3. **下载视频** - 拖拽或粘贴视频链接（如 YouTube、Bilibili 链接）
4. **设置输出目录** - 拖拽文件夹到悬浮窗，或在设置中选择
5. **打开输出文件夹** - 右键悬浮窗选择 "Open Folder"

### 快捷操作

- **隐藏窗口** - 点击右上角圆点按钮
- **打开设置** - 点击右下角方块按钮
- **取消下载** - 下载进行中点击取消按钮

### 设置选项

- **输出路径** - 自定义素材保存位置
- **全局快捷键** - 设置显示/隐藏窗口的快捷键
- **开机自启** - 开启/关闭开机自动启动
- **浏览器 Cookies** - 启用后可下载需要登录的视频

## 技术栈

- **框架**: [Tauri v2](https://tauri.app/)
- **前端**: React 19 + TypeScript + Vite
- **后端**: Rust
- **UI**: TailwindCSS + Framer Motion
- **视频下载**: [yt-dlp](https://github.com/yt-dlp/yt-dlp)

## 项目结构

```
FlowSelect/
├── src/                    # React 前端代码
│   ├── App.tsx            # 主悬浮窗组件
│   ├── pages/             # 页面组件
│   └── utils/             # 工具函数
├── src-tauri/             # Rust 后端代码
│   ├── src/lib.rs         # 核心逻辑
│   ├── binaries/          # yt-dlp 可执行文件
│   └── Cargo.toml         # Rust 依赖配置
├── package.json           # Node.js 依赖配置
└── README.md
```

## 许可证

MIT License

## 致谢

- [Tauri](https://tauri.app/) - 跨平台桌面应用框架
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - 视频下载工具
- [Lucide](https://lucide.dev/) - 图标库
