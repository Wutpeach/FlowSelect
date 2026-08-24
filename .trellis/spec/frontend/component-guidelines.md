# Component Guidelines

> How components are built in FlowSelect.

---

## Overview

Components use functional React with hooks. Styling combines TailwindCSS for layout with inline styles for dynamic theming. Animations use Motion for React via `motion/react`.

---

## Component Structure

**Standard component file structure:**

```tsx
// 1. Imports
import React from "react";
import { useTheme } from '../../contexts/ThemeContext';

// 2. Props interface
interface NeonButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

// 3. Component function
export function NeonButton({
  variant = 'default',
  size = 'md',
  disabled,
  style,
  children,
  ...props
}: NeonButtonProps) {
  const { colors } = useTheme();

  // 4. Style objects
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    // ...
  };

  // 5. Return JSX
  return (
    <button style={{ ...baseStyle, ...style }} {...props}>
      {children}
    </button>
  );
}
```

*Reference: `src/components/ui/neon-button.tsx:1-67`*

---

## Props Conventions

**Extend native HTML attributes:**
```tsx
// CORRECT: Extend native props
interface NeonButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline';
}

// WRONG: Define all props manually
interface NeonButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  // Missing many native props
}
```

**Use optional props with defaults:**
```tsx
export function NeonButton({
  variant = 'default',  // Default value
  size = 'md',
  ...props
}: NeonButtonProps) { }
```

---

## Styling Patterns

**Start from semantic tokens for reusable UI work:**
```tsx
const { colors } = useTheme();

const style: React.CSSProperties = {
  border: `1px solid ${colors.fieldBorder}`,
  background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
  boxShadow: `inset 0 1px 0 ${colors.fieldInset}`,
};
```

For shared UI primitives and core surfaces, follow the semantic token guidance in `./design-system.md`.

**Use inline styles for dynamic theming:**
```tsx
const { colors } = useTheme();

const style: React.CSSProperties = {
  backgroundColor: colors.bgPrimary,
  color: colors.textPrimary,
  transition: 'all 0.3s ease',
};
```

**Prefer shared style helpers before page-local style objects:**
```tsx
import {
  getContinuousCornerStyle,
  getWindowShellStyle,
  getWindowHeaderStyle,
  getWindowBodyStyle,
} from "../components/ui/shared-styles";

const { theme, colors } = useTheme();

<div style={getWindowShellStyle(colors, theme)}>
  <div style={getWindowHeaderStyle(colors)} />
  <div style={getWindowBodyStyle()} />
</div>
```

Use page-local style objects only after checking whether the pattern already belongs in `src/components/ui/shared-styles.ts` or an existing UI primitive.

**Use continuous corners for reusable rounded surfaces:**
```tsx
const panelStyle: React.CSSProperties = {
  ...getContinuousCornerStyle(16),
  background: `linear-gradient(180deg, ${colors.bgGradientStart} 0%, ${colors.bgGradientEnd} 100%)`,
};
```

- Rounded shells, fields, cards, and compact buttons should use `getContinuousCornerStyle(...)` instead of plain `borderRadius` when they are part of the core FlowSelect surface language.
- Pointer-following border overlays must reuse the same continuous-corner radius as the host surface; do not leave the host on a smoothed corner while the overlay still uses a plain rounded rectangle.
- If a window shell needs clipping, keep any fallback `clip-path: inset(... round ...)` behind feature detection so capable runtimes can preserve continuous-corner shaping.

**Use TailwindCSS for static layout:**
```tsx
<div className="flex items-center justify-center gap-2">
```

**Variant styles as objects:**
```tsx
const variantStyles: Record<string, React.CSSProperties> = {
  default: {
    backgroundColor: '#3b82f6',
    boxShadow: '0 0 12px rgba(59,130,246,0.5)',
  },
  outline: {
    backgroundColor: 'transparent',
    border: '1px solid #3b82f6',
  },
};
```

**Mirror semantic theme tokens to CSS variables for global CSS hooks:**
```tsx
useEffect(() => {
  document.documentElement.style.setProperty("--fs-text-primary", colors.textPrimary);
}, [colors.textPrimary]);
```

This is the right approach for root-level CSS concerns like scrollbars or browser default surfaces. Do not duplicate full theme objects into page-local CSS classes.

---

## Border Mask + Radial Hover (Shiny Border)

Use this pattern when you need a pointer-following border highlight that stays attached to the component border (instead of filling the full surface).

**When to use**
- Compact cards or floating panels
- "Follow cursor" highlight effects
- Subtle emphasis on hover without changing layout

