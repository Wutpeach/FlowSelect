import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DownloadRuntimeError,
  sanitizeDiagnosticText,
  toSafeDiagnosticUrl,
  type DownloadResult,
} from "../core/index.js";
import { InvalidCommandPlanError } from "./commandPlanErrors.js";
import { buildYtdlpCommandArgs, createYtdlpCommandPlan } from "./ytDlpCommandPlan.js";
import { resolveYtdlpSectionRetryFormatProfile, type YtdlpFormatProfile } from "./engineManifest.js";
import { runStreamingCommand } from "./processRunner.js";
import { parseYtDlpProgressLine } from "./ytDlpProgress.js";
import { summarizeError } from "./runtimeUtils.js";
import { cleanupCookiesFile, writeCookiesFile } from "./sidecarCookies.js";
import { hasTerminalYtDlpAvailabilityFailure, summarizeYtDlpFailure } from "./ytDlpErrorSummary.js";
import {
  classifyEngineDiagnosticCategory,
  classifyEngineFailure,
} from "./engineErrorClassifier.js";
import type { EngineInvocationContext, YtDlpRuntimeDependencies } from "./engineExecutionContext.js";
import {
  applyNetworkRouteForContext,
  logNetworkApplication,
  withNetworkFailureClassification,
} from "./engineNetworkAdapters.js";
import {
  classifyNetworkFailure,
  NETWORK_FAILURE_CLASSIFICATIONS,
  redactNetworkCredentials,
  type NetworkRoute,
} from "../config/networkRoute.js";

const YTDLP_ACTIVITY_FALLBACK = "Resolving media...";

const isInjectionDebugEnabled = (config: Record<string, unknown>): boolean =>
  config.extensionInjectionDebugEnabled === true;

const formatElapsedMs = (startedAtMs: number): string => `${Date.now() - startedAtMs}ms`;

const resolveClipDurationSec = (clipRange: { startSec: number; endSec: number } | null): number | null => {
  if (!clipRange) {
    return null;
  }
  const duration = clipRange.endSec - clipRange.startSec;
  return Number.isFinite(duration) && duration > 0 ? duration : null;
};

const toSafeLogDetails = (payload: unknown): string => {
  try {
    return sanitizeDiagnosticText(JSON.stringify(payload));
  } catch {
    return sanitizeDiagnosticText(String(payload));
  }
};

const logYtDlpTiming = (message: string, payload: Record<string, unknown>): void => {
  console.log(`>>> [yt-dlp timing] ${message}: ${toSafeLogDetails(payload)}`);
};

const logInjectedDownloadDebug = (message: string, payload: unknown): void => {
  console.log(`>>> [InjectedDownloadDebug] ${message}: ${toSafeLogDetails(payload)}`);
};

class YtDlpAttemptError extends Error {
  readonly exitCode: number;
  readonly stderrLines: string[];

  constructor(message: string, options: { exitCode: number; stderrLines: string[] }) {
    super(message);
    this.name = "YtDlpAttemptError";
    this.exitCode = options.exitCode;
    this.stderrLines = options.stderrLines;
  }
}

type YtDlpAttemptDescriptor = {
  label: "primary" | "section_format_retry" | "transient_network_retry";
  formatProfile: YtdlpFormatProfile;
};

const TRANSIENT_YTDLP_NETWORK_PATTERNS = [
  /\bUNEXPECTED_EOF_WHILE_READING\b/i,
  /\bEOF occurred in violation of protocol\b/i,
  /\bSSLError\b/i,
  /\bTLSV1_ALERT/i,
  /\bConnection (?:closed|reset|aborted|timed out)\b/i,
  /\bRemote end closed connection\b/i,
  /\bThe read operation timed out\b/i,
];

const isYtDlpPostProcessingLine = (line: string): boolean => {
  const normalized = line.toLowerCase();
  return normalized.includes("post-process")
    || normalized.includes("embedding metadata")
    || normalized.includes("deleting original file");
};

