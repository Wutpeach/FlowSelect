import type { SiteProvider } from "../core/index.js";

export const siteProviderTemplate = `
import type { RawDownloadInput, ResolvedDownloadPlan, SiteProvider } from "../core/index.js";

export const exampleProvider: SiteProvider = {
  id: "example",
  matches(input: RawDownloadInput): boolean {
    return input.url.includes("example.com");
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan | null {
    return null;
  },
};
`.trim();

export const exampleProvider: SiteProvider = {
  id: "template",
  matches() {
    return false;
  },
  resolvePlan() {
    return null;
  },
};
