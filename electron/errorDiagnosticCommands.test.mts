import { describe, expect, it, vi } from "vitest";

import type { AmeowRendererCommand } from "../src/types/electronBridge.js";
import { createErrorDiagnosticCommandController } from "./errorDiagnosticCommands.mjs";

describe("createErrorDiagnosticCommandController", () => {
  it("supports only the diagnostic copy command", () => {
    const controller = createErrorDiagnosticCommandController({
      appVersion: "0.3.1",
      writeClipboardText: vi.fn(),
    });

    expect(controller.supports("copy_error_diagnostics")).toBe(true);
    expect(controller.supports("export_support_log")).toBe(false);
  });

  it("writes the readable v2 report text to the clipboard", async () => {
    const writeClipboardText = vi.fn();
    const controller = createErrorDiagnosticCommandController({
      appVersion: "0.3.1",
      platform: "win32",
      arch: "x64",
      writeClipboardText,
      now: () => new Date("2026-07-22T12:00:00.000Z"),
    });

    await expect(controller.invoke("copy_error_diagnostics", {
      surface: "download",
      traceId: "download-1",
      userMessage: "Downloader is not ready",
      category: "runtime_downloader_unavailable",
      failure: {
        rawMessage: "yt-dlp unavailable",
        userUrl: "https://example.com/watch",
      },
    })).resolves.toBe(true);

    expect(writeClipboardText).toHaveBeenCalledTimes(1);
    const copied = writeClipboardText.mock.calls[0]?.[0];
    expect(copied).toContain("Ameow Diagnostic Report");
    expect(copied).toContain("formatVersion=2");
    expect(copied).toContain("[incident]");
    expect(copied).toContain("surface=download");
    expect(copied).toContain("traceId=download-1");
    expect(copied).toContain("url-origin=https://example.com");
    expect(copied).toContain("category=runtime_downloader_unavailable");
    // v2 is readable sectioned text, not the old pretty-printed JSON payload.
    expect(() => JSON.parse(copied)).toThrow();
  });

  it("throws when invoked directly with an unsupported command", async () => {
    const controller = createErrorDiagnosticCommandController({
      appVersion: "0.3.1",
      writeClipboardText: vi.fn(),
    });

    await expect(controller.invoke("get_config" as AmeowRendererCommand))
      .rejects.toThrow("Unsupported error diagnostic command: get_config");
  });

  it("rejects cleanly when the clipboard sink fails (non-authoritative sink)", async () => {
    const writeClipboardText = vi.fn(() => {
      throw new Error("clipboard write failed");
    });
    const controller = createErrorDiagnosticCommandController({
      appVersion: "0.3.1",
      writeClipboardText,
    });

    // Sink failure propagates as a rejection: no success return and no other
    // authority callback exists on the controller.
    await expect(controller.invoke("copy_error_diagnostics", {
      surface: "download",
      userMessage: "failed",
      category: "unclassified",
    })).rejects.toThrow("clipboard write failed");
  });
});
