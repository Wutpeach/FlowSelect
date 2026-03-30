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
    expect(plan?.engines.map((engine) => engine.engine)).toEqual(["direct", "yt-dlp"]);
    expect(plan?.engines[0]?.sourceUrl).toBe(directUrl);
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
});
