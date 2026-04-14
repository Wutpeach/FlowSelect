import type { CapabilityProbeSnapshot } from "./probe-snapshot.js";
import type { ProviderMigrationTarget } from "./provider-migration-targets.js";
import { providerMigrationTargets } from "./provider-migration-targets.js";
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

export type DownloadProviderMigrationSummary = {
  total: number;
  migrated: number;
  planned: number;
  entries: Array<{
    providerId: string;
    strategySiteId: string | null;
    planningMode: ProviderMigrationTarget["planningMode"];
    status: ProviderMigrationTarget["status"];
  }>;
};

export type DownloadCapabilityProbeSummary = {
  generatedAt: string;
  totalTargets: number;
  totalRecords: number;
  works: number;
  worksWithAuth: number;
  unstable: number;
  broken: number;
  tierCounts: {
    critical: number;
    authSensitive: number;
    coverage: number;
  };
};

export type DownloadTelemetryReport = {
  schemaVersion: 1;
  generatedAt: string;
  totals: DownloadTelemetryTotals;
  siteSummaries: DownloadTelemetrySiteSummary[];
  authHotspots: DownloadTelemetrySiteSummary[];
  highRiskEngineCombos: DownloadTelemetryEngineRiskSummary[];
  providerMigration: DownloadProviderMigrationSummary;
  probeSummary: DownloadCapabilityProbeSummary | null;
};

const roundRate = (value: number): number => Math.round(value * 10_000) / 100;

const escapeHtml = (value: string): string => value
  .split("&").join("&amp;")
  .split("<").join("&lt;")
  .split(">").join("&gt;")
  .split("\"").join("&quot;")
  .split("'").join("&#39;");

const summarizeProviderMigrationTargets = (
  targets: readonly ProviderMigrationTarget[],
): DownloadProviderMigrationSummary => ({
  total: targets.length,
  migrated: targets.filter((target) => target.status === "migrated").length,
  planned: targets.filter((target) => target.status === "planned").length,
  entries: [...targets]
    .map((target) => ({
      providerId: target.providerId,
      strategySiteId: target.strategySiteId,
      planningMode: target.planningMode,
      status: target.status,
    }))
    .sort((left, right) => left.providerId.localeCompare(right.providerId)),
});

const summarizeProbeSnapshot = (
  snapshot: CapabilityProbeSnapshot,
): DownloadCapabilityProbeSummary => ({
  generatedAt: snapshot.generatedAt,
  totalTargets: snapshot.targets.length,
  totalRecords: snapshot.records.length,
  works: snapshot.summary.works,
  worksWithAuth: snapshot.summary.worksWithAuth,
  unstable: snapshot.summary.unstable,
  broken: snapshot.summary.broken,
  tierCounts: {
    critical: snapshot.targets.filter((target) => target.tier === "critical").length,
    authSensitive: snapshot.targets.filter((target) => target.tier === "auth_sensitive").length,
    coverage: snapshot.targets.filter((target) => target.tier === "coverage").length,
  },
});

