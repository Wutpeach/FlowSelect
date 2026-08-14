import { describe, expect, it } from "vitest";
import {
  createDownloadIntakePresentationState,
  reduceDownloadIntakePresentation,
} from "./downloadIntakePresentation";

describe("Download Intake Presentation", () => {
  it("creates one bounded opportunity and lets the latest distinct intake replace it", () => {
    const first = reduceDownloadIntakePresentation(
      createDownloadIntakePresentationState(),
      {
        type: "accepted",
        traceId: "first",
        primaryTraceIdAtStart: "current",
        now: 100,
      },
    );
    const latest = reduceDownloadIntakePresentation(first, {
      type: "accepted",
      traceId: "latest",
      primaryTraceIdAtStart: "current",
      now: 200,
    });

    expect(first.current?.opportunityId).toBe(1);
    expect(latest.current).toMatchObject({
      opportunityId: 2,
      traceId: "latest",
      primaryTraceIdAtStart: "current",
    });
    expect(latest.current?.deadlineAt).toBeGreaterThan(200);
  });

  it("ignores stale expiry and expires only the matching elapsed opportunity", () => {
    const first = reduceDownloadIntakePresentation(
      createDownloadIntakePresentationState(),
      { type: "accepted", traceId: "first", primaryTraceIdAtStart: null, now: 10 },
    );
    const latest = reduceDownloadIntakePresentation(first, {
      type: "accepted",
      traceId: "latest",
      primaryTraceIdAtStart: null,
      now: 20,
    });
    const stale = reduceDownloadIntakePresentation(latest, {
      type: "expired",
      opportunityId: 1,
      now: Number.POSITIVE_INFINITY,
    });
    const early = reduceDownloadIntakePresentation(stale, {
      type: "expired",
      opportunityId: 2,
      now: latest.current?.deadlineAt ?? 0,
    });

    expect(stale).toBe(latest);
    expect(early.current).toBeNull();
  });

  it("invalidates removal and unrelated primary replacement but keeps related identities", () => {
    const active = reduceDownloadIntakePresentation(
      createDownloadIntakePresentationState(),
      {
        type: "accepted",
        traceId: "intake",
        primaryTraceIdAtStart: "existing",
        now: 0,
      },
    );
    const samePrimary = reduceDownloadIntakePresentation(active, {
      type: "downloadStateChanged",
      liveTraceIds: ["existing", "intake"],
      primaryTraceId: "existing",
    });
    const intakePromoted = reduceDownloadIntakePresentation(samePrimary, {
      type: "downloadStateChanged",
      liveTraceIds: ["intake"],
      primaryTraceId: "intake",
    });
    const unrelated = reduceDownloadIntakePresentation(active, {
      type: "downloadStateChanged",
      liveTraceIds: ["existing", "intake", "new-primary"],
      primaryTraceId: "new-primary",
    });
    const removed = reduceDownloadIntakePresentation(active, {
      type: "downloadStateChanged",
      liveTraceIds: ["existing"],
      primaryTraceId: "existing",
    });

    expect(samePrimary).toBe(active);
    expect(intakePromoted.current?.traceId).toBe("intake");
    expect(unrelated.current).toBeNull();
    expect(removed.current).toBeNull();
  });

  it("invalidates only a foreground terminal and resets without replay", () => {
    const active = reduceDownloadIntakePresentation(
      createDownloadIntakePresentationState(),
      {
        type: "accepted",
        traceId: "intake",
        primaryTraceIdAtStart: "other",
        now: 0,
      },
    );
    const background = reduceDownloadIntakePresentation(active, {
      type: "terminalReceived",
      postReductionLiveTraceIds: ["intake", "other"],
      postReductionPrimaryTraceId: "other",
    });
    const foreground = reduceDownloadIntakePresentation(background, {
      type: "terminalReceived",
      postReductionLiveTraceIds: [],
      postReductionPrimaryTraceId: null,
    });
    const removedInBackground = reduceDownloadIntakePresentation(active, {
      type: "terminalReceived",
      postReductionLiveTraceIds: ["other"],
      postReductionPrimaryTraceId: "other",
    });
    const reset = reduceDownloadIntakePresentation(active, { type: "reset" });

    expect(background).toBe(active);
    expect(foreground.current).toBeNull();
    expect(removedInBackground.current).toBeNull();
    expect(reset.current).toBeNull();
  });
});
