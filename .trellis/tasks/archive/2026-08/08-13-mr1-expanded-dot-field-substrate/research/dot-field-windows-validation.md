# MR1 Dot Field — Windows / Manual Validation Procedure

## Status

Automated (repeatable) validation is complete and runs on Windows via Vitest:

- `npx vitest run src/presentation/main-window/dotFieldPerfValidation.test.ts` —
  prints per-scenario frame/draw statistics and asserts the invariants:
  bounded population (225 dots at 200px, hard cap 400), PEAK pending rAF
  through every scenario <= 1 (latest-replaces, measured during the burst,
  not only at the end), rest pending exactly 0 (settled/sleeping/disposed
  hold zero scheduled frames), bounded response peaks (<= 1), reduced-motion
  settle within the short duration.
- `npx vitest run src/presentation/main-window/` — recipe, runtime
  (fake-scheduler), surface classification, and perf suites (44 tests).
- `npx vitest run src/architecture/import-guard.test.ts` — MR0 renderer-local
  guard incl. the new Dot Field leaves and the wiring-boundary check.

Real rasterization (the canvas pixels themselves) cannot be automated under
the Node-only Vitest environment, so the steps below are the manual Windows
checklist. It should take ~10 minutes in the packaged/dev app.

An executable Electron smoke was also run on Windows on 2026-08-13 against
this MR1 worktree using the real renderer and Chromium DevTools protocol:

- Electron started successfully and exposed the real `Ameow` page.
- Settled Compact mounted a `60x60` sleeping Canvas and requested zero Dot
  Field animation frames during a 1.2 s observation.
- A real Windows pointer enter woke Expanded presentation and revised the
  Canvas to `200x200` at device pixel ratio 1.
- One background Surface Click produced 30 Canvas redraws with 225 dots per
  redraw over approximately 483 ms. The redraw counters were identical at
  650 ms and 1150 ms, proving the real renderer stopped scheduling after
  settle (not only the fake scheduler).
- The development app and all child processes created for this smoke were
  stopped after collection.

The executable smoke does not replace visual/manual validation. Both-theme
raster quality, native Context Open placement/acknowledgement, drag/control/
double-click exclusion feel, live OS reduced-motion switching, replacement
while visibly active, and mixed-monitor DPR changes remain **NOT VERIFIED by a
human**. The checklist below is retained for Architecture Review/manual signoff.

## Manual checklist (Electron on Windows, dev or packaged)

App under test: the Expanded (full) 200x200 main window. Open DevTools on the
main window (`Ctrl+Shift+I`) → Performance / Rendering panels.

### 1. Dormant grid (both themes)

- Default black theme: the full window shows a quiet, low-weight dot grid
  across the content area. Dots are subtle neutral white, brighter in the
  interior, fading toward the panel edge (no hard clipping line, no blue
  glow, no motion).
- Settings → switch to white theme: dots flip to subtle neutral black with
  the same interior/edge behavior. No theme-change flash or stale dots.
- Performance panel: no frames are being produced while idle (record 5 s of
  idle; the main window should not appear in the frame trace at all).

### 2. Click acknowledgement

- Single left click on the panel background: a soft brightness wave expands
  from the click point — a gentle travelling envelope with afterglow behind
  the front (no hard radar ring) — is absorbed at the panel boundary, and
  settles back to the dormant grid within ~0.5 s.
- Click on the queue badge button / any button: NO dot response (interactive
  targets are excluded).
- Click-and-drag the window by its background: no dot response during or
  after the drag (drag path excluded).
- Double-click the background (output-folder shortcut): the second click of
  the shortcut gesture (event detail 2) is excluded BEFORE acknowledgement
  and never blooms. Note: the first click of a double-click is
  indistinguishable from a real click at pointerup time and may acknowledge
  — accepted.

### 3. Context-open acknowledgement

- Right-click the panel background: the dot wave starts at the cursor
  position and the native context menu still opens at the correct position
  (placement unchanged). Rapid right-click bursts replace, never queue.

### 4. Sleep / wake (collapse / expand)

- While the full window collapses to the icon, the dot field disappears with
  the surface; no trailing frames after collapse.
- Re-expand: the grid redraws once. A click acknowledgement issued during
  compact mode is dropped and must NOT replay after re-expansion.
- After re-expansion, repeat section 2 — full behavior restored.

### 5. Reduced motion

- Enable reduced motion (OS setting) and restart the app.
- Click: only a brief localized brightness acknowledgement (~90 ms, no
  travel/displacement — the envelope does not propagate), then dormant.
- Toggle reduced motion mid-wave (OS setting while the app is running):
  the current wave resolves quickly to the reduced target; no lingering
  propagation.

### 6. Disposal / replacement

- Close and reopen the main window (or reload via Ctrl+R during an active
  ripple): no console errors, no frames after reload, the grid rebuilds
  cleanly.

### 7. Device pixel ratio

- Run the app on a 100% and a 150%/200% display scale (or drag between
  monitors). The grid must render crisp at both scales (backing store capped
  at 2x) with the same logical layout; no blurriness, no layout shift.
- LIVE revision: with the full window open, change the Windows display scale
  (or drag the window to a monitor with a different scale). The grid
  re-renders once at the new scale (matchMedia-driven; the listener re-arms
  against the revised dpr, so one scale change = one revision, no loop).
  Known limitation: if the browser never fires the resolution `change` event
  (unsupported/rare), the backing store revises on the next eligibility flip
  (collapse/expand) instead.

### 8. No per-frame cross-layer path

- Performance panel during a click burst: frames appear ONLY in the renderer
  process. Main / preload / IPC traces must show zero per-frame traffic
  (watch the `desktopCurrentWindow` / IPC network/events timeline). The
  existing Windows correctness risks (native argument conversion, terminal
  window stays full) are OUT OF SCOPE for MR1 and must not be "fixed" here.

### 9. Performance budget

- A single click burst executes ~30 frames (~480 ms) with 225 dots and no
  visible jank; overlapping bursts keep the PEAK pending frame count at
  exactly 1 through the whole burst (latest-replaces, measured during the
  scenario — not only the final rest value). Idle, settled, sleeping, and
  disposed states hold zero scheduled frames (rest = 0).
