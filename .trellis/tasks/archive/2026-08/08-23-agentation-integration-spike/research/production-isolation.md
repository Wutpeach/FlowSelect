# Agentation Production Isolation Evidence

Evidence date: 2026-08-23  
Patterns: `agentation`, `data-agentation`, `feedback-annotations-`, `Start feedback mode`, `Copy feedback`, `PolyForm-Shield`

## Production renderer and Electron outputs

`npm run build` completed successfully.

| Artifact | Files | Bytes | Identifier content hits | Filename hits |
| --- | ---: | ---: | ---: | ---: |
| `dist/` | 5 | 2,835,317 | 0 | 0 |
| `dist-electron/` | 150 | 788,953 | 0 | 0 |

The production Vite output remained rooted at `index.html`; no Lab or Agentation asset was emitted.

## Windows unpacked package

The normal `npm run package:win:dir` path reached electron-builder twice but Windows returned `EPERM` while renaming `dist-release/win-unpacked.tmp` to `win-unpacked`. The same build inputs, builder config, platform, architecture, and `--dir` target succeeded when only the output directory was overridden to the shorter `D:\Ameow\spike-package-output` path.

Artifact: `D:\Ameow\spike-package-output\win-unpacked`

| Check | Result |
| --- | --- |
| Total files | 3,810 |
| Total bytes | 430,973,566 |
| Text artifacts scanned | 450 |
| Identifier content hits | 0 |
| Filename hits | 0 |
| `resources/app/node_modules/agentation` | absent |
| `Ameow.exe` | present |
| `resources/app/dist/index.html` | present |
| `.asar` files | 0 |

The repository builder config has `asar: false`, so there is no asar to extract or scan. The real unpacked `resources/app` tree is the production package payload and passed the raw artifact scan.

Static source assertions remain supplementary; the conclusions above come from built and packaged artifacts.

## Final placement repair revalidation

Revalidated on 2026-08-23 after the Lab-only placement repair.

- `npm run build` again produced 5 `dist/` files (2,835,317 bytes) and 150 `dist-electron/` files (788,953 bytes), with 0 identifier-content and 0 filename hits in both outputs.
- The known worktree `dist-release` rename `EPERM` reproduced. Direct electron-builder invocation used the same config, build, platform, architecture, and `--dir` inputs with only `directories.output` changed to `D:\Ameow\agentation-placement-package-output`.
- The fresh `win-unpacked` contained 3,810 files / 430,973,566 bytes and 451 text artifacts. An all-file identifier scan and relative filename scan both returned 0 hits.
- `resources/app/node_modules/agentation` was absent; `Ameow.exe` and `resources/app/dist/index.html` were present; `.asar` count remained 0 because `asar: false` is unchanged.
