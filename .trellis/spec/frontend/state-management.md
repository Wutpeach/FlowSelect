# State Management

> How state is managed in FlowSelect.

---

## Overview

FlowSelect uses local React state for most UI state, with ThemeContext for global theme management. Configuration is persisted through the Electron desktop bridge into JSON files under the app user-data directory.

---

## State Categories

| Category | Solution | Example |
|----------|----------|---------|
| UI State | useState | `isHovering`, `isPanelHovered` |
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

For transparent desktop child windows such as `/settings` and `/context-menu`, do not render the window with a hardcoded fallback theme and then asynchronously switch to the persisted theme.

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
  → desktopCommands.invoke("save_config", { json })
  → Electron main writes JSON file
```

**Backend → Frontend:**
```
App mounts
  → desktopCommands.invoke("get_config")
  → Electron main reads JSON file
  → React setState
  → UI updates
```

**Example:**
```tsx
// Save config
const saveConfig = async () => {
const configStr = await desktopCommands.invoke<string>("get_config");
const config = JSON.parse(configStr);
config.outputPath = outputPath;
await desktopCommands.invoke("save_config", { json: JSON.stringify(config) });
};
```

### Renderer Config Patch Helper

For new renderer code that needs to update one or a few fields in the raw desktop config object, prefer the typed renderer helper in `src/desktop/config.ts` over repeating `get_config` / parse / mutate / `save_config` inline.

```tsx
import { saveConfigPatch } from "../desktop/config";

