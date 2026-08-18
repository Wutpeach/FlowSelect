import type {
  ErrorDiagnosticCategory,
  ErrorDiagnosticSurface,
  RuntimeFailureDiagnostic,
} from "../types/errorDiagnostics";

type FailureCategoryInput = {
  surface: ErrorDiagnosticSurface;
  failure?: RuntimeFailureDiagnostic | null;
  fallbackMessage?: string | null;
};

/**
 * Presentation-only diagnostic-category resolution.
 *
 * Rules (approved compatibility contract):
 * - A typed `diagnosticCategory` from the Product/Application terminal path
 *   is the sole authority and always wins.
 * - A typed Transcode surface maps to `transcode_merge` without inspecting
 *   any ffmpeg/raw text.
 * - Otherwise only typed code/classification facts are consulted. Truly
 *   legacy/untyped Download failures (raw message/context only) become
 *   `unclassified` — raw evidence text is never parsed to infer category.
 * - Product terminal classification and outcomes are never changed here.
 */
export const resolveErrorDiagnosticCategory = (
  input: FailureCategoryInput,
): ErrorDiagnosticCategory => {
  switch (input.failure?.diagnosticCategory) {
    case "authentication_required":
      return "auth_login_state";
    case "network":
      return "network_proxy";
    case "site_input":
    case "content_unavailable":
      return "content_unavailable";
    case "output":
      return "output_write";
    case "format_unavailable":
      return "quality_format_unavailable";
    case "engine_unavailable":
    case "engine_execution":
      return "runtime_downloader_unavailable";
    case "cancelled":
      return "unclassified";
  }

  if (input.surface === "transcode") {
    return "transcode_merge";
  }

  const code = input.failure?.code;
  const classification = input.failure?.classification;

  if (classification === "auth_required" || code === "E_AUTH_REQUIRED") {
    return "auth_login_state";
  }

  if (
    classification === "input_invalid"
    || code === "E_NO_PROVIDER_MATCH"
    || code === "E_INVALID_DOWNLOAD_INPUT"
    || code === "E_INVALID_INTENT"
    || code === "E_INPUT_INVALID"
  ) {
    return "content_unavailable";
  }

  if (code === "E_OUTPUT_NOT_FOUND") {
    return "output_write";
  }

  if (
    code === "E_ENGINE_NOT_FOUND"
    || code === "E_ENGINE_UNAVAILABLE"
    || code === "E_ENGINE_REJECTED_INTENT"
    || code === "E_DIRECT_SOURCE_REQUIRED"
  ) {
    return "runtime_downloader_unavailable";
  }

  return "unclassified";
};

export const errorDiagnosticCategoryTranslationKey = (
  category: ErrorDiagnosticCategory,
): string => `app.errorDiagnostic.category.${category}`;
