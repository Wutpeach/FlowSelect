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

### Shared Motion Tokens

Reusable UI motion values live in:

```text
src/components/ui/motion.ts
```

Use this module for shared easing tuples, duration tokens, compact presence presets, and small motion helper functions. Keep it as a leaf module: it must not import from `shared-styles.ts` or other UI components.

`MOTION_EASE.compact` and `COMPACT_EASE` intentionally represent the same curve in different formats:

- `MOTION_EASE.compact`: Motion tuple, for `motion/react`
- `COMPACT_EASE`: CSS cubic-bezier string, for CSS transitions in `shared-styles.ts`

Do not parse CSS strings into Motion tuples or force CSS consumers to use Motion tuple values.

CSS transition helpers exported from `motion.ts` must include `Css` in the name, such as `compactCssTransition(...)`, so they are not confused with Motion transition objects.

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

### Phase Boundary Rule

Shared motion tokens may be used by low-risk UI consumers such as dropdowns, settings page transitions, and center overlays. The main floating-window compact/full morph is a separate high-risk motion area. Do not tune or refactor its lifecycle epoch handling, hover-collapse timing, or platform-specific compact shell behavior as part of generic motion-token cleanup.

Main floating-window presentation is owned by the `src/presentation/main-window/` module. The lifecycle reducer (`lifecycle.ts`) is the only writable full/compact/transition authority; `projections.ts` derives visual/interaction/native facts; `geometry.ts` is spatial only; `motionRecipes.ts` owns renderer choreography (spring/tween/icon-handoff values); `pointerField.ts` is the one continuous pointer coordinate authority (viewport-local MotionValues measured from the stable presentation root); `magnetic.ts` is the full-mode-only Magnetic visual consumer of the Pointer Field (renderer-local displacement, zero in compact/reduced-motion/drag states, no lifecycle or native involvement). Normal full↔compact morphs are renderer-visual-only and never change native width/height or call a renderer-facing bounds animation API. The Magnetic outer layer and the shell morph nodes own transforms on different DOM nodes; no transform is merged, mirrored, or written by two owners.

Native Main Window surface policy lives in `electron/mainWindowSurfacePolicy.mts` (compact reachability correction, monitor clamp, position-only interpolation). The renderer never requests arbitrary native width/height, target bounds, easing, or duration.

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

- Trigger: A transparent desktop child window such as `/settings` or `/context-menu` is being rendered.

### 2. Signatures

Window creation:

Current implementation detail may vary by Electron window creation helpers; the motion contract is about first paint and panel animation behavior, not a specific framework constructor.

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

Lifecycle intent from application code:

```tsx
presentation.dispatch({ type: "requestFull", reason: "task", recipe: "instant" });
```

Pointer/drop facts and visual completion flow into the same reducer:

```tsx
presentation.dispatch({ type: "pointerEnter" });
presentation.dispatch({ type: "pointerLeave" });
presentation.dispatch({ type: "dropEnter" });
// Surface Motion completion reports its transition epoch:
presentation.dispatch({ type: "visualTransitionCompleted", target: "compact", epoch });
```

### 3. Contracts

- The lifecycle reducer (`src/presentation/main-window/lifecycle.ts`) is the only writable compact/full/transition authority. `App.tsx` issues intent-level facts and requests only; it never owns collapse timers, completion handoff, native sequencing, hotspot evaluation, or Motion recipe assembly.
- Do not treat `onMouseLeave` as the sole source of truth for compact-window collapse. Leave is one signal; the reducer gates it against phase and pointer truth, and the native pointer-boundary subscription (with a listener-generation guard) supplies the same fact channel during transparent-window morphs.
- If pointer exit happens while the expand morph is still running, the reducer records pointer-outside without interrupting the expand; the matching expand completion starts normal collapse pending. Do not land on a steady full window for one frame and then collapse.
- Pointer enter/leave is the primary compact/full contract: entering the compact icon expands immediately, and leaving an unlocked full shell must collapse through the short leave grace window (80 ms) without waiting for a longer idle path. First launch is not exempt from this rule.
- There is no normal 3-second idle collapse contract for compact/full switching.
- The compact transition has exactly one acknowledgement: the matching Renderer Motion collapse completion, checked against the lifecycle epoch. Stale completions after reversal are ignored. Native compact reachability correction is independent, cancellable OS work; it never completes or gates the lifecycle or passthrough. There is no `nativeSettled` state.
- Windows compact passthrough activates only after the matching collapse completion (one edge-triggered `native.setInteraction` effect) and never flips during collapse; the pure interaction projection independently reports `compact-passthrough` for settled compact.
- Before the main window settles into compact/icon mode, the native surface policy (`electron/mainWindowSurfacePolicy.mts`) clamps the compact frame into the current monitor work area with position-only interpolation. Returning to interactive mode cancels any active correction.
- Normal full↔compact morphs keep one stable BrowserWindow viewport and never send per-frame native bounds updates from the renderer. The renderer cannot request arbitrary native width/height, target bounds, easing, or duration.
- Keep the minimized `AnimatePresence` container visually stable during the shell collapse, then trigger a small pulse on the visible inner icon wrapper only after the lifecycle reaches `compact` (keyed by the settle epoch). This avoids racing the icon animation against the panel shell `clipPath` / radius morph.
- Pointer-leave collapse must be guarded while pointer-down, drag-threshold pending, or active drag state exists (the `drag` lock). Do not allow leave handling to cancel window dragging.
- The leave-delay grace window is one cancelable 80 ms timer owned by the effect executor; re-entry cancels it. Do not scatter independent leave timers across handlers.
- Hover response may stay immediate on enter, but leave grace for this compact surface should remain short and intentional. Keep the `80 ms` timer value in the lifecycle effect contract.