**Reference implementation pattern (React/TS):**
```tsx
const borderStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: 16,               // Must match host component radius
  pointerEvents: "none",
  padding: 1.25,                  // Border ring width
  background: `radial-gradient(
    180px circle at ${mouseX}px ${mouseY}px,
    rgba(59,130,246,1) 0%,
    rgba(96,165,250,0.7) 30%,
    rgba(147,197,253,0.2) 50%,
    transparent 75%
  )`,
  mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
  maskComposite: "exclude",
  WebkitMaskComposite: "xor",     // Required for WebKit
};
```

**Edge-attached behavior rule**
- Compute opacity from distance to nearest edge (`min(x, y, width - x, height - y)`).
- Fade out when cursor is far from edges to keep the effect "attached" to border.
- Keep overlay `pointerEvents: none` so drag/drop and click behavior are not blocked.

**Recommended tuning ranges (for ~200x200 panel)**
- `border width`: `1.2` to `1.8`
- `radial radius`: `150` to `220`
- `edge trigger distance`: `70` to `100`
- `falloff exponent`: `0.9` to `1.3`

**Main Window pointer-following ownership**
- The Main Window's continuous pointer coordinates have one renderer-local authority: `src/presentation/main-window/pointerField.ts` (viewport-local MotionValues measured from the stable presentation root).
- The full-mode Magnetic shell displacement is the only pointer-following Main Window decoration consumer (`src/presentation/main-window/magnetic.ts`). The former pointer-following border glow was removed; do not reintroduce a second continuous pointer consumer or a second pointer authority.
- Other components that want a shiny border may still read local hover state directly; do not consume Main Window Pointer Field data outside the presentation module.

**Common mistakes**
- Rendering a filled gradient strip (causes trapezoid/demo-like look).
- Forgetting `maskComposite`/`WebkitMaskComposite` (effect fills entire panel).
- Border radius mismatch between host and overlay (edge halo looks misaligned).
- On transparent rounded windows, using outer blue glow (`0 0 ...`) for persistent states can tint corner regions; prefer `inset` glow for download/active states.

---

## Animation Patterns

**Use Motion for React for mount/unmount and panel transitions:**
```tsx
import { motion, AnimatePresence } from "motion/react";

<AnimatePresence>
  {isVisible && (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.2 }}
    >
      {content}
    </motion.div>
  )}
</AnimatePresence>
```

For tool-choice, timing, anchor, and transparent child-window rules, see `./motion-guidelines.md`.

---

## Common Mistakes

**WRONG: Using CSS classes for theme colors**
```tsx
// WRONG - theme colors won't update
<div className="bg-gray-800 text-white">
```

**CORRECT: Using ThemeContext**
```tsx
// CORRECT - responds to theme changes
const { colors } = useTheme();
<div style={{ backgroundColor: colors.bgPrimary, color: colors.textPrimary }}>
```

**WRONG: Missing spread props**
```tsx
// WRONG - loses native attributes
<button onClick={onClick}>{children}</button>
```

**CORRECT: Spread remaining props**
```tsx
// CORRECT - preserves all native attributes
<button {...props}>{children}</button>
```
## Motion / Presentation Foundation (MR0)

### MainWindowPresentationSurface stays a wiring/composition boundary

- It may own: DOM event wiring (pointer/drag/drop/paste), Pointer Field creation and writing, Magnetic composition, shell recipe application, the epoch-matched shell completion callback, compact icon composition, and native interaction wiring (drag position passthrough, interaction mode).
- It must NOT accumulate: recipe algorithms or timing constants, Download reconciliation, intake acceptance/origin policy beyond calling pure helpers, generic motion orchestration, or a second lifecycle/pointer authority.
- It must not import Product dispatch (`src/features/`); guarded by `src/architecture/import-guard.test.ts`.
- The shell `visualTransitionCompleted` acknowledgement is lifecycle-owned and epoch-matched; it is not exposed as a general feature-motion completion API.

### Recipes, scheduling, and geometry stay consumer-local

- Motion recipes (`motionRecipes.ts`) and future recipe families own renderer choreography only and import no Product/lifecycle/native modules.
- Easing, springs, geometry, frame ownership, and sleep/wake scheduling stay inside the consumer; no centralized scheduling/geometry/easing module is introduced for future consumers.
- A shared type or helper is added only when two real consumers need the exact
  same data contract — never preemptively for graphics/Character consumers.

### Composition wrapper pattern

When a feature composes motion over persistent presentation (e.g. intake decoration over Progress):

- Persistent semantic/control content stays selector-derived and mounted immediately; the decorative layer affects visual material only.
- The wrapper owns one read-only eligibility fact and epoch/generation bookkeeping; all completion paths are epoch-guarded so stale callbacks are no-ops.
- Decorative layers are `pointer-events: none` and `aria-hidden`; the persistent content stays the interaction/accessibility authority.
- No animation callback dispatches business, lifecycle, or native work.
