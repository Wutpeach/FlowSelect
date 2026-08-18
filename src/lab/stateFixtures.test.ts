import { describe, expect, it } from "vitest";
import { selectPrimaryDownloadProgress, selectPrimaryDownloadTask, selectVisibleTaskCount } from "../features/download/selectors";
import { resolveDownloadProgressTarget } from "../presentation/main-window/downloadProgressProjection";
import { runtimeGateIsActive, runtimeGateNeedsManualAction } from "../utils/runtimeDependencyGate";
import { projectLabOverlayFixture } from "./overlayProjection";
import {
  createDownloadActiveFixture,
  createDownloadQueuedFixture,
  createMixedBusyFixture,
  createRuntimeAutoConfigFixture,
  createRuntimeFailedFixture,
  createTranscodeActiveFixture,
  createTranscodeFailedFixture,
  LAB_DOWNLOAD_TRACE_ID,
  LAB_TRANSCODE_TRACE_ID,
  LAB_OVERLAY_FIXTURE_IDS,
  LAB_OVERLAY_FIXTURES,
} from "./stateFixtures";

const t = (key: string): string => key;

describe("Lab overlay fixtures", () => {
  it("registers exactly the seven migrated legacy scenarios", () => {
    expect(LAB_OVERLAY_FIXTURE_IDS).toEqual([
      "runtime-auto-config",
      "runtime-failed",
      "download-active",
      "download-queued",
      "transcode-active",
      "transcode-failed",
      "mixed-busy",
    ]);
  });

  it("download-active drives the production Download selectors to a determinate 0.64 arc", () => {
    const fixture = createDownloadActiveFixture();
    expect(fixture.kind).toBe("download");
    if (fixture.kind !== "download") return;
    const primaryTask = selectPrimaryDownloadTask(fixture.queue);
    expect(primaryTask?.traceId).toBe(LAB_DOWNLOAD_TRACE_ID);
    expect(primaryTask?.status).toBe("active");
    const progress = selectPrimaryDownloadProgress(fixture.queue);
    expect(progress?.percent).toBe(64);
    const target = resolveDownloadProgressTarget(primaryTask, progress);
    expect(target).toEqual({ kind: "determinate", traceId: LAB_DOWNLOAD_TRACE_ID, target: 0.64 });
    expect(selectVisibleTaskCount(fixture.queue)).toBe(1);
  });

  it("download-queued has no active primary task -> idle presentation", () => {
    const fixture = createDownloadQueuedFixture();
    if (fixture.kind !== "download") return;
    const primaryTask = selectPrimaryDownloadTask(fixture.queue);
    expect(primaryTask).toBeNull();
    const progress = selectPrimaryDownloadProgress(fixture.queue);
    expect(progress).toBeNull();
    expect(resolveDownloadProgressTarget(primaryTask, progress)).toEqual({ kind: "idle" });
    expect(selectVisibleTaskCount(fixture.queue)).toBe(2);
  });

  it("transcode-active drives a transcode primary task and idle WebGL", () => {
    const fixture = createTranscodeActiveFixture();
    if (fixture.kind !== "transcode") return;
    expect(fixture.transcodeTasks[0].status).toBe("active");
    expect(fixture.transcodeTasks[0].progressPercent).toBe(37);
    expect(fixture.centerOverlayState.kind).toBe("idle");
  });

  it("transcode-failed carries a failed task plus a failure center overlay", () => {
    const fixture = createTranscodeFailedFixture();
    if (fixture.kind !== "transcode") return;
    expect(fixture.transcodeTasks[0].status).toBe("failed");
    expect(fixture.transcodeTasks[0].error).toContain("ffmpeg");
    expect(fixture.centerOverlayState.kind).toBe("task-outcome-visible");
    if (fixture.centerOverlayState.kind === "task-outcome-visible") {
      expect(fixture.centerOverlayState.status).toBe("failure");
      expect(fixture.centerOverlayState.source).toBe("transcode");
    }
  });

  it("runtime-auto-config is an active gate with quantifiable progress", () => {
    const fixture = createRuntimeAutoConfigFixture();
    if (fixture.kind !== "runtime") return;
    expect(fixture.gate.phase).toBe("downloading");
    expect(runtimeGateIsActive(fixture.gate.phase)).toBe(true);
    expect(runtimeGateNeedsManualAction(fixture.gate.phase)).toBe(false);
    expect(fixture.gate.progressPercent).toBe(42);
  });

  it("runtime-failed requires manual action", () => {
    const fixture = createRuntimeFailedFixture();
    if (fixture.kind !== "runtime") return;
    expect(runtimeGateIsActive(fixture.gate.phase)).toBe(false);
    expect(runtimeGateNeedsManualAction(fixture.gate.phase)).toBe(true);
    expect(fixture.gate.lastError).toContain("ffmpeg");
  });

  it("mixed-busy composes the same Download and Transcode paths", () => {
    const fixture = createMixedBusyFixture();
    expect(fixture.kind).toBe("mixed");
    if (fixture.kind !== "mixed") return;
    expect(selectVisibleTaskCount(fixture.queue)).toBe(1);
    expect(fixture.transcodeTasks[0].status).toBe("active");
  });

  it("every registered fixture is constructible", () => {
    for (const fixtureId of LAB_OVERLAY_FIXTURE_IDS) {
      expect(typeof LAB_OVERLAY_FIXTURES[fixtureId]).toBe("function");
      expect(LAB_OVERLAY_FIXTURES[fixtureId]()).toBeTruthy();
    }
  });
});

