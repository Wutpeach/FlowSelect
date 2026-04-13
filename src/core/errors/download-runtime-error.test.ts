import { describe, expect, it } from "vitest";
import { DownloadRuntimeError } from "./download-runtime-error.js";

describe("DownloadRuntimeError", () => {
  it("classifies direct source validation as fallback-to-other-engine", () => {
    const error = new DownloadRuntimeError(
      "E_DIRECT_SOURCE_REQUIRED",
      "Direct engine requires a direct media URL",
    );

    expect(error.classification).toBe("fallback_to_other_engine");
    expect(error.fallbackable).toBe(true);
  });

  it("classifies invalid engine plans as terminal-for-site", () => {
    const error = new DownloadRuntimeError(
      "E_INVALID_ENGINE_PLAN",
      "yt-dlp requires a page or source URL",
    );

    expect(error.classification).toBe("terminal_for_site");
    expect(error.fallbackable).toBe(false);
  });

  it("detects auth-required failures from execution output", () => {
    const error = new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      "yt-dlp exited with code 1: Sign in to confirm you're not a bot (cookies required)",
    );

    expect(error.classification).toBe("auth_required");
    expect(error.fallbackable).toBe(false);
  });

  it("detects transient execution failures as retry-same-engine", () => {
    const error = new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      "gallery-dl exited with code 1: request timed out while fetching media",
    );

    expect(error.classification).toBe("retry_same_engine");
    expect(error.fallbackable).toBe(false);
  });
});
