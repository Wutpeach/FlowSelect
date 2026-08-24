import type { DownloadFailureClassification } from "../core/constants/error-classifications.js";
import type { DownloadErrorCode } from "../core/constants/error-codes.js";
import type { DownloadDiagnosticCategory } from "../core/constants/diagnostic-categories.js";
import type { SafeDiagnosticUrl } from "../core/diagnostics/safe-diagnostic.js";
import type { DownloadTerminalDiagnosticSummary } from "../application/download-diagnostics.js";

export type ErrorDiagnosticSurface = "download" | "transcode";

export type ErrorDiagnosticCategory =
  | "auth_login_state"
  | "network_proxy"
  | "content_unavailable"
  | "output_write"
  | "quality_format_unavailable"
  | "runtime_downloader_unavailable"
  | "transcode_merge"
  | "unclassified";

export type RuntimeFailureDiagnostic = {
  code?: DownloadErrorCode | string;
  classification?: DownloadFailureClassification | string;
  /** Legacy-only raw text; new structured download payloads omit it. */
  rawMessage?: string;
  userUrl?: string;
  safeUrl?: SafeDiagnosticUrl;
  diagnosticCategory?: DownloadDiagnosticCategory;
  attemptSummary?: DownloadTerminalDiagnosticSummary;
  context?: Record<string, unknown>;
};

export type ErrorDiagnosticCopyRequest = {
  surface: ErrorDiagnosticSurface;
  traceId?: string;
  userMessage: string;
  category: ErrorDiagnosticCategory;
  language?: string;
  failure?: RuntimeFailureDiagnostic | null;
};

/**
 * Bounded sanitized evidence line for Transcode/legacy-only failures. It is
 * explicitly labeled as evidence and never re-interpreted to choose Product
 * terminal or report category semantics.
 */
export type ErrorDiagnosticCopyEvidence = {
  kind: "transcode" | "legacy";
  summary: string;
};

/**
 * Incident-scoped Quick Copy report (v2). Contains typed incident facts and
 * ordered attempt summaries only; it never includes whole-session runtime log
 * lines and never carries open context bags or raw engine output.
 */
export type ErrorDiagnosticCopyReport = {
  formatVersion: 2;
  generatedAt: string;
  app: {
    version: string;
    platform?: string;
    arch?: string;
    language?: string;
  };
  incident: {
    surface: ErrorDiagnosticSurface;
    traceId?: string;
    userMessage: string;
    category: ErrorDiagnosticCategory;
    url?: SafeDiagnosticUrl;
    code?: string;
    classification?: string;
    diagnosticCategory?: DownloadDiagnosticCategory;
    attemptSummary?: DownloadTerminalDiagnosticSummary;
    evidence?: ErrorDiagnosticCopyEvidence;
  };
  privacy: {
    applied: true;
    notes: string[];
  };
};
