# MR9 implementation validation

Date: 2026-08-15 (Asia/Shanghai)

Worktree: `D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx`

Baseline: `motion/presentation-integration` at `4de9c2e`

## Review status

| Item | Status |
| --- | --- |
| Core Architecture | **PASS preserved**. The isolated-runtime repair is validation-environment work only; it changes no MR9 architecture or product source. |
| Implementation commit | `c762c1437047372802a077e576db89176d1e95b2` (`c762c14` short). |
| Task lifecycle | Remains `in_progress`; no final PASS, archive, merge, or commit is implied by this record. |

## Automated evidence

| Command | Result |
| --- | --- |
| Focused MR9 Vitest paths | PASS, 15 files / 229 tests |
| `npm run type-check` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run docs:build` | PASS |
| `git diff --check` | PASS; repository CRLF conversion warnings only |
| `npm test` | 1640 passed / 1 failed. The same `browser-extension/architecture-guard.test.js:277` source-shape assertion fails unchanged on the clean MR8 integration baseline; MR9 has no browser-extension listener diff. |

Focused coverage proves accepted-marker pairing and malformed/unpaired-sidecar rejection, controller absent-before/present-after membership proof, immutable paste-time Pointer Field snapshots, neutral-center fallback, Folder-success-only activation, Terminal absence from Expanded targets, one canvas/program/draw contract, immediate downward/replacement progress behavior, bounded activation scheduling, stale-frame rejection, protected-control stacking, the reviewed six-role palette, and static Reduced Motion.

## Windows Electron/WebGL

`run-mr9-windows-validation.mjs` now targets the MR9 uniforms and real UI boundaries. Against an Electron renderer on CDP port 9333 it exercises:

- paste with a live in-surface pointer and paste without one;
- URL drop and Browser Extension center fallback;
- one canvas/WebGL2 program, immutable origin uniforms, normal-motion thermal occlusion, and protected cancel stacking;
- Reduced Motion static time/non-occluding stacking;
- WebGL context loss/restoration;
- a real screenshot at `research/mr9-windows-electron.png` when the run succeeds.

The harness and its validation-only delayed downloader helper syntax/build successfully. CDP port `9333` remains unavailable in this environment, so its renderer-uniform, pixel, context-loss, and media-emulation probes have not run. A separately launched native Electron session was observed with durable file-backed output, then ended before final status synthesis; no cause is inferred and no live native manual session is currently available.

## Windows isolated-runtime closure delta (2026-08-15)

| Area | Status | Evidence / scope |
| --- | --- | --- |
| Native Electron launch | **VERIFIED (recorded) / STOPPED (current)** | Electron PID `9964` was responsive (`Ameow`) when observed; Vite PID `27428` listened on `127.0.0.1:1420` and Electron owned extension WS `127.0.0.1:39527`. At final status check, no Ameow main process or port `39527` listener remained; Vite `27428`/`1420` remained. No cause is inferred. CDP was not enabled. |
| EPIPE | **VERIFIED (recorded)** | File-backed Electron/Vite stdout and stderr resolved the prior closed-pipe failure for the recorded native session: no `EPIPE` appeared in its Electron logs and stderr was empty. This is not a claim about a live Electron process. |
| First isolated-runtime blocker: yt-dlp | **VERIFIED** | A profile-local `yt-dlp.exe --version` alone was insufficient: missing/mismatched metadata caused `ensureManagedYtDlpRuntimeReady` to preflight bundled Python and spawn the missing dev resolver path. The exact resolver target is now a test-only junction at `D:/Ameow/.cindy-worktrees/desktop-assets/binaries/python-x86_64-pc-windows-msvc` to the repository bundled-Python asset; it reports Python `3.11.15`. A complete pinned managed yt-dlp tree was copied read-only from the real profile into the isolated profile, with only disposable metadata adjusted to the isolated entrypoint/resolver. |
| Second isolated-runtime blocker: ffmpeg / deno | **VERIFIED** | Resolver-created empty directories were insufficient. Complete already-managed ffmpeg/ffprobe and deno trees were copied read-only into the same isolated profile. No package, runtime, or media download occurred. |
| Full yt-dlp binding gate | **VERIFIED** | A faithful no-network binding harness ran the production sequence `ensureManagedYtDlpRuntimeReady` → `ensureManagedFfmpegRuntimeReady` → `ensureManagedDenoRuntimeReady` with the same Electron environment inputs. All returned without bootstrap logs or network calls. Resolved commands executed harmless version checks: yt-dlp `2026.07.04`; ffmpeg `8.0.1`; ffprobe `8.0.1`; deno `2.7.1`. |
| Post-gate engine-dispatch seam | **PARTIAL** | The controlled binding harness reached its post-gate dispatch sentinel. It intentionally did not start the real download engine, make a network request, or download media; actual queue/engine execution therefore remains unjudged. |
| gallery-dl isolated runtime | **NOT VERIFIED** | A Pinterest/gallery-dl task entered bootstrap and failed with `ENOENT` because the isolated profile does not provision gallery-dl. This is separate from the verified yt-dlp binding gate and is not attributed to yt-dlp version, MR9 visuals, or MR9 architecture. No gallery-dl repair was performed. |
| Full test suite | **PARTIAL** | `1640 passed / 1 failed`; the unchanged `browser-extension/architecture-guard.test.js:277` source-shape assertion reproduces on the clean MR8 baseline and is not attributed to MR9. |
| CDP harness / visual pixels | **BLOCKED** | The existing harness requires CDP `9333`; the permitted native session has no renderer-inspection endpoint. Syntax and automated coverage are not visual proof. |

Runtime/log evidence (outside the repository so task artifacts remain intact):

- Isolated profile: `C:/Users/Administrator/AppData/Local/Temp/ameow-mr9-validation-appdata-lead/ameow`
- Historical Electron stdout/stderr from the recorded session: `C:/Users/Administrator/AppData/Local/Temp/ameow-mr9-validation-appdata-lead/session-logs/20260815-224755/`
- File-backed Vite stdout/stderr: `C:/Users/Administrator/AppData/Local/Temp/ameow-mr9-validation-appdata-lead/session-logs/20260815-222729/`
- Isolated app runtime log: `C:/Users/Administrator/AppData/Local/Temp/ameow-mr9-validation-appdata-lead/ameow/logs/runtime-latest.log`

## Download Runtime Repair / Manual Acceptance Gate (2026-08-16)

This section is the authoritative final runtime-repair delta and supersedes earlier intermediate status rows above where they conflict.

| Area | Final functional status | Evidence / scope |
| --- | --- | --- |
| Root cause | **CONFIRMED** | The real Electron queue reached the yt-dlp engine attempt, then `spawn` failed with `ENOENT` for `D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx/desktop-assets/binaries/python-x86_64-pc-windows-msvc/python.exe`. The standard dev resolver was correct; the ignored bundled-Python asset directory was absent at the nested worktree-local candidate. The existing parent-level junction was not a candidate for this worktree. |
| Validation repair | **APPLIED outside product source** | A worktree-local validation-only junction now maps `D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx/desktop-assets/binaries/python-x86_64-pc-windows-msvc` to `D:/Ameow/desktop-assets/binaries/python-x86_64-pc-windows-msvc`. It reports Python `3.11.15`. The existing parent-level junction remains. No Product, Motion, Presentation, or runtime-resolution source was changed. yt-dlp remains pinned at `2026.07.04`. |
| Paste with local pointer | **DOWNLOAD PASS; visual origin remains for manual confirmation** | The completed three-case run produced 19 authoritative progress events, reached 100%, wrote a 4 MiB media file, emitted success, rendered real determinate Circular Progress, and ended with `uActivationKind = 0`. That run sampled origin about `(0.257, 0.744)`. A later repeat again completed the real download successfully, but sampled center origin and intentionally stopped on the harness's visual assertion; no architecture or visual tuning followed. |
| Paste center fallback | **PASS** | 19 authoritative progress events, 100%, 4 MiB output, successful terminal outcome, center `(0.5, 0.5)`, real determinate Circular Progress, and terminal `uActivationKind = 0`. |
| Browser Extension | **PASS** | 19 authoritative progress events, 100%, 4 MiB output, successful terminal outcome, center `(0.5, 0.5)`, real determinate Circular Progress, and terminal `uActivationKind = 0`. Origin metadata did not alter Extension download correctness. |
| Functional regression gates | **PASS** | Focused Vitest: 24 files / 294 tests. `npm run type-check`: PASS. `npm run lint`: PASS. This covers managed bootstrap, runtime paths/process/engine/service, IPC, queue authority, MR9 Intake/Folder/Progress/Terminal policy/runtime/surface/composition, and download view behavior. |
| Manual session | **READY** | Electron PID `70352` is running with CDP `127.0.0.1:9333`, Extension WS `127.0.0.1:39527`, and Vite PID `27428` on `127.0.0.1:1420`. The isolated profile and runtime log paths below remain the active evidence locations. |

Functional stop condition is met: real paste and Browser Extension downloads reached authoritative membership, engine execution, real progress, and successful terminal outcomes. Final visual/aesthetic acceptance is intentionally not claimed. No archive, merge, next MR, or MR9 Final Closure PASS is performed.

## Remaining validation debt

- **MANUAL GATE:** visual judgment of Intake local-vs-center origin, Intake-versus-Folder personality, transition illusion, protected controls, Circular Progress styling, terminal restraint, and Reduced Motion remains with the user. The later center-origin sample on the local-pointer repeat must be checked here rather than auto-tuned.
- **OUT OF CURRENT ACCEPTANCE PATH:** gallery-dl was not required by the verified generic yt-dlp paste/Extension path, so no gallery-dl product change or dependency upgrade was made.
- **NOT VERIFIED:** macOS transparent-window/WebGL behavior.
- **PARTIAL:** the unrelated full-suite browser-extension source-shape assertion remains owned outside MR9; the clean MR8 baseline reproduces it.
- **VALIDATION-ONLY CLEANUP DEBT:** keep both bundled-Python junctions until MR9 manual acceptance is finished. The isolated output directory also contains two 4 MiB harness-owned paste files (`paste-local-1786811929472...mp4` and `paste-local-1786812381635...mp4`) because command policy rejected their deletion. Remove only these validation-owned files/profile and junctions after the session; do not alter their `D:/Ameow/desktop-assets/...` target or the real `%APPDATA%/Ameow` runtime.

## Browser Presentation Lab implementation + validation (2026-08-18)

A dev-only pure-Vite Browser Presentation Lab was added in this worktree. It is a separate browser entry and never enters the production Electron renderer/package.

| Area | Status | Evidence / scope |
| --- | --- | --- |
| Dedicated command/address | **ADDED** | `npm run dev:lab` -> `vite --config vite.lab.config.ts` -> `http://127.0.0.1:1421/lab.html`. Plain browser, no Electron bridge, no downloader. |
| Entry/build isolation | **PASS** | `lab.html` + `src/lab/` are never referenced by `index.html`, `src/main.tsx`, or Electron. `vite.config.ts` pins production `build.rollupOptions.input` to `index.html` only; `vite build` produced `dist/` with **no** lab assets or references (grep-confirmed). |
| Production reuse | **PASS** | Lab mounts the exact production `ExpandedPresentationSurface` (single canvas, single WebGL2 program, single fragment shader) with `THERMAL_PALETTE`. Lab code contains no `createExpandedPresentationRuntime(`, shader source, `<canvas`, or `drawArrays`; the inspector only reads uniforms from the one existing context (same technique as the CDP harness). |
| Focused automated tests | **PASS** | 3 new files / 33 tests: scenario mapping + click origin + replay + RM + determinate/indeterminate + downward revision + replacement (17), production runtime semantics through composed inputs with fake clock (8), production renderer reuse / browser-only isolation / build exclusion (8). Combined lab + presentation/main-window run: 23 files / 203 tests PASS. |
| Gates | **PASS** | `npm run type-check` PASS, `npm run lint` PASS, `npm run build` PASS. `git status` unchanged by the build (no stray source edits). |
| Live browser validation | **PASS** | Playwright Chromium headless against `npm run dev:lab`: 37/37 checks — exactly one production canvas, program linked, `aria-hidden`/`pointer-events:none`, Intake center/local (click-origin (0.25,0.25) verified), Folder, Intake/Folder reduced motion (`uReducedMotion=1`), Replay restarts the bounded phase, progress 25/75 + convergence, downward revision snap to 0.25, replacement reset to 0.5, indeterminate mode 2, inspector RM toggle, page reload survival, and real Vite HMR (`[vite] hot updated: /src/lab/PresentationLab.tsx`) with the page still functional. Screenshots: `research/mr9-browser-lab.png` (three-pane UI) and `research/mr9-browser-lab-activation.png`. |
| No fake controls | **PASS** | Inspector exposes only controls that map to real production inputs (reducedMotion prop, activation origin, determinate target) plus live uniform readouts. Distortion/chromatic and time scrub/pause controls are intentionally omitted — production has no independent distortion uniform and `uTime` is continuous, so those controls would be fake. |
| Authority boundary | **PASS** | Lab state is a pure reducer over synthetic `ExpandedPresentationTarget`; no Download/Product/lifecycle state, no Electron commands, no Browser Extension, no downloader interaction. Downward/replacement semantics are executed by the production `expandedPresentationRuntime`, not Lab-side animation. |

