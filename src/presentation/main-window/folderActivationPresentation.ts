import type { LocalIntakeOrigin } from "../../application/download-api";
import type { CenterOverlayState } from "../../utils/centerOverlayState";
import { NEUTRAL_PRESENTATION_ORIGIN } from "./downloadIntakePresentation";

export type FolderActivationPresentationOpportunity = Readonly<{
  opportunityId: number;
  origin: LocalIntakeOrigin;
  startedAt: number;
}>;

/** Folder persistence success is the only Folder Activation authority. */
export const resolveFolderActivationPresentation = (
  state: CenterOverlayState,
): FolderActivationPresentationOpportunity | null => (
  state.kind === "folder-outcome-visible"
    && state.status === "success"
    && typeof state.startedAt === "number"
    && Number.isFinite(state.startedAt)
    ? {
        opportunityId: state.requestId,
        origin: state.origin ?? NEUTRAL_PRESENTATION_ORIGIN,
        startedAt: state.startedAt,
      }
    : null
);
