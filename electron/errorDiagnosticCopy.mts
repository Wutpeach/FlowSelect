import type {
  ErrorDiagnosticCategory,
  ErrorDiagnosticCopyReport,
  ErrorDiagnosticCopyRequest,
  ErrorDiagnosticSurface,
  RuntimeFailureDiagnostic,
} from "../src/types/errorDiagnostics.js";
import {
  DOWNLOAD_DIAGNOSTIC_CATEGORIES,
  sanitizeDiagnosticText,
  sanitizeDiagnosticValue,
  toSafeDiagnosticUrl,
  type DownloadDiagnosticCategory,
  type DownloadErrorCode,
  type DownloadFailureClassification,
} from "../src/core/index.js";
import type {
  AttemptDiagnosticSummary,
  DownloadDiagnosticNetwork,
  DownloadTerminalDiagnosticSummary,
} from "../src/application/download-diagnostics.js";

type BuildErrorDiagnosticCopyReportOptions = {
  request: ErrorDiagnosticCopyRequest;
  appVersion: string;
  platform?: string;
  arch?: string;
  now?(): Date;
};

const asObject = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeSafeString = (
  value: unknown,
  maxLength = 160,
): string | undefined => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }
  return sanitizeDiagnosticText(normalized, maxLength).trim() || undefined;
};

const normalizeCategory = (value: unknown): ErrorDiagnosticCategory => {
  const normalized = normalizeOptionalString(value);
  switch (normalized) {
    case "auth_login_state":
    case "network_proxy":
    case "content_unavailable":
    case "output_write":
    case "quality_format_unavailable":
    case "runtime_downloader_unavailable":
    case "transcode_merge":
    case "unclassified":
      return normalized;
    default:
      return "unclassified";
  }
};

const normalizeDiagnosticCategory = (
  value: unknown,
): DownloadDiagnosticCategory | undefined => (
  typeof value === "string"
  && DOWNLOAD_DIAGNOSTIC_CATEGORIES.includes(value as DownloadDiagnosticCategory)
    ? value as DownloadDiagnosticCategory
    : undefined
);

const normalizeSurface = (value: unknown): ErrorDiagnosticSurface => (
  normalizeOptionalString(value) === "transcode" ? "transcode" : "download"
);

const FAILURE_CLASSIFICATIONS: readonly DownloadFailureClassification[] = [
  "retry_same_engine",
  "fallback_to_other_engine",
  "terminal_for_site",
  "input_invalid",
  "auth_required",
  "cancelled",
];

const normalizeFailureClassification = (
  value: unknown,
): DownloadFailureClassification | null => (
  typeof value === "string"
  && FAILURE_CLASSIFICATIONS.includes(value as DownloadFailureClassification)
    ? value as DownloadFailureClassification
    : null
);

const isNetworkRouteKind = (value: unknown): value is DownloadDiagnosticNetwork["routeKind"] => (
  value === "direct" || value === "proxy" || value === "complex"
);

const isNetworkSource = (value: unknown): value is DownloadDiagnosticNetwork["source"] => (
  value === "manual"
  || value === "system"
  || value === "environment"
  || value === "direct"
  || value === "fallback"
);

const isNetworkProxyProtocol = (
  value: unknown,
): value is DownloadDiagnosticNetwork["proxyProtocol"] => (
  value === "http"
  || value === "https"
  || value === "socks4"
  || value === "socks5"
  || value === null
);

const normalizeAttemptSummary = (value: unknown): AttemptDiagnosticSummary | null => {
  const attempt = asObject(value);
  if (!attempt) {
    return null;
  }
  const attemptIndex = Number(attempt.attemptIndex);
  const attemptId = normalizeSafeString(attempt.attemptId);
  const engineId = normalizeSafeString(attempt.engineId);
  const cycle = attempt.cycle === "auth_recovery" ? "auth_recovery" : "initial";
  const outcome = attempt.outcome === "succeeded" ? "succeeded" : "failed";
  if (!Number.isInteger(attemptIndex) || attemptIndex < 1 || !attemptId || !engineId) {
    return null;
  }
  const rawNetwork = asObject(attempt.network);
  const routeKind = isNetworkRouteKind(rawNetwork?.routeKind)
    ? rawNetwork?.routeKind
    : null;
  const source = isNetworkSource(rawNetwork?.source) ? rawNetwork?.source : null;
  const consumer = normalizeSafeString(rawNetwork?.consumer);
  const proxyProtocol = isNetworkProxyProtocol(rawNetwork?.proxyProtocol)
    ? rawNetwork?.proxyProtocol
    : null;
  const normalizedNetwork = (routeKind && source && consumer) ? {
    routeKind,
    source,
    consumer,
    appliedToEngine: rawNetwork?.appliedToEngine === true,
    proxyProtocol,
    failureClassification: normalizeSafeString(rawNetwork?.failureClassification) ?? null,
  } : undefined;

  return {
    attemptIndex,
    attemptId,
    engineId,
    cycle,
    outcome,
    errorCode: normalizeSafeString(attempt.errorCode, 80) as DownloadErrorCode | undefined ?? null,
    classification: normalizeFailureClassification(attempt.classification),
    category: normalizeDiagnosticCategory(attempt.category) ?? null,
    network: normalizedNetwork,
  };
};

