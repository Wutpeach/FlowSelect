# Repository State Consolidation — Phase 3 Disposition

## Checkpoint and fixed identity

This is a targeted disposition update using the completed repository research,
not a new architecture review. The current task remains `planning` until Lead
acceptance. After acceptance, Phase 3 is allowed to execute and close the
repository-state truth; Phase 4 main integration/merge remains excluded.

- Repository truth anchor: `origin/main@5619ba031163c3dab7071f67ad4739d49b1f095f`.
  Local `main@2b46f91496214a85162593557f38c04267524deb` is four commits ahead.
  `git diff 5619ba0..main -- src electron package.json package-lock.json` is
  empty, so the main-only delta is archive/journal state, not Product code.
  Combined normalized patch ID: `73a9a14891088e2df14cd296fdea06e72662f7e3`.
- Main-only truth: `94692a9` preserves the 31-path Paper archive at
  `.trellis/tasks/archive/2026-08/08-23-paper-official-source-level-adaptation-planning/`
  (patch `95fe4c6950d2749e78396751e95bb3af635f424d`); `a5db244` updates
  `.trellis/workspace/Mabel-WIN/index.md`/`journal-5.md` (patch
  `c66dd583f19e12c4432ecc785e3fc274b36c6a8e`); `0ef5238` preserves the
  684-path Ripple archive at
  `.trellis/tasks/archive/2026-08/08-23-mr9-ripple-motion-foundation-planning/`
  (patch `5508735cd0b5ec43fca285dce1237c1510e931d3`); `2b46f91` updates the
  same index/journal (patch `e577ecbf619640ec8990e2b67e1e136e23e0ed4a`).
  These remain reachable by starting the Phase 3 line at exact main.
- Immutable Product baseline: clean
  `motion/compact-mascot-visual@2bb9a221708c211bdec8721e02d0e469de44ef89`,
  patch `34281085cc4f8bcd047ce403c4421f61a288e9f6`.
- Accepted MR8 reference: clean
  `motion/presentation-integration@4de9c2edc74f8b2becd5f3b27a25f0e31dba4c14`,
  implementation `3a3aeb3b8d1660120b3eec398bdbe5fba5b4c60c`, patch
  `2ffa610d8cc3eabf03182812050885e578f6b93d`.

## Final disposition matrix

Every row has a final evidence disposition. “Preserve separately” means
recoverable historical ownership outside the Product/Phase 3 commit; “close”
means only after the specified canonical evidence is recorded.

