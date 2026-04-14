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

type StrategyEngineSourceConfig = {
  sourceUrl: string;
  reason?: string;
  fallbackOn?: EnginePlan["fallbackOn"];
  fallbackOnClassifications?: EnginePlan["fallbackOnClassifications"];
  options?: EnginePlan["options"];
};

type StrategyEngineSourceMap = Partial<
  Record<EnginePlan["engine"], StrategyEngineSourceConfig>
>;

export const buildEnginePlansFromStrategySources = (
  strategy: DownloadSiteStrategyEntry,
  sources: StrategyEngineSourceMap,
): EnginePlan[] => (
  strategy.engineOrder.flatMap((engine, index) => {
    const config = sources[engine];
    if (!config?.sourceUrl) {
      return [];
    }

    return [{
      engine,
      priority: DEFAULT_PRIMARY_PRIORITY - (index * DEFAULT_FALLBACK_PRIORITY_STEP),
      when: index === 0 ? "primary" : "fallback",
      reason: config.reason ?? buildRegistryEngineReason(strategy, engine, index),
      sourceUrl: config.sourceUrl,
      fallbackOn: config.fallbackOn,
      fallbackOnClassifications: config.fallbackOnClassifications,
      options: config.options,
    }];
  })
);
