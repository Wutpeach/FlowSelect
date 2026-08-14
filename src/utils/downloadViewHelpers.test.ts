import { describe, expect, it } from "vitest";

import type {
  DownloadProgressPayload,
  VideoTranscodeTaskPayload,
} from "../protocol/download/ipcTypes";
import {
  advanceDownloadStage,
  getDownloadActivityLabel,
  getDownloadStatusText,
  getTranscodeStageLabel,
  getTranscodeTaskStatusText,
  getVideoTranscodeFormatLabel,
  getVideoTranscodeTaskProgressPercent,
  mergeVideoTranscodeTask,
  normalizeVideoQueueDetail,
  normalizeVideoQueueState,
  normalizeVideoTranscodeQueueDetail,
  normalizeVideoTranscodeQueueState,
  normalizeVideoTranscodeTask,
  removeVideoTranscodeTask,
  shouldShowVideoTaskBadge,
  sortVideoTranscodeTasks,
  upsertVideoTranscodeTask,
} from "./downloadViewHelpers";

const t = (key: string, options?: Record<string, unknown>): string => {
  if (!options) {
    return key;
  }
  return `${key} ${JSON.stringify(options)}`;
};

const progress = (overrides: Partial<DownloadProgressPayload> = {}): DownloadProgressPayload => ({
  traceId: "trace-1",
  percent: 42,
  stage: "downloading",
  speed: "",
  eta: "",
  ...overrides,
});

const transcodeTask = (
  overrides: Partial<VideoTranscodeTaskPayload> = {},
): VideoTranscodeTaskPayload => ({
  traceId: "trace-1",
  label: "clip.mov",
  status: "active",
  stage: "transcoding",
  progressPercent: 42,
  etaSeconds: 61,
  sourcePath: "C:/input.mov",
  sourceFormat: "mov",
  targetFormat: "mp4",
  error: null,
  ...overrides,
});

describe("advanceDownloadStage", () => {
  it("keeps stages monotonic and allows forward skips", () => {
    expect(advanceDownloadStage("preparing", "merging", -1)).toBe("merging");
    expect(advanceDownloadStage("merging", "downloading", -1)).toBe("merging");
    expect(advanceDownloadStage(null, "downloading", 10)).toBe("downloading");
  });

  it("does not regress to preparing after progress is known", () => {
    expect(advanceDownloadStage("downloading", "preparing", 0)).toBe("downloading");
    expect(advanceDownloadStage("downloading", "preparing", 35)).toBe("downloading");
    expect(advanceDownloadStage("downloading", "preparing", -1)).toBe("downloading");
  });
});

describe("getDownloadStatusText", () => {
  it("uses activity labels while preparing", () => {
    expect(getDownloadStatusText(t, progress({
      stage: "preparing",
      speed: "Resolving media...",
    }), null)).toBe("desktop:app.downloadActivity.galleryDl.resolvingMedia");
  });

  it("falls back from missing activity tokens to the stage label", () => {
    expect(getDownloadActivityLabel(t, "activity:missing")).toBeNull();
    expect(getDownloadStatusText(t, progress({
      stage: "preparing",
      speed: "activity:missing",
    }), null)).toBe("desktop:app.downloadStage.preparing");
  });

  it("formats downloading text with speed and ETA", () => {
    expect(getDownloadStatusText(t, progress({
      speed: "1.2 MiB/s",
      eta: "0:10",
    }), null)).toBe(
      'desktop:app.downloadStage.downloading 1.2 MiB/s · desktop:app.downloadStatus.eta {"eta":"0:10"}',
    );
  });

  it("hides runtime fallback speed tokens and keeps ETA", () => {
    expect(getDownloadStatusText(t, progress({
      speed: "gallery-dl",
      eta: "0:10",
    }), null)).toBe(
      'desktop:app.downloadStage.downloading desktop:app.downloadStatus.eta {"eta":"0:10"}',
    );

    expect(getDownloadStatusText(t, progress({
      speed: "Downloading...",
      eta: "N/A",
    }), null)).toBe("desktop:app.downloadStage.downloading");
  });

  it("uses the explicit stage override when supplied", () => {
    expect(getDownloadStatusText(t, progress({
      stage: "downloading",
      speed: "2 MiB/s",
      eta: "0:08",
    }), "merging")).toBe("desktop:app.downloadStage.merging");
  });

  it("does not leak merge speed or ETA into muxing status", () => {
    expect(getDownloadStatusText(t, progress({
      stage: "merging",
      percent: 100,
      speed: "merging",
      eta: "0:01",
    }), null)).toBe("desktop:app.downloadStage.merging");
  });

  it("short-circuits non-downloading stages to stage labels", () => {
    expect(getDownloadStatusText(t, progress({
      stage: "merging",
      speed: "1.2 MiB/s",
      eta: "0:10",
    }), null)).toBe("desktop:app.downloadStage.merging");

    expect(getDownloadStatusText(t, progress({
      stage: "post_processing",
      speed: "1.2 MiB/s",
      eta: "0:10",
    }), null)).toBe("desktop:app.downloadStage.postProcessing");
  });
});