| Evidence and exact identifiers | Primary disposition | Phase 3 closure rule |
| --- | --- | --- |
| `5619ba0`; main-only `94692a9`, `a5db244`, `0ef5238`, `2b46f91` and their paths/patches above | **Preserve in consolidation commit** | Start the isolated consolidation line at exact `main@2b46f91`; preserve these through ancestry. Never copy/replay archive or journal files and never start a main merge. |
| Active task files `.trellis/tasks/08-24-repository-state-consolidation/{task.json,prd.md,design.md,implement.md,implement.jsonl,check.jsonl,research/repository-disposition.md}` | **Preserve in consolidation commit** | Commit the reviewed Phase 3 plan, report, and manifests only after Lead acceptance, execution, and all gates. `task.json` is currently unchanged and remains `planning`. |
| Clean Compact Mascot `motion/compact-mascot-visual@2bb9a22`, patch `34281085...` | **Preserve separately as recoverable historical evidence** | Keep branch/worktree and exact commit clean/immutable. It is a Product reference only; no refactor or copy. |
| Accepted MR8 `4de9c2e` / `3a3aeb3`, patch `2ffa610...` | **Preserve separately as recoverable historical evidence** | Keep the semantic baseline available. Application/runtime authors `acceptedTraceId` on `video-queue-detail`; this is the authority used to supersede M3. |
| Root 22-path Trellis/tooling diff, normalized patch `55ff33a0c35a8b0ba68f431ba8aff79340e1ad96` | **Preserve separately as recoverable historical evidence** | Assign to separate tooling-maintenance ownership. Preserve exact dirty state; exclude from Phase 3/Product commits. Its ownership disposition is decided separately. `.trellis/.template-hashes.json` must not smuggle runtime/session, `__pycache__`, `.trellis/tmp`, or package-check outputs into Product. |
| Dirty M3 branch `cindy/auto-o3p8cr` at `342991724502ff067583d56fd877de9d1e536943`, worktree `.cindy-worktrees/auto-o3p8cr`, current raw patch `0da5bd7bddd5d3a812f66007f4a107a3a6945740`, task `08-11-m3-download-intake-motion-planning` (`in_progress`, `meta.paused=true`) | **Preserve separately as recoverable historical evidence** | First verify the 32-row raw-byte manifest `398c293e75c565cefde7da28c6583aa44d8926fcf63f850ca368aaa967026383` (16 tracked + 16 individual untracked) and make a raw snapshot commit on a dedicated non-Product historical line. Then add a separate disposition commit marking M3 superseded by accepted MR8 semantics. Historical `a543b0...` and CRLF-sensitive patch IDs are informational only; keep the original `.cindy-*` worktree untouched and never reintegrate M3 wholesale. |
| M3 tracked paths: `.trellis/spec/frontend/{component-guidelines,directory-structure,motion-guidelines,state-management}.md`, `electron/main.mts`, `src/App.tsx`, `src/architecture/import-guard.test.ts`, `src/features/download/{client.test,client,useDownloadQueue.test,useDownloadQueue}.ts`, `src/presentation/main-window/MainWindowPresentationSurface.tsx`, `src/protocol/download/ipcTypes.ts`, `src/types/electronBridge.ts`, `src/utils/centerOverlayState{.test.ts,.ts}` | **Preserve separately as recoverable historical evidence** | Include exactly in the raw M3 snapshot lineage, not in the Phase 3 consolidation line or Product ancestry. |
| M3 untracked paths: task `check.jsonl`, `design.md`, `implement.jsonl`, `implement.md`, `prd.md`, `research/current-download-intake-audit.md`, `task.json`; renderer `DownloadIntakeTransitionSurface.tsx`, `DownloadProgressSurface.tsx`, `downloadIntakeMotionRecipe{,.test}.ts`, `downloadIntakePresentation{,.test}.ts`, `interactionOrigin{,.test}.ts`, `useDownloadIntakePresentation.ts` | **Preserve separately as recoverable historical evidence** | Hash/path-verify before the raw snapshot commit; disposition metadata follows as a separate commit on the same non-Product line. |
| M3’s `queue_observer_bootstrap`, `bootstrap?: boolean`, durable `baselineTraceIds`, center fallback, ack reconciliation, and direct foreground events | **Safely superseded/close** | Record superseded-by-MR8 in the historical disposition only after raw evidence is recoverable. Do not treat the extra cross-layer implementation as an accepted Product direction. |
| Diagnostics candidate `b9ba0278d9f49d1831f5acbf813448072f53178b` is inherited by immutable Product `motion/compact-mascot-visual@2bb9a22`; repair-line `353a7984174a3d3d6e56a7944b7cb33b1ce5707f` has the same stable patch `e1f4967ec5a9f1ca8a60ec0a1d8e5dfc7f6a3264` (25 paths, 2081+/353-) | **Preserve b9ba027 as canonical Product truth; preserve 353a798 separately** | Close/supersede the duplicate against the Product pointer. Keep `353a798` recoverable, but do not reintegrate or duplicate Diagnostics code. |
| Diagnostics worktree `.cindy-worktrees/diagnostics-readability-export-cleanup`, branch `repair/diagnostics-readability-export-cleanup@353a798`; root task `08-18-diagnostics-readability-export-cleanup-planning` (`planning`) versus worktree task (`in_progress`) | **Preserve separately as recoverable historical evidence** | Close/align root and worktree task records against Product-canonical `b9ba027`, preserving the clean duplicate worktree/reports. Record the pointer before any archive/close operation. |
| Paper predecessor `92219275e07ebe2eca4b0f0486cb406faf0312c7`, patch `40dfeac6de5ec6cbec964b6b3fc74a5d704c7c83`, and archive `1ee927c` for `08-23-mr9-paper-official-heatmap-panel-interior-calibration` | **Preserve separately as recoverable historical evidence** | Retain unique predecessor research/reports, but align task truth to the final NO-GO outcome. |
| Paper worktree `motion/mr9-paper-heatmap-official-baseline@77eb5611178a06f7079db29563c9ef75197d7af8`, patch `11aceaa08bee8480a217e97afb406367360d48b1`; paths `src/lab/*`, `THIRD_PARTY_NOTICES.md` | **Exclude from Product** | Keep clean research branch/evidence recoverable. This Paper adaptation is research-only NO-GO and never enters Product presentation. |
| Active Paper tasks `08-23-mr9-paper-heatmap-official-component-source-fidelity-baseline` and `08-23-mr9-paper-heatmap-panel-mapping-comparison` (`in_progress`, reports `UNDECIDED`) | **Safely superseded/close** | Close/archive as final NO-GO using `77eb561` and canonical Paper archive evidence, while retaining each unique report/evidence file. Do not infer a Product choice from their old undecided wording. |
| Ripple `lab/mr9-ripple-source-fidelity@818057f664c7474ec1722b143fcc84dcf3ec67e9`, patch `ab8c42dc09a0869045fb485f87686c936aabd87b`; `src/lab/lab-main.tsx`, `src/lab/ripple/*`, `evidence/mr9-ripple/*`; archive `0ef5238` | **Exclude from Product** | Retain Lab feasibility PASS/STOP evidence and archive; no Lab/evidence path enters Product or is copied into main ancestry. |
| Root MR8 duplicate task `08-14-mr8-download-intake-reveal-planning` (`planning`) versus completed archive `4c43c08` and implementation `3a3aeb3` | **Safely superseded/close** | Use the completed candidate archive as canonical; close/archive the duplicate while retaining any unique notes. |
| Empty task directories `.trellis/tasks/08-23-agentation-integration-planning` and `.trellis/tasks/08-23-compact-mascot-visual-planning` | **Safely superseded/close** | Verify they remain empty and have no unique evidence, then remove/close only during the accepted Phase 3 execution. No cleanup occurs in this correction. |
| `.cindy-worktrees/` (~5.79 GB/156,157 files), `.cindy-upstream/bible-strong-avatar-lab-175691a`, `spike-package-output` (~431 MB), `agentation-placement-package-output` (~431 MB), `.trellis/.runtime`, `.trellis/tmp`, `__pycache__`, logs, generated packages | **Exclude from Product** | Leave untouched. Never stage, copy, commit, clean, or delete these operational artifacts in Phase 3. |

