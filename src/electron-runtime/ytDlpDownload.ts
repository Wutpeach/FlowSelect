import { promises as fs } from "node:fs";
import path from "node:path";
import type { EngineExecutionContext, YtdlpQualityPreference } from "../core/index.js";
import { runStreamingCommand } from "./processRunner.js";
import { parseYtDlpProgressLine } from "./ytDlpProgress.js";
import { summarizeError } from "./runtimeUtils.js";
import type { DownloadResultPayload } from "../types/videoRuntime.js";
import { cleanupCookiesFile, writeCookiesFile } from "./sidecarCookies.js";
import { resolveRenameEnabled } from "./renameRules.js";

const isYouTubeUrl = (value: string): boolean =>
  value.includes("youtube.com/") || value.includes("youtu.be/");

const YTDLP_FORMAT_SELECTOR_BEST = "bestvideo+bestaudio/best";
const YTDLP_FORMAT_SELECTOR_BALANCED = [
  "bv*[height=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[height=1080][ext=mp4]+ba[ext=m4a]/",
  "b[height=1080][vcodec^=avc1][ext=mp4]/",
  "b[height=1080][ext=mp4]/",
  "best[height=1080][ext=mp4]/",
  "bv*[height<=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/",
  "b[height<=1080][vcodec^=avc1][ext=mp4]/",
  "b[height<=1080][ext=mp4]/",
  "best[height<=1080][ext=mp4]/",
  "bv*[vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[ext=mp4]+ba[ext=m4a]/",
  "b[vcodec^=avc1][ext=mp4]/",
  "b[ext=mp4]/",
  "best[ext=mp4]/",
  "best",
].join("");
const YTDLP_FORMAT_SELECTOR_DATA_SAVER = [
  "bv*[height=360][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[height=360][ext=mp4]+ba[ext=m4a]/",
  "b[height=360][vcodec^=avc1][ext=mp4]/",
  "b[height=360][ext=mp4]/",
  "best[height=360][ext=mp4]/",
  "bv*[height<360][ext=mp4]+ba[ext=m4a]/",
  "b[height<360][ext=mp4]/",
  "best[height<360][ext=mp4]/",
  "worstvideo[ext=mp4]+ba[ext=m4a]/",
  "worst[ext=mp4]/",
  "worst",
].join("");

const YTDLP_ACTIVITY_FALLBACK = "Resolving media...";

type YtdlpMergeOutputFormat = "mp4" | "mp4/mkv" | null;

const isInjectionDebugEnabled = (config: Record<string, unknown>): boolean =>
  config.extensionInjectionDebugEnabled === true;

const logInjectedDownloadDebug = (message: string, payload: unknown): void => {
  const details = (() => {
    try {
      return JSON.stringify(payload);
    } catch {
      return String(payload);
    }
  })();
  console.log(`>>> [InjectedDownloadDebug] ${message}: ${details}`);
};

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

const resolveYtdlpFormatProfile = (
  quality: YtdlpQualityPreference | undefined,
  hasFfmpeg: boolean,
): {
  selector: string;
  sort: string | null;
  mergeOutputFormat: YtdlpMergeOutputFormat;
} => {
  const normalized = quality ?? "best";
  if (!hasFfmpeg) {
    switch (normalized) {
      case "balanced":
        return {
          selector: "best[height<=1080][ext=mp4]/best[ext=mp4]/best",
          sort: "ext:mp4:m4a",
          mergeOutputFormat: null,
        };
      case "data_saver":
        return {
          selector: "best[height<=360][ext=mp4]/worst[ext=mp4]/worst",
          sort: "ext:mp4:m4a",
          mergeOutputFormat: null,
        };
      case "best":
      default:
        return {
          selector: "best[ext=mp4]/best",
          sort: "res,codec:h264,acodec:aac,ext",
          mergeOutputFormat: null,
        };
    }
  }

  switch (normalized) {
    case "balanced":
      return {
        selector: YTDLP_FORMAT_SELECTOR_BALANCED,
        sort: "ext:mp4:m4a",
        mergeOutputFormat: "mp4",
      };
    case "data_saver":
      return {
        selector: YTDLP_FORMAT_SELECTOR_DATA_SAVER,
        sort: "ext:mp4:m4a",
        mergeOutputFormat: "mp4",
      };
    case "best":
    default:
      return {
        selector: YTDLP_FORMAT_SELECTOR_BEST,
        sort: "res,codec:h264,acodec:aac,ext",
        // Prefer a directly compatible MP4 when the selected streams allow it,
        // but keep MKV as the fallback for genuinely higher-tier combinations.
        mergeOutputFormat: "mp4/mkv",
      };
  }
};