await saveConfigPatch({ aePortalEnabled: true });
```

The helper contract is intentionally narrow:

- it still calls `get_config` and `save_config`; do not add a new desktop command for simple field patches
- `get_config` remains a raw string and `save_config` still receives `{ json: JSON.stringify(config) }`
- invalid, empty, array, null, or non-object config input falls back to `{}`
- object patches must preserve unrelated fields in the loaded config object
- save/load failures propagate to the caller so existing optimistic UI rollback and error messages stay caller-owned
- do not use the helper when a handler needs different parse semantics, additional validation, event emission, or rollback behavior that cannot be proven equivalent

Good candidates are small Settings toggles that already follow the raw-config blob pattern. Poor candidates include handlers that intentionally use direct `JSON.parse`, validate a derived config before saving, emit cross-window events after persistence, or need a behavior fix before extraction.

### App.tsx Pure Logic Boundary

`src/App.tsx` may keep extracting pure helpers, reducers, and formatting functions when the logic can be proven side-effect free.

Keep these in `App.tsx` or the adjacent bridge/component boundary:

- event subscriptions
- timers and timer cleanup
- refs and synchronous interaction guards
- optimistic rollback behavior
- Electron bridge calls
- window ownership and lifecycle side effects

If an extraction needs any of the above, it is not a pure-logic helper and should stay with the component or the bridge layer.

### Config-backed toggle rule

For small Settings toggles backed by the raw config blob, keep one clear ownership pattern:

- read the current config string through `get_config`
- mutate only the specific config key you own
- write the full string back through `save_config`
- if the UI applies the toggle optimistically before persistence completes, revert local state on save failure

This is required for dev-only toggles such as `extensionInjectionDebugEnabled`, where the local Settings switch drives both desktop persistence and browser-extension synchronization.

---

## Compact Window Interaction State

The main floating window combines hover, drag, minimize, expand-morph, short leave grace, and short-lived status locks. Treat this as one coordinated interaction state machine, not as unrelated booleans.

Preferred ownership:

| Concern | Preferred State | Why |
|---------|-----------------|-----|
| Compact/full/transition authority | lifecycle reducer (`src/presentation/main-window/lifecycle.ts`) | The reducer is the only writable owner; `App.tsx` never keeps `isMinimized`/`shellPhase` mirrors |
| Visual, interaction, native facts | pure projections (`projections.ts`) | Consumers read projected facts; projections never write lifecycle state |
| High-frequency interaction guards | feature-local refs in the presentation surface | Pointer-down / drag pending / drag active update synchronously without waiting for render |
| Cancelable timers | effect executor (`effectExecutor.ts`) | The 80 ms collapse timer is executor-owned and canceled by re-enter, teardown, and any full intent |
| Hover truth after transforms | lifecycle pointer facts | DOM enter/leave and native pointer-boundary facts both feed the same reducer |
| Continuous pointer coordinates | Pointer Field (`pointerField.ts`) | One renderer-local MotionValue authority; pointer coordinates never live in React application state, lifecycle state, or IPC |

Contracts:
- Do not let `onMouseLeave` directly own collapse decisions for the compact window. Leave is only one fact; the reducer gates it against phase, locks, and pointer truth.
- Compact/full switching must be owned by the single lifecycle reducer. Handlers dispatch explicit events (pointer enter/leave, drop enter/leave, lock changes, startup settle, requestFull, visual transition completion); they must not make independent compact/full decisions.
- Do not use DOM `:hover` as a compact/full decision source. The reducer's explicit pointer/drop facts are the source of truth.
- Native pointer-boundary events from Electron main are input facts for the lifecycle. Electron reports whether the OS cursor is inside the main BrowserWindow bounds, but it must not decide compact/full shell state. The subscription keeps a listener-generation guard so a late emission from a replaced subscription cannot affect the current lifecycle.
- The collapse timer is one executor-owned 80 ms timer keyed by the lifecycle timer epoch. Re-enter cancels it, teardown cancels it, and any full intent cancels it. Stale timer events are rejected by epoch.
- Pointer-down, drag-threshold pending, and active drag are distinct interaction states owned by the presentation surface, and the `drag` lock holds full.
- When multiple transitions can hand off between each other, the reducer decides the next shell state at the handoff point (epoch-checked visual completion) instead of letting one effect finish and a second effect immediately undo it.
- If a foreground success/error outcome is rendered briefly in the main panel, the `centerOutcome` lock keeps the shell full. The foreground task path issues `requestFull` (explicit full intent) before the outcome can paint; intent never fabricates pointer-inside truth.
- When showing a foreground task outcome after download/transcode completion, request full-mode ownership before or alongside flipping the visible outcome state. The completion glyph/message must not first appear inside the compact icon shell and then recover back to the full panel.
- Programmatic full requests (`requestFull`) must not fabricate pointer ownership. They preserve the current `pointerInside` value. Otherwise lock release can believe the pointer is still inside and skip the normal collapse path until the next real enter/leave event.

### Center Overlay State Ownership

The center overlay in `src/App.tsx` is a separate single-owner state machine inside the main window. It must not be modeled as several independent booleans such as `isProcessing`, `isForegroundTaskOutcomeVisible`, and `centerOutcome`.

Preferred ownership:

| Concern | Preferred State | Why |
|---------|-----------------|-----|
| Current visual owner | discriminated union / reducer state | One selector decides whether the center shows progress, processing, task outcome, folder outcome, or nothing; the compact icon is surface output driven by the lifecycle visual projection |
| Transient outcome lifetime | request id / epoch in state | Stale timer callbacks must not clear a newer outcome |
| Shell-lock truth | derived from the same reducer state | Processing, loading, visible outcome, and folder outcome all keep the shell stable |
| Progress truth | derived from queue/progress maps | Progress stays the source of truth and can preempt stale outcomes |

Contracts:
- Keep task progress derived from queue/progress maps.
- Use one selector to choose the center visual owner.
- Give each transient outcome a request id and validate it in timer callbacks before mutating state.
- Progress events may dismiss stale outcome visuals, but they must not clear the long-running `task-processing` state if it is still active.
- Folder outcomes must use the same request-id guard as task outcomes.
- The compact icon shell is presentation-surface output driven by the lifecycle visual projection; the center overlay has no minimized/icon branch and must never render task or outcome content inside the compact shell.

Common mistakes:

**WRONG: Several unrelated center booleans**
```tsx
const [isProcessing, setIsProcessing] = useState(false);
const [isForegroundTaskOutcomeVisible, setIsForegroundTaskOutcomeVisible] = useState(false);
const [centerOutcome, setCenterOutcome] = useState<"folder-success" | "folder-error" | null>(null);
```

**CORRECT: One center overlay state machine**
```tsx
const [centerOverlayState, setCenterOverlayState] = useState(() => createCenterOverlayState());
const centerOverlayVisual = selectCenterOverlayVisual({
  primaryTask,
  centerOverlayState,
});
```

**WRONG: Progress and outcomes own themselves independently**
```tsx
if (hasProgress) {
  showProgress();
}
if (hasOutcome) {
  showOutcome();
}
```

**CORRECT: One selector chooses one center owner**
```tsx
switch (centerOverlayVisual.kind) {
  case "task-progress":
  case "task-processing":
  case "task-outcome":
  case "folder-outcome":
  case "none":
}
```

Common compact-window mistakes:

**WRONG: App-owned collapse timer**
```tsx
onMouseLeave={() => {
  setTimeout(collapseMainWindowToIcon, 140);
}}
```

Why wrong:
- The App never owns a collapse timer. The lifecycle reducer emits
  `collapseTimer.start` / `collapseTimer.cancel` effects; the effect executor
  owns the single cancelable `80 ms` timer, and re-entry cancels it.

**CORRECT: Collapse timer owned by the effect executor**
```tsx
// Lifecycle emits: { type: "collapseTimer.start", timerEpoch, delayMs: 80 }
// The executor schedules/cancels exactly one timer and reports the epoch
// back as collapseTimerFired; stale epochs are ignored by the reducer.
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
await desktopCommands.invoke("save_config", { json: JSON.stringify(config) });
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
## Motion / Presentation Foundation (MR0)

