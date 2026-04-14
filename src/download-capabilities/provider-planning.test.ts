import { describe, expect, it } from "vitest";
import { detectSiteHintFromUrl, type RawDownloadInput } from "../core/index.js";
import { builtinProviders } from "../sites/index.js";
import {
  buildEnginePlansFromStrategy,
  bundledCapabilityRegistry,
  getProviderMigrationTarget,
  providerMigrationTargets,
  resolveProviderStrategy,
} from "./index.js";

describe("provider planning helpers", () => {
  it("prefers explicit site hints over unknown urls", () => {
    const strategy = resolveProviderStrategy({
      url: "https://cdn.example.com/watch?id=42",
      siteHint: "twitter-x",
    });

    expect(strategy.strategy.siteId).toBe("twitter-x");
    expect(strategy.matchedBy).toBe("site_hint");
    expect(strategy.resolvedSiteHint).toBe("twitter-x");
  });

  it("resolves strategy from page urls before generic fallback", () => {
    const strategy = resolveProviderStrategy({
      url: "https://cdn.example.com/watch?id=42",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });

    expect(strategy.strategy.siteId).toBe("youtube");
    expect(strategy.matchedBy).toBe("page_url");
    expect(strategy.matchedUrl).toBe("https://www.youtube.com/watch?v=abc123");
  });

  it("falls back to detected site hints when host aliases are not in registry host match hints", () => {
    const input: RawDownloadInput = {
      url: "https://cdn.bytedance.com/video/example.mp4",
    };

    expect(detectSiteHintFromUrl(input.url)).toBe("douyin");

    const strategy = resolveProviderStrategy(input);
    expect(strategy.strategy.siteId).toBe("douyin");
    expect(strategy.matchedBy).toBe("detected_hint");
    expect(strategy.resolvedSiteHint).toBe("douyin");
  });

  it("falls back to the generic strategy when no site can be resolved", () => {
    const strategy = resolveProviderStrategy({
      url: "https://cdn.example.com/video?id=42",
    });

    expect(strategy.strategy.siteId).toBe("generic");
    expect(strategy.matchedBy).toBe("generic_fallback");
  });

  it("builds ordered engine plans directly from registry strategy order", () => {
    const strategy = bundledCapabilityRegistry.getSiteStrategy("weibo");
    expect(strategy).not.toBeNull();
    if (!strategy) {
      throw new Error("Missing weibo strategy");
    }

    const plans = buildEnginePlansFromStrategy(
      strategy,
      "https://weibo.com/detail/4913212871149937",
    );

    expect(plans).toEqual([
      expect.objectContaining({
        engine: "gallery-dl",
        when: "primary",
        priority: 100,
        sourceUrl: "https://weibo.com/detail/4913212871149937",
      }),
      expect.objectContaining({
        engine: "yt-dlp",
        when: "fallback",
        priority: 90,
        sourceUrl: "https://weibo.com/detail/4913212871149937",
      }),
    ]);
  });
});

describe("provider migration targets", () => {
  it("covers every builtin provider with an explicit migration target", () => {
    const missingTargets = builtinProviders
      .map((provider) => provider.id)
      .filter((providerId) => !getProviderMigrationTarget(providerId));

    expect(missingTargets).toEqual([]);
  });

  it("maps strategy-backed providers to existing registry strategies", () => {
    const unresolvedTargets = providerMigrationTargets
      .filter((target) => target.strategySiteId)
      .filter((target) => !bundledCapabilityRegistry.getSiteStrategy(target.strategySiteId ?? ""))
      .map((target) => target.providerId);

    expect(unresolvedTargets).toEqual([]);
  });

  it("documents gallery-dl-supported as the only dynamic-capability migration target", () => {
    const dynamicTargets = providerMigrationTargets.filter(
      (target) => target.planningMode === "dynamic_capability_resolution",
    );

    expect(dynamicTargets).toEqual([
      expect.objectContaining({
        providerId: "gallery-dl-supported",
        strategySiteId: null,
      }),
    ]);
  });

  it("marks gallery-dl-supported as planned while keeping the remaining providers migrated", () => {
    const plannedTargets = providerMigrationTargets.filter((target) => target.status === "planned");
    const migratedTargets = providerMigrationTargets.filter((target) => target.status === "migrated");

    expect(plannedTargets).toEqual([
      expect.objectContaining({
        providerId: "gallery-dl-supported",
      }),
    ]);
    expect(migratedTargets).toHaveLength(providerMigrationTargets.length - 1);
  });
});
