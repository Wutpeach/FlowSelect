import capabilitiesSeedJson from "../assets/capabilities-seed.json";
import { capabilitySeedSchema } from "./schema.js";
import type {
  CapabilitySeed,
  DownloadCapabilityEntry,
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
  getDownloadCapabilities(siteId: string): readonly DownloadCapabilityEntry[];
  getInteractionCapabilities(siteId: string): readonly InteractionCapabilityEntry[];
};

export const bundledCapabilitySeed = capabilitySeedSchema.parse(
  capabilitiesSeedJson,
) satisfies CapabilitySeed;

export const createCapabilityRegistry = (
  seed: CapabilitySeed = bundledCapabilitySeed,
): CapabilityRegistry => {
  const downloadBySiteId = groupBySiteId(seed.downloadCapabilities);
  const interactionBySiteId = groupBySiteId(seed.interactionCapabilities);

  return {
    seed,
    listDownloadCapabilities() {
      return seed.downloadCapabilities;
    },
    listInteractionCapabilities() {
      return seed.interactionCapabilities;
    },
    getDownloadCapabilities(siteId: string) {
      return downloadBySiteId.get(siteId) ?? [];
    },
    getInteractionCapabilities(siteId: string) {
      return interactionBySiteId.get(siteId) ?? [];
    },
  };
};

export const bundledCapabilityRegistry = createCapabilityRegistry();