## MR8 comparison used for M3 closure

Accepted MR8 authors `acceptedTraceId` at the Application/runtime boundary for
`video-queue-detail` in `src/electron-runtime/service.ts:585,592,957-963`,
`src/protocol/download/ipcTypes.ts:68`,
`src/features/download/client.ts:62,162-164`,
`src/features/download/useDownloadQueue.ts:245-255,309-319`,
`src/presentation/main-window/downloadIntakePresentation.ts:137-219`, and
`src/App.tsx:439-444,572-574`. M3’s observer bootstrap and expanded
cross-layer state are therefore historical superseded direction, not Product
architecture input.

## Exact Phase 3 execution order

1. After Lead acceptance, activate this task and dispatch `develop`. Before any
   mutation, snapshot refs, statuses, worktree locations, task records, exact
   hashes, and the root dirty-state summary. Confirm no active task or
   operational artifact is silently missing.
2. Freeze M3 source `.cindy-worktrees/auto-o3p8cr` at branch
   `cindy/auto-o3p8cr`/HEAD `3429917...`; record current raw patch
   `0da5bd7...`, exact 16 tracked paths, exact 16 individual untracked paths,
   and the manifest. Create a separate historical worktree from that HEAD,
   materialize the 32 entries, compare the aggregate/hash manifest, and commit
   the raw snapshot on a non-Product branch.
3. On that historical line, add and commit a disposition record marking M3
   superseded by accepted MR8 semantics, pointing to the raw snapshot, and
   stating no wholesale reintegration. Keep the original `.cindy-*` worktree
   unchanged; the snapshot is additive, not cleanup.
4. Create a clean consolidation worktree/branch from exact
   `main@2b46f91496214a85162593557f38c04267524deb`. Preserve `5619ba0`
   ancestry; do not use the dirty root or research worktrees.
5. In the consolidation line, apply canonical closure records in order: MR8
   duplicate to completed archive; Paper active tasks to final NO-GO; Diagnostics
   root/worktree records to Product-canonical `b9ba027` while retaining duplicate
   `353a798`; M3 task pointer to its historical snapshot; Ripple and operational
   exclusions. Keep unique evidence paths.
