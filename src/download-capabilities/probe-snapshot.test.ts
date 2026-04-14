import { describe, expect, it } from "vitest";
import {
  createCapabilityProbeRecord,
  createCapabilityProbeSnapshot,
} from "./probe-snapshot.js";

describe("capability probe snapshots", () => {
  it("summarizes probe records by probe status", () => {
    const targets = [
      {
        id: "youtube-ytdlp",
        engine: "yt-dlp",
        sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        siteId: "youtube",
        tier: "critical",
      },
      {
        id: "generic-direct",
        engine: "direct",
        sourceUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
        siteId: "generic",
        tier: "coverage",
      },
    ] as const;

    const snapshot = createCapabilityProbeSnapshot({
      generatedAt: "2026-04-14T00:00:00.000Z",
      targets,
      records: [
        createCapabilityProbeRecord(targets[0], {
          engine: "yt-dlp",
          sourceUrl: targets[0].sourceUrl,
          siteId: "youtube",
          status: "works",
          authRequirement: "optional",
          classification: null,
          transport: "command",
          executedAt: "2026-04-14T00:00:00.000Z",
          summary: "ok",
        }),
        createCapabilityProbeRecord(targets[1], {
          engine: "direct",
          sourceUrl: targets[1].sourceUrl,
          siteId: "generic",
          status: "works_with_auth",
          authRequirement: "required",
          classification: "auth_required",
          transport: "head_request",
          executedAt: "2026-04-14T00:00:00.000Z",
          summary: "needs auth",
        }),
      ],
    });

    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.targets[0]).toMatchObject({
      id: "youtube-ytdlp",
      tier: "critical",
    });
    expect(snapshot.summary).toEqual({
      total: 2,
      works: 1,
      worksWithAuth: 1,
      unstable: 0,
      broken: 0,
    });
  });
});
