import { describe, expect, it } from "vitest";
import {
  bundledCapabilityRegistry,
  bundledCapabilitySeed,
  capabilitySeedSchema,
  createCapabilityRegistry,
} from "./index.js";

describe("download capability seed", () => {
  it("validates the bundled capability seed", () => {
    expect(capabilitySeedSchema.parse(bundledCapabilitySeed)).toEqual(bundledCapabilitySeed);
    expect(bundledCapabilitySeed.sources).toHaveLength(3);
    expect(bundledCapabilitySeed.downloadCapabilities.length).toBeGreaterThan(1000);
    expect(bundledCapabilitySeed.siteStrategies.length).toBeGreaterThan(0);
  });

  it("creates a registry that groups capabilities by site id", () => {
    const registry = createCapabilityRegistry(bundledCapabilitySeed);
    const firstEntry = bundledCapabilitySeed.downloadCapabilities[0];

    expect(firstEntry).toBeDefined();
    expect(registry.getDownloadCapabilities(firstEntry.siteId)).toContainEqual(firstEntry);
    expect(registry.getSiteStrategy("youtube")).toMatchObject({
      siteId: "youtube",
      engineOrder: ["yt-dlp"],
    });
    expect(registry.findSiteStrategyForUrl("https://www.xiaohongshu.com/explore/123")).toMatchObject({
      siteId: "xiaohongshu",
      engineOrder: ["direct", "yt-dlp"],
    });
    expect(bundledCapabilityRegistry.listInteractionCapabilities().length).toBeGreaterThan(0);
  });
});