describe("video queue helpers", () => {
  it("shows the video task badge only for multi-task queues unless the queue popover is open", () => {
    expect(shouldShowVideoTaskBadge({
      totalTaskCount: 0,
      isQueuePopoverOpen: false,
      isAdvancedQualitySelectionPopover: false,
    })).toBe(false);
    expect(shouldShowVideoTaskBadge({
      totalTaskCount: 1,
      isQueuePopoverOpen: false,
      isAdvancedQualitySelectionPopover: false,
    })).toBe(false);
    expect(shouldShowVideoTaskBadge({
      totalTaskCount: 2,
      isQueuePopoverOpen: false,
      isAdvancedQualitySelectionPopover: false,
    })).toBe(true);
    expect(shouldShowVideoTaskBadge({
      totalTaskCount: 1,
      isQueuePopoverOpen: true,
      isAdvancedQualitySelectionPopover: false,
    })).toBe(true);
    expect(shouldShowVideoTaskBadge({
      totalTaskCount: 2,
      isQueuePopoverOpen: true,
      isAdvancedQualitySelectionPopover: true,
    })).toBe(false);
  });

  it("normalizes queue counts with clamped defaults", () => {
    expect(normalizeVideoQueueState({
      activeCount: 1.8,
      pendingCount: -4,
      totalCount: 999,
      maxConcurrent: 0,
    })).toEqual({
      activeCount: 1,
      pendingCount: 0,
      totalCount: 1,
      maxConcurrent: 1,
    });

    expect(normalizeVideoQueueState(null)).toEqual({
      activeCount: 0,
      pendingCount: 0,
      totalCount: 0,
      maxConcurrent: 1,
    });
  });

  it("normalizes queue detail labels and status", () => {
    expect(normalizeVideoQueueDetail({
      tasks: [
        { traceId: "active-1", label: "", status: "active" },
        { traceId: "pending-1", label: " Pending ", status: "pending" },
        { traceId: "coerced", label: "Coerced", status: "other" as "active" },
        { traceId: "bad", label: null as unknown as string, status: "active" },
      ],
    })).toEqual({
      tasks: [
        {
          traceId: "active-1",
          label: "active-1",
          videoTitle: undefined,
          status: "active",
          phase: null,
          qualityOptions: undefined,
        },
        {
          traceId: "pending-1",
          label: "Pending",
          videoTitle: undefined,
          status: "pending",
          phase: null,
          qualityOptions: undefined,
        },
        {
          traceId: "coerced",
          label: "Coerced",
          videoTitle: undefined,
          status: "active",
          phase: null,
          qualityOptions: undefined,
        },
      ],
    });
  });

  it("normalizes advanced quality title and post-process metadata", () => {
    expect(normalizeVideoQueueDetail({
      tasks: [
        {
          traceId: "advanced-1",
          label: "Fallback title",
          videoTitle: " Real video title ",
          status: "active",
          phase: "selecting_quality",
          qualityOptions: [
            {
              id: "height_1080",
              label: " 1080p ",
              tags: [" ", "legacy"],
              postProcessPlan: "full_transcode",
            },
            {
              id: "height_720",
              label: "720p",
              postProcessPlan: "bad" as "unknown",
            },
          ],
        },
      ],
    })).toEqual({
      tasks: [
        {
          traceId: "advanced-1",
          label: "Fallback title",
          videoTitle: "Real video title",
          status: "active",
          phase: "selecting_quality",
          qualityOptions: [
            {
              id: "height_1080",
              label: "1080p",
              tags: ["legacy"],
              postProcessPlan: "full_transcode",
            },
            {
              id: "height_720",
              label: "720p",
              tags: undefined,
              postProcessPlan: undefined,
            },
          ],
        },
      ],
    });
  });

  it("keeps only a nonblank Intake marker that identifies a normalized task", () => {
    expect(normalizeVideoQueueDetail({
      acceptedTraceId: " accepted ",
      tasks: [{ traceId: "accepted", label: "Video", status: "pending" }],
    })).toMatchObject({ acceptedTraceId: "accepted" });

    expect(normalizeVideoQueueDetail({
      acceptedTraceId: "missing",
      tasks: [{ traceId: "accepted", label: "Video", status: "pending" }],
    })).not.toHaveProperty("acceptedTraceId");
    expect(normalizeVideoQueueDetail({
      acceptedTraceId: "   ",
      tasks: [{ traceId: "accepted", label: "Video", status: "pending" }],
    })).not.toHaveProperty("acceptedTraceId");
  });
});

