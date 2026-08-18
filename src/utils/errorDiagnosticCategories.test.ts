import { describe, expect, it } from "vitest";

import {
  errorDiagnosticCategoryTranslationKey,
  resolveErrorDiagnosticCategory,
} from "./errorDiagnosticCategories";

describe("errorDiagnosticCategories", () => {
  it("maps typed auth failures to the login-state category", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        code: "E_AUTH_REQUIRED",
        classification: "auth_required",
        diagnosticCategory: "authentication_required",
        rawMessage: "Fresh cookies are required",
      },
    })).toBe("auth_login_state");
  });

  it("maps typed auth classification without a diagnostic category", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        code: "E_AUTH_REQUIRED",
        classification: "auth_required",
      },
    })).toBe("auth_login_state");
  });

  it("makes the typed diagnostic category the sole authority over raw text", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        diagnosticCategory: "engine_execution",
        rawMessage: "ERROR: HTTP Error 429: Too Many Requests via proxy",
      },
    })).toBe("runtime_downloader_unavailable");
  });

  it("maps typed input-invalid facts to content unavailable", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        code: "E_INVALID_DOWNLOAD_INPUT",
        classification: "input_invalid",
      },
    })).toBe("content_unavailable");
  });

  it("maps typed output-write facts to the output category", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        code: "E_OUTPUT_NOT_FOUND",
      },
    })).toBe("output_write");
  });

  it("maps typed engine-unavailable facts to the runtime category", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        code: "E_ENGINE_UNAVAILABLE",
      },
    })).toBe("runtime_downloader_unavailable");
  });

  it("defaults transcode surface to the transcode category without inspecting text", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "transcode",
      failure: {
        rawMessage: "ffmpeg exited with code 1",
      },
    })).toBe("transcode_merge");
  });

  it("maps a transcode surface to transcode_merge before download code/classification fallbacks", () => {
    // Transcode carrying a Download-compatible code must still map to
    // transcode_merge: the typed surface wins before code fallbacks.
    expect(resolveErrorDiagnosticCategory({
      surface: "transcode",
      failure: {
        code: "E_OUTPUT_NOT_FOUND",
      },
    })).toBe("transcode_merge");
    expect(resolveErrorDiagnosticCategory({
      surface: "transcode",
      failure: {
        code: "E_AUTH_REQUIRED",
        classification: "input_invalid",
      },
    })).toBe("transcode_merge");
    // Typed diagnosticCategory remains the sole authority over the surface.
    expect(resolveErrorDiagnosticCategory({
      surface: "transcode",
      failure: {
        code: "E_OUTPUT_NOT_FOUND",
        diagnosticCategory: "output",
      },
    })).toBe("output_write");
  });

  it("does not infer categories from raw message or context for untyped downloads", () => {
    // Raw-text-only failures must not gain semantics from parsing.
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        rawMessage: "ERROR: HTTP Error 429: Too Many Requests via proxy",
      },
    })).toBe("unclassified");
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
      failure: {
        rawMessage: "Requested format is not available",
      },
      fallbackMessage: "no space left on device",
    })).toBe("unclassified");
  });

  it("keeps the raw-text-free contract even when no typed facts exist", () => {
    expect(resolveErrorDiagnosticCategory({
      surface: "download",
    })).toBe("unclassified");
  });

  it("returns stable desktop translation keys", () => {
    expect(errorDiagnosticCategoryTranslationKey("output_write"))
      .toBe("app.errorDiagnostic.category.output_write");
  });
});