### 4. Validation & Error Matrix

| Condition | Expected Behavior | Action |
|-----------|-------------------|--------|
| Pointer exits during expand morph | Expand finishes cleanly, then collapse continues without a full-window flash | Decide collapse in morph-complete handoff |
| Pointer briefly slips out and back in | Collapse is canceled and window stays expanded | Use one cancelable leave-delay timer |
| Pointer leaves while drag gesture is starting | Window drag continues; leave handling does not interrupt | Guard leave handling on pointer-down / pending drag / active drag |
| Post-task unlock runs after hover state drift | Window uses real hover truth, not stale React state | Reconcile with `matches(":hover")` before collapse |
| External dragover expands the compact shell without firing a real pointer enter | Expand morph stays open through the drop instead of collapsing mid-drag | Hold a dedicated drag-hover ref and treat it as hover ownership until `drop`/`dragleave` |
| A stale compact completion resolves after a newer full request | Passthrough and compact state must not apply to a newer full surface | Epoch-check the Renderer Motion completion in the lifecycle; stale completions after reversal are ignored |
| Full shell is dragged partly outside the display before collapse | Compact icon remains visible and reachable inside the current work area | Native surface policy clamps the compact frame into the monitor work area (position-only) |
| macOS collapse shows icon drift or last-frame flicker | One shell stays visually anchored through the morph | Keep one shell surface active; the icon plate appears only after lifecycle compact (settle epoch pulse), never tied to native bounds |
| Full-mode rounded shadow or scale overshoot clips into straight corners | Native full viewport has no gutter for transparent-window drawing | Restore full-mode shadow gutter through `getMainWindowFullOuterSize(...)` while keeping visible panel `200x200` |
| Compact icon elasticity causes outline shimmer or thickening | Elasticity was applied to the panel shell layer that draws the outline | Move elasticity to a post-collapse inner icon wrapper pulse |
| Center icon flashes during full -> compact collapse | Icon enter keyframes overlap with shell `clipPath` / radius morph | Keep the outer icon container stable during collapse and pulse only after the lifecycle reaches `compact` (settle epoch) |
| Enter feels laggy | Window feels sticky or slow | Keep enter immediate; do not mirror leave delay onto enter |

### 5. Good / Base / Bad Cases

- Good:
  - Rapid icon -> panel -> leave results in one continuous motion path without flashing.
  - An 80ms leave grace absorbs accidental slips while keeping the panel responsive.
  - Dragging the main window across its edge does not collapse the shell.
  - On macOS, the cat icon does not jump at the end of full-window -> icon collapse because the icon pulse only appears after the lifecycle reaches compact (settle epoch), independent of native bounds — the BrowserWindow viewport stays stable full.
- Base:
  - Leave delay exists only on collapse, not on expand.
- Bad:
  - A fix only changes one timer while leaving expand-complete handoff unchanged.
  - Hover is stored in React state only and never reconciled after morphs.
  - Pointer leave fires during drag startup and collapses the panel before drag begins.

### 6. Tests Required

- Rapidly enter and leave from icon mode: verify no one-frame flash of the full panel appears.
- Repeated icon -> panel -> leave cycles: verify collapse remains consistent after many repetitions.
- On macOS, verify the cat icon stays centered through the last collapse frames and no extra inset jump appears when the compact shell settles.
- Drag the full shell against each display edge, then collapse: verify the compact icon remains inside the active monitor work area.
- Trigger compact -> expand -> compact -> expand stress cycles and verify a stale compact completion (epoch mismatch) cannot enable passthrough or collapse a newer full surface.
- Start dragging the main window and cross the panel edge: verify dragging still works and collapse does not interrupt it.
- Drag a web image or video into icon mode: verify the window expands once, does not bounce back to compact during the drag, and does not end stuck in the full window because of a stale collapse decision.
- Leave and re-enter within the leave-delay window: verify collapse is canceled.
- Finish a foreground task while the pointer is already outside the panel: verify collapse resumes promptly without waiting for idle.
- When tuning full-mode elasticity, verify Windows and macOS full rounded shadows are not clipped and the visible panel body remains aligned inside the larger native viewport.
- When tuning compact icon elasticity, verify the Windows compact outline stays stable and the pulse is disabled under reduced motion.
- Capture or inspect rapid full -> compact cycles when changing compact icon handoff timing; no center-icon partial-opacity or partial-scale flicker frame should appear during the shell morph.

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
// No App-owned leave timer at all: the lifecycle emits collapseTimer.start /
// collapseTimer.cancel effects and the effect executor owns the single
// cancelable 80 ms timer, reporting the timer epoch back. Re-entry cancels
// it; the drag lock gates collapse inside the reducer.
```
## Scenario: MR0 Motion / Presentation Architecture Foundation

MR0 codifies the repository-level contracts that later stages (MR1 Expanded Dot Field, MR2 Character, MR3 Progress Field, MR4 Intake/Confirmation/Terminal Reveal) share. It introduces NO shared animator, global runtime, recipe framework, renderer hierarchy, DSL, or graphics dependency. Execution stays heterogeneous: `motion/react` + DOM/SVG for shell/Character-style work, and renderer-local Canvas 2D + rAF remain available for a future Dot Field if profiling justifies it.

### 1. Authority direction (one-way, unique)

```text
Download/Application facts
  -> Download reducer/selectors
  -> presentation projections (center overlay + main-window projections)
  -> Presentation Surface wiring/composition
  -> renderer-local disposable motion
  -> pixels

