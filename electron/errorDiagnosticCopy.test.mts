import { describe, expect, it, vi } from "vitest";

import type { ErrorDiagnosticCopyRequest } from "../src/types/errorDiagnostics.js";
import {
  buildErrorDiagnosticCopyReport,
  buildErrorDiagnosticCopyText,
  formatErrorDiagnosticCopyReport,
  normalizeErrorDiagnosticCopyRequest,
} from "./errorDiagnosticCopy.mjs";

describe("errorDiagnosticCopy", () => {
  it("builds a readable v2 report from typed download facts with ordered attempts", async () => {
    const text = buildErrorDiagnosticCopyText({
      request: {
        surface: "download",
        traceId: "download-1",
        userMessage: "网络连接异常，请检查代理",
        category: "network_proxy",
        language: "zh-CN",
        failure: {
          code: "E_EXECUTION_FAILED",
          classification: "fallback_to_other_engine",
          diagnosticCategory: "network",
          userUrl: "https://example.com/watch?v=123",
          context: {
            cookies: "SID=secret",
            outputUrl: "https://cdn.example.com/video.mp4",
          },
          attemptSummary: {
            traceId: "download-1",
            status: "failed",
            finalEngineId: "gallery-dl",
            attemptCount: 3,
            finalCode: "E_EXECUTION_FAILED",
            finalClassification: "fallback_to_other_engine",
            finalCategory: "network",
            attempts: [
              {
                attemptIndex: 1,
                attemptId: "download-1:1",
                engineId: "yt-dlp",
                cycle: "initial",
                outcome: "failed",
                errorCode: "E_EXECUTION_FAILED",
                classification: "retry_same_engine",
                category: "network",
                network: {
                  routeKind: "proxy",
                  source: "manual",
                  consumer: "yt-dlp",
                  appliedToEngine: true,
                  proxyProtocol: "http",
                  failureClassification: null,
                },
              },
              {
                attemptIndex: 2,
                attemptId: "download-1:2",
                engineId: "yt-dlp",
                cycle: "auth_recovery",
                outcome: "failed",
                errorCode: "E_EXECUTION_FAILED",
                classification: "auth_required",
                category: "authentication_required",
              },
              {
                attemptIndex: 3,
                attemptId: "download-1:3",
                engineId: "gallery-dl",
                cycle: "initial",
                outcome: "failed",
                errorCode: "E_EXECUTION_FAILED",
                classification: "fallback_to_other_engine",
                category: "network",
              },
            ],
          },
        },
      },
      appVersion: "0.3.1",
      platform: "win32",
      arch: "x64",
      now: () => new Date("2026-07-22T12:00:00.000Z"),
    });

    expect(text).toContain("Ameow Diagnostic Report");
    expect(text).toContain("formatVersion=2");
    expect(text).toContain("[summary]\n网络连接异常，请检查代理");
    expect(text).toContain("[incident]");
    expect(text).toContain("surface=download");
    expect(text).toContain("traceId=download-1");
    expect(text).toContain("category=network_proxy");
    expect(text).toContain("diagnosticCategory=network");
    expect(text).toContain("url-origin=https://example.com");
    expect(text).toContain("url-has-query=yes");
    // Typed attempt chronology is preserved.
    expect(text).toContain("[attempts]");
    expect(text.indexOf("1. engine=yt-dlp cycle=initial"))
      .toBeLessThan(text.indexOf("2. engine=yt-dlp cycle=auth_recovery"));
    expect(text.indexOf("2. engine=yt-dlp cycle=auth_recovery"))
      .toBeLessThan(text.indexOf("3. engine=gallery-dl cycle=initial"));
    expect(text).toContain("[terminal]");
    expect(text).toContain("status=failed");
    expect(text).toContain("finalEngine=gallery-dl");
    // No session runtime log dump, no open context, no evidence for typed facts.
    expect(text).not.toContain("runtimeLog");
    expect(text).not.toContain("SID=secret");
    expect(text).not.toContain("cdn.example.com/video.mp4");
    expect(text).not.toContain("[evidence]");
    expect(text).toContain("[privacy]");
  });

  it("includes a bounded sanitized transcode evidence line for transcode failures", () => {
    const report = buildErrorDiagnosticCopyReport({
      request: {
        surface: "transcode",
        traceId: "transcode-1",
        userMessage: "Video processing failed. Copy diagnostics",
        category: "transcode_merge",
        failure: {
          code: "E_EXECUTION_FAILED",
          rawMessage: "ffmpeg exited with code 1: /Users/alice/Movies/input.mp4",
          userUrl: "https://example.com/watch?v=1",
        },
      },
      appVersion: "0.3.1",
      now: () => new Date("2026-07-22T12:00:00.000Z"),
    });

    expect(report.incident.evidence).toEqual({
      kind: "transcode",
      summary: "ffmpeg exited with code 1: [REDACTED_PATH]",
    });
    expect(report.incident.attemptSummary).toBeUndefined();
  });

  it("labels legacy untyped download failures as evidence and does not classify from text", () => {
    const report = buildErrorDiagnosticCopyReport({
      request: {
        surface: "download",
        userMessage: "Download failed",
        category: "unclassified",
        failure: {
          rawMessage: "HTTP Error 429: Too Many Requests via proxy",
          userUrl: "https://example.com/watch?v=123",
        },
      },
      appVersion: "0.3.1",
      now: () => new Date("2026-07-22T12:00:00.000Z"),
    });

    expect(report.incident.evidence).toEqual({
      kind: "legacy",
      summary: "HTTP Error 429: Too Many Requests via proxy",
    });
    // The raw text must not become a classification authority.
    expect(report.incident.category).toBe("unclassified");
    expect(report.incident.diagnosticCategory).toBeUndefined();
  });

  it("normalizes malformed renderer payloads to bounded defaults", () => {
    expect(normalizeErrorDiagnosticCopyRequest({
      surface: "unknown",
      traceId: "  trace-1  ",
      userMessage: "",
      category: "bad-category",
      failure: {
        rawMessage: "  ERROR  ",
        userUrl: "  https://example.com  ",
        context: [],
      },
    })).toEqual({
      surface: "download",
      traceId: "trace-1",
      userMessage: "",
      category: "unclassified",
      language: undefined,
      failure: {
        code: undefined,
        classification: undefined,
        rawMessage: "ERROR",
        safeUrl: {
          origin: "https://example.com",
          hasQuery: false,
          hasFragment: false,
        },
        diagnosticCategory: undefined,
        attemptSummary: undefined,
      },
    });
  });

  it("scrubs secret-bearing values inside structured diagnostic fields", () => {
    const request = normalizeErrorDiagnosticCopyRequest({
      surface: "download",
      traceId: "trace-token=top-secret",
      userMessage: "failed",
      category: "runtime_downloader_unavailable",
      failure: {
        code: "E_EXECUTION_FAILED secret=code-secret",
        classification: "fallback_to_other_engine token=classification-secret",
        diagnosticCategory: "engine_execution",
        attemptSummary: {
          traceId: "trace-token=summary-secret",
          status: "failed",
          finalEngineId: "yt-dlp token=engine-secret",
          attemptCount: 1,
          attempts: [{
            attemptIndex: 1,
            attemptId: "attempt-token=attempt-secret",
            engineId: "yt-dlp secret=attempt-engine-secret",
            cycle: "initial",
            outcome: "failed",
            errorCode: "E_EXECUTION_FAILED token=attempt-code-secret",
            classification: "fallback_to_other_engine",
            category: "engine_execution",
            network: {
              routeKind: "direct",
              source: "direct",
              consumer: "yt-dlp token=consumer-secret",
              appliedToEngine: true,
              proxyProtocol: null,
              failureClassification: "token=network-secret",
            },
          }],
          finalCode: "E_EXECUTION_FAILED token=final-code-secret",
          finalClassification: "fallback_to_other_engine",
          finalCategory: "engine_execution",
        },
      },
    });

    const text = formatErrorDiagnosticCopyReport(buildErrorDiagnosticCopyReport({
      request,
      appVersion: "1.0.0",
    }));

    expect(text).not.toContain("top-secret");
    expect(text).not.toContain("summary-secret");
    expect(text).not.toContain("engine-secret");
    expect(text).not.toContain("attempt-secret");
    expect(text).not.toContain("attempt-engine-secret");
    expect(text).not.toContain("attempt-code-secret");
    expect(text).not.toContain("consumer-secret");
    expect(text).not.toContain("network-secret");
    expect(text).not.toContain("final-code-secret");
    expect(text).not.toContain("classification-secret");
    expect(text).not.toContain("code-secret");
  });

  it("final safety net scrubs unnormalized app/trace/attempt/network leaves", () => {
    // Deliberately bypass normalizeErrorDiagnosticCopyRequest: raw string
    // leaves with secrets and local paths flow straight into the builder.
    const text = buildErrorDiagnosticCopyText({
      request: {
        surface: "download",
        traceId: `trace "C:\\Users\\Alice\\private\\trace.log" token=s3cr3t-trace`,
        userMessage: `failed at "C:\\Users\\Alice Smith\\Videos\\private.mp4"`,
        category: "unclassified",
        failure: {
          code: "E_EXECUTION_FAILED",
          attemptSummary: {
            traceId: "t token=summary-s3cr3t",
            status: "failed",
            finalEngineId: `yt-dlp "C:\\Users\\Alice\\engines\\yt-dlp.exe"`,
            attemptCount: 2,
            attempts: [{
              attemptIndex: 1,
              attemptId: `attempt "C:\\Users\\Alice\\private\\attempt.json" token=attempt-secret-a1`,
              engineId: "yt-dlp --proxy user:pass@proxy.example.com:8080",
              cycle: "initial",
              outcome: "failed",
              errorCode: "E_EXECUTION_FAILED",
              classification: "fallback_to_other_engine",
              category: "engine_execution",
              network: {
                routeKind: "direct",
                source: "direct",
                consumer: `yt-dlp "C:\\Users\\Alice\\private\\consumer.txt"`,
                appliedToEngine: true,
                proxyProtocol: null,
                failureClassification: "token=network-secret-n",
              },
            }],
            finalCode: "E_EXECUTION_FAILED",
            finalClassification: "fallback_to_other_engine",
            finalCategory: "engine_execution",
          },
        },
      } as ErrorDiagnosticCopyRequest,
      appVersion: "0.1.0-token=app-secret",
    });

    expect(text).not.toContain("s3cr3t");
    expect(text).not.toContain("summary-s3cr3t");
    expect(text).not.toContain("app-secret");
    expect(text).not.toContain("attempt-secret");
    expect(text).not.toContain("network-secret");
    expect(text).not.toContain("user:pass");
    expect(text).not.toContain("proxy.example.com");
    expect(text).not.toContain("Alice");
    expect(text).not.toContain("private.mp4");
    expect(text).not.toContain("trace.log");
    // Typed values and ordered attempts survive the safety net.
    expect(text).toContain("formatVersion=2");
    expect(text).toContain("[attempts]");
    expect(text).toContain("1.");
    expect(text).toContain("[terminal]");
    expect(text).toContain("status=failed");
    expect(text).toContain("attemptCount=2");
  });

  it("builds the report synchronously without reading any runtime log", () => {
    const readRecentRuntimeLogLines = vi.fn(async () => ["unrelated session line"]);
    const text = buildErrorDiagnosticCopyText({
      request: {
        surface: "download",
        userMessage: "failed",
        category: "unclassified",
        failure: { rawMessage: "boom" },
      },
      appVersion: "0.3.1",
      // @ts-expect-error - a legacy caller passing a log reader must have no effect
      readRecentRuntimeLogLines,
    });

    expect(readRecentRuntimeLogLines).not.toHaveBeenCalled();
    expect(text).not.toContain("unrelated session line");
  });
});
