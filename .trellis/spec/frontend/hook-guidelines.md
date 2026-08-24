# Hook Guidelines

> How hooks are used in FlowSelect.

---

## Overview

FlowSelect uses React hooks for state management and the Electron preload bridge for desktop communication. No external data fetching libraries are used; renderer-side desktop calls should go through `src/desktop/runtime.ts`.

---

## Desktop Event Listening Pattern

**Standard pattern for Electron bridge events:**

```tsx
import { desktopEvents } from "../desktop/runtime";

useEffect(() => {
  let cleanup: (() => void) | null = null;

  void desktopEvents.on<{ percent: number; speed: string }>(
    "video-download-progress",
    (event) => {
      setDownloadProgress(event.payload);
    },
  ).then((unlisten) => {
    cleanup = unlisten;
  });

  return () => {
    cleanup?.();
  };
}, []);
```

*Reference: `src/App.tsx:119-146`*

---

## Backend Communication

**Calling Electron bridge commands:**

```tsx
import { desktopCommands } from "../desktop/runtime";

// Async call with typed response
const configStr = await desktopCommands.invoke<string>("get_config");
const config = JSON.parse(configStr);

// Call with parameters
await desktopCommands.invoke("save_config", { json: JSON.stringify(config) });
```

*Reference: `src/App.tsx:76-89`*

---

## Config Loading Pattern

**Load config on mount:**

```tsx
useEffect(() => {
  const loadConfig = async () => {
    try {
      const configStr = await desktopCommands.invoke<string>("get_config");
      const config = JSON.parse(configStr);
      if (config.outputPath) {
        setOutputPath(config.outputPath);
      }
    } catch (err) {
      console.error("Failed to load config:", err);
    }
  };
  loadConfig();
}, []);
```

---

## Timer Hygiene Pattern

There is no App-owned idle/leave collapse timer: the lifecycle reducer emits
`collapseTimer.start` / `collapseTimer.cancel` effects and the effect executor
owns the single cancelable 80 ms collapse timer. App timers exist only for
transient UI such as notices.

**Resetting a transient notice after a delay:**

```tsx
const queueNoticeTimerRef = useRef<number | null>(null);

const showQueueNotice = () => {
  if (queueNoticeTimerRef.current !== null) {
    clearTimeout(queueNoticeTimerRef.current);
  }
  queueNoticeTimerRef.current = window.setTimeout(() => {
    queueNoticeTimerRef.current = null;
    setQueueNoticeMessage(null);
  }, 4000);
};
```

**When timer logic depends on hover/drag state, use refs for the latest state inside timeout callbacks:**

```tsx
const isHoveredRef = useRef(false);
const isDraggingRef = useRef(false);

const resetQueueNoticeTimer = () => {
  if (queueNoticeTimerRef.current) clearTimeout(queueNoticeTimerRef.current);
  if (isHoveredRef.current || isDraggingRef.current) return;
  queueNoticeTimerRef.current = window.setTimeout(() => {
    if (isHoveredRef.current || isDraggingRef.current) return;
    setQueueNoticeMessage(null);
  }, 4000);
};
```

This avoids stale-closure timing bugs where UI is still hovered but a timer still fires.

---

## Inline Overlay Focus Dismiss Pattern

If a popup/menu is migrated from a dedicated desktop child window into an inline React overlay, do not keep the old "close on main window focus" listener.

Why:
- Separate-window popups may need window-level focus listeners because focus returns to the main window when the popup closes.
- Inline overlays live inside the main window, so a main-window focus event is no longer a reliable dismiss signal.
- On Windows, reusing the old listener can immediately close the overlay during the same interaction that opened it.

Preferred dismiss sources for inline overlays:
- Outside click on the overlay backdrop
- `Escape` key
- Actual main-window blur (`focused === false`) if the overlay should close when the app loses focus

**Wrong**
```tsx
mainWindow.onFocusChanged(({ payload: focused }) => {
  if (!focused) return;
  closeInlineMenu();
});
```

**Correct**
```tsx
mainWindow.onFocusChanged(({ payload: focused }) => {
  if (focused || !isInlineMenuOpenRef.current) return;
  closeInlineMenu();
});
```

Treat focus-driven dismiss logic as part of the component contract whenever you change popup architecture.

---

## Dedicated Menu Window Dismiss Guard

For tiny dedicated desktop menu windows on Windows, do not arm blur/focus-dismiss logic immediately on mount.

Use a short guard window plus a dialog-in-flight ref:
- Arm dismiss after a small timeout (for example `100-200ms`) to ignore creation-time focus jitter.
- Ignore blur/focus-dismiss while a native dialog (such as folder picker) is open.
- Emit a single close event back to the main window so parent state stays in sync when the child closes itself.
- If the menu action must open a native file/folder dialog, prefer a Rust command that opens the dialog directly instead of relaying through frontend cross-window events.

For context-menu folder actions, follow the cross-layer contract in [Type Safety](./type-safety.md) under `Context Menu Native Folder Actions Contract`; the child menu window must not own folder-picker orchestration.

This prevents two common regressions:
- Menu flickers closed right after it opens.
- Menu action opens a native picker but parent state still thinks the menu is open.

---

## Common Mistakes

**WRONG: Not cleaning up listeners**
```tsx
useEffect(() => {
  listen("event", handler);
  // Missing cleanup!
}, []);
```

**CORRECT: Proper cleanup**
```tsx
useEffect(() => {
  let cleanup: (() => void) | null = null;
  void desktopEvents.on("event", handler).then((unlisten) => {
    cleanup = unlisten;
  });
  return () => {
    cleanup?.();
  };
}, []);
```

**WRONG: Blocking render with await**
```tsx
// WRONG - blocks component
const config = await desktopCommands.invoke("get_config");
```

**CORRECT: Use useEffect for async**
```tsx
useEffect(() => {
  desktopCommands.invoke("get_config").then(setConfig);
}, []);
```

## Third-party Overlay Event Guard Pattern

When integrating third-party overlay/capture tools (such as visual annotators), some native controls (`select`, `input`, etc.) may trigger their default interaction before the tool's own click blocker runs.

Use a local capture-phase guard in your wrapper component:

```tsx
useEffect(() => {
  const handleMouseDownCapture = (event: MouseEvent) => {
    if (!isOverlayCaptureActive()) return;
    if (!shouldBlockInteractions()) return;
    if (!isEarlyInteractiveTarget(event.target)) return;
    event.preventDefault();
  };

  window.addEventListener("mousedown", handleMouseDownCapture, true);
  return () => {
    window.removeEventListener("mousedown", handleMouseDownCapture, true);
  };
}, []);
```

Use this only for controls that can open on `mousedown` (typically `select`), and let the annotator library own normal `click` handling.

Avoid app-level synthetic click forwarding for all interactive controls; it can break annotation creation on buttons/inputs because the library may rely on trusted native click flow.