Main Window lifecycle authority
  -> phase/lock/recipe projections
  -> shell and feature eligibility
  X no feature-motion completion may write lifecycle progression
```

- `src/presentation/main-window/lifecycle.ts` is the only writable full/compact/transition authority; `reactAdapter.ts` is the only file that reduces it.
- `pointerField.ts` is the only continuous pointer-geometry authority; `MainWindowPresentationSurface.tsx` is the only file that writes it (`updatePointerFieldFromClientPoint` / `resetPointerFieldToCenter`).
- Interaction Origin (`interactionOrigin.ts`) is a discrete snapshot, never a second pointer authority.
- Motion state is disposable/reconstructible and never gates correctness: losing it cannot change tasks, progress, terminal outcome, lifecycle, or collapse.
- Shell `visualTransitionCompleted` is a private lifecycle-owned epoch acknowledgement; feature motion must not use it as a collapse gate.
- Enforced by `src/architecture/import-guard.test.ts` (MR0 renderer-local motion guard).

### 2. Presentation composition: persistent + bounded transient + terminal priority

Projection shape (a contract, not a state machine):

```text
Authoritative facts
  -> projected presentation target
       persistent baseline
       + bounded transient intent(s)   (consumer-local epoch/generation)
       + optional terminal-priority target
  -> consumer-local execution
```

- Persistent baseline: current projected visual target from authoritative facts (e.g. logical progress). A local runtime may interpolate toward it.
- Transient response: bounded, event-scoped, additive (e.g. click/intake ripple). Latest-replaces for same-priority ephemeral work; a consumer may coalesce or suppress. NEVER an unbounded FIFO queue.
- Terminal target: success/failure/cancelled projection with visual priority; may interrupt/absorb/suppress transients without waiting. It is a projection, not a Product or lifecycle authority, and it does not own collapse.
- When a transient ends it reconverges to the CURRENT persistent baseline — including baseline changes that arrived while the transient ran.
- No shared type is added for this shape until two real consumers need the exact same data contract; vocabulary lives in specs and tests (see `presentationCompositionContract.test.ts`).

### 3. Renderer-local runtime lifecycle (every consumer, no shared engine)

| Event | Required behavior |
| --- | --- |
| mount | construct from the current presentation target; never require historical animation state |
| target change | accept immediately; for suitable geometry, retarget from the current rendered condition rather than reset/replay |
| persistent update during transient | update stored/projected baseline; transient remains additive and later returns to the NEW baseline |
| terminal target | supersede lower-priority transient work from the current visual condition; do not wait |
| reduced-motion change | resolve deterministically to the reduced semantic target; cancel unnecessary travel; no fake lifecycle completion |
| collapse / eligibility exit | invalidate the active generation, hard-stop frames/timers/controls, and SLEEP (a still-mounted surface is not permanently disposed) |
| re-expand / eligibility re-entry | wake or reconstruct from the current projection, never from pre-collapse animation history |
| surface replacement / unmount / dispose | permanently mark disposed, release rAF/timers/subscriptions/Motion controls, make late callbacks no-op |
| rebuild after replacement | reconstruct from current projection; brief visual continuity loss is acceptable |

M2 Pointer Field is existing evidence of local `MotionValue` ownership and stable consumption, not a universal template: its event-driven values do not run a permanent frame loop. Future rAF/Canvas consumers add explicit wake/settle/sleep locally.

### 4. Interpolation classes

- Information-bearing geometry (e.g. visual progress): may lag but approaches the latest authoritative value MONOTONICALLY and never visually exceeds it; retargets from the current rendered value. Progress values remain selector authority.
- Expressive geometry (Character body/ears/eyes/hands, decorative pulses, Magnetic displacement): may spring, lag, overshoot, squash, or settle freely because it carries no authoritative quantity. It may consume the Pointer Field but cannot create another continuous pointer state.

### 5. Reduced motion

Responsibility is split: the presentation projection/recipe boundary selects the deterministic reduced semantic target (fact visible/understandable; travel, deformation, propagation, displacement removed or shortened); the consumer-local renderer executes it immediately or with minimal non-spatial transition and stops obsolete work. Applies at mount AND mid-flight. Product and lifecycle code never receive a fake animation completion.

### 6. Performance: sleep/wake and no cross-layer frame loops

- React publishes target/input changes, never per-frame geometry.
- Electron Main, BrowserWindow, preload, and IPC never participate in per-frame feature motion.
- Local runtimes wake on input/target/transient, render/interpolate, detect settlement, cancel scheduling, and hold ZERO scheduled frames while settled (frame-count instrumentation in `presentationCompositionContract.test.ts`).
- No `setState`/React render loop, Electron Main/BrowserWindow loop, or high-frequency IPC carries frame geometry.

### 7. Windows correctness closures (MR6; not solved by visual replacement)

Both observed issues were reachable on the committed M0–M2/MR0 baseline and
were not removed by replacing Reveal/Progress visuals. MR6 closes them as two
independent repairs without changing the existing authority model:

- Native manual-position boundary: `src/App.tsx` -> `src/desktop/runtime.ts` ->
  `electron/preload.mts` -> the targeted `electron/main.mts` IPC handler ->
  `electron/mainWindowManualPosition.mts`. Electron Main rejects every
  non-finite converted coordinate before the single native `win.setPosition`
  write and preserves finite `Math.round` semantics. Compact reachability and
  renderer coordinate ownership are unchanged.
- Terminal retention/lifecycle release: Download's exact post-reduction
  terminal selection still enters `App.tsx` `showForegroundTaskOutcome`, but
  Application now publishes the outcome and arms the existing request-id timer
  without waiting for renderer frames, Motion completion, or visual callbacks.
  Timer expiry or new-primary invalidation changes only Presentation state;
  `centerOutcome` projects the final lock release into the unchanged lifecycle
  reducer, which remains the sole full/compact/transition authority.

Regression gates: `src/architecture/windows-risk-path.test.ts`,
`electron/mainWindowManualPosition.test.mts`, and
`src/architecture/windows-terminal-retention.test.ts`.

### 8. Tests required (MR0)

- `src/architecture/import-guard.test.ts` — MR0 renderer-local motion guard: leaf import restrictions, position/IPC side-channel bans, surface wiring boundary, lifecycle/pointer writer uniqueness, M3 candidates not promoted.
- `src/architecture/windows-risk-path.test.ts` — both repaired Windows chains
  pinned link-by-link at their existing authority boundaries.
- `src/presentation/main-window/presentationCompositionContract.test.ts` — NORMATIVE test-only contract model: composition invariants, interpolation classes, sleep/wake harness. It defines the required behavior future consumers must conform to and does NOT certify that any current production module already complies; each MR1/MR2 implementation must add its own conformance tests against these contracts.
- Existing M0/M1/M2 focused suites remain authoritative (`lifecycle`, `projections`, `effectExecutor`, `geometry`, `pointerField`, `magnetic`, `motionRecipes`, `panelHover`, `presentationCompletion`, `mainWindowSurfacePolicy`, `mainWindowPointerBoundary`, `preloadBridgeContract`).

## Scenario: MR1 Expanded Dot Field Consumer

### 1. Scope / Trigger

This contract applies only to `src/presentation/main-window/DotFieldCanvas.tsx`,
`dotFieldRuntime.ts`, `dotFieldRecipe.ts`, and their Surface wiring. It is the
first concrete MR0 consumer, not a renderer or scheduler template for future
Character, Progress, Intake, or Terminal work.

### 2. Signatures

The Surface supplies coarse inputs and discrete local intents:

```ts
type DotFieldBaseline = {
  size: number;
  dormant: string;
  ack: string;
  reducedMotion: boolean;
};

