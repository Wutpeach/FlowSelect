# Plan P2-B managed yt-dlp release stage-only

## Goal

在 P2-A immutable bundled baseline 与 attempt runtime pinning 的既有契约上，规划一条 Ameow-owned 的 managed yt-dlp release 获取、验证、immutable staging 与 bounded eligibility probe lifecycle。P2-B 的唯一可观察产物是 staged candidate 或 eligible candidate；bundled baseline 继续是唯一 effective runtime candidate。

## Background

- P2-A 已建立 immutable bundled baseline、canonical manifest/package-set authoring 与 attempt-scoped runtime binding。
- P2-B 只建立 candidate acquisition/staging/eligibility 事实，不建立 active selection。
- P1 Diagnostics 只允许只读观察，查询不得触发任何网络或 candidate lifecycle side effect。

## Confirmed Planning Decisions

- Runtime approval truth 是 app-packaged Ameow managed-release allowlist；upstream metadata 只在 release preparation 中作为 evidence。
- bundled baseline pin 继续由 `managedPythonPackageManifest.mts` 单独 author；managed allowlist 不在 runtime code 中复制版本 pin，并与 baseline 复用 canonical package-set schema/identity/verifier。
- candidate storage、catalog 与 eligibility evidence 全部 target-scoped；committed directory immutable，eligibility 为独立原子 catalog fact。
- network temp 下载/字节校验不持有 runtime mutation；materialization、staged commit 与 bounded probe 在同一个 existing `runMutation` 内完成。
- P2-B command 语义为显式 `stage_managed_ytdlp_release`，无 `update`/activation 暗示；Diagnostics 只读 persisted facts。

## Requirements

1. 规划 managed release metadata / allowed-release 的单一 authority，明确 upstream discovery evidence 与 Ameow approval policy 的边界。
2. 定义 candidate 的最小 immutable identity，包括版本、package-set、target compatibility、provenance 与 bytes identity；不同 bytes 不得复用同一 identity 或原地更新 candidate directory。
3. 定义 download → temporary → integrity/authenticity verification → immutable staging → eligibility probe → eligible 的生命周期与原子 commit point。
4. 定义 partial、failed、corrupt、hash-mismatch、unsupported、package-mismatch、probe-failed、quarantined 与 duplicate release 的状态及持久化语义。
5. managed package set 必须覆盖 yt-dlp 运行契约所需的 app-approved dependencies，并继续排除 `ejs:github`、machine JS fallback、user plugins、machine pip、runtime self-update 与其他未纳入 identity 的 dependency authority。
6. eligibility probe 必须使用 bundled Python 与 app-owned FFmpeg、FFprobe、Deno，并在现有 runtime lifecycle / lease boundary 下 bounded 执行，不运行用户下载、不改变 active runtime、不破坏 active process-tree dependency stability。
7. P1 Diagnostics 只能观察已持久化 candidate facts；观察不得触发 discovery、network check、download、verification、staging 或 probe。
8. P2-B 必须与 Download Runtime / Orchestrator authority 分离；任一 candidate failure 不得影响 bundled baseline、active downloads、attempt binding 或现有 runtime dependency binding。
9. 仅定义 P2-C 将来 activation 所需的最小 eligible-candidate contract；不得提前实现或建模 selection、activation、rollback、automatic fallback、GC、Repair Center、universal backend updater、`previous`、generation 或 rollback history。
10. 评估 P2-A canonical manifest/package-set model、现有 network/asset acquisition、lifecycle coordinator 与 immutable staging 对 P2-B 的适配性，并明确 implementation blocker。
11. 保留 P2-A external release gates：clean-host Windows Electron Builder、Windows default-userData、portable replacement retention、successful live EJS challenge、macOS arm64 fresh quarantine/offline baseline/Gatekeeper；除非 P2-B 设计直接改变风险，不重新调查或扩大这些 gates。

## Acceptance Criteria

- [x] Planning report 明确回答 release discovery / approval 的 single source of truth，以及 upstream metadata、PyPI、GitHub 各自只能作为 evidence 还是可进入 Ameow-approved truth。
- [x] Planning report 明确回答 allowed release 判定、immutable candidate identity、package-set/Python/target/Deno-EJS eligibility 输入。
- [x] Planning report 明确回答 temporary 与 final staged commit point、各类失败与 duplicate release 的表示和持久化。
- [x] Planning report 明确 eligibility probe 能证明与不能证明的范围。
- [x] Planning report 明确 staged/eligible candidate 对 bundled baseline、attempt binding 与 runtime lifecycle 的单向 dependency direction。
- [x] Planning report 明确 P1 Diagnostics 的安全只读 candidate facts。
- [x] Planning report 明确 P2-C 最小稳定 contract 与必须延期的概念。
- [x] Planning report 以仓库路径/符号/行号区分 repository facts 与 design recommendations，并判断当前 blocker。
- [x] `design.md` 给出最小、stage-only、无 activation path 的技术设计；`implement.md` 给出未来 P2-B 的最小执行与验证清单。
- [x] 本任务停止在 Planning；不运行 `task.py start`，不修改 product code，不授予 Architecture PASS。

## Out of Scope

- managed candidate 参与真实 download attempt 或成为 active runtime。
- selection、activation、rollback、automatic fallback、GC、Repair Center、universal backend updater。
- 用户 URL、machine pip、runtime self-update、未经批准的 upstream metadata 取得安装 authority。
- 用户下载、release gate 重验或 P2-A external release gates 的扩展。
