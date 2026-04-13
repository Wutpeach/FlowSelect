import {
  detectSiteHintFromUrl,
  normalizeSiteHint,
  type RawDownloadInput,
} from "../core/index.js";
import type { CapabilityRegistry } from "./seed.js";
import { bundledCapabilityRegistry } from "./seed.js";
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

export type ProviderPlanningMode =
  | "registry_engine_order"
  | "registry_engine_order_after_provider_normalization"
  | "dynamic_capability_resolution";

export type ProviderMigrationTarget = {
  providerId: string;
  strategySiteId: string | null;
  planningMode: ProviderPlanningMode;
  matchingOwner: "provider";
  sourceUrlOwner: "provider";
  candidateSelectionOwner: "provider" | "none";
  notes: readonly string[];
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

export const providerMigrationTargets = [
  {
    providerId: "youtube",
    strategySiteId: "youtube",
    planningMode: "registry_engine_order",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "none",
    notes: [
      "Provider continues to own YouTube URL matching and metadata shaping.",
      "Registry can fully own engine ordering because the current route is single-engine yt-dlp.",
    ],
  },
  {
    providerId: "douyin",
    strategySiteId: "douyin",
    planningMode: "registry_engine_order_after_provider_normalization",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "provider",
    notes: [
      "Provider must continue direct-media detection before registry engine ordering is applied.",
      "Registry can own the direct -> yt-dlp chain once the provider resolves the correct source URL.",
    ],
  },
  {
    providerId: "xiaohongshu",
    strategySiteId: "xiaohongshu",
    planningMode: "registry_engine_order_after_provider_normalization",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "provider",
    notes: [
      "Provider must keep note URL canonicalization and candidate filtering.",
      "Registry should only take over engine ordering after provider-owned normalization chooses the source URL.",
    ],
  },
  {
    providerId: "bilibili",
    strategySiteId: "bilibili",
    planningMode: "registry_engine_order",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "none",
    notes: [
      "Provider continues to own current-item metadata and clip-range intent fields.",
      "Registry can own engine ordering because the route remains single-engine yt-dlp.",
    ],
  },
  {
    providerId: "twitter-x",
    strategySiteId: "twitter-x",
    planningMode: "registry_engine_order",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "none",
    notes: [
      "Provider continues to own status matching and intent shaping.",
      "Registry can own engine ordering because the route remains single-engine yt-dlp.",
    ],
  },
  {
    providerId: "pinterest",
    strategySiteId: "pinterest",
    planningMode: "registry_engine_order_after_provider_normalization",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "provider",
    notes: [
      "Provider must keep direct-asset verification and candidate filtering.",
      "Registry can own direct -> gallery-dl ordering after the provider chooses whether a direct asset exists.",
    ],
  },
  {
    providerId: "weibo",
    strategySiteId: "weibo",
    planningMode: "registry_engine_order_after_provider_normalization",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "none",
    notes: [
      "Provider must keep visitor-wrapper unwrapping and tv/show normalization.",
      "Registry can own gallery-dl -> yt-dlp ordering for canonical detail/status URLs after provider normalization.",
    ],
  },
  {
    providerId: "gallery-dl-supported",
    strategySiteId: null,
    planningMode: "dynamic_capability_resolution",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "none",
    notes: [
      "This provider spans many upstream gallery-dl sites and cannot map to one manual strategy entry.",
      "Migration depends on dynamic capability lookup seeded from upstream data and later probe outcomes.",
    ],
  },
  {
    providerId: "generic",
    strategySiteId: "generic",
    planningMode: "registry_engine_order",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "none",
    notes: [
      "Generic matching remains the final catch-all provider responsibility.",
      "Registry can own engine ordering immediately because the route is single-engine yt-dlp.",
    ],
  },
] satisfies readonly ProviderMigrationTarget[];

export const getProviderMigrationTarget = (
  providerId: string,
): ProviderMigrationTarget | null => (
  providerMigrationTargets.find((entry) => entry.providerId === providerId) ?? null
);
