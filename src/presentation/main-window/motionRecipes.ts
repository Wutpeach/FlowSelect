import type { TargetAndTransition, Transition } from "motion/react";
import type { MainWindowVisualFrame } from "./geometry";
import type { MainWindowVisualProjection } from "./projections";

// Renderer choreography constants. These are motion-only values; spatial
// metrics that overlap with geometry are intentionally duplicated so the
// recipe layer never imports geometry.
export const MAIN_WINDOW_COMPACT_VISIBILITY_MOVE_DURATION_MS = 180;
export const MAIN_WINDOW_MINIMIZED_ICON_SIZE = 38;
// Duplicated from geometry's compact shell metric so recipes never import geometry.
export const MAIN_WINDOW_COMPACT_SHELL_SIZE = 60;
export const MAIN_WINDOW_INITIAL_PANEL_SCALE = 0.88;
export const MAIN_WINDOW_PANEL_FULL_ELASTIC_SCALE_KEYFRAMES = [1, 1.01, 1] as const;
export const MAIN_WINDOW_PANEL_FULL_ELASTIC_SCALE_TIMES = [0, 0.66, 1] as const;
export const MAIN_WINDOW_MINIMIZED_ICON_SETTLE_SCALE_KEYFRAMES = [1, 1.025, 1] as const;
export const MAIN_WINDOW_MINIMIZED_ICON_SETTLE_SCALE_TIMES = [0, 0.7, 1] as const;

export const MAIN_WINDOW_COMPACT_MOTION_EASE = [0.22, 1, 0.36, 1] as const;

export const MAIN_WINDOW_PANEL_INITIAL_TWEEN_TRANSITION = {
  duration: 0.2,
  ease: MAIN_WINDOW_COMPACT_MOTION_EASE,
} as const;

export const MAIN_WINDOW_PANEL_COMPACT_TWEEN_TRANSITION = {
  duration: 0.2,
  ease: MAIN_WINDOW_COMPACT_MOTION_EASE,
} as const;

export const MAIN_WINDOW_PANEL_INSTANT_TRANSITION = {
  duration: 0,
} as const;

export const MAIN_WINDOW_PANEL_FULL_SPRING_TRANSITION = {
  type: "spring",
  stiffness: 460,
  damping: 36,
} as const;

export const MAIN_WINDOW_MINIMIZED_ICON_REDUCED_MOTION_TRANSITION = {
  duration: 0.12,
} as const;

export const MAIN_WINDOW_MINIMIZED_ICON_ENTER_TRANSITION = {
  duration: 0.08,
  ease: MAIN_WINDOW_COMPACT_MOTION_EASE,
} as const;

export const MAIN_WINDOW_MINIMIZED_ICON_SETTLE_TRANSITION = {
  duration: 0.28,
  times: MAIN_WINDOW_MINIMIZED_ICON_SETTLE_SCALE_TIMES,
  ease: MAIN_WINDOW_COMPACT_MOTION_EASE,
} as const;

export const MAIN_WINDOW_MINIMIZED_ICON_LEAVE_TRANSITION = {
  duration: 0.2,
  times: [0, 0.64, 1],
  ease: MAIN_WINDOW_COMPACT_MOTION_EASE,
};

export const MAIN_WINDOW_MINIMIZED_ICON_REDUCED_EXIT_TRANSITION = {
  duration: 0.01,
} as const;

export const MAIN_WINDOW_MINIMIZED_ICON_EXIT_TRANSITION = {
  duration: 0.06,
  ease: MAIN_WINDOW_COMPACT_MOTION_EASE,
} as const;

export type MainWindowShellMotionRecipe = {
  shellAnimate: TargetAndTransition;
  shellTransition: {
    scale: Transition;
    borderRadius: Transition;
    clipPath: Transition;
    x: Transition;
    y: Transition;
    width: Transition;
    height: Transition;
  };
  icon: {
    animate: TargetAndTransition;
    transition: Transition;
    settleAnimate: TargetAndTransition;
    settleTransition: Transition;
    exit: TargetAndTransition;
    size: number;
    frameSize: number;
    wrapperScale: number;
  };
};

export type ResolveMainWindowShellMotionRecipeOptions = {
  projection: MainWindowVisualProjection;
  visualShell: MainWindowVisualFrame;
  reducedMotion: boolean;
  isInitialMount: boolean;
  isMacOS: boolean;
};