type DotFieldIntent = {
  kind: "click" | "context";
  origin: { u: number; v: number };
};
```

The runtime lifecycle is `wake -> submitIntent/setBaseline -> settle/sleep ->
dispose`; it never publishes a completion or authority write.

### 3. Contracts

- Eligibility is derived by `MainWindowPresentationSurface` from settled full
  presentation (`mode === "full" && transitionEpoch === null`).
- The Canvas is a non-interactive, `aria-hidden` background. React publishes
  baseline revisions and discrete intents only; Canvas 2D + local rAF owns
  frame geometry.
- Transient storage is bounded to one active intent plus one fixed-size
  residual field. On retarget, the currently rendered field is frozen into
  that single residual and continues its own decay while the new local wave is
  seeded. This preserves visual continuity without a FIFO or historical replay.
- Baseline/theme revisions are read on every draw. A live residual must not be
  replaced by a dormant-only frame and then reappear.
- A normal-to-reduced-motion change re-times any live residual to at most the
  reduced duration while preserving its current local brightness and frozen
  shape. It does not travel and emits no fake completion.
- Grid population is capped at 400 dots, backing DPR at 2, and pending rAF at
  one. Settled, sleeping, and disposed runtimes hold zero pending frames.
- Sleep and dispose clear active/residual state and invalidate queued frames;
  wake reconstructs from current baseline inputs.

### 4. Validation / Error Matrix

| Condition | Required result |
| --- | --- |
| rapid click/context retarget | current rendered field decays continuously; latest origin is acknowledged; no queue |
| baseline changes with residual live | next scheduled draw uses the latest material; no dormant flash |
| reduced motion turns on mid-response | no propagation; active and residual settle within the reduced bound |
| eligibility exits | pending frame canceled, transient discarded, runtime remains wakeable |
| unmount/replacement | permanent dispose; stale callback is a no-op |
| dormant/settled | no continuing rAF or React frame updates |

### 5. Good / Base / Bad Cases

- Good: a click retarget folds the old rendered values into one local residual,
  seeds the new origin, and returns to the latest dormant theme with zero frames.
- Base: wake performs one necessary dormant redraw and schedules nothing else.
- Bad: reset to dormant then replay; preserve a list of prior origins; let a
  normal-mode residual continue for 480 ms after reduced motion becomes active.

### 6. Tests Required

- `dotFieldRecipe.test.ts`: deterministic/capped topology, bounded origins,
  response/material limits, soft front, raw-DPR query and capped backing DPR.
- `dotFieldRuntime.test.ts`: first-frame retarget continuity, fixed residual
  replacement, latest-baseline material, reduced-motion retiming, sleep/wake,
  dispose/stale generation, and zero pending frames at rest.
- `dotFieldSurface.test.ts`: gesture exclusions and synchronous context origin
  wiring facts.
- `dotFieldPerfValidation.test.ts`: peak pending rAF <= 1 and rest pending rAF =
  0 across normal, burst, theme, reduced-motion, and sleep scenarios.
- `src/architecture/import-guard.test.ts`: no Product/lifecycle/native/Electron/
  IPC/Pointer Field authority imports or writes.

### 7. Wrong vs Correct

#### Wrong

```ts
pendingIntents.push(intent); // unbounded history and replay
dispatch({ type: "visualTransitionCompleted" }); // authority leak
```

#### Correct

```ts
residual = foldCurrentRenderedField(); // one bounded local snapshot
intent = seedLatestIntent(nextIntent); // latest replaces, one rAF path
```

## Scenario: MR3 Progress Field Consumer

### 1. Scope / Trigger

This contract applies to the MR3 Progress Field:
`src/presentation/main-window/downloadProgressProjection.ts` (pure projection),
the progress extension of `dotFieldRecipe.ts` / `dotFieldRuntime.ts`, and their
Surface wiring. It reuses the MR1 single Canvas/rAF runtime; it adds no new
Progress system, shared Motion runtime, generic scheduler, dependency, or
central progress UI rewrite. MR4 (Intake/Confirmation/Terminal Reveal) is out
of scope.

### 2. Signatures

Data path:

```text
Download reducer/selectors (authoritative task + percent)
  -> resolveDownloadProgressTarget(task, progress)   // pure, no authority writes
  -> DotFieldProgressTarget (idle | determinate | indeterminate)
  -> Dot Field runtime progress baseline (renderer-local interpolation)
  -> pixels
