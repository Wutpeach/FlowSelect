import type {
  MainWindowInteractionMode,
} from "./effectContracts";
import type {
  MainWindowPresentationState,
} from "./lifecycle";

export type MainWindowVisualMode = "full" | "compact";

export type MainWindowVisualProjection = {
  /** Target visual mode for the shell and content. */
  mode: MainWindowVisualMode;
  /** Target reported by the shell's Motion completion callback. */
  completionTarget: "full" | "compact";
  /** Epoch of the transition the shell is currently animating, if any. */
  transitionEpoch: number | null;
  /** The expanding recipe selected by the lifecycle, if transitioning to full. */
  recipe: "animated" | "instant";
  /** Post-compact icon pulse epoch; changes key the settle pulse. */
  settleEpoch: number | null;
};

export type MainWindowInteractionProjection = {
  /** Current native interaction policy derived from the lifecycle. */
  mode: MainWindowInteractionMode;
  /** Whether the Windows compact hotspot evaluation is active. */
  hotspotActive: boolean;
  /** Whether the native pointer-boundary subscription should be listening. */
  pointerBoundaryActive: boolean;
};

export type MainWindowPresentationProjections = {
  visual: MainWindowVisualProjection;
  interaction: MainWindowInteractionProjection;
};

/** Pure phase → visual mode mapping; the single source for shell mode. */
export const resolveMainWindowVisualMode = (
  state: MainWindowPresentationState,
): MainWindowVisualMode => {
  switch (state.phase.kind) {
    case "compact":
    case "collapsing":
      return "compact";
    case "expanding":
    case "full":
    case "collapsePending":
      return "full";
  }
};

/** Full application content is visible in every mode except compact. */
export const isMainWindowFullContentVisible = (
  state: MainWindowPresentationState,
): boolean => resolveMainWindowVisualMode(state) === "full";

export const resolveMainWindowPresentationProjections = (
  state: MainWindowPresentationState,
  {
    supportsCompactPassthrough,
  }: {
    supportsCompactPassthrough: boolean;
  },
): MainWindowPresentationProjections => {
  const mode = resolveMainWindowVisualMode(state);
  switch (state.phase.kind) {
    case "compact": {
      const passthrough = supportsCompactPassthrough
        ? "compact-passthrough" as const
        : "interactive" as const;
      return {
        visual: {
          mode,
          completionTarget: "compact",
          transitionEpoch: null,
          recipe: "animated",
          settleEpoch: state.phase.settleEpoch,
        },
        interaction: {
          mode: passthrough,
          hotspotActive: supportsCompactPassthrough,
          pointerBoundaryActive: false,
        },
      };
    }

    case "collapsing":
      return {
        visual: {
          mode,
          completionTarget: "compact",
          transitionEpoch: state.phase.epoch,
          recipe: "animated",
          settleEpoch: null,
        },
        interaction: {
          mode: "interactive",
          hotspotActive: false,
          pointerBoundaryActive: true,
        },
      };

    case "expanding":
      return {
        visual: {
          mode,
          completionTarget: "full",
          transitionEpoch: state.phase.epoch,
          recipe: state.phase.recipe,
          settleEpoch: null,
        },
        interaction: {
          mode: "interactive",
          hotspotActive: false,
          pointerBoundaryActive: true,
        },
      };

    case "full":
    case "collapsePending":
      return {
        visual: {
          mode,
          completionTarget: "full",
          transitionEpoch: null,
          recipe: "animated",
          settleEpoch: null,
        },
        interaction: {
          mode: "interactive",
          hotspotActive: false,
          pointerBoundaryActive: true,
        },
      };
  }
};
