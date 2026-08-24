## Scenario: Main Window Output Folder Double-Click Contract

### 1. Scope / Trigger

- Trigger: The main floating window adds a double-click shortcut to open the current output folder.
- Why this needs code-spec depth: The gesture shares pointer input with the custom window-drag path, so a small event-order mistake can break both dragging and the new shortcut.

### 2. Signatures

Frontend command/handler usage:

```ts
await window.ameow!.commands.invoke<void>("open_current_output_folder");

const handlePanelPointerDown = async (e: React.PointerEvent<HTMLDivElement>) => { ... };
const handlePanelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => { ... };
const handlePanelPointerUp = (e: React.PointerEvent<HTMLDivElement>) => { ... };
const handlePanelPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => { ... };
const handlePanelDoubleClick = async (e: React.MouseEvent<HTMLDivElement>) => { ... };
```

Frontend guard constants:

```ts
const PANEL_DOUBLE_CLICK_IGNORE_SELECTOR = "button, [data-panel-double-click='ignore']";
const PANEL_NATIVE_DRAG_ALLOW_SELECTOR = "[data-panel-native-drag='allow']";
const WINDOW_DRAG_START_THRESHOLD = 6;
```

Electron drag bridge usage:

```ts
const pendingDragStartRef = useRef<{
  pointerId: number;
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
  windowPositionPromise: Promise<{ x: number; y: number }>;
} | null>(null);

const windowPosition = await desktopCurrentWindow.outerPosition();
desktopCurrentWindow.setPosition({ x: nextX, y: nextY });
```

Backend command/helper signatures:

```rust
#[tauri::command]
fn open_current_output_folder(app: tauri::AppHandle) -> Result<(), String>

fn resolve_current_output_folder_path(app: &tauri::AppHandle) -> Result<PathBuf, String>
fn open_folder(path: String) -> Result<(), String>
```

### 3. Contracts

#### Frontend Contract

- Main window must invoke `open_current_output_folder` through the desktop bridge; it must not duplicate output-path resolution in React.
- Double-click open-folder must only be enabled in the normal idle full panel state:
  - full content visible (lifecycle visual projection is `full`, not compact)
  - `!isProcessing`
  - no active `downloadProgress`
  - `videoQueueState.totalCount === 0`
  - `!isQueuePopoverOpen`
- The gesture must only apply to empty panel space. Targets matching `button` or `[data-panel-double-click='ignore']` are excluded.
- The queue popover root must mark itself with `data-panel-double-click="ignore"` so overlay content never triggers the panel-level gesture.
- The main panel is a drop target and a frameless drag surface at the same time, so internal panel content must not start native DOM drag sessions unless it explicitly opts in with `data-panel-native-drag="allow"`.
- Progress/checkmark/error overlays rendered inside the panel must default to non-interactive presentation layers:
  - suppress pointer-driven native drag on the overlay shell
  - keep decorative SVG/icon/text layers non-interactive
  - re-enable pointer events only for specific controls such as the current-task cancel button
- Main window dragging must not start on `pointerdown`; it must wait until pointer movement exceeds `WINDOW_DRAG_START_THRESHOLD`.
- `pointerdown` may only arm drag state:
  - store the starting `clientX/clientY` and `screenX/screenY`
  - start one `desktopCurrentWindow.outerPosition()` read
  - capture the pointer when possible
- When dragging becomes active:
  - derive movement from `screenX/screenY`, not from element-local coordinates
  - resolve `outerPosition()` once and reuse it as the drag origin
  - send position updates through `desktopCurrentWindow.setPosition(...)`
  - batch updates with `requestAnimationFrame` if pointermove frequency exceeds one IPC write per frame
- The pointer-move hot path must not `await` `invoke(...)`, `startDragging()`, or `commands.invoke("set_window_position", ...)`.
- `pointerup`, `pointercancel`, context-menu open paths, and double-click setup must clear any pending or active drag state and release pointer capture when held.
- Drop-session cleanup must not rely on a single React `onDrop` / `onDragLeave` path. If a browser/system drag session ends, the panel should also clear drop-hover state from window-level termination signals such as capture-phase `drop`, `dragend`, or window blur.

#### Backend Contract

- `open_current_output_folder` must:
  - resolve the current output folder from config
  - fallback to `<Desktop>/Ameow_Received` when `outputPath` is missing/empty
  - delegate folder opening through backend `open_folder(...)`
- `open_current_output_folder` must not emit `context-menu-closed`; it is a generic command shared by multiple UI surfaces.

#### Shared Behavior Contract