```

```ts
type DotFieldProgressTarget =
  | { kind: "idle" }
  | { kind: "indeterminate"; traceId: string }
  | { kind: "determinate"; traceId: string; target: number };
```

### 3. Contracts

- Download authority -> pure projection: the projection maps selector output
  to a target; it never dispatches, cancels, or writes Product/lifecycle/native
  state (type-only Download imports, enforced by import-guard).
- Single Dot Field runtime: progress is one persistent baseline channel on the
  existing MR1 runtime, not an intent; no new Progress system or abstraction.
- Determinate rendering: row-major occupancy frontier. The rendered level may
  lag but approaches the latest authoritative target MONOTONICALLY and never
  exceeds it; downward authoritative revision clamps immediately (information
  correctness outranks continuity).
- Same-trace coalescing: high-frequency updates converge from the current
  rendered condition to the LATEST target; at most one pending frame.
- New-trace rebase: a trace replacement rebases immediately; through an
  indeterminate gap it resets to a safe zero seed — no old-task progress carry.
- Indeterminate: non-percent states (probing/selecting, non-finite percent)
  render a soft diagonal sweep band (normal motion) or static centered bloom
  (Reduced Motion); never read as a determinate frontier.
- Reduced Motion: the projection selects a static semantic target; the runtime
  resolves it directly with no travel and stops obsolete work.
- Acknowledgement transients (clicks) compose additively on the frontier and
  settle back to the LATEST progress baseline.
- Terminal/removal: projection -> idle; sleep/wake reconstructs from the
  current projection; the field returns to dormant.
- Frame budget: one pending rAF max; ZERO pending frames at idle/settled/
  sleep/dispose.
- No completion authority: progress motion never writes lifecycle, Product, or
  native completion state.

### 4. Validation / Error Matrix

| Condition | Required result |
| --- | --- |
| trace replacement mid-display | rebase to the new trace's target; old task progress never renders |
| downward authoritative revision | rendered level clamps at/below the new target immediately |
| high-frequency percent updates | converge to the latest target from the current condition, one pending frame |
| indeterminate (probing / non-finite percent) | band or bloom, never a determinate frontier |
| reduced motion active | static information; no sweep loop |
| click over the frontier | additive transient; settles to the latest baseline |
| terminal / removal | idle; reconstruct; dormant draw; zero frames |
| same-trace determinate -> indeterminate -> determinate | safe seed at/below target, no visual pop |

### 5. Good / Base / Bad Cases

- Good: a new task rebases immediately; a dropped percent is never visually
  overstated; the indeterminate band runs at low duty.
- Base: a same-trace upward update converges from the current rendered level.
- Bad: carrying the replaced trace's numeric progress into a new trace;
  rendering a percent the authority never reported; keeping a sweep loop
  running at idle, reduced motion, or sleep.

### 6. Tests Required

- `downloadProgressProjection.test.ts`: idle/determinate/indeterminate
  mapping, clamping, trace identity, pure current-state projection.
- `dotFieldRecipe.test.ts`: frontier occupancy, band, and reduced bloom
  rendering bounds.
- `dotFieldRuntime.test.ts`: convergence, coalescing, downward clamp, trace
  rebase including the indeterminate-gap reset, reduced snap, additive
  acknowledgement settle, sleep/wake/dispose.
- `dotFieldPerfValidation.test.ts`: peak pending rAF <= 1 and rest pending
  rAF = 0 across determinate/indeterminate/click/sleep/reduced scenarios.
- `src/architecture/import-guard.test.ts`: the projection stays free of
  authority vocabulary.

### 7. Wrong vs Correct

#### Wrong

```ts
progressLevel = Math.min(progressLevel, target); // seeds from the replaced trace
dispatch({ type: "setProgress", target }); // authority write from motion
```

#### Correct

```ts
if (next.kind === "indeterminate" && traceChanged) progressLevel = 0;
progressLevel = clamp(level + (target - level) * RATE, 0, target); // never overstates
```

## Scenario: MR4 Terminal Reveal Consumer

### 1. Scope / Trigger

This contract applies to the MR4 Download-only Terminal Reveal:
`src/presentation/main-window/downloadTerminalProjection.ts` (pure
center-outcome Presentation -> Dot Field lane projection), the terminal
extension of `dotFieldRecipe.ts` / `dotFieldRuntime.ts` (one bounded priority
lane), and their Surface wiring. It reuses the MR1 single Canvas/rAF runtime
and the MR3 progress baseline; it adds no second canvas, generic animator,
shared scheduler, state-machine framework, dependency, or central outcome
rewrite. Intake Reveal, Folder Confirmation, Transcode Reveal, and
terminal-not-compact repair remain out of scope.

### 2. Signatures

Data path:

```text
Download feature classifies the FIRST terminal transition (typed outcome)
  -> Download reducer removes/tombstones the trace (MR3 projection -> next/idle);
     terminal listeners receive (outcome, postReductionState) — the exact
     controller state captured synchronously AFTER the reduction, so no React
     commit timing or ref snapshot can lag it (read-only, never mutated)
  -> App decides visibility from that snapshot (background terminal while
     another primary Download remains -> suppress; none remains -> show)
  -> App center outcome state machine (one bounded Presentation slot, requestId,
     origin: "terminal" for typed terminals only; generic enqueue/command
     failures and image/file/transcode outcomes default origin "foreground")
  -> resolveDotFieldTerminalTarget(overlay, primaryDownloadTask)  // pure, no authority writes
  -> DotFieldTerminalTarget (none | terminal(success|failure|cancelled))
  -> Dot Field runtime terminal lane (renderer-local reveal level 0..1)
  -> pixels
