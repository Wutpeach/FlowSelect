# Motion Guidelines

> How `motion/react` is used in FlowSelect.

---

## Overview

FlowSelect uses Motion for React for UI states that need mount/unmount choreography, panel transforms, or multi-step state transitions.

This document defines when to use `motion/react`, when to stay with CSS transitions, and how motion should behave on compact floating desktop surfaces.

FlowSelect motion should feel:

- Compact
- Intentional
- Fast to read
- Slightly polished, not theatrical

For broader visual principles, also read `./design-system.md`.

---

## Library Contract

### Import Rule

Use Motion for React from `motion/react`.

```tsx
import { motion, AnimatePresence } from "motion/react";
```

Do not introduce new imports from `framer-motion`.

### Property Rule

Prefer animating:

- `transform`
- `opacity`
- `filter` only when the blur/fade is part of a compact overlay reveal

Avoid animating layout-affecting properties for core floating surfaces unless there is a strong reason:

- `width`
- `height`
- `top`
- `left`
- `margin`
- `padding`

### Tool Choice Rule

Use CSS transitions for:

- Hover
- Focus
- Pressed states
- Quiet color/border/shadow changes
- Simple progress width changes

Use `motion/react` for:

- Mount/unmount transitions
- Overlay and popover reveals
- Switching between mutually exclusive UI states
- Panel scale/position transforms
- Stateful transitions that need `AnimatePresence`

Do not animate the same property with both CSS and Motion at the same time.

---

## Scenario: Choosing CSS vs Motion

### 1. Scope / Trigger

- Trigger: You are adding or modifying UI motion on a React surface.

### 2. Signatures

Motion import:

```tsx
import { motion, AnimatePresence } from "motion/react";
```

CSS transition pattern:

```tsx
const style: React.CSSProperties = {
  transition: "background-color 0.18s ease, border-color 0.18s ease",
};
```

Motion pattern:

```tsx
<AnimatePresence>
  {open ? (
    <motion.div
      initial={{ opacity: 0, scale: 0.965, y: -2 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.985, y: 2 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
    />
  ) : null}
</AnimatePresence>
```

### 3. Contracts

- Use CSS for single-state visual response.
- Use Motion when the element enters, exits, or switches state identity.
- Prefer `AnimatePresence` only at the boundary where presence actually changes.
- Keep transition ownership on a single wrapper layer; do not stack multiple entry animations on shell and content unless the effect is intentional.

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Action |
|-----------|-------------------|--------|
| Hover/focus only | Immediate, quiet response | Use CSS transition |
| Overlay appears/disappears | Controlled mount/unmount animation | Use Motion + `AnimatePresence` |
| Shell and content both animate in on first paint | Motion feels doubled or delayed | Collapse to one animated layer |
| Same property animated by CSS and Motion | Jitter or uneven timing | Give one system sole ownership |

### 5. Good / Base / Bad Cases

- Good:
  - Button hover uses CSS.
  - Popover reveal uses one `motion.div`.
  - View switching uses `AnimatePresence mode="wait"` when needed.
- Base:
  - A small overlay only animates `opacity` and `y`.
- Bad:
  - A menu shell fades in while its children separately scale in.
  - A hover color transition is rewritten as Motion without a real need.

### 6. Tests Required

- Hover state still responds instantly.
- Mount/unmount surfaces animate once, not in layered phases.
- No visible jitter from mixed CSS/Motion ownership.

### 7. Wrong vs Correct

#### Wrong

```tsx
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
  <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
    {content}
  </motion.div>
</motion.div>
```

#### Correct

```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.965, y: -2 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
>
  {content}
</motion.div>
```

---

## Scenario: Compact Floating Surface Motion

### 1. Scope / Trigger

- Trigger: You are animating the main floating window, a settings window, a context menu, or another compact floating surface.

### 2. Signatures

Typical reveal transition:

```tsx
transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
```

Typical compact reveal shape:

```tsx
initial={{ scale: 0.965, y: -2 }}
animate={{ scale: 1, y: 0 }}
```

Anchor rule:

```tsx
style={{ transformOrigin: "top left" }}
```

### 3. Contracts

- Compact menus and popovers should usually use eased tween transitions, not springs.
- Reserve springs for persistent state transitions where physical feedback is part of the product behavior, such as the main panel minimize/expand flow.
- Cursor-anchored surfaces must align `transformOrigin` with the actual spawn anchor.
- For menus opened from a cursor position, default to `top left` unless placement logic explicitly flips the anchor.
- Keep entry motion small. The element should feel placed, not thrown.