6. Stage only the active task/research files and specific task/archive closure
   metadata. Inspect the staged name list; no Product/source, root tooling,
   `.cindy-*`, package, runtime/temp/cache/log, Lab, or implementation path is
   allowed.
7. Validate ancestry, hashes, patch IDs, status ownership, JSON/JSONL, scoped
   `git diff --check`, clean baselines, and empty Product-path diff. Confirm
   `b9ba027` is the Product pointer and `353a798` remains excluded duplicate
   evidence. Commit one Phase 3 consolidation commit only after all gates pass.
8. Run the completion/archive workflow for this active task only after the
   commit and validation pass. Record the commit and leave Phase 4 main
   integration/merge as an explicit future handoff.

## Recovery gates

- If M3 hash/path comparison fails, stop before the raw snapshot commit and
  leave the source worktree untouched. If the raw snapshot already committed,
  retain it and stop before the disposition/closure commit.
- If any consolidation staged path escapes the allowlist, stop before commit;
  do not reset the shared root or clean the source worktrees.
- If `5619ba0` ancestry, exact main parent, baseline cleanliness, canonical
  patch IDs, unique evidence, or final NO-GO/Diagnostics/M3 pointers cannot be
  verified, stop and keep the task active rather than marking it complete.
- If a gate fails after a Phase 3 commit, revert only the isolated Phase 3
  line according to the recorded commit, preserve the M3 raw snapshot and all
  evidence, and do not merge to main. Phase 4 is not a rollback action.

## M3 frozen-state identity (read-only, 2026-08-24)

The previous review recorded tracked patch ID `a543b0fb53b858f1a26ff870c42a3df94297e652`.
That ID does not reproduce from the current frozen worktree. The following
commands were run without changing M3:

```text
git -C .cindy-worktrees/auto-o3p8cr rev-parse HEAD
  342991724502ff067583d56fd877de9d1e536943
git -C .cindy-worktrees/auto-o3p8cr branch --show-current
  cindy/auto-o3p8cr
git -C .cindy-worktrees/auto-o3p8cr diff --binary --no-ext-diff --no-textconv HEAD -- |
  git -C .cindy-worktrees/auto-o3p8cr patch-id --stable
  0da5bd7bddd5d3a812f66007f4a107a3a6945740 0000000000000000000000000000000000000000
```

The raw stable ID is therefore `0da5bd7bddd5d3a812f66007f4a107a3a6945740`.
For diagnosis, the same current bytes produced `64ec269dd8d29cba62eccd3765a08d4509c66803`
with `patch-id --unstable`, `cce8e9c6f749c7b8717f11a142a34031e5625867` with
`diff --ignore-space-at-eol`, `eef20248947c7d9cb5f3df91b73e6ebb3ee5c25b`
with `--ignore-space-change`, and `dc3144ccb813496f54528565b2328bb9b5fa6cd4`
with `--ignore-all-space`. Raw stable IDs from `-- .`, the explicit 16-path
list, directory pathsets, and reverse path order all reproduced `0da5bd7...`.
The intentionally narrower `-- src electron` pathset omitted the four
`.trellis/spec/frontend` files and produced `a7e08b1917d22fa02a55b325cda1fb822bb5a565`;
it is not an equivalent identity. No complete current-state command reproduced
`a543b0...`.

The worktree has `core.autocrlf=true` from
`C:/Program Files/Git/etc/gitconfig`; `core.eol`/`core.safecrlf` have no local
value, and `.gitattributes` has no EOL rule for these M3 paths. `git
ls-files --eol` reports three changed spec files as `i/mixed w/lf`, ten changed
files as `i/lf w/lf`, and six changed source files as `i/lf w/crlf`. Git emits
“LF will be replaced by CRLF” warnings for the affected paths, while
`git diff --check -- .` exits `0`. This proves the patch ID is sensitive to
command/normalization form in this worktree; the available evidence does not
reproduce the old `a543b0...` command or prove that it represented these exact
bytes. It is retained as an informational historical ID only, not an execution
gate.

Two consecutive read-only snapshots returned the same HEAD, branch, 32-line
status, and 32-entry byte manifest (`manifest-identical=True`,
`status-identical=True`, `head-identical=True`). This rules out mutation during
the inspection. The authoritative frozen identity is now the raw-byte manifest
below, not a patch ID.

