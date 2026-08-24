---
title: 错误提示与错误码
description: 按用户看到的错误文字、状态和下载错误码定位 Ameow 常见问题。
---

遇到报错时，先保留完整提示。Ameow 有些地方显示的是用户可读的错误文字，有些日志或反馈信息里会出现内部错误码。错误码能帮助定位方向，但不要只看错误码本身；同时看任务状态、站点、链接和输出目录。

下载失败时，Ameow 会显示一句稳定的错误提示（例如 `Download failed (E_EXECUTION_FAILED)`）和错误分类。`yt-dlp`、`gallery-dl` 或 `ffmpeg` 的原始输出不会直接展示在界面上；需要具体原因时，用中心提示的复制图标把诊断信息发给开发者，或看本页下方的常见原文说明。

最快的处理顺序是：**先按屏幕上的文字判断类型，再按错误码补充确认，最后记录完整提示反馈。**

## 中心提示里的复制诊断信息

下载失败或转码失败时，Ameow 主窗口中央会优先显示一句通俗的原因提示，例如登录态可能失效、网络连接异常、保存位置不可用，或视频处理失败。提示右侧如果出现复制图标，点击后会把本次错误的诊断信息复制到剪贴板。

复制出来的是可读的分段诊断报告（格式版本 v2），只包含**这一次失败**的已选事实：Ameow 版本、系统平台、任务 trace id、安全化后的链接摘要（只保留域名）、内部错误码、错误分类、诊断分类，以及按顺序排列的尝试摘要（引擎、周期、结果、回退、登录态恢复与重试都会保留）。只有转码或旧版遗留失败（没有结构化尝试记录）时，报告里才会附一条已脱敏、有边界的原始过程证据，并明确标注它只是证据、不决定错误分类。报告**不会**包含会话运行时日志片段或其它任务的内容。

出于隐私考虑，完整链接、本地路径、Cookie、令牌、代理地址与未脱敏的下载器输出不会出现在诊断信息里；报告的末尾会附一段隐私说明。反馈问题时，直接把这整段可读文本粘贴给开发者即可，它比只截图一句错误提示更容易定位问题。

设置页里的 **导出诊断日志** 仍然保留，适合需要完整环境和设置快照时使用；中心提示的复制图标更适合把某一次失败快速发给开发者。

## 先看你看到的文字