Recommended ranges for compact overlays:

- `duration`: `0.14` to `0.20`
- `scale` start: `0.96` to `0.985`
- `y` start: `-4` to `2`

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Action |
|-----------|-------------------|--------|
| Small menu uses spring | Tail bounce reads as sloppy | Use eased tween |
| Transform origin does not match spawn point | Motion feels detached from click location | Align `transformOrigin` to anchor |
| Initial offset is too large | Menu feels theatrical or laggy | Reduce `scale`/`y` delta |
| Entry animation is applied to both shell and items | Container appears first, children lag behind | Animate the panel as one layer |

### 5. Good / Base / Bad Cases

- Good:
  - Context menu reveals as one surface from its actual anchor.
  - Menu hover states stay CSS-only while the panel reveal uses Motion.
- Base:
  - Panel uses only a slight `opacity + y` tween.
- Bad:
  - Bottom menu item appears to "bounce" because the whole menu uses a stiff spring.
  - Cursor-anchored menu scales from center or top-center.

### 6. Tests Required

- Open context menu near the cursor and confirm the reveal feels anchored to the click position.
- Open the same menu repeatedly and confirm no tail bounce appears on the lower item.
- Confirm hover states still feel immediate during and after reveal.

### 7. Wrong vs Correct

#### Wrong

```tsx
<motion.div
  initial={{ scale: 0.94, y: -3 }}
  animate={{ scale: 1, y: 0 }}
  transition={{ type: "spring", stiffness: 700, damping: 30 }}
  style={{ transformOrigin: "top center" }}
/>
```

#### Correct

```tsx
<motion.div
  initial={{ scale: 0.965, y: -2 }}
  animate={{ scale: 1, y: 0 }}
  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
  style={{ transformOrigin: "top left" }}
/>
```

---

## Scenario: Wheel-Driven Deck Motion Inside Scrollable Panels

### 1. Scope / Trigger

- Trigger: A compact card stack or deck inside a scrollable page/panel should switch cards on mouse wheel instead of letting the parent panel scroll.

### 2. Signatures

Use a native wheel listener when scroll prevention must be guaranteed:

```tsx
useEffect(() => {
  const element = deckRef.current;
  if (!element) return;

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    event.stopPropagation();
    // accumulate delta and switch cards
  };

  element.addEventListener("wheel", handleWheel, { passive: false, capture: true });
  return () => element.removeEventListener("wheel", handleWheel, true);
}, [/* stable deps */]);
```

Visual hover contract when animation spans multiple frames:

```tsx
const isVisuallyHovered = isPointerInside || isAnimating;
const previewOpacity = isVisuallyHovered ? 0.74 : 0.62;
```

### 3. Contracts

- If the deck lives inside a scrollable settings/content panel, do not rely on React `onWheel` alone when parent scroll must be blocked. Use a native `wheel` listener with `passive: false`.
- Keep the wheel handler on the deck root, not on individual animated cards, so the switch gesture survives card re-layering during animation.
- During an in-flight deck animation, freeze hover-derived visual targets from collapsing back to the non-hover state. Pointer exit may happen mid-animation and must not retarget opacity/scale halfway through the transition.
- If reduced motion shortens the visual deck transition, any wheel/input lock timer must shrink to the same effective duration. Do not keep the deck non-interactive after the visible motion has already settled.
- Only the active/front card may receive pointer events; stacked background cards must use `pointerEvents: "none"`.
- Prefer keyed transform/opacity timelines for deck role changes (front -> back, back -> front). Do not mix deck role animation with separate hover animation ownership on the same properties.

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Action |
|-----------|-------------------|--------|
| Mouse wheel over deck | Parent settings panel does not scroll | Use native `wheel` listener with `passive: false` |
| Deck cards reorder during animation | Wheel gesture still works on container | Attach listener to deck root |
| Pointer leaves deck mid-animation | Card opacity/scale does not jump or flicker | Freeze visual hover while `isAnimating` |
| Reduced motion is enabled | Wheel navigation unlocks when the shorter motion finishes | Keep timers/locks aligned with reduced-motion duration |
| Background card remains interactive | Clicks hit hidden/back card | Set `pointerEvents: "none"` on non-active cards |
| Hover styles and motion both drive opacity | Flicker or retargeting mid-transition | Give motion sole ownership of animated opacity |

### 5. Good / Base / Bad Cases

