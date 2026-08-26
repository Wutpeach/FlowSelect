import path from "node:path";
import type { VideoQualityPreference } from "../core/index.js";
import type { EngineInvocationContext, YtDlpRuntimeDependencies } from "./engineExecutionContext.js";
import { InvalidCommandPlanError } from "./commandPlanErrors.js";
import { getCliEngineManifest, resolveYtdlpFormatProfile, type YtdlpFormatProfile } from "./engineManifest.js";
import { resolveRenameEnabled } from "./renameRules.js";

type YtdlpClipRange = {
  startSec: number;
  endSec: number;
};

export type YtdlpCommandPlan = {
  sourceUrl: string;
  isYouTube: boolean;
  clipRange: YtdlpClipRange | null;
  reportPath: string;
  titleReportPath: string;
  outputTemplate: string;
  artifactPrefixes: string[];
  ffmpegDir: string;
  formatProfile: YtdlpFormatProfile;
};

type BuildYtdlpCommandArgsOptions = {
  cookiesPath: string | null;
  hasFfmpeg: boolean;
  denoPath: string | null;
  formatProfile?: YtdlpFormatProfile;
  /** Proxy-related args produced by the yt-dlp network adapter. */
  proxyArgs?: string[];
  selectionScope?: string;
  pageUrl?: string;
  platform: NodeJS.Platform;
};

export const isYouTubeUrl = (value: string): boolean =>
  value.includes("youtube.com/") || value.includes("youtu.be/");

export const appendExtendedYouTubeYtdlpArgs = (
  args: string[],
  options: { denoPath: string | null },
): void => {
  const manifest = getCliEngineManifest("yt-dlp");
  args.push(...manifest.youtube.extendedExtractorArgs);
  if (!options.denoPath) {
    return;
  }
  args.push("--js-runtimes", `deno:${options.denoPath}`);
};