- The right-click `Open Folder` action and the main-window double-click shortcut must converge on the same resolved output-path behavior.
- If the folder-open command fails, frontend may only log the rejected command; it must not leave the main panel in a special transient state.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Double-click uses inline filesystem logic | Code review | Main window and menu can drift on fallback behavior | Route through `window.ameow!.commands.invoke<void>("open_current_output_folder")` |
| Dragging still starts on `pointerdown` | Runtime gesture path | Double-click never reliably fires | Gate dragging behind movement threshold |
| Drag path awaits `invoke(...)` or `set_window_position` on every pointer move | Runtime gesture path | Frameless drag remains smooth | Use `desktopCurrentWindow.setPosition(...)` with fire-and-forget IPC, optionally RAF-batched |
| Drag delta is based on `clientX/clientY` after activation | Multi-monitor or repeated drag path | Window lags or drifts from the cursor | Use `screenX/screenY` plus one initial `outerPosition()` snapshot |
| Pending drag state is not cleared on `pointerup` / `pointercancel` | Runtime gesture path | Drag can get stuck or stop mid-way | Always clear pending + active drag state and release capture |
| User double-clicks a button/control | Runtime pointer path | Action button also opens output folder unexpectedly | Ignore targets matching `PANEL_DOUBLE_CLICK_IGNORE_SELECTOR` |
| Queue popover does not mark itself as ignored | Runtime overlay path | Double-clicking queue content opens folder | Add `data-panel-double-click="ignore"` on overlay root |
| Decorative overlay content starts a native DOM drag | Download/progress overlay interaction | Cursor changes to file/object drag and the window stops dragging | Prevent panel-native `dragstart` unless the target opts in with `data-panel-native-drag="allow"` |
| Drop hover state only clears through one React path | Browser/system drag termination | Panel can stay in a stale post-drop interaction state | Also clear drop state from capture-phase `drop`, `dragend`, and window blur |
| Window is minimized or processing | Runtime gesture path | Hidden/ephemeral states trigger unexpected folder opens | Guard on idle-only state before invoking |
| Backend command emits context-menu close event | Cross-surface behavior | Main window double-click mutates unrelated menu state | Keep `open_current_output_folder` generic and side-effect free beyond opening folder |
| Folder path resolution fails | Command rejection path | No crash; gesture simply logs failure | Return `Err(String)` and catch on frontend |

### 5. Good / Base / Bad Cases

- Good:
  - Idle main window empty-space double-click opens the configured output folder.
  - Idle main window can still be dragged by holding left mouse, moving beyond the threshold, and continuing smoothly even if the pointer leaves the panel bounds.
  - After a browser/media drop triggers foreground progress or completion UI, dragging on the panel still moves the window instead of starting a DOM drag session.
  - Right-click `Open Folder` and double-click open the same fallback folder when no custom `outputPath` exists.
- Base:
  - Double-click on a button, queue overlay, or settings control does nothing extra.
  - Double-click during minimized/processing/download states is ignored.
- Bad:
  - Double-click handler is attached but drag still starts immediately on first `pointerdown`.
  - Dragging calls `commands.invoke("set_window_position")` for every pointer move and stutters under normal use.
  - Main window resolves config locally while context menu uses backend fallback logic.
  - Queue popover content bubbles into the panel gesture and opens Explorer/Finder.

### 6. Tests Required (with assertion points)

- Type checks:
  - Main window uses `window.ameow!.commands.invoke<void>("open_current_output_folder")`.
  - No `any` introduced in the new pointer handlers.
  - `desktopCurrentWindow.setPosition(...)` exists in the typed desktop bridge.
- Runtime checks:
  - In idle state, double-click empty panel space and assert the current output folder opens.
  - Hold left mouse and move beyond the threshold; assert the window drags instead of opening the folder.
  - Continue dragging after the pointer leaves the panel bounds and assert pointer capture keeps the drag alive until release.
  - Drag continuously for several seconds and assert motion stays smooth with no obvious stutter or mid-drag freeze.
  - After dropping browser media that shows the progress ring or completion check/error state, drag from the overlay and assert the main window still moves normally.
  - Trigger a browser/system drag session and end it outside the expected panel path; assert hover/drop state is cleared on the next frame and the panel does not stay in a stale drag-hover mode.
  - Double-click the queue badge / settings button / close button and assert no folder-open side effect occurs.
  - Open the queue popover and double-click inside it; assert the panel shortcut is ignored.
  - Start a download or minimize the window and assert double-click no longer triggers folder open.
  - Right-click `Open Folder` and double-click idle panel; assert both open the same resolved path when `outputPath` is unset.

### 7. Wrong vs Correct

#### Wrong

```ts
const handlePanelPointerMove = async (e: React.PointerEvent<HTMLDivElement>) => {
  await window.ameow!.commands.invoke("set_window_position", {
    x: e.clientX,
    y: e.clientY,
  });
};

const handlePanelDoubleClick = async () => {
  const configStr = await window.ameow!.commands.invoke<string>("get_config");
  const config = JSON.parse(configStr) as { outputPath?: string };
  await window.ameow!.commands.invoke<void>("open_folder", { path: config.outputPath ?? "" });
};
```

#### Correct

```ts
const handlePanelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
  if (Math.hypot(dx, dy) < WINDOW_DRAG_START_THRESHOLD) {
    return;
  }
  updateManualWindowDrag(e.screenX, e.screenY);
};

const handlePanelDoubleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
  if (shouldIgnorePanelDoubleClickTarget(e.target) || !canDoubleClickOpenOutputFolder) {
    return;
  }
  await window.ameow!.commands.invoke<void>("open_current_output_folder");
};
```

---
