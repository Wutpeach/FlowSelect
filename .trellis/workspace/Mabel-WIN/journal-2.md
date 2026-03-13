# Journal - Mabel-WIN (Part 2)

> Continuation from `journal-1.md` (archived at ~2000 lines)
> Started: 2026-03-12

---



## Session 51: Bump version to 0.2.6 and package portable

**Date**: 2026-03-12
**Task**: Bump version to 0.2.6 and package portable

### Summary

Used npm run version:set -- 0.2.6, built local portable package FlowSelect_0.2.6_x64_portable.zip, and verified lint/type-check/test pass.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `c4cac90` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 52: Release prep workflow: scaffold notes after version bump

**Date**: 2026-03-12
**Task**: Release prep workflow: scaffold notes after version bump

### Summary

Extended version:set to scaffold release-notes/v<version>.md, documented the release-prep flow in Trellis, and reduced duplicate release docs by pointing to a single canonical guide.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `305319c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 53: Prepare public repository release

**Date**: 2026-03-13
**Task**: Prepare public repository release

### Summary

Trimmed private workflow files from the public repo, added MIT license and release-note guidance, rewrote Git history in a cleaned mirror, force-pushed rewritten refs, validated builds/tests/sidecar packaging, and switched the GitHub repository visibility from private to public.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `e961e5c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 54: Align main with origin and keep ace-tool ignore

**Date**: 2026-03-13
**Task**: Align main with origin and keep ace-tool ignore

### Summary

Aligned local main to origin/main, restored and committed .gitignore update to ignore .ace-tool/, and verified CI workflow state.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `449c926` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 55: Implement runtime sidecar manifest publish pipeline

**Date**: 2026-03-13
**Task**: Implement runtime sidecar manifest publish pipeline

### Summary

Added runtime sidecar publish workflow + manifest generation/validation schema/docs, verified workflow run succeeded, and aligned branch/push cleanup.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `5c5097c` | (see git log) |
| `449c926` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 56: Runtime dependency gate scaffold and settings integration

**Date**: 2026-03-13
**Task**: Runtime dependency gate scaffold and settings integration

### Summary

Added runtime dependency snapshot + gate-state commands/events in Rust, integrated runtime diagnostics card in Settings, and synced EN/ZH locale keys with resource mirrors.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `c7bddc6` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 57: Main UI runtime gate prompt and task linkage

**Date**: 2026-03-13
**Task**: Main UI runtime gate prompt and task linkage

### Summary

(Add summary)

### Main Changes

- Linked the main window to runtime dependency status and gate state commands/events.
- Added an inline runtime prompt that reacts to checking, awaiting approval, downloading, blocked, failed, and missing states.
- Wired prompt emphasis to queue/task presence so missing runtime issues surface when work arrives.
- Added localized app-level runtime prompt copy in both source locales and generated mirrors.
- Verification already completed in this session: npm run lint, npm run typecheck, npm test, npm run build.


### Git Commits

| Hash | Message |
|------|---------|
| `143f287` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 58: Managed Pinterest runtime bootstrap for portable builds

**Date**: 2026-03-13
**Task**: Managed Pinterest runtime bootstrap for portable builds

### Summary

(Add summary)

### Main Changes

- Implemented managed pinterest-dl bootstrap under app_config_dir/runtimes with manifest fetch, target selection, checksum validation, and atomic install.
- Switched Pinterest runtime resolution and download gating to the managed runtime path; portable builds no longer bundle pinterest-dl.
- Simplified runtime gate UX to forced auto-hydration plus retry, and updated runtime/pinterest downloader copy and types.
- Fixed runtime-sidecars manifest generation so empty --min-app-version is not mis-serialized as "true".
- Verified with cargo check, cargo test, npm run typecheck, npm run lint, npm test, npm run build, and portable packaging script.
- Confirmed runtime-sidecars-manifest-latest was republished remotely with minAppVersion=0.2.6 and local bootstrap can now download successfully.


### Git Commits

| Hash | Message |
|------|---------|
| `206ce69` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 59: Managed deno runtime bootstrap

**Date**: 2026-03-13
**Task**: Managed deno runtime bootstrap

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Runtime | Added managed `deno` bootstrap with pinned Deno 2.7.1 assets, size/checksum validation, archive extraction, atomic install, and same-run retry handling. |
| Packaging | Removed bundled `deno` from portable packaging and Tauri bundled resources while keeping bundled `yt-dlp`. |
| Download Flow | Ensured yt-dlp JS-runtime paths bootstrap managed `deno` before selection probe, slice-cache download, and normal yt-dlp download execution. |
| Diagnostics | Added `deno_path` to support-log downloader diagnostics. |

**Verification**
- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `npm run type-check`
- `cargo test --manifest-path src-tauri/Cargo.toml select_deno_runtime_artifact_spec_matches_current_target`
- `cargo test --manifest-path src-tauri/Cargo.toml runtime_dependency_missing_components_collects_missing_ids`


### Git Commits

| Hash | Message |
|------|---------|
| `e841133` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 60: Portable runtime flash fixes and polish

**Date**: 2026-03-13
**Task**: Portable runtime flash fixes and polish

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Highest download preflight | Moved YouTube `highest` cookie strategy from mid-flight yt-dlp restart to a preflight probe so the real download starts only once. |
| Preference sync hardening | Made extension download-preference sync bootstrap eagerly on connect/startup so first download is less likely to use stale quality settings. |
| Windows cancel flash | Routed Windows cancel-time `taskkill` / `tasklist` process commands through the hidden CLI configuration to remove the remaining cancel flash. |
| Success indicator | Improved the runtime success indicator exit behavior in the desktop UI. |

**Verification**:
- `npm run lint`
- `npm run type-check`
- `npm run test`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`
- Rebuilt portable artifact and user confirmed cancel no longer flashes on Windows

**Commits**:
- `9f3e7dd` `fix(runtime): preflight highest download retries`
- `2861684` `fix(runtime): hide cancel process commands`
- `c1852b7` `fix(runtime): improve success indicator exit`


### Git Commits

| Hash | Message |
|------|---------|
| `9f3e7dd` | (see git log) |
| `2861684` | (see git log) |
| `c1852b7` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