| 你看到的提示 | 通常表示 | 先做什么 |
| --- | --- | --- |
| `Disconnected` | 浏览器扩展没有连上桌面端 | 启动 Ameow，重载扩展，查看 [扩展未连接](./extension-disconnected/) |
| `Preparing` 一直不结束 | 正在解析链接、准备依赖、等待网络或登录态 | 等待一小段时间；多个公开链接都这样时看 [下载依赖与自动准备](../../advanced/download-dependencies/) |
| `cookies`、`login`、`sign in`、`authentication`、`authorization` | 站点需要登录态或 Cookie | 在浏览器登录后，通过扩展从页面发送任务 |
| `403`、`forbidden` | 站点拒绝访问，常见于登录态、地区、代理或规则变化 | 先用浏览器打开同一页面，再通过扩展发送 |
| `HTTP Error 412`、`Precondition Failed` | 站点拒绝了这次元数据或媒体请求，常见于登录态、风控、链接状态或下载器规则变化 | 先看下方 [BiliBili 412](#bilibili-http-error-412-precondition-failed) 说明；保留完整原文 |
| `timeout`、`timed out`、`network`、`fetch failed` | 网络请求失败或超时 | 检查网络和代理接管方式，换公开链接测试 |
| `429`、`too many requests`、`rate limit` | 访问过于频繁，被站点限流 | 等待一段时间，减少重复重试 |
| `Requested format is not available`、`No video formats found` | 当前画质/格式不可用，或下载器没有解析到可下载媒体 | 换较低质量或手动画质；仍失败时更新 Ameow/yt-dlp |
| `ffmpeg exited with code ...`、`Conversion failed` | 合并、封装或转码阶段失败 | 换质量或格式重试；反馈时保留完整错误和源链接 |
| `gallery-dl exited with code ...` | `gallery-dl` 执行失败，冒号后面通常才是具体原因 | 看同一条提示里的 `403`、`timeout`、`cookies` 等关键词 |
| `yt-dlp exited with code ...` | 下载器进程失败，后面通常还有更具体原因 | 看同一条提示里的站点、登录、代理或格式信息 |
| `produced no final output path` | 下载器结束了，但没有报告最终文件 | 打开当前输出目录，确认是否仍在转换或是否生成了中间文件 |
| `Download cancelled` | 任务被取消 | 如果不是你主动取消，重新发送任务并观察是否再次出现 |

如果提示里包含英文原文，反馈问题时尽量原样复制，不要只概括成“下载失败”。

## 下载错误码是什么意思？

下面这些错误码主要用于下载链路、日志和问题定位。用户界面不一定总会直接显示它们。

| 错误码 | 大致含义 | 用户应该怎么做 |
| --- | --- | --- |
| `E_ABORTED` | 任务被取消 | 重新发送任务；如果重复自动取消，记录操作步骤 |
| `E_AUTH_REQUIRED` | 需要登录态、Cookie 或授权 | 在浏览器登录后，用扩展从页面发送 |
| `E_INVALID_DOWNLOAD_INPUT` | 输入不是可用下载链接或缺少必要信息 | 重新复制完整链接，换公开链接测试 |
| `E_INVALID_INTENT` | 下载请求内容不完整或不符合当前规则 | 重新发送任务；如果来自扩展，先重载扩展 |
| `E_NO_PROVIDER_MATCH` | 当前链接没有匹配到可用站点处理方式 | 确认站点是否支持，换公开链接测试 |
| `E_ENGINE_NOT_FOUND` | 找不到对应下载引擎 | 重启 Ameow；如果仍失败，更新到最新稳定版 |
| `E_ENGINE_UNAVAILABLE` | 下载引擎暂时不可用 | 等待依赖准备完成，或查看 [下载依赖与自动准备](../../advanced/download-dependencies/) |
| `E_ENGINE_REJECTED_INTENT` | 某个下载引擎不能处理这次任务 | 换质量偏好或通过扩展从具体页面发送 |
| `E_DIRECT_SOURCE_REQUIRED` | 需要更直接的媒体地址或页面上下文 | 优先用浏览器扩展从当前页面发送 |
| `E_EXECUTION_FAILED` | 下载器执行失败 | 按错误分类（登录、网络、格式等）排查，必要时复制诊断信息反馈 |
| `E_INVALID_ENGINE_PLAN` | 下载计划生成失败 | 更新到最新稳定版；保留链接和错误提示反馈 |
| `E_NO_ENGINE_SUCCEEDED` | 已尝试的下载方式都失败 | 换公开链接、降低质量、确认登录态和代理 |
| `E_OUTPUT_NOT_FOUND` | 下载器没有给出最终输出文件 | 打开当前输出目录，确认任务是否还在转换；若重复出现，反馈完整错误 |

## 常见下载器原文是什么意思？

这些提示通常来自下载器或站点响应。它们和上面的 `E_*` 内部错误码不同：`E_*` 说明 Ameow 下载链路走到了哪类失败，下面这些原文更接近站点或下载器给出的具体原因。

| 原始提示或关键词 | 通常表示 | 先做什么 |
| --- | --- | --- |
| `ERROR: [BiliBili] ... Unable to download JSON metadata: HTTP Error 412 Precondition Failed` | BiliBili 拒绝了元数据请求。可能和登录态/Cookie、站点风控、链接状态、地区限制、请求头或 yt-dlp 规则变化有关 | 见下方 [BiliBili 412](#bilibili-http-error-412-precondition-failed) |
| `HTTP Error 403: Forbidden` | 站点拒绝访问。常见原因是未登录、Cookie 失效、地区限制、代理环境不一致或站点规则变化 | 在浏览器确认同一页面可播放；通过扩展从页面重新发送 |
| `HTTP Error 404`、`Private video`、`video unavailable`、`not available in your country` | 内容不可访问、私密、下架或地区不可用 | 先确认浏览器里能否访问；浏览器也不可访问时通常不是 Ameow 能修复的问题 |
| `HTTP Error 416: Requested Range Not Satisfiable` | 续传范围不匹配，常见于旧的 `.part` 临时文件或站点返回范围变化 | 清理同名残留临时文件后重试；仍失败时反馈完整错误 |
| `429`、`Too Many Requests`、`rate limit` | 请求太频繁，被站点限流 | 等待一段时间再试，减少连续重试；必要时刷新登录态 |
| `timeout`、`timed out`、`ECONNRESET`、`ENOTFOUND`、`EAI_AGAIN`、`fetch failed` | 网络、DNS 或代理链路失败 | 确认代理是否接管 Ameow 和下载器进程，换公开视频交叉测试 |
| `Requested format is not available` | 选择的画质或格式不可用，也可能是站点返回格式发生变化 | 换较低质量或手动画质；更新 Ameow/yt-dlp |
| `No video formats found` | 下载器没有解析到可下载媒体，可能是站点规则变化、链接类型不支持或需要登录态 | 用扩展从实际页面发送，确认登录态；仍失败时更新 Ameow/yt-dlp |
| `Sign in to confirm you're not a bot` | 站点触发登录或反机器人校验，常见于 YouTube | 在浏览器登录后通过扩展发送；检查代理路径是否一致 |
| `Fresh cookies ... needed` | 站点需要新的 Cookie | 在浏览器重新登录，并在 Ameow 里刷新对应站点登录态 |
| `ffmpeg exited with code ...`、`Conversion failed` | 下载后的合并、封装或转码失败 | 换质量/格式重试；反馈时提供完整错误和源链接 |
| `gallery-dl exited with code ...` | `gallery-dl` 本身失败，冒号后面的 HTTP、登录、网络文字才是重点 | 按同条提示里的具体关键词继续排查 |
| `produced no final output path`、`finished without producing an output file` | 下载器结束了，但没有给 Ameow 最终文件路径 | 打开输出目录检查残留文件；重复出现时反馈完整错误 |

### BiliBili `HTTP Error 412 Precondition Failed`

如果你看到类似下面的提示：

```text
ERROR: [BiliBili] 1E642127rm: Unable to download JSON metadata: HTTP Error 412 Precondition Failed
```

这表示下载器在向 BiliBili 请求视频元数据时被站点拒绝。`412 Precondition Failed` 本身不是 Ameow 的内部错误码，而是站点 HTTP 响应。常见方向包括：

- 当前浏览器能看，但下载器没有拿到同样的登录态或 Cookie。
- 站点触发了风控、地区、年龄、会员、番剧或链接状态限制。
- BiliBili 页面或接口规则变化，需要更新 Ameow 或 yt-dlp。
- 链接不是普通可公开视频，或视频已经失效、仅 App/会员/地区可看。

先按这个顺序处理：

1. 在浏览器里打开同一页面，确认可以正常播放。
2. 如果需要登录，先在浏览器登录 BiliBili。
3. 优先通过 Ameow 浏览器扩展从当前页面重新发送任务，不要只复制链接。
4. 在 Ameow 里刷新 BiliBili 站点登录态，然后重试。
5. 更新 Ameow 或 yt-dlp 后再试一次。
6. 如果仍失败，反馈时保留完整错误原文、页面链接、Ameow 版本，以及是否通过扩展发送。

## 常见场景怎么处理？

### 看到登录、Cookie 或 403

先在浏览器里打开同一页面并确认可以正常播放或查看。然后使用 Ameow 浏览器扩展从这个页面发送任务。只复制链接时，桌面端不一定能拿到页面登录态。

### YouTube 浏览器能播放，但 Ameow 报错

优先怀疑代理环境不一致。浏览器能播放不代表 Ameow 和下载器子进程也走了同一条代理路径。先尝试代理工具的 TUN、全局、VPN 或系统代理接管模式，再用公开视频测试。

### 一直准备中或提示运行时不可用

首次使用某些下载能力时，Ameow 可能要自动准备 `yt-dlp`、`gallery-dl`、`ffmpeg`、`deno` 等组件。先等一小段时间。如果多个公开链接都长期准备中，再重启并升级到最新稳定版。

### 显示完成但找不到文件

这通常不是错误码问题。先从 Ameow 打开当前输出目录，按修改时间排序。拖入文件夹会切换输出目录，不一定还在默认桌面目录。

## 反馈问题时提供什么？

请尽量提供：

1. 如果中心提示里有复制图标，优先粘贴复制出来的整段诊断报告（可读文本）。
2. 完整错误提示或错误码截图。
3. Ameow 版本和系统平台。
4. 站点类型，例如 YouTube、Bilibili、X / Twitter、Douyin、Xiaohongshu。
5. 任务状态：没有任务、准备中、失败、完成但找不到文件。
6. 是否通过浏览器扩展发送，以及扩展是否显示 `Connected`。
7. 是否需要登录、是否使用代理、输出目录是否可写。

这些信息通常比只说“下载失败”更容易定位。