const readReportedPath = async (reportPath: string): Promise<string | null> => {
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

const resolveYtdlpQualityLabel = (
  quality: YtdlpQualityPreference | undefined,
): "highest" | "balanced" | "data-saver" => {
  switch (quality) {
    case "balanced":
      return "balanced";
    case "data_saver":
      return "data-saver";
    case "best":
    default:
      return "highest";
  }
};

const resolveClipRangeSeconds = (
  context: EngineExecutionContext,
): { startSec: number; endSec: number } | null => {
  const rawIntent = context.intent as Record<string, unknown>;
  const startSec = rawIntent.clipStartSec;
  const endSec = rawIntent.clipEndSec;
  if (
    typeof startSec !== "number"
    || !Number.isFinite(startSec)
    || typeof endSec !== "number"
    || !Number.isFinite(endSec)
  ) {
    return null;
  }
  return { startSec, endSec };
};

const resolveClipRangeStemPrefix = (context: EngineExecutionContext): string | null => {
  const clipRange = resolveClipRangeSeconds(context);
  if (!clipRange) {
    return null;
  }
  const clipStartMs = Math.max(0, Math.round(clipRange.startSec * 1000));
  const clipEndMs = Math.max(0, Math.round(clipRange.endSec * 1000));
  return `${clipStartMs}-${clipEndMs}_${context.outputStem}`;
};

const resolveYtdlpArtifactPrefixes = (context: EngineExecutionContext): string[] => {
  const clipRangePrefix = resolveClipRangeStemPrefix(context);
  return clipRangePrefix
    ? [context.outputStem, clipRangePrefix]
    : [context.outputStem];
};

const buildYtdlpOutputTemplate = (context: EngineExecutionContext): string => {
  const runtimeConfig = context.config ?? {};
  if (resolveRenameEnabled(runtimeConfig)) {
    return path.join(context.outputDir, `${context.outputStem}.%(ext)s`);
  }

  const clipRangePrefix = resolveClipRangeStemPrefix(context);
  if (clipRangePrefix) {
    return path.join(context.outputDir, `${clipRangePrefix}.%(ext)s`);
  }

  const qualityLabel = resolveYtdlpQualityLabel(context.intent.ytdlpQuality);
  return path.join(
    context.outputDir,
    `${context.outputStem}[%(width|unknown)sx%(height|unknown)s][${qualityLabel}].%(ext)s`,
  );
};

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

export const runYtDlpDownload = async (
  context: EngineExecutionContext,
): Promise<DownloadResultPayload> => {
  const reportPath = path.join(context.outputDir, `${context.traceId}-after-move.txt`);
  const outputTemplate = buildYtdlpOutputTemplate(context);
  const artifactPrefixes = resolveYtdlpArtifactPrefixes(context);
  const beforeFiles = new Set(await collectTaskArtifacts(context.outputDir, artifactPrefixes));
  const ffmpegDir = path.dirname(context.binaries.ffmpeg);
  const sourceUrl = context.enginePlan.sourceUrl ?? context.intent.pageUrl ?? context.intent.originalUrl;
  if (!sourceUrl) {
    throw new Error("yt-dlp source URL is missing");
  }
  const formatProfile = resolveYtdlpFormatProfile(
    context.intent.ytdlpQuality,
    Boolean(context.binaries.ffmpeg),
  );
  const args = [
    "--newline",
    "--no-warnings",
    "--ignore-config",
    "--progress",
    "-f",
    formatProfile.selector,
    "--encoding",
    "utf-8",
    "--print-to-file",
    "after_move:filepath",
    reportPath,
    "-o",
    outputTemplate,
  ];

  if (formatProfile.sort) {
    args.push("--format-sort", formatProfile.sort);
  }
  if (formatProfile.mergeOutputFormat) {
    args.push("--merge-output-format", formatProfile.mergeOutputFormat);
  }
  if (context.binaries.ffmpeg) {
    args.push("--ffmpeg-location", ffmpegDir);
  }
  if (context.intent.selectionScope === "current_item") {
    args.push("--no-playlist");
  }
  if (context.intent.pageUrl) {
    args.push("--add-header", `Referer:${context.intent.pageUrl}`);
  }
  const cookiesPath = await writeCookiesFile(context.traceId, context.intent.cookies);
  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
  }

  if (isYouTubeUrl(sourceUrl)) {
    args.push(
      "--extractor-args",
      "youtube:player_js_variant=tv",
      "--remote-components",
      "ejs:github",
    );
    if (context.binaries.deno) {
      if (process.platform === "win32") {
        args.push("--js-runtimes", "deno", "--js-runtimes", "node");
      } else {
        args.push("--js-runtimes", "node", "--js-runtimes", "deno");
      }
    }
  }
  args.push(sourceUrl);

  if (isInjectionDebugEnabled(context.config)) {
    logInjectedDownloadDebug("yt-dlp invocation", {
      traceId: context.traceId,
      ytDlpBinaryPath: context.binaries.ytDlp,
      ffmpegBinaryPath: context.binaries.ffmpeg,
      denoBinaryPath: context.binaries.deno,
      sourceUrl,
      originalUrl: context.intent.originalUrl,
      pageUrl: context.intent.pageUrl ?? null,
      selectionScope: context.intent.selectionScope ?? null,
      siteId: context.intent.siteId,
      titlePresent: Boolean(context.intent.title),
      cookiesPresent: Boolean(context.intent.cookies?.trim()),
      cookiesPath,
      ytdlpQuality: context.intent.ytdlpQuality ?? null,
      formatSelector: formatProfile.selector,
      formatSort: formatProfile.sort,
      mergeOutputFormat: formatProfile.mergeOutputFormat,
      args,
    });
  }

  await context.onProgress({
    traceId: context.traceId,
    percent: 0,
    stage: "preparing",
    speed: "Starting...",
    eta: "",
  });

  const stderrLines: string[] = [];
  try {
    let emittedActivity = false;
    const exitCode = await runStreamingCommand(context.binaries.ytDlp, args, {
      env: {
        ...process.env,
        PATH: ffmpegDir
          ? `${ffmpegDir}${path.delimiter}${process.env.PATH ?? ""}`
          : process.env.PATH,
      },
      signal: context.abortSignal,
      onStdoutLine: async (line: string) => {
        const progress = parseYtDlpProgressLine(context.traceId, line);
        if (progress) {
          emittedActivity = true;
          await context.onProgress(progress);
          return;
        }
        const activity = normalizeYtDlpActivity(line);
        if (activity && !emittedActivity) {
          emittedActivity = true;
          await context.onProgress({
            traceId: context.traceId,
            percent: -1,
            stage: "downloading",
            speed: activity,
            eta: "",
          });
        }
      },
      onStderrLine: async (line: string) => {
        if (line.trim()) {
          stderrLines.push(line.trim());
        }
        const activity = normalizeYtDlpActivity(line);
        if (activity && !emittedActivity) {
          emittedActivity = true;
          await context.onProgress({
            traceId: context.traceId,
            percent: -1,
            stage: "downloading",
            speed: activity,
            eta: "",
          });
        }
      },
    });

    const reportedPath = await readReportedPath(reportPath);
    if (exitCode !== 0) {
      throw new Error(stderrLines[stderrLines.length - 1] ?? `yt-dlp exited with code ${exitCode}`);
    }
    if (!reportedPath) {
      throw new Error("yt-dlp exited successfully but produced no final output path");
    }

    return {
      traceId: context.traceId,
      success: true,
      file_path: reportedPath,
    };
  } catch (error) {
    if (isInjectionDebugEnabled(context.config)) {
      logInjectedDownloadDebug("yt-dlp failed", {
        traceId: context.traceId,
        sourceUrl,
        error: summarizeError(error),
        stderrTail: stderrLines.slice(-5),
      });
    }
    await cleanupTaskArtifacts(context.outputDir, beforeFiles, artifactPrefixes);
    throw new Error(summarizeError(error));
  } finally {
    await cleanupCookiesFile(cookiesPath);
    await fs.unlink(reportPath).catch(() => undefined);
  }
};
