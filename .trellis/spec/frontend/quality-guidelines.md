# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

FlowSelect frontend follows TypeScript strict mode with functional React patterns. Code should be concise and leverage the existing UI component library.

---

## Forbidden Patterns

**1. Class components**
```tsx
// WRONG - use functional components
class MyComponent extends React.Component { }

// CORRECT
function MyComponent() { }
```

**2. Direct DOM manipulation**
```tsx
// WRONG
document.getElementById('app').style.color = 'red';

// CORRECT - use React state
const [color, setColor] = useState('red');
```

**3. Hardcoded theme colors**
```tsx
// WRONG - won't respond to theme changes
<div style={{ backgroundColor: '#201E25' }}>

// CORRECT - use ThemeContext
const { colors } = useTheme();
<div style={{ backgroundColor: colors.bgPrimary }}>
```

**4. Missing cleanup in useEffect**
```tsx
// WRONG
useEffect(() => {
  const unlisten = listen("event", handler);
  // No cleanup!
}, []);

// CORRECT
useEffect(() => {
  const unlisten = listen("event", handler);
  return () => { unlisten.then(fn => fn()); };
}, []);
```

---

## Required Patterns

**1. TypeScript interfaces for props**
```tsx
interface ButtonProps {
  variant?: 'default' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}
```

**2. Error handling for Tauri calls**
```tsx
try {
  const result = await invoke("command");
} catch (err) {
  console.error("Failed:", err);
}
```

**3. Motion for React for overlay/state transitions**
```tsx
import { motion } from "motion/react";

<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
/>
```

Use CSS transitions for simple hover/focus states and reserve `motion/react` for mount/unmount or stateful transforms. See `./motion-guidelines.md`.

**4. Edit locale source files, not generated copies**
```text
// WRONG - this will be overwritten by locales:sync/prebuild
browser-extension/locales/en/extension.json
src-tauri/resources/locales/en/extension.json

// CORRECT - edit the source-of-truth locale file
locales/en/extension.json
```

Locale contract:
- `locales/<language>/<namespace>.json` is the only source of truth.
- `browser-extension/locales/` and `src-tauri/resources/locales/` are generated outputs.
- After locale edits, run `npm run locales:sync` or any build command that triggers `prebuild`.

**5. Keep packaged Electron renderer builds `file://`-safe**
```ts
// WRONG - packaged BrowserWindow loading dist/index.html over file://
// cannot resolve root-relative /assets/... URLs
export default defineConfig({
  base: "/",
});

// CORRECT - production build emits ./assets/... while dev keeps /
export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
}));
```

Packaged desktop contract:
- If Electron loads `dist/index.html` via `file://`, production JS/CSS URLs must stay relative to `dist/index.html`.
- Blank packaged windows are not automatically compositor bugs; first inspect built asset URLs.

**6. Treat third-party content-script button injection as DOM-contract work**
```js
// WRONG - global icon match + global URL fallback
const shareButton = document.querySelector('svg[aria-label="Share"]')?.closest('[role="button"]');
const pageUrl = document.querySelector('link[rel="canonical"]')?.href || location.href;

// CORRECT - resolve the local action group and local permalink scope first
const mountTarget = resolveActionSlot(shareButton, "horizontal");
const pageUrl = resolveSubmissionUrlFromLocalCardOrDialog(mountTarget.referenceButton);
```

Third-party DOM injection contract:
- For browser extension site detectors, treat the target site DOM as an unstable contract. Match the local action group/container, not only a globally labeled icon.
- Injection must be scoped by page mode when the same icon exists in multiple layouts. Example: a reels-only button may mount only on `/reel/...` routes, not on feed/detail pages that also expose a like icon.
- Shared injected icon DOM must be safe before page CSS settles. For cat-mask controls, create icons through the shared browser-extension helper so the first rendered frame has bounded inline dimensions, then release sizing back to site CSS after the mount frames.
- When native UI uses outer wrappers for spacing/count labels, clone only the DOM path that leads to the button shell. Do not deep-clone the entire slot if it also contains counts, duplicate icon states, or auxiliary text.
- Submission URL resolution must prefer the current card/dialog/article permalink over `location.href` or page-level canonical tags. Feed pages often expose `https://www.instagram.com/` as the global URL even though the actionable media lives in a nested `/p/.../` or `/reel/.../` anchor.
- SPA route changes must remove all prior FlowSelect-injected nodes and recompute mount targets from the new DOM. Reusing stale anchors is a common source of duplicate buttons and broken spacing.

