import type { EnginePlan } from "../core/index.js";
import type { DownloadSiteStrategyEntry } from "./types.js";

const DEFAULT_PRIMARY_PRIORITY = 100;
const DEFAULT_FALLBACK_PRIORITY_STEP = 10;

const buildRegistryEngineReason = (
  strategy: DownloadSiteStrategyEntry,
  engine: EnginePlan["engine"],
  index: number,
): string => {
  if (strategy.engineOrder.length === 1) {
    return `${strategy.displayName} registry strategy allows only ${engine}`;
  }

  if (index === 0) {
    return `${strategy.displayName} registry strategy prefers ${engine} first`;
  }

  return `${strategy.displayName} registry strategy falls back to ${engine}`;
};

export const buildEnginePlansFromStrategy = (
  strategy: DownloadSiteStrategyEntry,
  sourceUrl: string,
): EnginePlan[] => (
  strategy.engineOrder.map((engine, index) => ({
    engine,
    priority: DEFAULT_PRIMARY_PRIORITY - (index * DEFAULT_FALLBACK_PRIORITY_STEP),
    when: index === 0 ? "primary" : "fallback",
    reason: buildRegistryEngineReason(strategy, engine, index),
    sourceUrl,
  }))
);
