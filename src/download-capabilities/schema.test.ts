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
    expect(bundledCapabilitySeed.sources).toHaveLength(2);
    expect(bundledCapabilitySeed.downloadCapabilities.length).toBeGreaterThan(1000);
  });

  it("creates a registry that groups capabilities by site id", () => {
    const registry = createCapabilityRegistry(bundledCapabilitySeed);
    const firstEntry = bundledCapabilitySeed.downloadCapabilities[0];

    expect(firstEntry).toBeDefined();
    expect(registry.getDownloadCapabilities(firstEntry.siteId)).toContainEqual(firstEntry);
    expect(bundledCapabilityRegistry.listInteractionCapabilities()).toEqual([]);
  });
});