const normalizeYtDlpActivity = (line: string): string | null => {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  if (
    normalized.includes("[download]")
    || normalized.includes("merging")
    || isYtDlpPostProcessingLine(normalized)
  ) {
    return null;
  }

  if (
    /\b(extracting|downloading webpage|downloading player|downloading m3u8|downloading android player api json|downloading tv player api json|downloading web creator player api json|downloading ios player api json|downloading player api json|downloading video info webpage|requesting|retrieving)\b/i
      .test(normalized)
  ) {
    return YTDLP_ACTIVITY_FALLBACK;
  }

  return null;
};

const readReportedValue = async (reportPath: string): Promise<string | null> => {
  try {
    const raw = await fs.readFile(reportPath, "utf8");
    const resolved = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    return resolved ?? null;
  } catch {
    return null;
  }
};

const collectTaskArtifacts = async (
  outputDir: string,
  outputStemPrefixes: string[],
): Promise<string[]> => (
  await fs.readdir(outputDir).catch(() => [])
).filter((entry) => outputStemPrefixes.some((prefix) => (
  entry.startsWith(`${prefix}.`) || entry.startsWith(`${prefix}[`)
)));

const cleanupTaskArtifacts = async (
  outputDir: string,
  beforeFiles: Set<string>,
  outputStemPrefixes: string[],
): Promise<void> => {
  const afterFiles = await collectTaskArtifacts(outputDir, outputStemPrefixes);
  await Promise.all(afterFiles
    .filter((entry) => !beforeFiles.has(entry))
    .map((entry) => fs.unlink(path.join(outputDir, entry)).catch(() => undefined)));
};

const shouldRetryYouTubeSectionWithConservativeFormat = (
  commandPlan: ReturnType<typeof createYtdlpCommandPlan>,
  error: unknown,
  signal: AbortSignal,
): error is YtDlpAttemptError => (
  error instanceof YtDlpAttemptError
  && commandPlan.isYouTube
  && commandPlan.clipRange !== null
  && !signal.aborted
  && !hasTerminalYtDlpAvailabilityFailure(error.stderrLines)
);

const shouldRetryTransientYtDlpNetworkFailure = (
  error: unknown,
  signal: AbortSignal,
): error is YtDlpAttemptError => (
  error instanceof YtDlpAttemptError
  && !signal.aborted
  && !hasTerminalYtDlpAvailabilityFailure(error.stderrLines)
  && error.stderrLines.some((line) => (
    TRANSIENT_YTDLP_NETWORK_PATTERNS.some((pattern) => pattern.test(line))
  ))
);

