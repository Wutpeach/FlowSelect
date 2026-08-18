# Diagnostics Readability / Export Cleanup — Repository-grounded Planning Report

> 状态：Planning complete candidate；未进入 implementation，未授予 Architecture PASS。

## 1. 结论摘要

当前 Ameow 已有足够的 typed Download terminal / attempt facts，可以让主界面 Copy 不再复制“最近 120 行会话日志”。最小方案不是重写 logging，而是：

1. Quick Copy 改成单 incident、结构化事实优先的可读文本；第一版不带 session raw-log dump。
2. Settings Export 保留现有命令、文件行为和四段结构，但把 raw config、runtime paths 和 evidence 先做 allowlist projection，再统一经过 main-process pre-egress sanitization。
3. 复用现有 `safe-diagnostic.ts`、P6B attempt summary、session runtime log 和 bounded history；不新增 event store、trace platform 或 generic diagnostics framework。
4. Implementation 应独立于 MR9，最好从 MR9 稳定/consolidated baseline 后落地；它不是 Thermal FX 的 architecture prerequisite。

## 2. Current-state diagnostic/data flow

```text
yt-dlp / gallery-dl / ffmpeg stdout+stderr
        |  Infrastructure owns parsing/classification and progress conversion
        v
DownloadRuntimeError + typed code/classification/category
        |
        +--> Application DownloadDiagnosticRecorder
        |      - trace / attempts / fallback / auth recovery / terminal
        |      - last 8 attempt summaries
        |      - best-effort sink -> RuntimeLogger -> Electron console
        |
        +--> one protocol terminal mapper
               -> safe URL + typed failure + attemptSummary
               -> Renderer typed terminal reduction
               -> App builds ErrorDiagnosticCopyRequest
               -> copy_error_diagnostics
               -> last 120 whole-session runtime lines + pretty JSON
               -> Electron clipboard

Electron main console + Renderer console-message + selected startup lines
        -> runtimeLog sanitizer at ingest
        -> 1500-line memory fallback + runtime-latest.log (overwritten per start)
        -> newest 800 lines
        -> export_support_log
           + raw environment paths
           + entire config object
           + raw runtime status object/paths/errors
           + runtime lines
        -> support-<timestamp>.txt -> Settings opens folder
```

关键证据：

- Runtime log 在写入前做文本 scrub，内存上限 1500、默认导出 800 行；文件在 session 初始化时覆盖，但 session 内持续 append：`electron/runtimeLog.mts:61-65,110-126,146-166,189-206`。
- Main composition 固定 `runtime-latest.log`、1500 buffer、800 export：`electron/main.mts:195-197,420-433`。
- Renderer console 经 startup diagnostics controller 追加到 runtime log；额外 startup file 只有 diagnostics enabled 时写入：`electron/startupDiagnostics.mts:125-142,228-249`。
- Application diagnostics 是 closed Download-only union、best-effort sink、最多 8 attempts、exactly-one terminal summary：`src/application/download-diagnostics.ts:9-16,54-166,176,269-415`。
- Typed diagnostic events 当前只是写入现有 runtime logger，不是独立 store：`src/electron-runtime/downloadDiagnosticSink.ts:7-13`。
- Protocol mapper 已明确禁止新 structured Download payload 暴露 raw downloader/process output，并只发 code/classification/category/safe URL/attempt summary：`src/protocol/download/ipcMappers.ts:337-364`。
- 另有本地 `telemetry/download-outcomes.jsonl` 持久化 typed Download outcome；它明确把 raw `errorMessage` 固定为 null，但采用 append-only、没有 rotation，而且当前不被 Copy/Export 读取：`src/electron-runtime/downloadTelemetry.ts:10-13,29-48`；`src/download-capabilities/telemetry.ts:202-229`。它不是本 task 要扩展的 telemetry/diagnostics store。

## 3. Raw/backend evidence 当前如何产生与保留

### yt-dlp

- stdout/stderr progress 被转换为 typed progress，不写每个 tick；non-progress stderr 在 attempt 内暂存，failure 时 Infrastructure 用它分类并只把已 scrub 的短 tail 写 timing log：`src/electron-runtime/ytDlpDownload.ts:298-394,505-557`。
- transient network retry、section-format retry 是真实语义事件，不能被 dedupe 掉：`src/electron-runtime/ytDlpDownload.ts:456-503`。
- yt-dlp 的 `stderrLines` 当前按 attempt 累积，没有 gallery-dl 同类 tail cap；这是 producer-local retention debt，但 Quick Copy 不应通过引入 session dump 来补救。

### gallery-dl