- Good:
  - Settings card deck captures wheel locally and the page stays still.
  - Pointer leaves during animation but the deck finishes on the original visual path.
  - Only the front card is clickable.
- Base:
  - Deck uses a small accumulated wheel threshold to avoid overly sensitive trackpad switching.
- Bad:
  - Parent panel scrolls even though the deck is supposed to own the gesture.
  - Preview card flickers because hover opacity changes while the card is moving to the back layer.
  - Both front and back cards accept clicks during animation.

### 6. Tests Required

- Hover the deck and scroll: confirm the parent panel does not move.
- Start a card switch and move the pointer out before the animation ends: confirm no flicker or sudden opacity jump appears.
- Enable reduced motion and switch cards: confirm wheel/input unlocks as soon as the shorter motion completes.
- Click the preview/background card area: confirm only the active card can receive input.
- Use a small trackpad wheel gesture: confirm the deck does not over-switch from a tiny delta burst.

### 7. Wrong vs Correct

#### Wrong

```tsx
<div onWheel={(event) => event.preventDefault()}>
  <motion.div animate={{ opacity: isHovered ? 0.74 : 0.62 }} />
</div>
```

Why wrong:
- React `onWheel` may not be sufficient to suppress parent scrolling in a nested scroll region.
- Hover state can retarget opacity while the motion transition is still running.

#### Correct

```tsx
useEffect(() => {
  const element = deckRef.current;
  if (!element) return;

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  element.addEventListener("wheel", handleWheel, { passive: false, capture: true });
  return () => element.removeEventListener("wheel", handleWheel, true);
}, []);

const isVisuallyHovered = isPointerInside || isAnimating;
```

---

## Scenario: Transparent Child Window First Paint

### 1. Scope / Trigger

- Trigger: A transparent Tauri child window such as `/settings` or `/context-menu` is being rendered.

### 2. Signatures

Window creation:

```ts
new WebviewWindow("context-menu", {
  url: "/context-menu",
  transparent: true,
});
```

Theme hydration:

```tsx
<ThemeProvider initialTheme={initialTheme}>
  <BrowserRouter>{children}</BrowserRouter>
</ThemeProvider>
```

### 3. Contracts

- Resolve persisted theme before first React render for transparent child windows.
- Do not render the whole window shell from `opacity: 0` if that creates a visible first-frame flash.
- The transparent outer root may stay stable while the visible panel surface animates.
- If the window contains a single compact panel, animate that panel as a unit instead of staggering shell and content.

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Action |
|-----------|-------------------|--------|
| Theme defaults to black before white config loads | One-frame flash on white theme | Preload theme before render |
| Entire transparent wrapper fades from 0 | Window appears to flicker | Keep wrapper stable and animate visible panel |
| Panel and children animate separately | Shell/content mismatch | Use one animated panel surface |

### 5. Good / Base / Bad Cases

- Good:
  - Settings window opens directly in the persisted theme.
  - Context menu appears without a transparent flicker.
- Base:
  - Transparent wrapper is static and only the panel animates.
- Bad:
  - Transparent child window renders black first and corrects on the next frame.

### 6. Tests Required

- Open settings in white theme and verify there is no black-frame flash.
- Open the context menu repeatedly and verify no first-frame transparent flicker appears.

### 7. Wrong vs Correct

#### Wrong

```tsx
<ThemeProvider>
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <Panel />
  </motion.div>
</ThemeProvider>
```

#### Correct

```tsx
<ThemeProvider initialTheme={initialTheme}>
  <div style={{ background: "transparent" }}>
    <motion.div
      initial={{ scale: 0.965, y: -2 }}
      animate={{ scale: 1, y: 0 }}
    >
      <Panel />
    </motion.div>
  </div>
</ThemeProvider>
```

---

## Scenario: Compact Main Window Hover / Expand / Collapse Handoff

### 1. Scope / Trigger

- Trigger: The 200x200 main window expands from icon mode on pointer enter and collapses back on pointer leave or idle.

### 2. Signatures

Compact expand morph:

```tsx
const isExpandMorphVisible = isExpandingFromMinimized && windowResized;
```

Cancelable leave delay:

```tsx
const pointerLeaveCollapseTimerRef = useRef<number | null>(null);
```

DOM hover reconciliation:

```tsx
const isPanelActuallyHovered = containerRef.current?.matches(":hover") ?? false;
```

Transition-token guard:

