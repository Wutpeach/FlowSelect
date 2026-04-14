import { describe, expect, it } from "vitest";
import { createCapabilityRegistry } from "./seed.js";
import { createCapabilityProbeRecord, createCapabilityProbeSnapshot } from "./probe-snapshot.js";
import { createCapabilityProbeReviewArtifact } from "./probe-review.js";

describe("capability probe review artifacts", () => {
  it("surfaces existing-capability drifts and missing capability entries separately", () => {
    const registry = createCapabilityRegistry({
      schemaVersion: 1,
      generatedAt: "2026-04-14T00:00:00.000Z",
      sources: [
        {
          id: "manual-sites",
          type: "manual",
          engine: null,
          label: "Manual sites",
          fetchedAt: "2026-04-14T00:00:00.000Z",
          entryCount: 1,
        },
      ],
      downloadCapabilities: [
        {
          siteId: "youtube",
          displayName: "YouTube",
          engine: "yt-dlp",
          sourceId: "manual-sites",
          claimStatus: "manual_supported",
          probeStatus: "unknown",
          authRequirement: "optional",
          upstreamState: "reported_supported",
        },
      ],
      interactionCapabilities: [],
      siteStrategies: [],
    });

    const targets = [
      {
        id: "youtube-ytdlp",
        engine: "yt-dlp",
        sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        siteId: "youtube",
        tier: "critical",
      },
      {
        id: "douyin-ytdlp",
        engine: "yt-dlp",
        sourceUrl: "https://www.douyin.com/video/7493088730088770870",
        siteId: "douyin",
        tier: "critical",
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
          summary: "resolved metadata",
        }),
        createCapabilityProbeRecord(targets[1], {
          engine: "yt-dlp",
          sourceUrl: targets[1].sourceUrl,
          siteId: "douyin",
          status: "works_with_auth",
          authRequirement: "required",
          classification: "auth_required",
          transport: "command",
          executedAt: "2026-04-14T00:00:00.000Z",
          summary: "needs cookies",
        }),
      ],
    });

    const artifact = createCapabilityProbeReviewArtifact({
      snapshot,
      registry,
      generatedAt: "2026-04-14T00:00:00.000Z",
    });

    expect(artifact.summary).toEqual({
      totalCandidates: 2,
      unchangedRecords: 0,
      updateExistingCapability: 1,
      addMissingCapability: 1,
      candidateTiers: {
        critical: 2,
        authSensitive: 0,
        coverage: 0,
      },
    });
    expect(artifact.candidates[0]).toMatchObject({
      target: {
        id: "youtube-ytdlp",
      },
      maintained: {
        present: true,
        probeStatus: "unknown",
      },
      observed: {
        status: "works",
      },
      review: {
        kind: "update_existing_capability",
      },
    });
    expect(artifact.candidates[1]).toMatchObject({
      target: {
        id: "douyin-ytdlp",
      },
      maintained: {
        present: false,
      },
      review: {
        kind: "add_missing_capability",
        requiresManualConfirmation: true,
      },
    });
  });
});
