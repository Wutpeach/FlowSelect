import type { DownloadErrorCode } from "./error-codes.js";

export type DownloadFailureClassification =
  | "retry_same_engine"
  | "fallback_to_other_engine"
  | "terminal_for_site"
  | "input_invalid"
  | "auth_required"
  | "cancelled";

const AUTH_REQUIRED_PATTERNS = [
  /\bcookies?\b/i,
  /\blog(?:in|ged in)\b/i,
  /\bsign(?:ed)? in\b/i,
  /\bauth(?:entication|orization)?\b/i,
  /\brequires?\s+(?:login|cookies|authentication|authorization)\b/i,
  /\b403\b/,
  /\bforbidden\b/i,
];

const RETRY_SAME_ENGINE_PATTERNS = [
  /\btimeout\b/i,
  /\btimed out\b/i,
  /\bnetwork\b/i,
  /\btemporar(?:y|ily)\b/i,
  /\brate limit/i,
  /\btoo many requests\b/i,
  /\b429\b/,
  /\beconnreset\b/i,
  /\benotfound\b/i,
  /\beai_again\b/i,
  /\bconnection reset\b/i,
  /\bconnection aborted\b/i,
  /\bfetch failed\b/i,
];

type DownloadFailureDescriptor = {
  code: DownloadErrorCode;
  message: string;
  context?: Record<string, unknown>;
};

const messageOrContextMatches = (
  descriptor: DownloadFailureDescriptor,
  patterns: readonly RegExp[],
): boolean => {
  const serializedContext = (() => {
    if (!descriptor.context) {
      return "";
    }
    try {
      return JSON.stringify(descriptor.context);
    } catch {
      return "";
    }
  })();

  return patterns.some((pattern) => (
    pattern.test(descriptor.message) || pattern.test(serializedContext)
  ));
};

export const classifyDownloadFailure = (
  descriptor: DownloadFailureDescriptor,
): DownloadFailureClassification => {
  switch (descriptor.code) {
    case "E_ABORTED":
      return "cancelled";
    case "E_AUTH_REQUIRED":
      return "auth_required";
    case "E_DIRECT_SOURCE_REQUIRED":
    case "E_ENGINE_NOT_FOUND":
    case "E_ENGINE_REJECTED_INTENT":
    case "E_ENGINE_UNAVAILABLE":
    case "E_OUTPUT_NOT_FOUND":
      return "fallback_to_other_engine";
    case "E_INVALID_DOWNLOAD_INPUT":
    case "E_INVALID_INTENT":
    case "E_NO_PROVIDER_MATCH":
      return "input_invalid";
    case "E_INVALID_ENGINE_PLAN":
    case "E_NO_ENGINE_SUCCEEDED":
      return "terminal_for_site";
    case "E_EXECUTION_FAILED":
      if (messageOrContextMatches(descriptor, AUTH_REQUIRED_PATTERNS)) {
        return "auth_required";
      }
      if (messageOrContextMatches(descriptor, RETRY_SAME_ENGINE_PATTERNS)) {
        return "retry_same_engine";
      }
      return "fallback_to_other_engine";
    default:
      return "terminal_for_site";
  }
};

export const isFallbackEligibleFailure = (
  classification: DownloadFailureClassification,
): boolean => classification === "fallback_to_other_engine";