Reproducible validation: `node .trellis/tasks/08-15-mr9-fullscreen-activation-fx-progress-visual-refinement/research/run-browser-lab-validation.mjs`.

This section records Browser Lab results only; all earlier runtime/downloader/Electron evidence above remains authoritative and untouched. Task lifecycle remains `in_progress`; no archive, merge, commit, or Final Closure PASS is implied.

## Final bounded closure (2026-08-20)

GPT Architecture Lead granted **PASS** for the bounded MR9 task and accepted the Earlier Motion Baseline + Material / Palette / Edge Repair as the final visual state. The accepted implementation preserves the Checkpoint C diagonal travelling surface field and localized Rounded Boundary Edge Capture, while using a clean-room Paper-inspired thermal palette and material treatment. No further visual tuning is authorized in this task.

Final visual evidence is preserved at:

- `research/mr9-edge-repair.md`
- `research/mr9-edge-repair/repair-contact-sheet.png`
- `research/mr9-edge-repair/baseline-vs-repaired.png`
- `research/mr9-edge-repair/failed-vs-repaired.png`
- `research/mr9-edge-repair/paper-vs-repaired.png`

Final Lead-terminal validation on the accepted worktree state:

| Command | Result |
| --- | --- |
| `npm run type-check` | PASS |
| `npm run lint -- --quiet` | PASS |
| `npx vitest run src/presentation/main-window src/lab` | PASS, 25 files / 248 tests |
| `npm run build` | PASS |
| `npm run docs:build` | PASS |
| `git diff --check` | PASS; repository CRLF conversion warnings only |
| `npm test` | 1766 passed / 1 failed. The sole failure remains the unchanged `browser-extension/architecture-guard.test.js:277` baseline source-shape assertion and is explicitly non-blocking for MR9 closure. |

The task-specific research already records the accepted mechanics, rejected visual experiments, captures, and validation evidence; no `.trellis/spec` update is required. Commit and archive are authorized. Thermal Refraction and every later phase remain unopened and out of scope.