describe("Lab overlay projection (production pure path)", () => {
  it("download-active projects the shared center overlay + queue popover + arc", () => {
    const projection = projectLabOverlayFixture(createDownloadActiveFixture(), t);
    expect(projection.expandedTarget).toEqual({
      kind: "progress",
      progress: { kind: "determinate", traceId: LAB_DOWNLOAD_TRACE_ID, target: 0.64 },
    });
    expect(projection.primaryTask?.kind).toBe("download");
    expect(projection.centerOverlayVisual.kind).toBe("task-progress");
    expect(projection.totalDownloadTaskCount).toBe(1);
    expect(projection.totalTranscodeTaskCount).toBe(0);
    expect(projection.showRuntimeIndicator).toBe(false);
    expect(projection.downloadQueueTasks[0].traceId).toBe(LAB_DOWNLOAD_TRACE_ID);
  });

  it("download-queued projects idle WebGL with queued rows", () => {
    const projection = projectLabOverlayFixture(createDownloadQueuedFixture(), t);
    expect(projection.expandedTarget).toEqual({ kind: "idle" });
    expect(projection.primaryTask).toBeNull();
    expect(projection.centerOverlayVisual.kind).toBe("none");
    expect(projection.totalDownloadTaskCount).toBe(2);
  });

  it("transcode-active projects a transcode pill and idle arc", () => {
    const projection = projectLabOverlayFixture(createTranscodeActiveFixture(), t);
    expect(projection.expandedTarget).toEqual({ kind: "idle" });
    expect(projection.primaryTask?.kind).toBe("transcode");
    expect(projection.primaryTask?.percent).toBe(37);
    expect(projection.centerOverlayVisual.kind).toBe("task-progress");
    expect(projection.totalTranscodeTaskCount).toBe(1);
  });

  it("transcode-failed projects a failure outcome overlay with no active primary task", () => {
    const projection = projectLabOverlayFixture(createTranscodeFailedFixture(), t);
    expect(projection.primaryTask).toBeNull();
    expect(projection.centerOverlayVisual.kind).toBe("task-outcome");
    if (projection.centerOverlayVisual.kind === "task-outcome") {
      expect(projection.centerOverlayVisual.status).toBe("failure");
      expect(projection.centerOverlayVisual.message).toContain("ffmpeg");
    }
    expect(projection.primaryTaskSummaryText).toContain("ffmpeg");
  });

  it("runtime-auto-config projects the shared runtime indicator with progress", () => {
    const projection = projectLabOverlayFixture(createRuntimeAutoConfigFixture(), t);
    expect(projection.showRuntimeIndicator).toBe(true);
    expect(projection.runtimeRequiresManualAction).toBe(false);
    expect(projection.runtimeProgressPercent).toBe(42);
    expect(projection.runtimeIsIndeterminate).toBe(false);
    expect(projection.runtimeShouldRenderRing).toBe(true);
  });

  it("runtime-failed projects a manual-action runtime indicator", () => {
    const projection = projectLabOverlayFixture(createRuntimeFailedFixture(), t);
    expect(projection.showRuntimeIndicator).toBe(true);
    expect(projection.runtimeRequiresManualAction).toBe(true);
    expect(projection.runtimeProgressPercent).toBeNull();
  });

  it("mixed-busy projects download arc + transcode pill + both counts", () => {
    const projection = projectLabOverlayFixture(createMixedBusyFixture(), t);
    expect(projection.expandedTarget).toEqual({
      kind: "progress",
      progress: { kind: "determinate", traceId: LAB_DOWNLOAD_TRACE_ID, target: 0.64 },
    });
    expect(projection.primaryTask?.kind).toBe("download");
    expect(projection.totalDownloadTaskCount).toBe(1);
    expect(projection.totalTranscodeTaskCount).toBe(1);
    expect(projection.transcodeQueueTasks[0].traceId).toBe(LAB_TRANSCODE_TRACE_ID);
  });
});