```

```ts
type DotFieldTerminalTarget =
  | { kind: "none" }
  | { kind: "terminal"; status: "success" | "failure" | "cancelled" };
```

The center DOM overlay (icon + message + diagnostic copy) remains the
accessible semantic carrier; the lane is ack-tone decorative presence only.

### 3. Contracts

- Terminal authority -> read-only projection: the projection reuses the
  already-classified center outcome status; it never classifies, retains a
  trace, or writes Product/lifecycle/native state (type-only center-overlay
  imports, enforced by import-guard).
- Interruption is Download-only: a current primary DOWNLOAD projects `none`
  immediately and the runtime clears the lane the moment a progress target
  arrives. A Transcode primary is NOT an MR4 interruption rule — the center
  overlay selector (`selectCenterOverlayVisual`) may visually prioritize
  Transcode independently, but MR4 projection/tests/spec never claim
  Transcode semantics. A background terminal while a primary Download exists
  is suppressed from the controller's EXACT post-reduction snapshot (the
  terminal's own trace is already pruned, so any remaining primary is
  necessarily "another" download). Invalidation is state+timer+lock, not just
  canvas suppression: a NEW current primary Download dismisses the previous
  typed terminal Presentation and its retention timer (via the existing
  `dismissTransient` primitive) immediately, pre-first-progress included,
  releasing the `centerOutcome` lock; the authoritative typed terminal fact
  in the Download queue state is untouched, and requestId generation guards
  make the dismissed timer a stale no-op.
- Typed-origin discriminator, never inferred: only outcomes carrying
  `source: "download"` AND `origin: "terminal"` (set by App ONLY from an
  already-classified Download terminal transition) project to the lane or are
  invalidated by a new primary Download. Generic download-sourced outcomes —
  enqueue/command failures, image/file tasks defaulting to source
  "download" — stay on their existing presentation paths and never seed or
  invalidate the MR4 lane.
- Download-only sourcing: transcode/image/folder outcomes stay on their
  existing presentation paths and never seed the lane.
- Single bounded lane: one kind slot; a kind change replaces it (no FIFO);
  same-kind re-application keeps the running reveal (no restart); the lane
  renders exactly while the projected target is present.
- Retention is owned by the publishing Presentation (the center overlay
  requestId/timer policy), never by the runtime: no rAF/timer/completion
  callback starts, extends, or finishes the retention deadline.
- Reduced Motion: the lane seeds at the fully revealed semantic level
  directly (zero frames, no travel); a mid-flight flip resolves immediately;
  outcome identity, message, and diagnostic action stay in the DOM carrier.
- Interruption: sleep/dispose clear the lane; wake reconstructs from the
  current projection; late callbacks are stale no-ops.
- Acknowledgement transients are absorbed while the lane is active
  (terminal-priority per the MR0 composition contract).
- Frame budget: one pending rAF max; a converged lane holds statically with
  ZERO pending frames; idle/sleep/dispose hold zero.
- No completion authority: terminal motion never writes lifecycle, Product,
  or native state; the `centerOutcome` lock is projected by App presentation
  state only, and the `task` lock comes from Product task facts only.

### 4. Validation / Error Matrix

| Condition | Required result |
| --- | --- |
| typed success / failure / cancelled outcome | three distinct lane materials + distinct center icons/tone |
| current primary DOWNLOAD exists while a terminal is stored | lane none immediately; old retention cannot re-lock or replay |
| Transcode primary with a stored terminal | no MR4 interruption rule; the center overlay may prioritize Transcode visually; the lane follows the Download-only projection |
| background terminal while a primary Download exists | suppressed from the exact post-reduction snapshot; current progress/cancel affordance unchanged |
| generic download enqueue/command failure | center overlay shows the failure as before; the MR4 lane NEVER projects it |
| synchronous progress/queue events before a terminal | all present in the listener snapshot; no stale React ref can miss them |
| retention expiry | projected target removed -> lane clears, field settles to current baseline |
| kind change while retained | one slot replaced; no FIFO; no restart for same kind |
| reduced motion active | semantic target available immediately; static material; zero frames |
| mid-flight reduced flip | lane resolves to final level without travel |
| click/context during terminal | absorbed; nothing scheduled or replayed |
| sleep / dispose / re-entry | lane cleared; wake reconstructs from the current projection |
| progress target arrives mid-reveal | lane superseded at once; progress convergence only |

### 5. Good / Base / Bad Cases

- Good: a terminal arrives while the window is compact; the semantic outcome
  and retention are owned by the overlay; on re-expansion the lane
  reconstructs from the current projection and renders only for the
  remaining retention.
- Base: a converged terminal lane holds statically with zero pending frames
  until the Presentation removes the target.
- Bad: holding a terminal in the runtime past the Presentation deadline;
  letting a lane replay after a newer task arrived; deriving terminal kind
  from progress disappearance, timers, or animation completion; seeding the
  lane from transcode/image/folder outcomes.

### 6. Tests Required

- `downloadTerminalProjection.test.ts`: three-way mapping, loading/visible
  phases, source filter, primary-DOWNLOAD invalidation (Transcode is not an
  MR4 rule), origin discriminator (generic enqueue/command outcomes never
  project), pure current-state, background-terminal suppression and primary
  invalidation decisions (download-only, terminal-origin only;
  transcode/image/folder untouched).
- `useDownloadQueue.test.ts`: controller terminal-notification seam — the
  listener receives the exact post-reduction snapshot; background terminal
  while another primary remains is suppressed, a sole terminal is shown, and
  synchronous progress/queue changes before a terminal are all reflected in
  the snapshot (no React commit timing involved).
- `dotFieldRecipe.test.ts`: terminal material bounds (success occupancy,
  failure/cancelled bloom), monotonicity, kind amplitude ordering, invalid
  input guards.
- `dotFieldRuntime.test.ts`: seed/converge/hold, removal settle, kind
  replace, same-kind no-restart, reduced snap, mid-flight reduced flip,
  progress supersede, intent absorption, sleep/wake reconstruction,
  dispose staleness, one-frame budget.
- `dotFieldPerfValidation.test.ts`: peak pending rAF <= 1 and rest pending
  rAF = 0 across reveal/absorb/supersede/reduced/removal scenarios.
- `src/architecture/import-guard.test.ts`: the projection stays a leaf with
  no authority vocabulary.
- `src/architecture/windows-risk-path.test.ts`: the terminal-not-compact
  chain stays pinned (MR4 does not repair it).

## Scenario: MR7 Expanded Presentation Substrate

MR7 supersedes the MR1 renderer recipe and the Dot Field execution vocabulary
in the MR3/MR4 scenarios above. Their Product/Application and pure Presentation
semantics remain normative; their Dot Field module names, grid geometry,
acknowledgement intents, materials, and Canvas 2D runtime are retired.

Production dependency direction is fixed:

```text
Download/Application facts
  -> pure Progress / Terminal Presentation targets
  -> MainWindowPresentationSurface
  -> ExpandedPresentationSurface (one concrete WebGL2 host)
  -> consumer-local frame execution
  -> pixels