- stdout/stderr 分别使用 manifest 的 20-line tail，重复 activity label 在发 progress 前已局部抑制：`src/electron-runtime/galleryDlDownload.ts:33-41,175-211`；`src/electron-runtime/engineManifest.ts:218`。
- failure tail 在 Infrastructure 被 scrub/classify 后转成 typed `DownloadRuntimeError`；report formatter 不应再次从文本推导语义：`src/electron-runtime/galleryDlDownload.ts:214-242`。

### ffmpeg / Transcode

- stdout 的 machine progress 转成 typed percent/ETA；stderr 全量暂存，失败只抛最后一行 summary：`src/electron-runtime/transcode.ts:499-584`。
- Runtime service 目前给 Transcode failure 固定 `E_EXECUTION_FAILED`，同时保留 raw message、user URL 与含 source path/plan 的 open context；Copy normalization 会丢弃 context，因此路径当前不会进入 Copy：`src/electron-runtime/service.ts:229-242`；`electron/errorDiagnosticCopy.mts:208-247`。
- failed Transcode task history已有 20 条 retention，可复用其 terminal fact，但不应把整个 task/context 原样导出：`src/electron-runtime/service.ts:250,1185-1207`。

### runtime dependency / Electron/native

- Runtime dependency owner 是 Electron composition + `inspectRuntimeDependencyStatus`; snapshot 包含 component state/source/path/error：`electron/main.mts:2001-2007`；`src/types/runtimeDependencies.ts:5-21`。
- Electron/native startup/window facts 由 `startupDiagnostics.mts` 拥有；debug file serialization 当前不是共享 sanitizer，且 bootstrap payload 可包含 argv/execPath/userData/log/config paths。它不是当前 Support Export 的输入，但如果未来纳入必须先投影与 scrub：`electron/main.mts:3744-3759`；`electron/startupDiagnostics.mts:56-65,125-142`。
- 同一 debug-only startup path 还会把窗口截图写为 `startup-capture-*.png`；截图和 debug text 都没有历史 cleanup。它们不应被本次 Support Export 自动打包，retention/hardening 应作为独立 native-diagnostics debt：`electron/startupDiagnostics.mts:145-163`。
- Cookies 在 engine invocation 前写入系统临时目录，并通过 command arg 传给 sidecar，正常 settlement 后删除；`processRunner` 已明确禁止把 args 拼进普通错误。Diagnostics implementation 必须保持 cookie contents/path/args 不出站；crash 后临时文件残留属于 runtime credential-lifecycle debt，不应借本 task 扩成 cookie-storage rewrite：`src/electron-runtime/sidecarCookies.ts:5-23`；`src/electron-runtime/processRunner.ts:138-146`。

## 4. Quick Copy 当前真实路径

1. Download terminal 经 feature client typed-first classification；只有旧 payload 才解析 cancelled 文本：`src/features/download/client.ts:89-122`。
2. App 从 terminal failure 或 Transcode task 构建 `ErrorDiagnosticCopyRequest`，并把 copy action 交给 center overlay：`src/App.tsx:1178-1226,2108-2140,2404-2429`。
3. `copy_error_diagnostics` 进入独立 command controller；main process normalize 后调用 builder，再由 Electron clipboard 写入：`electron/errorDiagnosticCommands.mts:30-58`；`electron/main.mts:1894-1908`。
4. Builder 读取“最后 120 行”而不是 trace-scoped evidence，生成 schemaVersion 1 pretty JSON：`electron/errorDiagnosticCopy.mts:31,250-305`。
5. 已有防护：URL origin-only、open context 丢弃、attempt 最多 8、每个字段和 runtime line 再 scrub：`electron/errorDiagnosticCopy.mts:128-210`。

因此当前 Copy 的最大 readability/architecture 问题不是“没有 typed facts”，而是 typed facts 后又拼了不相关的 whole-session tail。

## 5. Settings Export 当前真实路径

1. Settings 的明确 UI section 调 `export_support_log`，成功后打开输出目录：`src/pages/SettingsPage.tsx:696-722,2328-2342`。
2. Command controller 只路由并返回 string path：`electron/supportLogCommands.mts:13-38`。
3. Main 传入 environment、raw `readConfigObject`、runtime status、recent log reader：`electron/main.mts:1416-1429`。
4. Export 直接 `JSON.stringify` 完整 config 与 runtime status，并明文写 configPath/logDir/runtimeLogPath；没有 Copy 同类 pre-egress privacy pass：`electron/supportLogExport.mts:21-55`。
5. 现有测试甚至把明文 paths 和 outputPath 当 contract 固定下来，implementation 必须显式迁移测试/spec：`electron/supportLogExport.test.mts:9-39`。

## 6. 主要 architecture / readability / privacy 问题

### Architecture