### Porcelain versus individual-file counts

`git status --porcelain=v1` returned 26 rows: 16 tracked ` M` rows and 10
top-level `??` rows. The 10 untracked top-level rows are the M3 task directory
plus these nine renderer files:

```text
.trellis/tasks/08-11-m3-download-intake-motion-planning/
src/presentation/main-window/DownloadIntakeTransitionSurface.tsx
src/presentation/main-window/DownloadProgressSurface.tsx
src/presentation/main-window/downloadIntakeMotionRecipe.test.ts
src/presentation/main-window/downloadIntakeMotionRecipe.ts
src/presentation/main-window/downloadIntakePresentation.test.ts
src/presentation/main-window/downloadIntakePresentation.ts
src/presentation/main-window/interactionOrigin.test.ts
src/presentation/main-window/interactionOrigin.ts
src/presentation/main-window/useDownloadIntakePresentation.ts
```

`git status --porcelain=v1 --untracked-files=all` returned 32 rows: the same
16 tracked rows plus 16 individual untracked files. The authoritative
individual-file count and list come from
`git ls-files --others --exclude-standard`, which returned exactly 16 files.

### Raw-byte manifest and hard gate

Each row is `kind|path|bytes|SHA256`, where `kind=T` is tracked dirty and
`kind=U` is untracked. SHA-256 is computed over raw worktree bytes with
PowerShell `Get-FileHash -Algorithm SHA256`; no Git EOL filter is applied. The
canonical manifest is the lexicographically sorted rows joined with a single
LF and a final LF, UTF-8 encoded. Its SHA-256 is
`398c293e75c565cefde7da28c6583aa44d8926fcf63f850ca368aaa967026383`.
The read-only PowerShell recipe is:

```powershell
$m3 = 'D:\Ameow\.cindy-worktrees\auto-o3p8cr'
$tracked = @(git -C $m3 diff --name-only -- .)
$untracked = @(git -C $m3 ls-files --others --exclude-standard)
$rows = foreach ($entry in @(@('T', $tracked), @('U', $untracked))) {
  foreach ($path in @($entry[1])) {
    $full = Join-Path $m3 $path
    $item = Get-Item -LiteralPath $full
    $hash = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant()
    "$($entry[0])|$path|$($item.Length)|$hash"
  }
}
$canonical = (($rows | Sort-Object) -join "`n") + "`n"
$bytes = [Text.Encoding]::UTF8.GetBytes($canonical)
$sha = [Security.Cryptography.SHA256]::Create()
try { ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
finally { $sha.Dispose() }
```