describe("video transcode queue helpers", () => {
  it("normalizes transcode queue counts", () => {
    expect(normalizeVideoTranscodeQueueState({
      activeCount: 1.2,
      pendingCount: 2.9,
      failedCount: -1,
      totalCount: 999,
      maxConcurrent: 0,
    })).toEqual({
      activeCount: 1,
      pendingCount: 2,
      failedCount: 0,
      totalCount: 3,
      maxConcurrent: 1,
    });
  });

  it("normalizes transcode tasks and invalid values", () => {
    expect(normalizeVideoTranscodeTask(null)).toBeNull();
    expect(normalizeVideoTranscodeTask({
      traceId: "missing-label",
      label: null as unknown as string,
    })).toBeNull();

    expect(normalizeVideoTranscodeTask({
      traceId: "trace-1",
      label: " ",
      status: "unknown" as "active",
      stage: "unknown" as unknown as VideoTranscodeTaskPayload["stage"],
      progressPercent: 150,
      etaSeconds: 0,
      sourcePath: " C:/input.mov ",
      sourceFormat: " mov ",
      targetFormat: "",
      error: " ",
    })).toEqual({
      traceId: "trace-1",
      label: "trace-1",
      status: "active",
      stage: null,
      progressPercent: 100,
      etaSeconds: 0,
      failure: null,
      sourcePath: "C:/input.mov",
      sourceFormat: "mov",
      targetFormat: null,
      error: null,
    });

    expect(normalizeVideoTranscodeTask({
      traceId: "failed-1",
      label: "Failed",
      status: "failed",
      stage: "invalid" as unknown as VideoTranscodeTaskPayload["stage"],
    })).toMatchObject({
      status: "failed",
      stage: "failed",
    });
  });

  it("sorts and upserts transcode tasks by status groups", () => {
    const failed = transcodeTask({ traceId: "failed", status: "failed" });
    const pending = transcodeTask({ traceId: "pending", status: "pending" });
    const active = transcodeTask({ traceId: "active", status: "active" });

    expect(sortVideoTranscodeTasks([failed, pending, active]).map((task) => task.traceId))
      .toEqual(["active", "pending", "failed"]);

    expect(upsertVideoTranscodeTask([failed, pending], active).map((task) => task.traceId))
      .toEqual(["active", "pending", "failed"]);
  });

  it("normalizes transcode queue details through task normalization and sorting", () => {
    expect(normalizeVideoTranscodeQueueDetail({
      tasks: [
        transcodeTask({ traceId: "failed", status: "failed" }),
        transcodeTask({ traceId: "pending", status: "pending" }),
        transcodeTask({ traceId: "active", status: "active" }),
        { traceId: "bad", label: null as unknown as string, status: "active" },
      ],
    }).tasks.map((task) => task.traceId)).toEqual(["active", "pending", "failed"]);
  });

  it("removes and merges transcode tasks without changing base trace ownership", () => {
    const base = transcodeTask({ traceId: "base", label: "Base", status: "pending" });
    const live = transcodeTask({ traceId: "live", label: " ", status: "active", progressPercent: 88 });

    expect(removeVideoTranscodeTask([base, live], "base")).toEqual([live]);
    expect(mergeVideoTranscodeTask(base, live)).toMatchObject({
      traceId: "base",
      label: "Base",
      status: "active",
      progressPercent: 88,
    });
    expect(mergeVideoTranscodeTask(base, null)).toEqual(base);
  });

  it("formats transcode status text, progress, and format labels", () => {
    expect(getTranscodeStageLabel(t, "finalizing_mp4")).toBe("desktop:app.transcodeStage.finalizingMp4");
    expect(getTranscodeTaskStatusText(t, transcodeTask())).toBe(
      '42% · desktop:app.transcodeStage.transcoding · desktop:app.downloadStatus.eta {"eta":"1:01"}',
    );
    expect(getTranscodeTaskStatusText(t, transcodeTask({ stage: null, progressPercent: null }))).toBe(
      'desktop:app.transcodeStage.analyzing · desktop:app.downloadStatus.eta {"eta":"1:01"}',
    );
    expect(getTranscodeTaskStatusText(t, transcodeTask(), { includePercent: false })).toBe(
      'desktop:app.transcodeStage.transcoding · desktop:app.downloadStatus.eta {"eta":"1:01"}',
    );
    expect(getTranscodeTaskStatusText(t, transcodeTask({ status: "pending" }))).toBe("desktop:app.queue.waiting");
    expect(getTranscodeTaskStatusText(t, transcodeTask({
      status: "failed",
      stage: null,
      etaSeconds: 10,
    }))).toBe("desktop:app.transcodeStage.failed");

    expect(getVideoTranscodeTaskProgressPercent(transcodeTask({ status: "pending", progressPercent: 99 }))).toBe(8);
    expect(getVideoTranscodeTaskProgressPercent(transcodeTask({ progressPercent: null }))).toBe(22);
    expect(getVideoTranscodeTaskProgressPercent(transcodeTask({ status: "failed", progressPercent: null }))).toBe(18);
    expect(getVideoTranscodeTaskProgressPercent(transcodeTask({ progressPercent: 3 }))).toBe(8);
    expect(getVideoTranscodeTaskProgressPercent(transcodeTask({ progressPercent: 120 }))).toBe(100);

    expect(getVideoTranscodeFormatLabel(transcodeTask())).toBe("MOV -> MP4");
    expect(getVideoTranscodeFormatLabel(transcodeTask({ targetFormat: null }))).toBeNull();
  });
});