- Copy 与 Export 是两个 builder，两者只共享 recent log reader；formatting/sanitization 没有 canonical egress boundary。
- P6B typed event/attempt seam 已存在，新增 generic diagnostic model 会形成重复 authority。
- `resolveErrorDiagnosticCategory` typed category 优先，但仍扫描 raw message/context 作为 fallback；new report 不应依赖这条兼容逻辑：`src/utils/errorDiagnosticCategories.ts:103-183`。
- Logging spec 声明了 Support Export sections 与 privacy/noise 规则，但 implementation 的 raw config/path 输出与该规则冲突：`.trellis/spec/backend/logging-guidelines.md:39-70`。

### Readability

- Quick Copy 把 incident facts 与 120 行 whole-session evidence 混在一起。
- Export 的 `[settings]` / `[runtime]` 直接 dump JSON，技术上完整但不说明什么是重要事实。
- 当前没有 collapse；chronology 保留是优点。不要用 fuzzy dedupe 修复可读性。

### Privacy

- Export 明文泄露 config/log/runtime paths、outputPath 和未来任意新增 config key；config store 本身是开放 `Record<string, unknown>`：`electron/configStore.mts:52-61,113`。
- `networkProxyUrl` 虽禁止 userinfo，但仍会泄露内部 proxy endpoint：`src/config/networkProxy.ts:10-13,69-97`。
- Runtime status 直接包含 executable paths 和 raw errors。
- Browser site-session credentials 当前不属于 Support Export input，必须继续保持排除；任何 cookies 文件路径或 sidecar command args 也不得为了“更完整诊断”加入 report。
- Current shared text scrub 已覆盖 HTTP(S)/SOCKS URL origin reduction、Cookie/Authorization/Bearer/Basic、secret-like key values、Windows drive 和部分 POSIX paths：`src/core/diagnostics/safe-diagnostic.ts:7-10,42-65`。但它不是 raw config allowlisting 的替代品，且需要补 UNC、macOS/其他 POSIX user paths、quoted CLI args 等 fixtures。
- Scheme-less URLs（例如 `www.example.com/path?token=...`）也不在现有 URL regex 保护范围内，必须纳入 egress fixtures 或明确拒绝作为 report field。
- Quick Copy 的 session tail 即使 scrub，也可能泄露另一个 incident 的 host/state/timing；scope isolation 是 privacy control，不只是 readability control。
- `startup-diagnostics-latest.txt` 在 debug-enabled 时走独立 raw JSON serialization；当前不被 Export 带出，但仍是诊断隐私审查项。

## 7. 推荐的最小 architecture direction

### Quick Copy

- 输入只用现有 `ErrorDiagnosticCopyRequest` + typed attempt summary。
- 输出改为 stable sectioned plain text：Summary → Incident facts → ordered attempts → bounded Transcode/legacy evidence → Privacy note。
- 第一版删除 `readRecentRuntimeLogLines(120)`，不做 log-text trace correlation，不建新 store。
- Download 的 retry/fallback/auth recovery 由 attempt summary 表达；Transcode 只带 scrub 后的 bounded failure summary。

### Settings Export

- 保留 command、string path、文件名、Settings action、四段 section。
- `[environment]` 保留 safe platform facts；path keys 只输出 redacted/presence values。
- `[settings]` 改为 explicit allowlist snapshot；未知 key 忽略。
- `[runtime]` 输出 state/source/error summary 与 path-present，不输出 executable path。
- `[recent-runtime-log]` 保留最多 800 行 chronology，出站前再次 scrub；structured sections 永远在 evidence 前。

### Canonical sanitization boundary

```text
owner-authoritative facts
  -> report-specific allowlist projection
  -> shared bounded string/value sanitizer
  -> final egress call in Electron main
     -> clipboard.writeText OR writeFile
```

任何 renderer-only、Copy-only、runtime-ingress-only redaction 都不是最终 authority。Network producer redaction 与 runtime-log ingress scrub 继续保留为 defense in depth。

## 8. Raw evidence 与 structured facts 的关系

| 内容 | Authority | Quick Copy | Settings Export |
| --- | --- | --- | --- |
| terminal status/code/classification/category | Product/Application typed facts | 必须，置顶 | 通过现有 typed log/event evidence 保留 |
| attempt index/engine/cycle/outcome/fallback/auth recovery | Application recorder | 必须，按 chronology | 保留，不 collapse |
| network route applied/source/protocol/failure classification | producer-safe snapshot | 可包含 safe metadata | 可包含 safe metadata/lines |
| yt-dlp/gallery-dl/ffmpeg stdout/stderr | Infrastructure evidence | 第一版不做 session dump；Transcode 只留一个 bounded summary | bounded + scrubbed chronological evidence |
| progress ticks/activity repetition | typed progress/noise | 不包含 | 默认过滤/省略，不靠 fuzzy dedupe |
| config/runtime paths/CLI args/cookies/browser credentials | sensitive operational data | 不包含 | 只输出 allowlisted presence/state；秘密值不包含 |