const resolveYtdlpQualityLabel = (
  quality: VideoQualityPreference | undefined,
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

const YTDLP_SECTION_DOWNLOAD_SITE_IDS = new Set(["youtube", "bilibili"]);

const isClipSectionDownloadSupported = (siteId: string | undefined): boolean => (
  typeof siteId === "string" && YTDLP_SECTION_DOWNLOAD_SITE_IDS.has(siteId)
);

const formatClipTimeForYtdlp = (seconds: number): string => {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  const base = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}`;
  return milliseconds > 0
    ? `${base}.${String(milliseconds).padStart(3, "0")}`
    : base;
};

const resolveClipRangeSeconds = (
  context: EngineInvocationContext<YtDlpRuntimeDependencies>,
): YtdlpClipRange | null => {
  const rawIntent = context.intent as Record<string, unknown>;
  const rawStartSec = rawIntent.clipStartSec;
  const rawEndSec = rawIntent.clipEndSec;
  const hasStartSec = rawStartSec !== undefined && rawStartSec !== null;
  const hasEndSec = rawEndSec !== undefined && rawEndSec !== null;

  if (!hasStartSec && !hasEndSec) {
    return null;
  }

  if (!isClipSectionDownloadSupported(context.intent.siteId)) {
    throw new InvalidCommandPlanError("Clip downloads are only supported for YouTube and Bilibili");
  }

  if (!hasStartSec || !hasEndSec) {
    throw new InvalidCommandPlanError("Clip downloads require both clipStartSec and clipEndSec");
  }

  const startSec = Number(rawStartSec);
  const endSec = Number(rawEndSec);
  if (!Number.isFinite(startSec) || startSec < 0 || !Number.isFinite(endSec) || endSec < 0) {
    throw new InvalidCommandPlanError("Clip download range must use finite non-negative seconds");
  }
  if (endSec <= startSec) {
    throw new InvalidCommandPlanError("Clip download end time must be later than the start time");
  }

  return { startSec, endSec };
};

const buildYtdlpDownloadSectionArg = (
  clipRange: YtdlpClipRange,
): string => `*${formatClipTimeForYtdlp(clipRange.startSec)}-${formatClipTimeForYtdlp(clipRange.endSec)}`;

const resolveClipRangeStemPrefix = (
  context: EngineInvocationContext<YtDlpRuntimeDependencies>,
  clipRange: YtdlpClipRange | null,
): string | null => {
  if (!clipRange) {
    return null;
  }
  const clipStartMs = Math.max(0, Math.round(clipRange.startSec * 1000));
  const clipEndMs = Math.max(0, Math.round(clipRange.endSec * 1000));
  return `${clipStartMs}-${clipEndMs}_${context.outputStem}`;
};

const resolveYtdlpArtifactPrefixes = (
  context: EngineInvocationContext<YtDlpRuntimeDependencies>,
  clipRange: YtdlpClipRange | null,
): string[] => {
  const clipRangePrefix = resolveClipRangeStemPrefix(context, clipRange);
  return clipRangePrefix
    ? [context.outputStem, clipRangePrefix]
    : [context.outputStem];
};

const buildYtdlpOutputTemplate = (
  context: EngineInvocationContext<YtDlpRuntimeDependencies>,
  clipRange: YtdlpClipRange | null,
): string => {
  const runtimeConfig = context.config ?? {};
  if (resolveRenameEnabled(runtimeConfig)) {
    return path.join(context.outputDir, `${context.outputStem}.%(ext)s`);
  }

  const clipRangePrefix = resolveClipRangeStemPrefix(context, clipRange);
  if (clipRangePrefix) {
    return path.join(context.outputDir, `${clipRangePrefix}.%(ext)s`);
  }

  const qualityLabel = resolveYtdlpQualityLabel(context.intent.videoQuality);
  return path.join(
    context.outputDir,
    `${context.outputStem}[%(width|unknown)sx%(height|unknown)s][${qualityLabel}].%(ext)s`,
  );
};

export const createYtdlpCommandPlan = (
  context: EngineInvocationContext<YtDlpRuntimeDependencies>,
): YtdlpCommandPlan => {
  const clipRange = resolveClipRangeSeconds(context);
  const sourceUrl = context.enginePlan.sourceUrl ?? context.intent.pageUrl ?? context.intent.originalUrl;
  if (!sourceUrl) {
    throw new InvalidCommandPlanError("yt-dlp source URL is missing");
  }
  const youtubeUrl = isYouTubeUrl(sourceUrl);
  const formatProfile = resolveYtdlpFormatProfile(
    context.intent.videoQuality,
    Boolean(context.binaries.ffmpeg),
    { isYouTube: youtubeUrl, siteId: context.intent.siteId },
  );
  const advancedQualitySelector = context.advancedQualitySelector?.trim();
  const resolvedFormatProfile = advancedQualitySelector
    ? {
        ...formatProfile,
        selector: advancedQualitySelector,
      }
    : formatProfile;

  return {
    sourceUrl,
    isYouTube: youtubeUrl,
    clipRange,
    reportPath: path.join(context.outputDir, `${context.traceId}-after-move.txt`),
    titleReportPath: path.join(context.outputDir, `${context.traceId}-title.txt`),
    outputTemplate: buildYtdlpOutputTemplate(context, clipRange),
    artifactPrefixes: resolveYtdlpArtifactPrefixes(context, clipRange),
    ffmpegDir: path.dirname(context.binaries.ffmpeg),
    formatProfile: resolvedFormatProfile,
  };
};

export const buildYtdlpCommandArgs = (
  plan: YtdlpCommandPlan,
  options: BuildYtdlpCommandArgsOptions,
): string[] => {
  const manifest = getCliEngineManifest("yt-dlp");
  const formatProfile = options.formatProfile ?? plan.formatProfile;
  const args = [
    ...manifest.baseArgs,
    ...manifest.configIsolationArgs,
    ...manifest.progressArgs,
    "-f",
    formatProfile.selector,
    ...manifest.encodingArgs,
    "--print-to-file",
    manifest.progressReport.finalPathPrint,
    plan.reportPath,
    "--print-to-file",
    manifest.progressReport.titlePrint,
    plan.titleReportPath,
    "-o",
    plan.outputTemplate,
  ];

  if (formatProfile.sort) {
    args.push("--format-sort", formatProfile.sort);
  }
  if (formatProfile.mergeOutputFormat) {
    args.push("--merge-output-format", formatProfile.mergeOutputFormat);
  }
  if (options.hasFfmpeg) {
    args.push("--ffmpeg-location", plan.ffmpegDir);
  }
  if (options.proxyArgs && options.proxyArgs.length > 0) {
    args.push(...options.proxyArgs);
  }
  if (options.selectionScope === "current_item") {
    args.push("--no-playlist");
  }
  if (options.pageUrl) {
    args.push("--add-header", `Referer:${options.pageUrl}`);
  }
  if (plan.clipRange) {
    args.push("--download-sections", buildYtdlpDownloadSectionArg(plan.clipRange));
  }
  if (options.cookiesPath) {
    args.push("--cookies", options.cookiesPath);
  }

  if (plan.isYouTube) {
    appendExtendedYouTubeYtdlpArgs(args, {
      denoPath: options.denoPath,
    });
  }

  args.push(plan.sourceUrl);
  return args;
};
