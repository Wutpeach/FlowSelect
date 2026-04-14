import type { DownloadTelemetryEvent } from "./telemetry.js";

export type DownloadTelemetryTotals = {
  total: number;
  success: number;
  failure: number;
  successRate: number;
};

export type DownloadTelemetrySiteSummary = {
  siteId: string;
  total: number;
  success: number;
  failure: number;
  successRate: number;
  authRequiredFailures: number;
};

export type DownloadTelemetryEngineRiskSummary = {
  siteId: string;
  engine: NonNullable<DownloadTelemetryEvent["chosenEngine"]>;
  total: number;
  failures: number;
  failureRate: number;
  authRequiredFailures: number;
};

export type DownloadTelemetryReport = {
  schemaVersion: 1;
  generatedAt: string;
  totals: DownloadTelemetryTotals;
  siteSummaries: DownloadTelemetrySiteSummary[];
  authHotspots: DownloadTelemetrySiteSummary[];
  highRiskEngineCombos: DownloadTelemetryEngineRiskSummary[];
};

const roundRate = (value: number): number => Math.round(value * 10_000) / 100;

export const summarizeDownloadTelemetryEvents = (
  events: readonly DownloadTelemetryEvent[],
): DownloadTelemetryReport => {
  const siteStats = new Map<string, DownloadTelemetrySiteSummary>();
  const engineStats = new Map<string, DownloadTelemetryEngineRiskSummary>();
  let success = 0;
  let failure = 0;

  for (const event of events) {
    if (event.outcome === "success") {
      success += 1;
    } else {
      failure += 1;
    }

    const siteSummary = siteStats.get(event.siteId) ?? {
      siteId: event.siteId,
      total: 0,
      success: 0,
      failure: 0,
      successRate: 0,
      authRequiredFailures: 0,
    };
    siteSummary.total += 1;
    if (event.outcome === "success") {
      siteSummary.success += 1;
    } else {
      siteSummary.failure += 1;
      if (event.errorClassification === "auth_required") {
        siteSummary.authRequiredFailures += 1;
      }
    }
    siteStats.set(event.siteId, siteSummary);

    if (!event.chosenEngine) {
      continue;
    }

    const key = `${event.siteId}:${event.chosenEngine}`;
    const engineSummary = engineStats.get(key) ?? {
      siteId: event.siteId,
      engine: event.chosenEngine,
      total: 0,
      failures: 0,
      failureRate: 0,
      authRequiredFailures: 0,
    };
    engineSummary.total += 1;
    if (event.outcome === "failure") {
      engineSummary.failures += 1;
      if (event.errorClassification === "auth_required") {
        engineSummary.authRequiredFailures += 1;
      }
    }
    engineStats.set(key, engineSummary);
  }

  const totals = {
    total: success + failure,
    success,
    failure,
    successRate: success + failure > 0 ? roundRate(success / (success + failure)) : 0,
  };

  const siteSummaries = [...siteStats.values()]
    .map((entry) => ({
      ...entry,
      successRate: entry.total > 0 ? roundRate(entry.success / entry.total) : 0,
    }))
    .sort((left, right) => right.total - left.total || right.failure - left.failure || left.siteId.localeCompare(right.siteId));

  const authHotspots = siteSummaries
    .filter((entry) => entry.authRequiredFailures > 0)
    .sort((left, right) => right.authRequiredFailures - left.authRequiredFailures || right.failure - left.failure);

  const highRiskEngineCombos = [...engineStats.values()]
    .map((entry) => ({
      ...entry,
      failureRate: entry.total > 0 ? roundRate(entry.failures / entry.total) : 0,
    }))
    .filter((entry) => entry.failures > 0)
    .sort((left, right) => right.failureRate - left.failureRate || right.failures - left.failures || right.total - left.total);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    totals,
    siteSummaries,
    authHotspots,
    highRiskEngineCombos,
  };
};

export const renderDownloadTelemetryReportMarkdown = (
  report: DownloadTelemetryReport,
): string => {
  const lines = [
    "# Download Telemetry Report",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "## Totals",
    "",
    `- Total events: ${report.totals.total}`,
    `- Success: ${report.totals.success}`,
    `- Failure: ${report.totals.failure}`,
    `- Success rate: ${report.totals.successRate}%`,
    "",
    "## Site Success Rates",
    "",
  ];

  if (report.siteSummaries.length === 0) {
    lines.push("- No telemetry events found.", "");
  } else {
    for (const entry of report.siteSummaries) {
      lines.push(
        `- ${entry.siteId}: ${entry.successRate}% success (${entry.success}/${entry.total}), auth-required failures=${entry.authRequiredFailures}`,
      );
    }
    lines.push("");
  }

  lines.push("## Auth Hotspots", "");
  if (report.authHotspots.length === 0) {
    lines.push("- No auth-required failures found.", "");
  } else {
    for (const entry of report.authHotspots) {
      lines.push(`- ${entry.siteId}: ${entry.authRequiredFailures} auth-required failures`);
    }
    lines.push("");
  }

  lines.push("## High-Risk Engine Combos", "");
  if (report.highRiskEngineCombos.length === 0) {
    lines.push("- No risky engine/site combinations found.", "");
  } else {
    for (const entry of report.highRiskEngineCombos) {
      lines.push(
        `- ${entry.siteId} / ${entry.engine}: ${entry.failureRate}% failure (${entry.failures}/${entry.total}), auth-required failures=${entry.authRequiredFailures}`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
};