const resolveShellScaleAnimate = ({
  projection,
  reducedMotion,
  isInitialMount,
}: Pick<ResolveMainWindowShellMotionRecipeOptions, "projection" | "reducedMotion" | "isInitialMount">): {
  animate: number | number[];
  transition: Transition;
} => {
  const isElastic = (
    projection.transitionEpoch !== null
    && projection.mode === "full"
    && projection.recipe === "animated"
    && !isInitialMount
    && !reducedMotion
  );

  if (isElastic) {
    return {
      animate: [...MAIN_WINDOW_PANEL_FULL_ELASTIC_SCALE_KEYFRAMES],
      transition: {
        ...MAIN_WINDOW_PANEL_FULL_SPRING_TRANSITION,
        times: [...MAIN_WINDOW_PANEL_FULL_ELASTIC_SCALE_TIMES],
      },
    };
  }

  if (isInitialMount) {
    return {
      animate: MAIN_WINDOW_INITIAL_PANEL_SCALE,
      transition: MAIN_WINDOW_PANEL_INITIAL_TWEEN_TRANSITION,
    };
  }

  if (projection.mode === "compact") {
    return {
      animate: 1,
      transition: MAIN_WINDOW_PANEL_COMPACT_TWEEN_TRANSITION,
    };
  }

  if (projection.recipe === "instant") {
    return {
      animate: 1,
      transition: MAIN_WINDOW_PANEL_INSTANT_TRANSITION,
    };
  }

  return {
    animate: 1,
    transition: MAIN_WINDOW_PANEL_FULL_SPRING_TRANSITION,
  };
};

const resolveShellFrameTransition = ({
  projection,
  isInitialMount,
}: Pick<ResolveMainWindowShellMotionRecipeOptions, "projection" | "isInitialMount">): Transition => {
  if (isInitialMount) {
    return MAIN_WINDOW_PANEL_INITIAL_TWEEN_TRANSITION;
  }
  if (projection.mode === "compact") {
    return MAIN_WINDOW_PANEL_COMPACT_TWEEN_TRANSITION;
  }
  if (projection.recipe === "instant") {
    return MAIN_WINDOW_PANEL_INSTANT_TRANSITION;
  }
  return MAIN_WINDOW_PANEL_FULL_SPRING_TRANSITION;
};

export const resolveMainWindowShellMotionRecipe = ({
  projection,
  visualShell,
  reducedMotion,
  isInitialMount,
  isMacOS,
}: ResolveMainWindowShellMotionRecipeOptions): MainWindowShellMotionRecipe => {
  const shellScale = resolveShellScaleAnimate({ projection, reducedMotion, isInitialMount });
  const frameTransition = resolveShellFrameTransition({ projection, isInitialMount });
  const isCompact = projection.mode === "compact";

  const iconSize = isMacOS ? MAIN_WINDOW_MINIMIZED_ICON_SIZE - 2 : MAIN_WINDOW_MINIMIZED_ICON_SIZE;

  return {
    shellAnimate: {
      scale: shellScale.animate,
      borderRadius: visualShell.radius,
      clipPath: visualShell.clipPath,
      x: visualShell.x,
      y: visualShell.y,
      width: visualShell.width,
      height: visualShell.height,
    },
    shellTransition: {
      scale: shellScale.transition,
      borderRadius: frameTransition,
      clipPath: frameTransition,
      x: frameTransition,
      y: frameTransition,
      width: frameTransition,
      height: frameTransition,
    },
    icon: {
      animate: reducedMotion
        ? (isCompact
            ? { scale: 1, opacity: 1 }
            : { scale: 1, opacity: 0 })
        : (isCompact
            ? { scale: 1, opacity: 1 }
            : { scale: [1, 1.015, 0.9], opacity: [1, 1, 0] }),
      transition: reducedMotion
        ? MAIN_WINDOW_MINIMIZED_ICON_REDUCED_MOTION_TRANSITION
        : (isCompact
            ? MAIN_WINDOW_MINIMIZED_ICON_ENTER_TRANSITION
            : MAIN_WINDOW_MINIMIZED_ICON_LEAVE_TRANSITION),
      settleAnimate: !reducedMotion && projection.settleEpoch !== null
        ? { scale: [...MAIN_WINDOW_MINIMIZED_ICON_SETTLE_SCALE_KEYFRAMES] }
        : { scale: 1 },
      settleTransition: !reducedMotion && projection.settleEpoch !== null
        ? {
          ...MAIN_WINDOW_MINIMIZED_ICON_SETTLE_TRANSITION,
          times: [...MAIN_WINDOW_MINIMIZED_ICON_SETTLE_SCALE_TIMES],
        }
        : MAIN_WINDOW_MINIMIZED_ICON_REDUCED_MOTION_TRANSITION,
      exit: reducedMotion
        ? {
          opacity: 0,
          scale: 1,
          transition: MAIN_WINDOW_MINIMIZED_ICON_REDUCED_EXIT_TRANSITION,
        }
        : {
          opacity: 0,
          scale: 1,
          transition: MAIN_WINDOW_MINIMIZED_ICON_EXIT_TRANSITION,
        },
      size: iconSize,
      frameSize: isMacOS ? MAIN_WINDOW_COMPACT_SHELL_SIZE : iconSize,
      wrapperScale: 1,
    },
  };
};
