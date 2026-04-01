# State Management

> How state is managed in FlowSelect.

---

## Overview

FlowSelect uses local React state for most UI state, with ThemeContext for global theme management. Configuration is persisted to the Rust backend via JSON files.

---

## State Categories

| Category | Solution | Example |
|----------|----------|---------|
| UI State | useState | `isHovering`, `isMinimized` |
| Refs | useRef | `idleTimerRef`, `containerRef` |
| Theme | ThemeContext | `theme`, `colors` |
| Config | Backend JSON | `outputPath`, `shortcut` |

---

## ThemeContext

**Provider setup** (`src/contexts/ThemeContext.tsx`):

```tsx
type Theme = 'black' | 'white';

interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  textPrimary: string;
  textSecondary: string;
  // ...
}

const ThemeContext = createContext<{
  theme: Theme;
  colors: ThemeColors;
  setTheme: (t: Theme) => void;
} | null>(null);
```

**Using theme in components:**

```tsx
import { useTheme } from './contexts/ThemeContext';

function MyComponent() {
  const { colors, setTheme } = useTheme();

  return (
    <div style={{ backgroundColor: colors.bgPrimary }}>
      <button onClick={() => setTheme('white')}>
        Light Mode
      </button>
    </div>
  );
}
```

### Transparent Child Window Theme Hydration

For transparent Tauri child windows such as `/settings` and `/context-menu`, do not render the window with a hardcoded fallback theme and then asynchronously switch to the persisted theme.

Why:
- Transparent windows make first-paint theme mismatches highly visible.
- Defaulting to `black` and patching to `white` after `invoke("get_config")` causes a one-frame flash.
- Small menu windows can also appear to "flicker" if the first frame is transparent or uses the wrong theme tokens.

Preferred pattern:

```tsx
const initialTheme = await resolveInitialThemeBeforeRender();

ReactDOM.createRoot(root).render(
  <ThemeProvider initialTheme={initialTheme}>
    <App />
  </ThemeProvider>
);
```

Provider behavior rule:
- Accept an optional `initialTheme`.
- If `initialTheme` is provided, use it for the initial state and do not re-fetch theme config on mount.
- Still listen for cross-window `theme-changed` events so open windows stay synchronized.

---

## Config Flow

**Frontend → Backend:**
```
User changes setting
  → React setState
  → invoke("save_config", { json })
  → Rust writes JSON file
```

**Backend → Frontend:**
```
App mounts
  → invoke("get_config")
  → Rust reads JSON file
  → React setState
  → UI updates
```

**Example:**
```tsx
// Save config
const saveConfig = async () => {
  const configStr = await invoke<string>("get_config");
  const config = JSON.parse(configStr);
  config.outputPath = outputPath;
await invoke("save_config", { json: JSON.stringify(config) });
};
```

---

## Compact Window Interaction State

The main floating window combines hover, drag, minimize, expand-morph, idle timers, and short-lived status locks. Treat this as one coordinated interaction state machine, not as unrelated booleans.

Preferred ownership:

| Concern | Preferred State | Why |
|---------|-----------------|-----|
| Visual shell mode | `useState` | React needs to render icon/full/morph states |
| High-frequency interaction guards | `useRef` | Pointer-down / drag pending / drag active must update synchronously without waiting for render |
| Cancelable timers | `useRef` + shared clear helper | Leave-delay and idle timers must be cancelable from multiple paths |
| Hover truth after transforms | DOM query + state sync | `:hover` can be more authoritative than stale React enter/leave events after morphs |

Contracts:
- Do not let `onMouseLeave` directly own collapse decisions for the compact window. Leave is only one signal; morph completion, drag lifecycle, and task-outcome unlocks may need a second truth check.
- If hover can drift during transforms, pointer capture, or drag setup, reconcile from the DOM before collapsing, for example with `container.matches(":hover")`.
- Keep one shared clear helper per timer family. If a leave-delay timer exists, it must be canceled by re-enter, idle reset, teardown, and any flow that forces full mode.
- Pointer-down, drag-threshold pending, and active drag are distinct interaction states. Leave handling must respect all three.
- When multiple transitions can hand off between each other, decide the next shell state at the handoff point instead of letting one effect finish and a second effect immediately undo it.

Common compact-window mistakes:

**WRONG: Independent timer ownership**
```tsx
onMouseLeave={() => {
  setTimeout(collapseMainWindowToIcon, 140);
}}

const resetIdleTimer = () => {
  clearTimeout(idleTimerRef.current!);
};
```

Why wrong:
- The leave timer is invisible to other reset paths and may still fire after re-enter.

**CORRECT: Shared timer ownership**
```tsx
const clearPointerLeaveCollapseTimer = () => {
  if (pointerLeaveCollapseTimerRef.current !== null) {
    clearTimeout(pointerLeaveCollapseTimerRef.current);
    pointerLeaveCollapseTimerRef.current = null;
  }
};
```

**WRONG: Drag and leave handled independently**
```tsx
onMouseLeave={() => collapseMainWindowToIcon()}
```

**CORRECT: Leave respects transient interaction state**
```tsx
if (
  isWindowPointerDownRef.current
  || pendingDragStartRef.current
  || activeWindowDragRef.current
) {
  return;
}
```

---

## Common Mistakes

**WRONG: Direct config mutation**
```tsx
// WRONG - doesn't persist
config.theme = 'white';
```

**CORRECT: Save through backend**
```tsx
// CORRECT - persists to disk
await invoke("save_config", { json: JSON.stringify(config) });
```

**WRONG: Missing ThemeProvider**
```tsx
// WRONG - useTheme will throw
function App() {
  const { colors } = useTheme(); // Error!
}
```

**CORRECT: Wrap with provider**
```tsx
// CORRECT - in main.tsx
<ThemeProvider>
  <App />
</ThemeProvider>
```
