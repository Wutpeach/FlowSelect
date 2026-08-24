import type { CenterOverlayState } from "../../utils/centerOverlayState";
/**
 * MR4 App-level decision: should a just-arrived download terminal create
 * Reveal Presentation state? The caller passes the EXACT post-reduction
 * primary Download the DownloadQueueController handed to the terminal
 * listener — captured synchronously after terminalReceived reduced the
 * authoritative fact, so no React commit timing can lag it. terminalReceived
 * has already pruned the terminal's own trace, so a non-null primary can
 * never legitimately be the same terminal: any remaining primary is
 * necessarily "another" download, and a background terminal must not create
 * center outcome state, retention timer, or centerOutcome lock. Only a null
 * primary shows the just-arrived terminal (normal foreground terminal).
 */
export const shouldShowDownloadTerminalReveal = (
  postReductionPrimaryDownload: { traceId: string } | null,
): boolean => postReductionPrimaryDownload === null;

/**
 * MR4 App-level decision: should a NEW current primary Download invalidate a
 * lingering terminal Reveal Presentation immediately (state, retention timer,
 * and centerOutcome lock) — including before the new download's first
 * progress event? Only typed terminal Presentations (`origin: "terminal"`,
 * `source: "download"`) match; folder, image, transcode, and generic
 * enqueue/command outcomes are untouched by MR4 invalidation semantics.
 */
export const shouldInvalidateTerminalRevealForPrimaryDownload = (
  centerOverlayState: CenterOverlayState,
  currentPrimaryDownload: { traceId: string } | null,
): boolean => {
  if (currentPrimaryDownload === null) {
    return false;
  }
  return (
    (centerOverlayState.kind === "task-outcome-loading"
      || centerOverlayState.kind === "task-outcome-visible")
    && centerOverlayState.source === "download"
    && centerOverlayState.origin === "terminal"
  );
};