**7. Bound long-lived extension background state**
```js
// WRONG - age-only cleanup with no hard cap
cache[key] = result;

// CORRECT - keep TTL cleanup plus an explicit total-entry limit
const nextCache = pruneEntries(cache, key, result, {
  ttlMs,
  totalLimit: 24,
});
```

Extension background lifecycle contract:
- Browser-extension background caches and registries that can live across many tabs or repeated scans must have an explicit hard bound, not only age-based cleanup.
- Timeout helpers used inside `Promise.race(...)` or similar early-settling flows must clear their timer handle after the winning branch resolves.
- Treat extension background maps/objects as long-lived runtime state even when they are not persisted to disk; if repeated user activity can grow them, add an eviction rule.

---

## Code Review Checklist

- [ ] Props have TypeScript interface
- [ ] useEffect has cleanup function
- [ ] Theme colors from ThemeContext
- [ ] Tauri calls have error handling
- [ ] No hardcoded magic numbers
- [ ] Locale edits were made in `locales/`, not generated resource folders
- [ ] If the renderer ships inside Electron over `file://`, built `dist/index.html` asset URLs were checked for `./assets/...` instead of `/assets/...`
- [ ] For browser extension content scripts on third-party sites, button injection is scoped to the correct local action group and page mode
- [ ] Third-party injected controls derive canonical submission URLs from the local card/dialog/article instead of falling back directly to global page URL
- [ ] Long-lived browser-extension background caches/registries have an explicit hard limit, not just TTL cleanup
- [ ] Timers created for early-settling async races are explicitly cleared after the race resolves

## Forbidden Patterns (Motion / Presentation Foundation, MR0)

**1. Feature motion importing Product/lifecycle/native authority**
```tsx
// WRONG - a motion module dispatching business or lifecycle work
import { cancelVideoTask } from "../../features/download/actions";
import { reduceMainWindowPresentation } from "./lifecycle";
```
Feature-motion modules must import no Product dispatch, lifecycle reducer, desktop runtime, Electron, or center-overlay policy (guarded by `src/architecture/import-guard.test.ts`).

**2. Per-frame React state loops**
```tsx
// WRONG - re-rendering React every animation frame
const [frame, setFrame] = useState(0);
useEffect(() => {
  const id = requestAnimationFrame(() => setFrame((f) => f + 1));
  return () => cancelAnimationFrame(id);
}, []);
```
React publishes target/input changes only. Per-frame geometry lives in local MotionValues/rAF runtimes that sleep when settled.

**3. High-frequency IPC / Main-process motion**
```tsx
// WRONG - moving a window per pointer event through IPC
ipcRenderer.send("ameow:current-window:set-position", pos); // per frame
```
Electron Main, BrowserWindow, preload, and IPC never participate in per-frame feature motion.

**4. Shared animator / runtime / DSL scaffolding**
```ts
// WRONG - a shared engine for future consumers that do not exist yet
export class MotionRuntime { /* ... */ }
```
No shared animator, global runtime, recipe framework, renderer hierarchy, DSL, or graphics dependency without evidence from two real consumers.

**5. Unbounded animation queues**
```ts
// WRONG - every event appends; nothing coalesces
queue.push(event);
```
Transient concurrency is bounded per consumer: latest-replaces/coalescing/suppress. No unbounded FIFO animation queue.

**6. Claiming Windows issues solved by visual replacement**
```
// WRONG - removing a Reveal visual while the native path stays reachable
// (comment) "this eliminates the Windows argument conversion problem"
```
Both Windows repair dependencies remain open unless their exact paths are changed and validated; MR0 gates them (`src/architecture/windows-risk-path.test.ts`).

## Code Review Checklist (Motion / Presentation additions)

- [ ] No feature-motion module imports Product/lifecycle/desktop/Electron modules
- [ ] No per-frame React state; no high-frequency IPC/native motion loops
- [ ] Collapse sleeps/invalidates; replacement/unmount disposes; stale callbacks are no-ops
- [ ] Reduced motion resolves deterministically without fake lifecycle completion
- [ ] Transients restore the latest persistent baseline; terminal has priority; no unbounded queue
- [ ] Information-bearing interpolation never overshoots authoritative values
- [ ] No shared animator/DSL/framework added for future consumers
