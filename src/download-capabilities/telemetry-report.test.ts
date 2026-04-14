import { describe, expect, it } from "vitest";
import {
  renderDownloadTelemetryReportMarkdown,
  summarizeDownloadTelemetryEvents,
} from "./telemetry-report.js";
import type { DownloadTelemetryEvent } from "./telemetry.js";

describe("telemetry report helpers", () => {
  it("summarizes success rates, auth hotspots, and high-risk engine combinations", () => {
    const events: DownloadTelemetryEvent[] = [
      {
        schemaVersion: 1,
        eventType: "download_outcome",
        recordedAt: "2026-04-14T00:00:00.000Z",
        traceId: "1",
        siteId: "weibo",
        providerId: "weibo",
        interactionMode: "context_menu",
        engineChain: ["gallery-dl", "yt-dlp"],
        chosenEngine: "gallery-dl",
        outcome: "failure",
        errorCode: "E_EXECUTION_FAILED",
        errorClassification: "auth_required",
        errorMessage: "cookies required",
      },
      {
        schemaVersion: 1,
        eventType: "download_outcome",
        recordedAt: "2026-04-14T00:00:01.000Z",
        traceId: "2",
        siteId: "weibo",
        providerId: "weibo",
        interactionMode: "context_menu",
        engineChain: ["gallery-dl", "yt-dlp"],
        chosenEngine: "yt-dlp",
        outcome: "success",
        errorCode: null,
        errorClassification: null,
        errorMessage: null,
      },
      {
        schemaVersion: 1,
        eventType: "download_outcome",
        recordedAt: "2026-04-14T00:00:02.000Z",
        traceId: "3",
        siteId: "youtube",
        providerId: "youtube",
        interactionMode: "paste",
        engineChain: ["yt-dlp"],
        chosenEngine: "yt-dlp",
        outcome: "failure",
        errorCode: "E_EXECUTION_FAILED",
        errorClassification: "retry_same_engine",
        errorMessage: "timeout",
      },
    ];

    const report = summarizeDownloadTelemetryEvents(events);
    expect(report.totals).toEqual({
      total: 3,
      success: 1,
      failure: 2,
      successRate: 33.33,
    });
    expect(report.authHotspots[0]).toMatchObject({
      siteId: "weibo",
      authRequiredFailures: 1,
    });
    expect(report.highRiskEngineCombos[0]).toMatchObject({
      siteId: "weibo",
      engine: "gallery-dl",
      failures: 1,
    });

    const markdown = renderDownloadTelemetryReportMarkdown(report);
    expect(markdown).toContain("# Download Telemetry Report");
    expect(markdown).toContain("weibo: 50%");
    expect(markdown).toContain("weibo / gallery-dl");
  });
});
