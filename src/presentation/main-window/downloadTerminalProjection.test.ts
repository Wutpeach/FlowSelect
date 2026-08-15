import { describe, expect, it } from "vitest";
import type { CenterOverlayState } from "../../utils/centerOverlayState";
import {
  shouldInvalidateTerminalRevealForPrimaryDownload,
  shouldShowDownloadTerminalReveal,
} from "./downloadTerminalProjection";

const terminalOutcome = (
  status: "success" | "failure" | "cancelled",
  phase: "loading" | "visible" = "visible",
): CenterOverlayState => ({
  kind: phase === "visible" ? "task-outcome-visible" : "task-outcome-loading",
  requestId: 1,
  source: "download",
  status,
  origin: "terminal",
  message: null,
  durationMs: 1500,
  diagnostic: null,
});

const genericOutcome = (
  source: "download" | "transcode" | "image",
): CenterOverlayState => ({
  kind: "task-outcome-visible",
  requestId: 1,
  source,
  status: "failure",
  origin: "foreground",
  message: null,
  durationMs: 1500,
  diagnostic: null,
});

describe("MR4 Terminal DOM semantics without Expanded graphics", () => {
  it("shows only a sole post-reduction terminal", () => {
    expect(shouldShowDownloadTerminalReveal(null)).toBe(true);
    expect(shouldShowDownloadTerminalReveal({ traceId: "another-primary" })).toBe(false);
  });

  it("invalidates retained loading and visible terminal outcomes for a new primary", () => {
    for (const status of ["success", "failure", "cancelled"] as const) {
      expect(shouldInvalidateTerminalRevealForPrimaryDownload(
        terminalOutcome(status, "loading"),
        { traceId: "next" },
      )).toBe(true);
      expect(shouldInvalidateTerminalRevealForPrimaryDownload(
        terminalOutcome(status),
        { traceId: "next" },
      )).toBe(true);
    }
  });

  it("keeps a retained terminal when there is no new primary", () => {
    expect(shouldInvalidateTerminalRevealForPrimaryDownload(
      terminalOutcome("success"),
      null,
    )).toBe(false);
  });

  it("does not invalidate generic, non-Download, Folder, or processing outcomes", () => {
    for (const state of [
      genericOutcome("download"),
      genericOutcome("transcode"),
      genericOutcome("image"),
      {
        kind: "folder-outcome-visible",
        requestId: 1,
        status: "success",
        message: null,
        durationMs: 1400,
      } satisfies CenterOverlayState,
      {
        kind: "task-processing",
        requestId: 1,
        source: "image",
      } satisfies CenterOverlayState,
    ]) {
      expect(shouldInvalidateTerminalRevealForPrimaryDownload(
        state,
        { traceId: "next" },
      )).toBe(false);
    }
  });
});