export const summarizeDownloadTelemetryEvents = (
  events: readonly DownloadTelemetryEvent[],
  options?: {
    providerTargets?: readonly ProviderMigrationTarget[];
    probeSnapshot?: CapabilityProbeSnapshot | null;
  },
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
    providerMigration: summarizeProviderMigrationTargets(
      options?.providerTargets ?? providerMigrationTargets,
    ),
    probeSummary: options?.probeSnapshot ? summarizeProbeSnapshot(options.probeSnapshot) : null,
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

  lines.push(
    "## Provider Migration Progress",
    "",
    `- Migrated providers: ${report.providerMigration.migrated}/${report.providerMigration.total}`,
    `- Planned providers: ${report.providerMigration.planned}/${report.providerMigration.total}`,
  );
  for (const entry of report.providerMigration.entries) {
    lines.push(
      `- ${entry.providerId}: ${entry.status} (${entry.planningMode}${entry.strategySiteId ? `, strategy=${entry.strategySiteId}` : ""})`,
    );
  }
  lines.push("");

  lines.push("## Capability Probe Status", "");
  if (!report.probeSummary) {
    lines.push("- No capability probe snapshot loaded.", "");
  } else {
    lines.push(
      `- Snapshot generated at: ${report.probeSummary.generatedAt}`,
      `- Targets / records: ${report.probeSummary.totalTargets}/${report.probeSummary.totalRecords}`,
      `- Works: ${report.probeSummary.works}`,
      `- Works with auth: ${report.probeSummary.worksWithAuth}`,
      `- Unstable: ${report.probeSummary.unstable}`,
      `- Broken: ${report.probeSummary.broken}`,
      `- Tier counts: critical=${report.probeSummary.tierCounts.critical}, auth-sensitive=${report.probeSummary.tierCounts.authSensitive}, coverage=${report.probeSummary.tierCounts.coverage}`,
      "",
    );
  }

  return `${lines.join("\n").trimEnd()}\n`;
};

const renderHtmlTable = (input: {
  columns: readonly string[];
  rows: readonly string[][];
}): string => {
  const header = input.columns
    .map((column) => `<th>${escapeHtml(column)}</th>`)
    .join("");
  const rows = input.rows.length === 0
    ? `<tr><td colspan="${input.columns.length}">No data</td></tr>`
    : input.rows
      .map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`)
      .join("");

  return `<table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
};