```

Contracts:

- `expandedPresentationTargets.ts` contains only the current Progress
  (`idle | determinate | indeterminate`) and Terminal
  (`none | success | failure | cancelled`) target shapes. It is not a scene,
  layer, reveal, command, or future-feature API.
- `downloadProgressProjection.ts` preserves current-primary selection, trace
  replacement, authoritative downward revision, and quantitative versus
  non-quantitative progress semantics.
- `downloadTerminalProjection.ts`, App retention, and `centerOverlayState`
  preserve bounded retention, primary priority, stale invalidation, and
  `centerOutcome` lock ownership. The renderer owns none of those facts.
- `ExpandedPresentationSurface.tsx` is the only production Expanded graphics
  host. It may own WebGL2 resources, bounded DPR/resize handling, context
  loss/restoration, and at most one local animation frame. It exposes no
  completion, lock, Product mutation, lifecycle, IPC, or native callback.
- Graphics/context failure fails closed to decorative absence. The existing
  accessible progress, cancel, outcome, and diagnostic DOM remains authority.
- Sleep and dispose leave zero frame work. Reduced Motion preserves the
  semantic material while removing nonessential travelling motion.
- No Canvas fallback, second backend, feature flag, compatibility adapter,
  shared scheduler/runtime/state machine/priority bus, or speculative Intake /
  Folder Reveal API is permitted.

Required regression evidence:

- projection tests for MR3/MR4 semantics and existing retention/lock suites;
- `expandedPresentationRuntime.test.ts` for convergence, downward revision,
  trace replacement, priority, generation, wake/sleep/dispose, Reduced Motion,
  frame bounds, and render-failure isolation;
- `expandedPresentationSurface.test.ts` for the one canvas/WebGL2 host,
  non-interactivity, resource/context lifecycle, and sole production mount;
- `src/architecture/import-guard.test.ts` for authority import bans, zero
  production Dot Field references, deleted legacy modules, and exclusive host;
- real Windows Electron validation for WebGL2 context creation, semantic
  target rendering, collapse/expand sleep/wake, and context recovery.

## Scenario: MR8 Download Intake Presentation

### 1. Scope / Trigger

MR8 adds one concrete Download Intake mode without widening the MR7 substrate
into a generic Reveal system.

Trigger: changes to authoritative Download membership acceptance,
`video-queue-detail`, Download Intake Presentation lifetime/priority, or the
MR7 Expanded target/host.

### 2. Signatures

```ts
type VideoQueueDetailPayload = {
  tasks: VideoQueueTaskPayload[];
  acceptedTraceId?: string;
};

