import {
  detectSiteHintFromUrl,
  normalizeSiteHint,
  type RawDownloadInput,
} from "../core/index.js";
import type { CapabilityRegistry } from "./seed.js";
import { bundledCapabilityRegistry } from "./seed.js";
import {
  providerMigrationTargets,
  type ProviderMigrationTarget,
  type ProviderPlanningMode,
} from "./provider-migration-targets.js";
import type { DownloadSiteStrategyEntry } from "./types.js";

export type ProviderStrategyMatchSource =
  | "site_hint"
  | "page_url"
  | "url"
  | "video_url"
  | "detected_hint"
  | "generic_fallback";

export type ResolvedProviderStrategy = {
  strategy: DownloadSiteStrategyEntry;
  matchedBy: ProviderStrategyMatchSource;
  resolvedSiteHint?: string;
  matchedUrl?: string;
};

const resolveStrategyBySiteId = (
  siteId: string | undefined,
  registry: CapabilityRegistry,
): DownloadSiteStrategyEntry | null => {
  if (!siteId) {
    return null;
  }

  return registry.getSiteStrategy(siteId);
};

export const resolveProviderStrategy = (
  input: RawDownloadInput,
  registry: CapabilityRegistry = bundledCapabilityRegistry,
): ResolvedProviderStrategy => {
  const explicitSiteHint = normalizeSiteHint(input.siteHint);
  const explicitStrategy = resolveStrategyBySiteId(explicitSiteHint, registry);
  if (explicitStrategy) {
    return {
      strategy: explicitStrategy,
      matchedBy: "site_hint",
      resolvedSiteHint: explicitSiteHint,
    };
  }

  const urlCandidates: Array<{
    value: string | undefined;
    matchedBy: Extract<
      ProviderStrategyMatchSource,
      "page_url" | "url" | "video_url"
    >;
  }> = [
    { value: input.pageUrl, matchedBy: "page_url" },
    { value: input.url, matchedBy: "url" },
    { value: input.videoUrl, matchedBy: "video_url" },
  ];

  for (const candidate of urlCandidates) {
    if (!candidate.value) {
      continue;
    }

    const strategy = registry.findSiteStrategyForUrl(candidate.value);
    if (strategy) {
      return {
        strategy,
        matchedBy: candidate.matchedBy,
        matchedUrl: candidate.value,
      };
    }
  }

  const detectedSiteHint = detectSiteHintFromUrl(input.pageUrl)
    ?? detectSiteHintFromUrl(input.url)
    ?? detectSiteHintFromUrl(input.videoUrl);
  const detectedStrategy = resolveStrategyBySiteId(detectedSiteHint, registry);
  if (detectedStrategy) {
    return {
      strategy: detectedStrategy,
      matchedBy: "detected_hint",
      resolvedSiteHint: detectedSiteHint,
    };
  }

  const genericStrategy = registry.getSiteStrategy("generic");
  if (!genericStrategy) {
    throw new Error("Missing generic download capability strategy");
  }

  return {
    strategy: genericStrategy,
    matchedBy: "generic_fallback",
    resolvedSiteHint: "generic",
  };
};

export const getProviderMigrationTarget = (
  providerId: string,
): ProviderMigrationTarget | null => (
  providerMigrationTargets.find((entry) => entry.providerId === providerId) ?? null
);