```tsx
const transitionToken = beginMainWindowBoundsTransition("full");
const result = await currentWindow.animateBounds(bounds, {
  durationMs: 0,
  transitionToken,
});
if (!isMainWindowBoundsTransitionStillCurrent(result.transitionToken, "full")) return;
```

### 3. Contracts

- Do not treat `onMouseLeave` as the sole source of truth for compact-window collapse. During icon-to-panel morphs, React hover events can become stale or arrive before the visual state is stable.
- If pointer exit happens while the expand morph is still running, let the current morph finish and decide the next state in the expand-complete handoff. Do not briefly land on the steady full window for one frame and then immediately collapse.
- Collapse checks that happen after a morph, task outcome, or other transient lock release must reconcile hover from the DOM first, for example via `element.matches(":hover")`, before mutating minimized state.
- Compact/full native-bounds requests must have one logical owner. If multiple async callbacks can request `animateBounds(...)`, every request must carry a transition token or epoch and every completion must verify that the token is still current before committing renderer-state follow-up such as `setIsMinimized(false)` or `setWindowResized(true)`.
- For Windows compact-shell flows, keep the restore target behind a shared constant such as `INTERMEDIATE_EXPAND_SIZE` instead of scattering raw `200` literals across expand, foreground-task restore, and morph handoff code.
- Pointer-leave collapse must be guarded while pointer-down, drag-threshold pending, or active drag state exists. Do not allow leave handling to cancel window dragging.
- If a leave-delay grace window is used, it must be cancelable on re-enter and cleared by shared timer reset helpers. Do not scatter independent leave timers across handlers.
- Hover response may stay immediate on enter, but leave grace for this compact surface should remain short and intentional. Start in the `0.12s` to `0.18s` range; values around `0.20s` are already noticeably sticky on a 200x200 utility window.

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Action |
|-----------|-------------------|--------|
| Pointer exits during expand morph | Expand finishes cleanly, then collapse continues without a full-window flash | Decide collapse in morph-complete handoff |
| Pointer briefly slips out and back in | Collapse is canceled and window stays expanded | Use one cancelable leave-delay timer |
| Pointer leaves while drag gesture is starting | Window drag continues; leave handling does not interrupt | Guard leave handling on pointer-down / pending drag / active drag |
| Post-task unlock runs after hover state drift | Window uses real hover truth, not stale React state | Reconcile with `matches(":hover")` before collapse |
| A stale shrink callback resolves after a newer full-mode request | Full panel never renders inside an `80x80` native shell | Guard `animateBounds(...)` completions with the current transition token |
| Enter feels laggy | Window feels sticky or slow | Keep enter immediate; do not mirror leave delay onto enter |

### 5. Good / Base / Bad Cases

- Good:
  - Rapid icon -> panel -> leave results in one continuous motion path without flashing.
  - A 140ms leave grace absorbs accidental slips while keeping the panel responsive.
  - Dragging the main window across its edge does not collapse the shell.
- Base:
  - Leave delay exists only on collapse, not on expand.
- Bad:
  - A fix only changes one timer while leaving expand-complete handoff unchanged.
  - Hover is stored in React state only and never reconciled after morphs.
  - Pointer leave fires during drag startup and collapses the panel before drag begins.

### 6. Tests Required

- Rapidly enter and leave from icon mode: verify no one-frame flash of the full panel appears.
- Repeated icon -> panel -> leave cycles: verify collapse remains consistent after many repetitions.
- Trigger compact -> expand -> compact -> expand stress cycles and verify a late compact callback cannot leave the main panel clipped inside the native `80x80` window.
- Start dragging the main window and cross the panel edge: verify dragging still works and collapse does not interrupt it.
- Leave and re-enter within the leave-delay window: verify collapse is canceled.
- Finish a foreground task while the pointer is already outside the panel: verify collapse resumes promptly without waiting for idle.

### 7. Wrong vs Correct

#### Wrong

```tsx
onMouseLeave={() => {
  setIsPanelHovered(false);
  collapseMainWindowToIcon();
}}
```

Why wrong:
- Leave is treated as authoritative even when the shell is mid-morph or drag preparation is active.
- Fast exit can cause expand and collapse animations to fight each other.

#### Correct

```tsx
onMouseLeave={() => {
  pointerLeaveCollapseTimerRef.current = window.setTimeout(() => {
    if (isExpandingFromMinimized || pendingDragStartRef.current) return;
    collapseMainWindowIfPointerOutside();
  }, 140);
}}
```