export const renderDownloadTelemetryReportHtml = (
  report: DownloadTelemetryReport,
): string => {
  const siteRows = report.siteSummaries.map((entry) => [
    entry.siteId,
    `${entry.successRate}%`,
    `${entry.success}/${entry.total}`,
    String(entry.authRequiredFailures),
  ]);
  const riskRows = report.highRiskEngineCombos.map((entry) => [
    entry.siteId,
    entry.engine,
    `${entry.failureRate}%`,
    `${entry.failures}/${entry.total}`,
    String(entry.authRequiredFailures),
  ]);
  const providerRows = report.providerMigration.entries.map((entry) => [
    entry.providerId,
    entry.status,
    entry.planningMode,
    entry.strategySiteId ?? "n/a",
  ]);
  const probeRows = report.probeSummary
    ? [
        ["Generated at", report.probeSummary.generatedAt],
        ["Targets / records", `${report.probeSummary.totalTargets}/${report.probeSummary.totalRecords}`],
        ["Works", String(report.probeSummary.works)],
        ["Works with auth", String(report.probeSummary.worksWithAuth)],
        ["Unstable", String(report.probeSummary.unstable)],
        ["Broken", String(report.probeSummary.broken)],
        [
          "Tier counts",
          `critical=${report.probeSummary.tierCounts.critical}, auth-sensitive=${report.probeSummary.tierCounts.authSensitive}, coverage=${report.probeSummary.tierCounts.coverage}`,
        ],
      ]
    : [["Snapshot", "No capability probe snapshot loaded"]];

  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    "  <title>Download Telemetry Report</title>",
    "  <style>",
    "    :root {",
    "      color-scheme: light;",
    "      --bg: #f6f3ea;",
    "      --paper: rgba(255,255,255,0.82);",
    "      --line: rgba(33,37,41,0.14);",
    "      --text: #1d1f23;",
    "      --muted: #5c6675;",
    "      --accent: #b35c3d;",
    "      --accent-soft: rgba(179, 92, 61, 0.12);",
    "      --shadow: 0 24px 60px rgba(44, 38, 31, 0.12);",
    "      font-family: 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', serif;",
    "    }",
    "    * { box-sizing: border-box; }",
    "    body { margin: 0; background: radial-gradient(circle at top, #fce9d8 0%, var(--bg) 42%, #efe9dc 100%); color: var(--text); }",
    "    main { max-width: 1200px; margin: 0 auto; padding: 48px 24px 72px; }",
    "    header { margin-bottom: 28px; }",
    "    h1, h2 { margin: 0; font-weight: 600; }",
    "    h1 { font-size: clamp(2.4rem, 3vw, 3.8rem); letter-spacing: -0.04em; }",
    "    h2 { font-size: 1.35rem; margin-bottom: 16px; }",
    "    p { color: var(--muted); margin: 10px 0 0; }",
    "    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin: 24px 0 32px; }",
    "    .card, section { background: var(--paper); border: 1px solid var(--line); border-radius: 20px; box-shadow: var(--shadow); backdrop-filter: blur(14px); }",
    "    .card { padding: 18px 20px; }",
    "    .eyebrow { font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); }",
    "    .metric { font-size: 2rem; line-height: 1.05; margin-top: 10px; }",
    "    .sections { display: grid; gap: 18px; }",
    "    section { padding: 22px 22px 18px; }",
    "    table { width: 100%; border-collapse: collapse; font-family: 'SF Pro Text', 'Segoe UI', sans-serif; font-size: 0.95rem; }",
    "    th, td { padding: 10px 0; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; }",
    "    th { color: var(--muted); font-weight: 600; font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase; }",
    "    tr:last-child td { border-bottom: none; }",
    "    .split { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 18px; }",
    "    @media (max-width: 900px) { .split { grid-template-columns: 1fr; } main { padding: 28px 16px 48px; } }",
    "    .pill { display: inline-block; padding: 5px 10px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font: 600 0.82rem/1 'SF Pro Text', 'Segoe UI', sans-serif; }",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    "    <header>",
    "      <span class=\"pill\">Offline Report</span>",
    "      <h1>Download Telemetry Report</h1>",
    `      <p>Generated at ${escapeHtml(report.generatedAt)}</p>`,
    "    </header>",
    "    <div class=\"cards\">",
    `      <div class="card"><div class="eyebrow">Total Events</div><div class="metric">${report.totals.total}</div></div>`,
    `      <div class="card"><div class="eyebrow">Success Rate</div><div class="metric">${report.totals.successRate}%</div></div>`,
    `      <div class="card"><div class="eyebrow">Migrated Providers</div><div class="metric">${report.providerMigration.migrated}/${report.providerMigration.total}</div></div>`,
    `      <div class="card"><div class="eyebrow">Probe Targets</div><div class="metric">${report.probeSummary?.totalTargets ?? 0}</div></div>`,
    "    </div>",
    "    <div class=\"sections\">",
    "      <section>",
    "        <h2>Site Success Rates</h2>",
    renderHtmlTable({
      columns: ["Site", "Success Rate", "Success / Total", "Auth Failures"],
      rows: siteRows,
    }),
    "      </section>",
    "      <div class=\"split\">",
    "        <section>",
    "          <h2>High-Risk Engine Combos</h2>",
    renderHtmlTable({
      columns: ["Site", "Engine", "Failure Rate", "Failures / Total", "Auth Failures"],
      rows: riskRows,
    }),
    "        </section>",
    "        <section>",
    "          <h2>Auth Hotspots</h2>",
    renderHtmlTable({
      columns: ["Site", "Auth Failures"],
      rows: report.authHotspots.map((entry) => [entry.siteId, String(entry.authRequiredFailures)]),
    }),
    "        </section>",
    "      </div>",
    "      <div class=\"split\">",
    "        <section>",
    "          <h2>Provider Migration Progress</h2>",
    renderHtmlTable({
      columns: ["Provider", "Status", "Planning Mode", "Strategy Site"],
      rows: providerRows,
    }),
    "        </section>",
    "        <section>",
    "          <h2>Capability Probe Status</h2>",
    renderHtmlTable({
      columns: ["Metric", "Value"],
      rows: probeRows,
    }),
    "        </section>",
    "      </div>",
    "    </div>",
    "  </main>",
    "</body>",
    "</html>",
  ].join("\n");
};