```text
T|.trellis/spec/frontend/component-guidelines.md|13821|a80d3b832cfe34ee8d30dfbfd7ef0d12d059afd859c04910d2908e637e24e521
T|.trellis/spec/frontend/directory-structure.md|6222|51200c006638ed57538a36dff492c45c636424e5f4c8d3159ab4451a43e17fbd
T|.trellis/spec/frontend/motion-guidelines.md|44998|30e25a3913e61e17e509af6e2f9aaf5640310e38446629f8dbe7e6e6e6d512d8
T|.trellis/spec/frontend/state-management.md|21277|f6a2acf3abc8735000d8ede3d3dcbfb08d4531d9c594adede549ba650669be03
T|electron/main.mts|116201|25b87d068b02f1de9f5bead13e742e1792fe70e952f872b6320c7778de292080
T|src/App.tsx|165355|91122cccf7710c0490d7b5b5794edcc6b4802c3e2fc02c6c1107f843cbafe859
T|src/architecture/import-guard.test.ts|40901|413b07016a0f4053f258473820125b8becc02bee3142b2214bdb1c062212c39e
T|src/features/download/client.test.ts|10070|75860cd8dd0697e867d67223ed8bd0aadb2f60b082cf3f39017e7fac6d41ebe8
T|src/features/download/client.ts|8141|5803d90fc604140cd81508ffe24f27f04a866acfeadcda46b1fc0c543bdacbc9
T|src/features/download/useDownloadQueue.test.ts|19976|88bb4cb50e22f78e0901293032eb0e2d1b9d2ca1f40e7b09ab51bd3a7dcbaac1
T|src/features/download/useDownloadQueue.ts|12223|3cd47c9db90c9ccdbf63acd5b26298051c77ca6e7e030c527b03cb499bec38c8
T|src/presentation/main-window/MainWindowPresentationSurface.tsx|40258|6e694dc8adaf68ebb2d5220f4d2a3983841558e44594c721440c9af3cdfe030f
T|src/protocol/download/ipcTypes.ts|4851|445a642154ea7c9cfc0cf80927f053f4aaae4847fbda31c61398378e7d6bcc1b
T|src/types/electronBridge.ts|6887|1d1f49b1fac147d3c82fe4d167604c8efc9c61205d4883d00dd503437dd959e9
T|src/utils/centerOverlayState.test.ts|6885|c37a8920884491d8985d7f055260e3965f8e3a92ba6fa8eaa05cd5d97db66927
T|src/utils/centerOverlayState.ts|7238|2cb5c0866f26ca9d8f13d836164bfb15497fda6e187d04f69295cd71b7c9882e
U|.trellis/tasks/08-11-m3-download-intake-motion-planning/check.jsonl|1004|06e437246af1e6c4186d64e3346c32bb13321295ba3dd2aa63818afa160f7b03
U|.trellis/tasks/08-11-m3-download-intake-motion-planning/design.md|23457|aa0e03f68c55dc3f2d51beb51e507ab9555d988bd08551448abf8cc917b78006
U|.trellis/tasks/08-11-m3-download-intake-motion-planning/implement.jsonl|1113|d016cf37d09df2ca070eedbcacd576f82f3de749558c19b4531e31be28fcbf7e
U|.trellis/tasks/08-11-m3-download-intake-motion-planning/implement.md|16803|4f2550145e3489c02a3e6cee743c686b51211914d56f4495d06b07ac7c276ac3
U|.trellis/tasks/08-11-m3-download-intake-motion-planning/prd.md|14666|7f7d5488ec38950d9bd66d96bc6d37becf8089b81bed32b5951c8355a07c8952
U|.trellis/tasks/08-11-m3-download-intake-motion-planning/research/current-download-intake-audit.md|15264|2feec66e88478712be399c2dd19d36efc4e5d286b2099ac39c61873cb74658fa
U|.trellis/tasks/08-11-m3-download-intake-motion-planning/task.json|1017|b3b414e8a1a944648078c349cef2d683a91c9a116d23a503147a884a42f1df46
U|src/presentation/main-window/DownloadIntakeTransitionSurface.tsx|11343|f7a7c8c983fc6c429205663038ea4545b4008f94d053c9aa95b898e3acc80d0d
U|src/presentation/main-window/DownloadProgressSurface.tsx|4016|2bfb65c2643132b534bf8e379b959c1708c94d218d2db554f80f88b2121bd7a2
U|src/presentation/main-window/downloadIntakeMotionRecipe.test.ts|6394|b945155a8f7114a64dac0338a243b59fbfb6e31d32a5a09205cf74dd5a17e631
U|src/presentation/main-window/downloadIntakeMotionRecipe.ts|6091|f8d3ab4b9b167042281cccf7d5ff9ea1f988512f6d32dfe7c0270af0ce72db8a
U|src/presentation/main-window/downloadIntakePresentation.test.ts|15565|0b3733c741fd108c1c6aa634410b13c343698ec5c81d36e7a5740d992465a6cf
U|src/presentation/main-window/downloadIntakePresentation.ts|11210|c6712f171bee50fca8c725e7b59c4ee5c7fefd2d43304ef969fe703546b79803
U|src/presentation/main-window/interactionOrigin.test.ts|4006|ce5b65795d491623a1ee061acf146c41a64c61efacf59558a666dc0ae9a0e803
U|src/presentation/main-window/interactionOrigin.ts|3520|d0f644a985dcb65d4f93d28dc6b3fbf3e1036dd58a9cb409b90a985ee829cd3f
U|src/presentation/main-window/useDownloadIntakePresentation.ts|5668|22889ca5e931a1ceb40f48c192bb5918d77026f356a2221a994e5fe9e048b8f3
```

Develop must verify this exact 32-row manifest and its aggregate
`398c293e...` before staging the raw M3 snapshot. The raw patch ID
`0da5bd7...` and historical `a543b0...` remain informational diagnostics only;
an EOL/patch-ID mismatch must not block a byte-identical manifest match.
