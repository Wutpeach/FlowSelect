import { describe, expect, it } from "vitest";
import { bundledCapabilityRegistry } from "./seed.js";
import {
  getRuntimeManualSiteStrategy,
  runtimeManualSiteStrategies,
} from "./runtime-site-strategies.js";

describe("runtime manual site strategies", () => {
  it("stays aligned with the bundled capability registry for every mirrored site strategy", () => {
    for (const strategy of runtimeManualSiteStrategies) {
      expect(getRuntimeManualSiteStrategy(strategy.siteId)).toEqual(strategy);
      expect(bundledCapabilityRegistry.getSiteStrategy(strategy.siteId)).toEqual(strategy);
    }
  });
});
