# MR8 Windows Electron Validation

Date: 2026-08-14 23:43 Asia/Shanghai
Worktree: `D:/Ameow/.cindy-worktrees/motion-integration`
Scope: Windows Electron development renderer, using the real renderer IPC path
and the real extension WebSocket path.

## Evidence collected

`run-mr8-windows-validation.mjs` connected to the Electron renderer through
CDP, explicitly tested normal motion and Reduced Motion in separate renderer
reloads, and used a local HTTP media endpoint only as input to the existing
queue commands. Two complementary runs were used: the machine's real missing
sidecar produced immediate failure Terminal evidence; an isolated temporary
Electron `userData` used a 2.5-second validation-only executable so membership
remained live long enough to observe deadline and Reduced Motion behavior.
Neither run changed product code, Download facts, or the user's normal
configuration.

| Check | Observed result |
| --- | --- |
| Renderer-origin queue | The real `queue_video_download` acknowledgement returned `video-1786722121873-1`; the same atomic read saw WebGL `uMode = 6` and `uReducedMotion = false`. At the bounded deadline it resolved to current indeterminate Progress (`uMode = 2`). |
| Extension-origin queue | The real `video_selected_v2` WebSocket acknowledgement returned `video-1786722123112-2`; the same atomic read saw `uMode = 6` and `uReducedMotion = false`. At the bounded deadline it also resolved from current Progress facts (`uMode = 2`). |
| Reduced Motion | After `Emulation.setEmulatedMedia(reduce)` and reload, a real renderer queue returned `video-1786722124500-3`; the atomic snapshot read `uMode = 6` and `uReducedMotion = true`. Two reads 160ms apart had exactly the same `uTime = 0.15530000627040863`, while mode 6 remained current. |
| Terminal priority | Each local validation download failed in 11–28ms because the development machine has no `yt-dlp` executable. The next observed mode was `4` (failure Terminal), demonstrating foreground Terminal supersedes Intake. |
| Single host and accessibility separation | Every snapshot had exactly one canvas, `aria-hidden="true"`, `pointer-events: none`, a linked WebGL2 program, `gl.getError() = 0`, and separate accessible DOM nodes. |
| Size / DPR backing store | Canvas client, backing, and drawing-buffer sizes were all 200x200. The temporary CSS rect was 176–195px during the full-shell Motion transform, while the backing store correctly remained 200x200. |
| Context recovery | `WEBGL_lose_context` reported one loss and one restoration; the restored context was live, linked, and error-free. |

The captured Intake-frame screenshot is [mr8-windows-electron.png](./mr8-windows-electron.png).

## Complementary lifetime evidence

The first run's real queue reached failure Terminal before a long static sample,
which truthfully proves foreground Terminal replacement but cannot prove a
still-current Intake frame. The isolated validation-only runtime kept normal
Download membership active for 2.5 seconds. That second run directly proved:

- Intake remains one bounded 1200ms Presentation opportunity;
- deadline expiry returns to current MR3 Progress rather than a saved snapshot;
- Reduced Motion retains typed Intake mode 6 but performs no continuous time
  advance during a 160ms observation window.

Focused runtime tests independently agree that Reduced-Motion Intake schedules
zero continuous frames.

## Limits

- This is Windows Electron evidence only; macOS was not run.
- The isolated executable only delayed/fails the engine process; it did not
  synthesize queue events or Presentation state. All queue acceptance,
  membership, controller reduction, deadline, Progress, and rendering paths
  remained production paths.
- The machine's immediate missing-sidecar failure is useful priority evidence,
  not a product regression attributed to MR8.

The validation command is syntax-checked with:

```powershell
node --check .trellis/tasks/08-14-mr8-download-intake-reveal-planning/research/run-mr8-windows-validation.mjs
```
