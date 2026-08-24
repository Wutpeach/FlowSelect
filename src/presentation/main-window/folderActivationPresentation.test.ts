import { describe, expect, it } from "vitest";
import { createCenterOverlayState, reduceCenterOverlayState } from "../../utils/centerOverlayState";
import { resolveFolderActivationPresentation } from "./folderActivationPresentation";

describe("Folder Activation presentation", () => {
  it("projects only persisted Folder success with its immutable drop origin", () => {
    const success = reduceCenterOverlayState(createCenterOverlayState(), {
      type: "showFolderOutcome",
      status: "success",
      durationMs: 1400,
      origin: { x: 0.3, y: 0.6 },
      startedAt: 120,
    });
    expect(resolveFolderActivationPresentation(success)).toEqual({
      opportunityId: 1,
      origin: { x: 0.3, y: 0.6 },
      startedAt: 120,
    });
    const failure = reduceCenterOverlayState(success, {
      type: "showFolderOutcome",
      status: "error",
      durationMs: 1800,
    });
    expect(resolveFolderActivationPresentation(failure)).toBeNull();
    expect(resolveFolderActivationPresentation({
      kind: "folder-outcome-visible",
      requestId: 3,
      status: "success",
      message: null,
      durationMs: 1400,
    })).toBeNull();
  });
});