MR0 keeps authority layers separate and never creates duplicate Product, lifecycle, or pointer state. The layers are:

| Layer | Owner | Role |
| --- | --- | --- |
| Product facts | Download reducer/selectors (`src/features/download/`), Application facts | tasks, progress, terminal outcomes; sole business truth |
| Presentation Lifecycle | `lifecycle.ts` reducer + projections | full/compact/transition, locks, epochs; sole writable lifecycle authority |
| Projected persistent/transient/terminal presentation | selectors + `centerOverlayState.ts` request-id policy + composition | the current persistent baseline, bounded transient intents, terminal-priority target; presentation projections only |
| Continuous renderer runtime | `pointerField.ts` (+ consumers like `magnetic.ts`) | high-frequency pointer geometry; renderer-local, never React app state |

Rules:

- Presentation projections never write back into Product or lifecycle authority. A projection is a pure function of facts.
- The center overlay (`centerOverlayState.ts`) keeps request-id/timer policy as presentation policy: it owns the bounded terminal visibility opportunity and projects the `centerOutcome` lifecycle lock. `lifecycle.ts` consumes the lock but does not own the timer. Animation completion never releases locks or dispatches collapse.
- Terminal projected presentation has visual priority over ordinary transients but owns neither the terminal fact nor collapse. New authoritative active work re-evaluates locks/collapse eligibility from facts.
- A transient response restores the CURRENT persistent baseline (including changes that arrived during the transient); it never rewrites the baseline.
- Transient concurrency is bounded locally (latest-replaces/coalescing). No unbounded animation queue, no global store, no bus, no state machine added for motion.
- Renderer motion state is disposable and reconstructible: collapse sleeps a still-mounted runtime; replacement/unmount permanently disposes; rebuild reconstructs from the current projection.
- Guarded by `src/architecture/import-guard.test.ts` (lifecycle/pointer writer uniqueness, surface wiring boundary) and `src/presentation/main-window/presentationCompositionContract.test.ts` — a normative test-only contract model; MR1/MR2 implementations add their own conformance tests and are not certified by the model alone.

### MR7 Expanded graphics clarification

`expandedPresentationRuntime.ts` may retain only reconstructible interpolation,
generation, and one pending frame. Its inputs are the pure current Progress and
Terminal Presentation targets. It must not retain terminal targets after their
publisher removes them, classify outcomes, release `centerOutcome`, progress the
main-window lifecycle, mutate Download/Application state, or expose semantic
callbacks. WebGL context/resource state is decorative renderer-local state and
failure leaves all authorities unchanged.

MR8 adds one Download-Intake-specific bounded Presentation owner beside these
projections. Its source is the Application-authored `acceptedTraceId` marker on
the exact new-membership queue snapshot; unmarked snapshots and local command
acks never create it. It owns only latest opportunity identity, deadline, and
stale invalidation. The pure Expanded Presentation policy resolves MR4 current-
primary suppression, Terminal, Intake, then MR3 Progress before passing one
typed target to the MR7 host. Intake creates no lifecycle lock, Product field,
renderer completion callback, queue, scheduler, or generic Reveal authority.