const normalizeTerminalSummary = (
  value: unknown,
): DownloadTerminalDiagnosticSummary | undefined => {
  const summary = asObject(value);
  if (!summary) {
    return undefined;
  }
  const traceId = normalizeSafeString(summary.traceId);
  const status = summary.status === "succeeded"
    || summary.status === "failed"
    || summary.status === "cancelled"
    ? summary.status
    : null;
  if (!traceId || !status) {
    return undefined;
  }
  const attempts = Array.isArray(summary.attempts)
    ? summary.attempts.map(normalizeAttemptSummary).filter((attempt): attempt is AttemptDiagnosticSummary => Boolean(attempt)).slice(-8)
    : [];
  const attemptCount = Number(summary.attemptCount);
  return {
    traceId,
    status,
    finalEngineId: normalizeSafeString(summary.finalEngineId) ?? null,
    attemptCount: Number.isInteger(attemptCount) && attemptCount >= attempts.length
      ? attemptCount
      : attempts.length,
    attempts,
    finalCode: normalizeSafeString(summary.finalCode, 80) as DownloadErrorCode | undefined ?? null,
    finalClassification: normalizeFailureClassification(summary.finalClassification),
    finalCategory: normalizeDiagnosticCategory(summary.finalCategory) ?? null,
  };
};

export const normalizeErrorDiagnosticCopyRequest = (
  payload: unknown,
): ErrorDiagnosticCopyRequest => {
  const request = asObject(payload) ?? {};
  const rawFailure = asObject(request.failure);
  const rawSafeUrl = asObject(rawFailure?.safeUrl);
  const reducedUrl = toSafeDiagnosticUrl(
    normalizeOptionalString(rawSafeUrl?.origin)
      ?? normalizeOptionalString(rawFailure?.userUrl),
  );
  const normalizedSafeUrl = reducedUrl
    ? {
        origin: reducedUrl.origin,
        hasQuery: rawSafeUrl ? rawSafeUrl.hasQuery === true : reducedUrl.hasQuery,
        hasFragment: rawSafeUrl ? rawSafeUrl.hasFragment === true : reducedUrl.hasFragment,
      }
    : undefined;
  const failure: RuntimeFailureDiagnostic | null = rawFailure
    ? {
        code: normalizeSafeString(rawFailure.code, 80),
        classification: normalizeSafeString(rawFailure.classification, 80),
        rawMessage: normalizeOptionalString(rawFailure.rawMessage),
        safeUrl: normalizedSafeUrl,
        diagnosticCategory: normalizeDiagnosticCategory(rawFailure.diagnosticCategory),
        attemptSummary: normalizeTerminalSummary(rawFailure.attemptSummary),
      }
    : null;

  return {
    surface: normalizeSurface(request.surface),
    traceId: normalizeSafeString(request.traceId),
    userMessage: normalizeOptionalString(request.userMessage) ?? "",
    category: normalizeCategory(request.category),
    language: normalizeOptionalString(request.language),
    failure,
  };
};

const PRIVACY_NOTES = [
  "URLs are reduced to origin only.",
  "Local paths, cookies, credentials, tokens, and proxy endpoints are redacted.",
  "Session runtime logs are not included in this report.",
];

/**
 * Incident-scoped Quick Copy report (v2). Typed terminal/attempt facts come
 * first; a bounded sanitized evidence line is included only for
 * Transcode/legacy failures that have no typed attempt summary. No session
 * runtime-log excerpt and no open context bags are ever copied.
 */
export const buildErrorDiagnosticCopyReport = (
  options: BuildErrorDiagnosticCopyReportOptions,
): ErrorDiagnosticCopyReport => {
  const failure = options.request.failure ?? null;
  const attemptSummary = failure?.attemptSummary;
  const rawMessage = normalizeOptionalString(failure?.rawMessage);
  const hasTypedEvidence = Boolean(attemptSummary);
  const evidence = !hasTypedEvidence && rawMessage && !failure?.diagnosticCategory
    ? {
        kind: options.request.surface === "transcode" ? "transcode" as const : "legacy" as const,
        summary: sanitizeDiagnosticText(rawMessage, 480),
      }
    : undefined;

  const report: ErrorDiagnosticCopyReport = {
    formatVersion: 2,
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    app: {
      version: options.appVersion,
      platform: options.platform,
      arch: options.arch,
      language: options.request.language,
    },
    incident: {
      surface: options.request.surface,
      traceId: options.request.traceId,
      userMessage: sanitizeDiagnosticText(options.request.userMessage),
      category: options.request.category,
      url: failure?.safeUrl ?? toSafeDiagnosticUrl(failure?.userUrl),
      code: normalizeSafeString(failure?.code, 80),
      classification: normalizeSafeString(failure?.classification, 80),
      diagnosticCategory: failure?.diagnosticCategory,
      attemptSummary,
      evidence,
    },
    privacy: {
      applied: true,
      notes: PRIVACY_NOTES,
    },
  };

  // Final recursive safety net over the complete projected report before
  // formatting/clipboard. Allowlist projection above stays primary; this
  // guarantees unnormalized app/trace/attempt/network string leaves (for
  // example a raw traceId or attemptSummary passed straight through) cannot
  // egress secrets or local paths. Typed values and array order are
  // preserved; exotic leaves are dropped.
  return sanitizeDiagnosticValue(report) as ErrorDiagnosticCopyReport;
};