type DownloadIntakeTransition = Readonly<{ traceId: string }>;

type ExpandedPresentationTarget =
  | { kind: "idle" }
  | { kind: "progress"; progress: ExpandedPresentationProgressTarget }
  | { kind: "terminal"; status: "success" | "failure" | "cancelled" }
  | {
      kind: "intake";
      opportunityId: number;
      traceId: string;
      progress: ExpandedPresentationProgressTarget;
    };
```

Production dependency direction is fixed:

```text
Application new Download membership
  -> video-queue-detail + transient acceptedTraceId
  -> DownloadQueueController normal reduction + pre/post membership guard
  -> latest bounded Download Intake Presentation opportunity
  -> pure Terminal / Intake / Progress policy
  -> one ExpandedPresentationTarget
  -> the sole ExpandedPresentationSurface
```

### 3. Contracts

- `acceptedTraceId` exists only on the full queue snapshot caused by actual new
  membership. It is transient protocol metadata, never Download model state,
  persistence, hydration, timing inference, local acknowledgement, or a second
  event channel.
- The controller reduces the queue snapshot first, then publishes Intake only
  when the marked trace is present after reduction and absent before it. The
  listener receives the exact post-reduction state.
- Intake Presentation owns one latest opportunity, a monotonic opportunity id,
  one finite deadline, and stale guards. A newer Intake replaces it; there is
  no Presentation queue or replay.
- Deadline, trace removal, qualifying foreground terminal, unrelated primary
  replacement, controller replacement, and unmount invalidate the opportunity.
  A background terminal remains subject to MR4 suppression. Expiry returns to
  a fresh MR3 projection, never a stored Progress snapshot.
- Intake creates no lifecycle lock, phase, full-intent reason, or native
  request. Download/Application and the Main Window lifecycle reducer retain
  their existing authority.
- `expandedPresentationPolicy.ts` resolves MR4 current-primary suppression,
  Terminal, Intake, then Progress before the host. The host/runtime receives
  one `idle | progress | terminal | intake` target and never competes lanes or
  emits semantic completion.
- The Intake target is concrete to Download Intake. Do not add Folder fields,
  a scene/layer API, command bus, scheduler, priority number, second host, or
  second backend.
- Reduced Motion retains the typed Intake distinction as an immediate/static
  treatment and schedules no nonessential continuous travelling frames.

### 4. Validation & Error Matrix

| Input / transition | Required result |
| --- | --- |
| marked trace absent before and present after normal reduction | publish exactly one Intake with exact post state |
| unmarked hydration/full snapshot | update Download state; publish no Intake |
| replayed marker or advanced-quality dedupe | publish no Intake |
| existing-trace quality selection | preserve membership; publish no Intake |
| rapid distinct accepted traces | latest opportunity replaces; no delayed queue |
| deadline or marked trace removal | invalidate; resolve from current MR3 facts |
| foreground / background terminal | foreground invalidates and Terminal wins; background remains MR4-suppressed |
| controller replacement / unmount | old opportunity and callbacks are stale |
| Reduced Motion Intake | one static semantic frame; no continuous frame work |

### 5. Good / Base / Bad Cases

- Good: an extension-origin request and a renderer-origin request both enter
  the same Application queue path and each new membership carries one marker.
- Base: an unmarked queue refresh updates current Progress without creating or
  replaying Intake.
- Bad: treating an ack, click, first progress, React commit, elapsed guess, or
  shader completion as acceptance; storing Intake in Download state; adding a
  Reveal queue or a second host.

### 6. Tests Required

- runtime/protocol/controller tests for marked normal and advanced creation,
  unmarked hydration/dedupe/existing-trace quality selection, replay guards,
  renderer and extension paths, exact post state, and rapid event order;
- `downloadIntakePresentation.test.ts` for latest replacement, guarded expiry,
  removal, primary change, foreground/background terminal behavior, and reset;
- `expandedPresentationPolicy.test.ts` for the full priority matrix;
- Expanded runtime/surface tests for latest target replacement, current
  Progress reconstruction, Reduced Motion zero continuous frames, one pending
  frame, failure isolation, and the single WebGL2 canvas boundary.

### 7. Wrong vs Correct

Wrong — infer acceptance from an unmarked snapshot and let the renderer decide:

```ts
if (nextTasks.length > previousTasks.length) runtime.playReveal();
```

Correct — validate the Application-authored cause after normal reduction and
resolve one target before rendering:

```ts
dispatch({ type: "queueDetailReceived", tasks });
if (acceptedTraceId && !wasMember && state.tasksById[acceptedTraceId]) {
  publishIntake({ traceId: acceptedTraceId }, state);
}

const target = resolveExpandedPresentationTarget({ progress, terminal, intake });
```
