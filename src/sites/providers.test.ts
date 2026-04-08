import { describe, expect, it } from "vitest";
import type { RawDownloadInput, ResolvedDownloadPlan, VideoDownloadIntent } from "../core/index.js";
import { builtinProviders } from "./index.js";
import { createSiteRegistry } from "./site-registry.js";

const resolvePlan = (input: RawDownloadInput): ResolvedDownloadPlan => {
  const plan = createSiteRegistry(builtinProviders).resolve(input);
  expect(plan).not.toBeNull();
  if (!plan) {
    throw new Error("Expected a resolved download plan");
  }
  return plan;
};

const expectVideoIntent = (intent: ResolvedDownloadPlan["intent"]): VideoDownloadIntent => {
  expect(intent.type).toBe("video");
  if (intent.type !== "video") {
    throw new Error("Expected a video download intent");
  }
  return intent;
};

describe("builtin site providers", () => {
  it("routes direct Douyin asset URLs to the Douyin direct engine even without explicit hints", () => {
    const directUrl = "https://www.douyinvod.com/obj/tos-cn-v-0000/example.mp4";
    const plan = resolvePlan({ url: directUrl });

    expect(plan?.providerId).toBe("douyin");
    expect(plan?.engines.map((engine) => engine.engine)).toEqual(["direct", "yt-dlp"]);
    expect(plan?.engines[0]?.sourceUrl).toBe(directUrl);
  });

  it("routes Xiaohongshu direct assets through the Xiaohongshu provider", () => {
    const directUrl = "https://sns-video-bd.xhscdn.com/stream/example.mp4";
    const pageUrl = "https://www.xiaohongshu.com/explore/66112233445566778899";
    const plan = resolvePlan({
      url: directUrl,
      pageUrl,
    });

    expect(plan?.providerId).toBe("xiaohongshu");
    expect(plan?.engines.map((engine) => engine.engine)).toEqual(["direct"]);
    expect(plan?.engines[0]?.sourceUrl).toBe(directUrl);
  });

  it("does not treat Xiaohongshu image-tagged candidates as direct video hints", () => {
    const pageUrl = "https://www.xiaohongshu.com/explore/66112233445566778899";
    const plan = resolvePlan({
      url: pageUrl,
      pageUrl,
      siteHint: "xiaohongshu",
      videoCandidates: [
        {
          url: "https://sns-video-bd.xhscdn.com/stream/example.mp4",
          type: "direct_mp4",
          source: "image_element",
          confidence: "high",
          mediaType: "image",
        },
      ],
    });

    expect(plan?.providerId).toBe("xiaohongshu");
    expect(plan?.engines.map((engine) => engine.engine)).toEqual(["yt-dlp"]);
  });

  it("preserves Bilibili clip metadata on the resolved provider intent", () => {
    const url = "https://www.bilibili.com/video/BV1xx411c7mD?p=2";
    const plan = resolvePlan({
      url,
      pageUrl: "https://www.bilibili.com/video/BV1xx411c7mD?spm_id_from=333.999.0.0&p=2",
      selectionScope: "current_item",
      clipStartSec: 12,
      clipEndSec: 24,
    });
    const intent = expectVideoIntent(plan?.intent);

    expect(plan?.providerId).toBe("bilibili");
    expect(plan?.engines).toHaveLength(1);
    expect(plan?.engines[0]).toMatchObject({
      engine: "yt-dlp",
      sourceUrl: url,
    });
    expect(intent.siteId).toBe("bilibili");
    expect(intent.selectionScope).toBe("current_item");
    expect(intent.clipStartSec).toBe(12);
    expect(intent.clipEndSec).toBe(24);
  });

  it("routes x.com status URLs to the Twitter/X provider instead of the generic fallback", () => {
    const url = "https://x.com/flowselect/status/1234567890";
    const plan = resolvePlan({ url });
    const intent = expectVideoIntent(plan?.intent);

    expect(plan?.providerId).toBe("twitter-x");
    expect(plan?.engines).toHaveLength(1);
    expect(plan?.engines[0]).toMatchObject({
      engine: "yt-dlp",
      sourceUrl: url,
    });
    expect(intent.siteId).toBe("twitter-x");
  });

  it("uses explicit site hints when the route url alone is not enough to identify the provider", () => {
    const url = "https://cdn.example.com/watch?id=123";
    const plan = resolvePlan({
      url,
      siteHint: "twitter-x",
      title: "Queued from extension v2",
    });
    const intent = expectVideoIntent(plan.intent);

    expect(plan.providerId).toBe("twitter-x");
    expect(plan.engines[0]).toMatchObject({
      engine: "yt-dlp",
      sourceUrl: url,
    });
    expect(intent.siteId).toBe("twitter-x");
  });

  it("keeps YouTube current-item routing on yt-dlp with playlist-safe metadata", () => {
    const url = "https://www.youtube.com/watch?v=abc123&list=PL123456";
    const plan = resolvePlan({
      url,
      pageUrl: url,
      selectionScope: "current_item",
      title: "Current item only",
    });
    const intent = expectVideoIntent(plan.intent);

    expect(plan.providerId).toBe("youtube");
    expect(plan.engines).toHaveLength(1);
    expect(plan.engines[0]).toMatchObject({
      engine: "yt-dlp",
      sourceUrl: url,
    });
    expect(intent.siteId).toBe("youtube");
    expect(intent.selectionScope).toBe("current_item");
  });

  it("prefers direct then gallery-dl for Pinterest direct-hint plans", () => {
    const plan = resolvePlan({
      url: "https://www.pinterest.com/pin/1234567890/",
      pageUrl: "https://www.pinterest.com/pin/1234567890/",
      siteHint: "pinterest",
      videoCandidates: [
        {
          url: "https://v1.pinimg.com/videos/iht/expmp4/example.mp4",
          type: "direct_mp4",
          source: "network_probe",
          confidence: "high",
        },
      ],
    });
    const intent = expectVideoIntent(plan.intent);

    expect(plan.providerId).toBe("pinterest");
    expect(plan.engines.map((engine) => engine.engine)).toEqual(["direct", "gallery-dl"]);
    expect(intent.candidates).toEqual([
      {
        url: "https://v1.pinimg.com/videos/iht/expmp4/example.mp4",
        type: "direct_mp4",
        source: "network_probe",
        confidence: "high",
      },
    ]);
  });

  it("routes gallery-dl-supported sites through gallery-dl before the generic yt-dlp fallback", () => {
    const url = "https://www.instagram.com/p/C7example/";
    const plan = resolvePlan({
      url,
      pageUrl: url,
      title: "Gallery-dl supported page",
    });
    const intent = expectVideoIntent(plan.intent);

    expect(plan.providerId).toBe("gallery-dl-supported");
    expect(plan.engines.map((engine) => engine.engine)).toEqual(["gallery-dl", "yt-dlp"]);
    expect(plan.engines[0]).toMatchObject({
      sourceUrl: url,
    });
    expect(intent.siteId).toBe("instagram.com");
  });

  it("normalizes Weibo layerid links to the canonical detail URL for gallery-dl", () => {
    const plan = resolvePlan({
      url: "https://weibo.com/?layerid=4913212871149937",
    });
    const intent = expectVideoIntent(plan.intent);

    expect(plan.providerId).toBe("weibo");
    expect(plan.engines.map((engine) => engine.engine)).toEqual(["gallery-dl", "yt-dlp"]);
    expect(plan.engines[0]).toMatchObject({
      sourceUrl: "https://weibo.com/detail/4913212871149937",
    });
    expect(plan.engines[1]).toMatchObject({
      sourceUrl: "https://weibo.com/?layerid=4913212871149937",
    });
    expect(intent.siteId).toBe("weibo");
  });

  it("does not guess a synthetic Weibo detail URL from a tv/show fid without a status id", () => {
    const url = "https://weibo.com/tv/show/1034:4913203381993532";
    const plan = resolvePlan({ url });

    expect(plan.providerId).toBe("weibo");
    expect(plan.engines[0]).toMatchObject({
      sourceUrl: url,
    });
  });

  it("falls back to the generic provider for unknown sites while preserving normalized metadata", () => {
    const url = "https://cdn.example.com/media?id=42";
    const plan = resolvePlan({
      url,
      pageUrl: "https://example.com/post/42",
      siteHint: "generic",
      title: "Unknown provider",
      videoCandidates: [
        {
          url: "https://cdn.example.com/video-720p.mp4",
          type: "direct_mp4",
          source: "page_probe",
        },
      ],
    });
    const intent = expectVideoIntent(plan.intent);

    expect(plan.providerId).toBe("generic");
    expect(plan.engines).toMatchObject([
      {
        engine: "yt-dlp",
        sourceUrl: "https://example.com/post/42",
      },
    ]);
    expect(intent.siteId).toBe("generic");
    expect(intent.candidates).toEqual([
      {
        url: "https://cdn.example.com/video-720p.mp4",
        type: "direct_mp4",
        source: "page_probe",
      },
    ]);
  });
});