Raw evidence 只能解释 typed facts，不能覆盖或重新计算它们。

## 9. Compatibility / migration

- 保持 `copy_error_diagnostics`、`export_support_log`、Export string path 与 Settings folder-open 行为。
- 保持 `[environment]`、`[settings]`、`[runtime]`、`[recent-runtime-log]`，新增 `formatVersion=2`/privacy header。
- Quick Copy 从 JSON v1 迁到 readable report v2；repo 内没有 external parser 证据，现有 consumers 是 tests/docs。实施时同步更新中英文 docs。
- Existing runtime log session behavior 不在第一版改变；long-session file rotation 与历史 `support-*.txt` cleanup 作为明确 follow-up debt。
- Existing typed telemetry JSONL 和 startup capture retention 同样不在第一版改造；不要为了“复用历史”把它们接进 Copy/Export。
- Legacy terminal cancellation fallback 不在本 task 改动；new diagnostic report/category 不得继续扫描 raw evidence。

## 10. Validation strategy

- Privacy matrix：Cookies、Authorization/Proxy-Authorization、Bearer/Basic、signed URL query/fragment/userinfo/tokenized path、browser/session/API tokens、proxy credentials、cookie paths、Windows/UNC/POSIX/mac paths、command args、unknown config secret keys。
- Authority matrix：typed category wins；evidence 文本变化不改变 category/terminal；Transcode surface 不解析 ffmpeg 文本；legacy untyped Download report 为 unclassified。
- Chronology matrix：attempt 1/2、fallback、auth recovery、transient retry、相同 failure 连续发生都保留；progress/UI chatter 不占主导。
- Failure isolation：clipboard/file/log read/serializer 失败不改变 Product/Download/Transcode/runtime/lifecycle/config 状态。
- Compatibility：commands、return shape、filename、四段 section、empty-log placeholder。
- Gates：focused tests、type-check、lint、full tests、build、docs build、diff check；Windows Electron 手工 Copy/Export；macOS path fixtures，runtime host 不可用则记录 validation debt。

## 11. Implementation scope 与 non-goals

建议触及的最小区域：

- `src/core/diagnostics/safe-diagnostic.ts` + tests：共享 privacy/limits。
- `electron/errorDiagnosticCopy.mts` / command tests：可读 incident report，删除 120-line session dump。
- `electron/supportLogExport.mts` / main composition / tests：allowlisted support snapshot + final egress scrub。
- `src/utils/errorDiagnosticCategories.ts` + tests：停止 new report 的 raw-message category inference，保持 Product terminal untouched。
- `src/electron-runtime/service.ts` 的最小 Transcode diagnostic projection（仅当现有 typed surface 不足以供 formatter 使用）。
- `.trellis/spec/backend/logging-guidelines.md` 与中英文 public docs。

明确 non-goals：logging rewrite、generic framework、新增/扩展 telemetry、cloud/AI analyzer、new persistence、Product terminal changes、runtime/lifecycle/config authority、Thermal FX、runtime/telemetry/support/startup-file rotation/cleanup、full startup diagnostics export。

## 12. MR9 landing recommendation

**Repository-grounded recommendation：独立 implementation line，MR9 完成/稳定后落地；不是 MR9 prerequisite repair。**

理由：

- MR9 的 authority 是 Presentation activation/progress/visual acceptance，并明确保留 restrained DOM diagnostic/copy；它不依赖 Copy/Export format。
- 本 cleanup 横跨 Electron log capture/export、config/runtime safe snapshot、clipboard formatting 与 docs，塞进 MR9 会把 visual/manual gate 与 privacy cross-layer work 混在一起。
- P6B 和 terminal-authority correction 已提供所需 typed semantics；不存在必须先修 Copy/Export 才能证明 MR9 correctness 的 repository blocker。
- Implementation 仍应从 post-MR9 stable integration baseline 起步，以减少 `App.tsx`/terminal DOM overlap。若 privacy 被定义为 release blocker，也应作为独立 repair 在 release 前完成，而非伪装成 Thermal FX prerequisite。

## 13. Phase Gate

- Planning artifacts：`prd.md`、`design.md`、`implement.md`、本报告已形成。
- 未运行 `task.py start`。
- 未修改 production code。
- 未创建/切换 implementation branch 或 worktree。
- 未授予 Architecture PASS。
- 下一步仅等待 GPT Architecture Lead 进行 Planning Architecture Review。