export const runYtDlpDownload = async (
  context: EngineInvocationContext<YtDlpRuntimeDependencies>,
): Promise<DownloadResult> => {
  const taskStartedAtMs = Date.now();
  let commandPlan: ReturnType<typeof createYtdlpCommandPlan>;
  try {
    commandPlan = createYtdlpCommandPlan(context);
  } catch (error) {
    if (!(error instanceof InvalidCommandPlanError)) {
      throw error;
    }
    throw new DownloadRuntimeError(
      "E_INVALID_ENGINE_PLAN",
      error.message,
      {
        context: {
          providerId: context.plan.providerId,
          traceId: context.traceId,
        },
      },
    );
  }

  const beforeFiles = new Set(await collectTaskArtifacts(context.outputDir, commandPlan.artifactPrefixes));
  logYtDlpTiming("task start", {
    traceId: context.traceId,
    siteId: context.intent.siteId,
    quality: context.intent.videoQuality ?? "best",
    sourceUrl: commandPlan.sourceUrl,
    isYouTube: commandPlan.isYouTube,
    formatSelectorLength: commandPlan.formatProfile.selector.length,
  });
  const clipDurationSec = resolveClipDurationSec(commandPlan.clipRange);
  let latestStderrLines: string[] = [];
  const fallbackNetworkRoute: NetworkRoute = {
    mode: "direct",
    source: "direct",
    reason: "no_proxy_source",
    resolvedFor: commandPlan.sourceUrl,
  };

  const runAttempt = async (attempt: YtDlpAttemptDescriptor): Promise<DownloadResult> => {
    if (context.abortSignal.aborted) {
      throw new Error("Download cancelled");
    }
    const attemptStartedAtMs = Date.now();
    const stderrLines: string[] = [];

    // One stable route per Job, applied exactly once per attempt via the
    // yt-dlp adapter (explicit `--proxy ""` for direct, one `--proxy` for
    // supported proxy routes, scrubbed ambient proxy env). The actual
    // applied/rejected outcome is reported for per-download diagnostics.
    // A real download may delegate the remote transfer to FFmpegFD (live HLS,
    // `m3u8` protocol, native-HLS fallback, --download-sections) with no
    // pre-spawn signal, and ffmpeg cannot use SOCKS proxies — so SOCKS routes
    // fail closed before spawn instead of silently going direct inside ffmpeg.
    const networkApplication = applyNetworkRouteForContext(
      "yt-dlp",
      context.network,
      fallbackNetworkRoute,
      context.onNetworkApplication,
      { mayDelegateRemoteNetwork: true },
    );
    const proxyUrl = networkApplication.args.length > 1
      ? networkApplication.args[networkApplication.args.indexOf("--proxy") + 1]
      : null;
    logNetworkApplication(networkApplication.diagnostic);

    const cookiesPath = await writeCookiesFile(context.traceId, context.cookies);
    const args = buildYtdlpCommandArgs(commandPlan, {
      cookiesPath,
      hasFfmpeg: Boolean(context.binaries.ffmpeg),
      denoPath: context.binaries.deno || null,
      formatProfile: attempt.formatProfile,
      proxyArgs: networkApplication.args,
      selectionScope: context.intent.selectionScope,
      pageUrl: context.intent.pageUrl,
      platform: process.platform,
    });

    if (isInjectionDebugEnabled(context.config)) {
      logInjectedDownloadDebug("yt-dlp invocation", {
        traceId: context.traceId,
        source: toSafeDiagnosticUrl(commandPlan.sourceUrl) ?? null,
        original: toSafeDiagnosticUrl(context.intent.originalUrl) ?? null,
        page: toSafeDiagnosticUrl(context.intent.pageUrl) ?? null,
        selectionScope: context.intent.selectionScope ?? null,
        siteId: context.intent.siteId,
        titlePresent: Boolean(context.intent.title),
        cookiesPresent: Boolean(context.cookies?.trim()),
        proxyPresent: Boolean(proxyUrl),
        proxyScheme: proxyUrl ? new URL(proxyUrl).protocol.replace(/:$/, "") : null,
        videoQuality: context.intent.videoQuality ?? null,
        attempt: attempt.label,
        formatSelector: attempt.formatProfile.selector,
        formatSort: attempt.formatProfile.sort,
        mergeOutputFormat: attempt.formatProfile.mergeOutputFormat,
        youtubeExtractorProfile: commandPlan.isYouTube ? "extended" : null,
        argumentCount: args.length,
      });
    }

    logYtDlpTiming("attempt start", {
      traceId: context.traceId,
      attempt: attempt.label,
      youtubeExtractorProfile: commandPlan.isYouTube ? "extended" : null,
      elapsedMs: formatElapsedMs(taskStartedAtMs),
      selectorLength: attempt.formatProfile.selector.length,
      hasCookies: Boolean(cookiesPath),
      hasProxy: Boolean(proxyUrl),
      selectionScope: context.intent.selectionScope ?? null,
    });

    try {
      let emittedActivity = false;
      let loggedFirstActivity = false;
      let loggedFirstProgress = false;
      const exitCode = await runStreamingCommand(context.binaries.ytDlp, args, {
        env: {
          ...networkApplication.env,
          PATH: commandPlan.ffmpegDir
            ? `${commandPlan.ffmpegDir}${path.delimiter}${networkApplication.env.PATH ?? ""}`
            : networkApplication.env.PATH,
        },
        signal: context.abortSignal,
        onStdoutLine: async (line: string) => {
          const progress = parseYtDlpProgressLine(context.traceId, line, { clipDurationSec });
          if (progress) {
            emittedActivity = true;
            if (!loggedFirstProgress) {
              loggedFirstProgress = true;
              logYtDlpTiming("first download progress", {
                traceId: context.traceId,
                attempt: attempt.label,
                youtubeExtractorProfile: commandPlan.isYouTube ? "extended" : null,
                elapsedMs: formatElapsedMs(taskStartedAtMs),
                attemptElapsedMs: formatElapsedMs(attemptStartedAtMs),
                percent: progress.percent,
                stage: progress.stage,
                speed: progress.speed,
              });
            }
            await context.onProgress(progress);
            return;
          }
          const activity = normalizeYtDlpActivity(line);
          if (activity && !emittedActivity) {
            if (!loggedFirstActivity) {
              loggedFirstActivity = true;
              logYtDlpTiming("first extractor activity", {
                traceId: context.traceId,
                attempt: attempt.label,
                youtubeExtractorProfile: commandPlan.isYouTube ? "extended" : null,
                elapsedMs: formatElapsedMs(taskStartedAtMs),
                attemptElapsedMs: formatElapsedMs(attemptStartedAtMs),
                activity,
                line: line.trim().slice(0, 160),
              });
            }
            await context.onProgress({
              traceId: context.traceId,
              percent: -1,
              stage: "preparing",
              speed: activity,
              eta: "",
            });
          }
        },
        onStderrLine: async (line: string) => {
          const progress = parseYtDlpProgressLine(context.traceId, line, { clipDurationSec });
          if (progress) {
            emittedActivity = true;
            if (!loggedFirstProgress) {
              loggedFirstProgress = true;
              logYtDlpTiming("first download progress", {
                traceId: context.traceId,
                attempt: attempt.label,
                youtubeExtractorProfile: commandPlan.isYouTube ? "extended" : null,
                elapsedMs: formatElapsedMs(taskStartedAtMs),
                attemptElapsedMs: formatElapsedMs(attemptStartedAtMs),
                percent: progress.percent,
                stage: progress.stage,
                speed: progress.speed,
              });
            }
            await context.onProgress(progress);
            return;
          }
          if (line.trim()) {
            stderrLines.push(line.trim());
          }
          const activity = normalizeYtDlpActivity(line);
          if (activity && !emittedActivity) {
            if (!loggedFirstActivity) {
              loggedFirstActivity = true;
              logYtDlpTiming("first extractor activity", {
                traceId: context.traceId,
                attempt: attempt.label,
                youtubeExtractorProfile: commandPlan.isYouTube ? "extended" : null,
                elapsedMs: formatElapsedMs(taskStartedAtMs),
                attemptElapsedMs: formatElapsedMs(attemptStartedAtMs),
                activity,
                line: line.trim().slice(0, 160),
              });
            }
            await context.onProgress({
              traceId: context.traceId,
              percent: -1,
              stage: "preparing",
              speed: activity,
              eta: "",
            });
          }
        },
      });

      const reportedPath = await readReportedValue(commandPlan.reportPath);
      const reportedTitle = await readReportedValue(commandPlan.titleReportPath);
      logYtDlpTiming("attempt finished", {
        traceId: context.traceId,
        attempt: attempt.label,
        youtubeExtractorProfile: commandPlan.isYouTube ? "extended" : null,
        elapsedMs: formatElapsedMs(taskStartedAtMs),
        attemptElapsedMs: formatElapsedMs(attemptStartedAtMs),
        exitCode,
        reportedPathPresent: Boolean(reportedPath),
        reportedTitlePresent: Boolean(reportedTitle),
      });
      if (exitCode !== 0) {
        latestStderrLines = stderrLines;
        throw new YtDlpAttemptError(
          summarizeYtDlpFailure(
            stderrLines,
            `yt-dlp exited with code ${exitCode}`,
            { isYouTube: commandPlan.isYouTube },
          ),
          {
            exitCode,
            stderrLines,
          },
        );
      }
      if (!reportedPath) {
        throw new DownloadRuntimeError(
          "E_OUTPUT_NOT_FOUND",
          "yt-dlp exited successfully but produced no final output path",
          {
            context: {
              sourceUrl: commandPlan.sourceUrl,
              traceId: context.traceId,
            },
          },
        );
      }
      logYtDlpTiming("task success", {
        traceId: context.traceId,
        elapsedMs: formatElapsedMs(taskStartedAtMs),
        attempt: attempt.label,
        youtubeExtractorProfile: commandPlan.isYouTube ? "extended" : null,
        filePath: reportedPath,
      });

      return {
        traceId: context.traceId,
        success: true,
        filePath: reportedPath,
        title: reportedTitle ?? undefined,
      };
    } finally {
      await cleanupCookiesFile(cookiesPath);
      await fs.unlink(commandPlan.reportPath).catch(() => undefined);
      await fs.unlink(commandPlan.titleReportPath).catch(() => undefined);
    }
  };

  try {
    try {
      return await runAttempt({
        label: "primary",
        formatProfile: commandPlan.formatProfile,
      });
    } catch (error) {
      if (shouldRetryTransientYtDlpNetworkFailure(error, context.abortSignal)) {
        logYtDlpTiming("transient network retry", {
          traceId: context.traceId,
          elapsedMs: formatElapsedMs(taskStartedAtMs),
          previousError: summarizeError(error),
        });
        await cleanupTaskArtifacts(context.outputDir, beforeFiles, commandPlan.artifactPrefixes);
        if (context.abortSignal.aborted) {
          throw new Error("Download cancelled");
        }
        return await runAttempt({
          label: "transient_network_retry",
          formatProfile: commandPlan.formatProfile,
        });
      }

      const retryFormatProfile = resolveYtdlpSectionRetryFormatProfile(
        context.intent.videoQuality,
        { isYouTube: commandPlan.isYouTube, siteId: context.intent.siteId },
      );
      if (
        !retryFormatProfile
        || !shouldRetryYouTubeSectionWithConservativeFormat(commandPlan, error, context.abortSignal)
      ) {
        throw error;
      }

      logYtDlpTiming("section format retry", {
        traceId: context.traceId,
        elapsedMs: formatElapsedMs(taskStartedAtMs),
        previousError: sanitizeDiagnosticText(summarizeError(error)),
        selectorLength: retryFormatProfile.selector.length,
      });
      await cleanupTaskArtifacts(context.outputDir, beforeFiles, commandPlan.artifactPrefixes);
      if (context.abortSignal.aborted) {
        throw new Error("Download cancelled");
      }
      return await runAttempt({
        label: "section_format_retry",
        formatProfile: retryFormatProfile,
      });
    }
  } catch (error) {
    await context.reportNetworkProxyFailure?.(error);
    const classification = context.abortSignal.aborted
      ? null
      : classifyNetworkFailure(error, latestStderrLines);
    const normalizedClassification = classification === NETWORK_FAILURE_CLASSIFICATIONS.UNKNOWN
      ? null
      : classification;
    const redactedError = sanitizeDiagnosticText(redactNetworkCredentials(summarizeError(error)));
    const redactedStderrTail = latestStderrLines.map((line) => (
      sanitizeDiagnosticText(redactNetworkCredentials(line))
    ));
    if (isInjectionDebugEnabled(context.config)) {
      logInjectedDownloadDebug("yt-dlp failed", {
        traceId: context.traceId,
        source: toSafeDiagnosticUrl(commandPlan.sourceUrl) ?? null,
        error: redactedError,
        stderrTail: redactedStderrTail.slice(-5),
      });
    }
    logYtDlpTiming("task failed", {
      traceId: context.traceId,
      elapsedMs: formatElapsedMs(taskStartedAtMs),
      error: redactedError,
      stderrTail: redactedStderrTail.slice(-3),
    });
    await cleanupTaskArtifacts(context.outputDir, beforeFiles, commandPlan.artifactPrefixes);
    // Raw stderr evidence is classified here (Infrastructure), then thrown as
    // a typed error with a stable code/classification for the Orchestrator.
    const engineClassification = classifyEngineFailure({
      message: redactedError,
      context: { stderrTail: redactedStderrTail },
    });
    const engineDiagnosticCategory = normalizedClassification
      ? "network"
      : classifyEngineDiagnosticCategory({
          message: redactedError,
          context: { stderrTail: redactedStderrTail },
        });
    if (error instanceof DownloadRuntimeError) {
      throw withNetworkFailureClassification(error, normalizedClassification);
    }
    throw new DownloadRuntimeError(
      "E_EXECUTION_FAILED",
      redactedError,
      {
        cause: error,
        classification: engineClassification,
        diagnosticCategory: engineDiagnosticCategory,
        context: normalizedClassification
          ? { networkFailureClassification: normalizedClassification }
          : undefined,
      },
    );
  }
};