const yesNo = (value: boolean): string => (value ? "yes" : "no");

const formatNetwork = (network: DownloadDiagnosticNetwork | undefined): string | undefined => {
  if (!network) {
    return undefined;
  }
  return [
    `routeKind=${network.routeKind}`,
    `source=${network.source}`,
    `consumer=${network.consumer}`,
    `appliedToEngine=${yesNo(network.appliedToEngine)}`,
    network.proxyProtocol ? `proxyProtocol=${network.proxyProtocol}` : null,
    network.failureClassification ? `failureClassification=${network.failureClassification}` : null,
  ].filter(Boolean).join(" ");
};

const formatAttemptLines = (attempts: readonly AttemptDiagnosticSummary[]): string[] => {
  const lines: string[] = [];
  for (const attempt of attempts) {
    const parts = [
      `${attempt.attemptIndex}.`,
      `engine=${attempt.engineId}`,
      `cycle=${attempt.cycle}`,
      `outcome=${attempt.outcome}`,
      attempt.errorCode ? `code=${attempt.errorCode}` : null,
      attempt.classification ? `classification=${attempt.classification}` : null,
      attempt.category ? `category=${attempt.category}` : null,
      formatNetwork(attempt.network),
    ].filter(Boolean);
    lines.push(parts.join(" "));
  }
  return lines;
};

export const formatErrorDiagnosticCopyReport = (
  report: ErrorDiagnosticCopyReport,
): string => {
  const lines: Array<string | string[] | null> = [
    "Ameow Diagnostic Report",
    `formatVersion=${report.formatVersion}`,
    `generatedAt=${report.generatedAt}`,
    `appVersion=${report.app.version}`,
    report.app.platform ? `platform=${report.app.platform}` : null,
    report.app.arch ? `arch=${report.app.arch}` : null,
    report.app.language ? `language=${report.app.language}` : null,
    "",
    "[summary]",
    report.incident.userMessage,
    "",
    "[incident]",
    `surface=${report.incident.surface}`,
    report.incident.traceId ? `traceId=${report.incident.traceId}` : null,
    `category=${report.incident.category}`,
    report.incident.code ? `code=${report.incident.code}` : null,
    report.incident.classification ? `classification=${report.incident.classification}` : null,
    report.incident.diagnosticCategory
      ? `diagnosticCategory=${report.incident.diagnosticCategory}`
      : null,
    report.incident.url
      ? [
          `url-origin=${report.incident.url.origin}`,
          `url-has-query=${yesNo(report.incident.url.hasQuery)}`,
          `url-has-fragment=${yesNo(report.incident.url.hasFragment)}`,
        ]
      : null,
  ];

  const attemptSummary = report.incident.attemptSummary;
  if (attemptSummary && attemptSummary.attempts.length > 0) {
    lines.push("", "[attempts]", formatAttemptLines(attemptSummary.attempts));
    lines.push("", "[terminal]");
    lines.push(`status=${attemptSummary.status}`);
    lines.push(`attemptCount=${attemptSummary.attemptCount}`);
    lines.push(`finalEngine=${attemptSummary.finalEngineId ?? ""}`);
    lines.push(`finalCode=${attemptSummary.finalCode ?? ""}`);
    lines.push(`finalClassification=${attemptSummary.finalClassification ?? ""}`);
    lines.push(`finalCategory=${attemptSummary.finalCategory ?? ""}`);
  }

  if (report.incident.evidence) {
    lines.push("", "[evidence]");
    lines.push(`kind=${report.incident.evidence.kind}`);
    lines.push(report.incident.evidence.summary);
    lines.push("", "This is raw process evidence only; it does not define the error classification.");
  }

  lines.push("", "[privacy]");
  for (const note of report.privacy.notes) {
    lines.push(`- ${note}`);
  }

  const flattened = lines.flatMap((entry) => (
    Array.isArray(entry) ? entry : entry === null ? [] : [entry]
  ));
  return `${flattened.join("\n")}\n`;
};

export const buildErrorDiagnosticCopyText = (
  options: BuildErrorDiagnosticCopyReportOptions,
): string => formatErrorDiagnosticCopyReport(buildErrorDiagnosticCopyReport(options));
