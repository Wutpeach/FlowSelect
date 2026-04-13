import capabilitiesManualJson from "../assets/capabilities-manual.json";
import capabilitiesSeedJson from "../assets/capabilities-seed.json";
import { capabilitySeedSchema } from "./schema.js";
import type {
  CapabilityEngineId,
  CapabilityMatchHints,
  InteractionMode,
  CapabilitySeed,
  DownloadCapabilityEntry,
  DownloadSiteStrategyEntry,
  InteractionCapabilityEntry,
} from "./types.js";

const groupBySiteId = <TEntry extends { siteId: string }>(entries: readonly TEntry[]): Map<string, TEntry[]> => {
  const grouped = new Map<string, TEntry[]>();
  for (const entry of entries) {
    const existing = grouped.get(entry.siteId);
    if (existing) {
      existing.push(entry);
      continue;
    }
    grouped.set(entry.siteId, [entry]);
  }
  return grouped;
};

export type CapabilityRegistry = {
  seed: CapabilitySeed;
  listDownloadCapabilities(): readonly DownloadCapabilityEntry[];
  listInteractionCapabilities(): readonly InteractionCapabilityEntry[];
  listSiteStrategies(): readonly DownloadSiteStrategyEntry[];
  getDownloadCapabilities(siteId: string): readonly DownloadCapabilityEntry[];
  getInteractionCapabilities(siteId: string): readonly InteractionCapabilityEntry[];
  getSiteStrategy(siteId: string): DownloadSiteStrategyEntry | null;
  getPreferredEngine(siteId: string): CapabilityEngineId | null;
  supportsEngine(siteId: string, engine: CapabilityEngineId): boolean;
  supportsInteractionMode(siteId: string, mode: InteractionMode): boolean;
  findDownloadCapabilitiesForUrl(url: string): readonly DownloadCapabilityEntry[];
  findInteractionCapabilityForUrl(url: string): InteractionCapabilityEntry | null;
  findSiteStrategyForUrl(url: string): DownloadSiteStrategyEntry | null;
};

const generatedCapabilitySeed = capabilitySeedSchema.parse(
  capabilitiesSeedJson,
) satisfies CapabilitySeed;
const manualCapabilitySeed = capabilitySeedSchema.parse(
  capabilitiesManualJson,
) satisfies CapabilitySeed;

const normalizeHost = (value: string): string => value.trim().toLowerCase().replace(/^www\./, "");

const matchesNormalizedHost = (
  normalizedHost: string,
  matchHints: CapabilityMatchHints | undefined,
): boolean => (
  matchHints?.hosts?.some((host) => {
    const normalizedCandidate = normalizeHost(host);
    return normalizedHost === normalizedCandidate || normalizedHost.endsWith(`.${normalizedCandidate}`);
  }) ?? false
);

const mergeCapabilitySeeds = (
  baseSeed: CapabilitySeed,
  overlaySeed: CapabilitySeed,
): CapabilitySeed => {
  const mergedSources = [
    ...baseSeed.sources,
    ...overlaySeed.sources.filter((source) => !baseSeed.sources.some((entry) => entry.id === source.id)),
  ];

  const strategyBySiteId = new Map<string, DownloadSiteStrategyEntry>();
  for (const strategy of baseSeed.siteStrategies) {
    strategyBySiteId.set(strategy.siteId, strategy);
  }
  for (const strategy of overlaySeed.siteStrategies) {
    strategyBySiteId.set(strategy.siteId, strategy);
  }

  return {
    schemaVersion: 1,
    generatedAt: overlaySeed.generatedAt,
    sources: mergedSources,
    downloadCapabilities: [
      ...baseSeed.downloadCapabilities,
      ...overlaySeed.downloadCapabilities,
    ],
    interactionCapabilities: [
      ...baseSeed.interactionCapabilities,
      ...overlaySeed.interactionCapabilities,
    ],
    siteStrategies: [...strategyBySiteId.values()],
  };
};

export const bundledCapabilitySeed = mergeCapabilitySeeds(
  generatedCapabilitySeed,
  manualCapabilitySeed,
);

export const createCapabilityRegistry = (
  seed: CapabilitySeed = bundledCapabilitySeed,
): CapabilityRegistry => {
  const downloadBySiteId = groupBySiteId(seed.downloadCapabilities);
  const interactionBySiteId = groupBySiteId(seed.interactionCapabilities);
  const strategyBySiteId = new Map(seed.siteStrategies.map((entry) => [entry.siteId, entry]));

  return {
    seed,
    listDownloadCapabilities() {
      return seed.downloadCapabilities;
    },
    listInteractionCapabilities() {
      return seed.interactionCapabilities;
    },
    listSiteStrategies() {
      return seed.siteStrategies;
    },
    getDownloadCapabilities(siteId: string) {
      return downloadBySiteId.get(siteId) ?? [];
    },
    getInteractionCapabilities(siteId: string) {
      return interactionBySiteId.get(siteId) ?? [];
    },
    getSiteStrategy(siteId: string) {
      return strategyBySiteId.get(siteId) ?? null;
    },
    getPreferredEngine(siteId: string) {
      return strategyBySiteId.get(siteId)?.engineOrder[0] ?? null;
    },
    supportsEngine(siteId: string, engine: CapabilityEngineId) {
      const strategy = strategyBySiteId.get(siteId);
      if (strategy) {
        if (strategy.forbiddenEngines?.includes(engine)) {
          return false;
        }
        return strategy.engineOrder.includes(engine);
      }

      return (downloadBySiteId.get(siteId) ?? []).some((entry) => entry.engine === engine);
    },
    supportsInteractionMode(siteId: string, mode: InteractionMode) {
      return (interactionBySiteId.get(siteId) ?? []).some((entry) => entry.supportedModes.includes(mode));
    },
    findDownloadCapabilitiesForUrl(url: string) {
      let normalizedHost: string;
      try {
        normalizedHost = normalizeHost(new URL(url).hostname);
      } catch {
        return [];
      }

      return seed.downloadCapabilities.filter((entry) => (
        matchesNormalizedHost(normalizedHost, entry.matchHints)
      ));
    },
    findInteractionCapabilityForUrl(url: string) {
      const strategy = this.findSiteStrategyForUrl(url);
      if (strategy) {
        return interactionBySiteId.get(strategy.siteId)?.[0] ?? null;
      }

      const [firstCapability] = this.findDownloadCapabilitiesForUrl(url);
      if (!firstCapability) {
        return null;
      }

      return interactionBySiteId.get(firstCapability.siteId)?.[0] ?? null;
    },
    findSiteStrategyForUrl(url: string) {
      let normalizedHost: string;
      try {
        normalizedHost = normalizeHost(new URL(url).hostname);
      } catch {
        return null;
      }

      for (const strategy of seed.siteStrategies) {
        if (matchesNormalizedHost(normalizedHost, strategy.matchHints)) {
          return strategy;
        }
      }

      return null;
    },
  };
};

export const bundledCapabilityRegistry = createCapabilityRegistry();
