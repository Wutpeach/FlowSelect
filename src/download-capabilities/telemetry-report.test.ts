import { describe, expect, it } from "vitest";
import {
  renderDownloadTelemetryReportHtml,
  renderDownloadTelemetryReportMarkdown,
  summarizeDownloadTelemetryEvents,
} from "./telemetry-report.js";
import { createCapabilityProbeSnapshot } from "./probe-snapshot.js";
import type { DownloadTelemetryEvent } from "./telemetry.js";

describe("telemetry report helpers", () => {
  it("summarizes telemetry, migration progress, probe status, and renders html", () => {
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

    const probeSnapshot = createCapabilityProbeSnapshot({
      generatedAt: "2026-04-14T00:10:00.000Z",
      targets: [
        {
          id: "youtube-ytdlp",
          engine: "yt-dlp",
          sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          siteId: "youtube",
          tier: "critical",
        },
        {
          id: "weibo-gallery-dl",
          engine: "gallery-dl",
          sourceUrl: "https://weibo.com/detail/4913212871149937",
          siteId: "weibo",
          tier: "auth_sensitive",
        },
      ],
      records: [],
    });

    const report = summarizeDownloadTelemetryEvents(events, {
      providerTargets: [
        {
          providerId: "youtube",
          strategySiteId: "youtube",
          planningMode: "registry_engine_order",
          status: "migrated",
          matchingOwner: "provider",
          sourceUrlOwner: "provider",
          candidateSelectionOwner: "none",
          notes: [],
        },
        {
          providerId: "gallery-dl-supported",
          strategySiteId: null,
          planningMode: "dynamic_capability_resolution",
          status: "planned",
          matchingOwner: "provider",
          sourceUrlOwner: "provider",
          candidateSelectionOwner: "none",
          notes: [],
        },
      ],
      probeSnapshot,
    });
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
    expect(report.providerMigration).toMatchObject({
      migrated: 1,
      planned: 1,
      total: 2,
    });
    expect(report.probeSummary).toMatchObject({
      totalTargets: 2,
      tierCounts: {
        critical: 1,
        authSensitive: 1,
        coverage: 0,
      },
    });

    const markdown = renderDownloadTelemetryReportMarkdown(report);
    expect(markdown).toContain("# Download Telemetry Report");
    expect(markdown).toContain("weibo: 50%");
    expect(markdown).toContain("weibo / gallery-dl");
    expect(markdown).toContain("## Provider Migration Progress");
    expect(markdown).toContain("## Capability Probe Status");

    const html = renderDownloadTelemetryReportHtml(report);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Provider Migration Progress");
    expect(html).toContain("Capability Probe Status");
  });
});
