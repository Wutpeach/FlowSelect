import path from "node:path";
import { DownloadRuntimeError } from "../core/index.js";
import type { EngineInvocationContext, YtDlpRuntimeDependencies } from "./engineExecutionContext.js";
import type {
  AdvancedQualityOption,
  AdvancedQualityPostProcessPlan,
} from "../application/download-api.js";
import {
  buildYtDlpNetworkApplication,
  logNetworkApplication,
} from "./engineNetworkAdapters.js";
import {
  classifyNetworkFailure,
  NETWORK_FAILURE_CLASSIFICATIONS,
  redactNetworkCredentials,
} from "../config/networkRoute.js";
import { getCliEngineManifest } from "./engineManifest.js";
import { runCapturedCommand } from "./processRunner.js";
import { cleanupCookiesFile, writeCookiesFile } from "./sidecarCookies.js";
import { summarizeYtDlpFailure } from "./ytDlpErrorSummary.js";
import { appendExtendedYouTubeYtdlpArgs, isYouTubeUrl } from "./ytDlpCommandPlan.js";

type AdvancedQualityInternalOption = AdvancedQualityOption & {
  selector: string;
};

export type AdvancedQualityProbeResult = {
  options: AdvancedQualityInternalOption[];
  videoTitle?: string;
};

const RESOLUTION_ALIAS_BY_HEIGHT: Record<number, string> = {
  2160: "4K",
  4320: "8K",
};

const buildQualityLabel = (height: number): string => {
  const alias = RESOLUTION_ALIAS_BY_HEIGHT[height];
  return alias ? `${height}p · ${alias}` : `${height}p`;
};

const buildSelectorForHeight = (height: number): string => (
  [
    `bv*[height=${height}][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/`,
    `bv*[height=${height}][ext=mp4]+ba[ext=m4a]/`,
    `b[height=${height}][vcodec^=avc1][ext=mp4]/`,
    `b[height=${height}][ext=mp4]/`,
    `best[height=${height}][ext=mp4]/`,
    `bv*[height=${height}]+ba/`,
    `b[height=${height}]/`,
    `best[height=${height}]`,
  ].join("")
);

const extractFormats = (payload: unknown): Array<Record<string, unknown>> => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }

  const formats = (payload as Record<string, unknown>).formats;
  if (!Array.isArray(formats)) {
    return [];
  }

  return formats.filter((entry): entry is Record<string, unknown> => (
    Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
  ));
};

const normalizeFormatString = (value: unknown): string => (
  typeof value === "string" ? value.trim().toLowerCase() : ""
);

const hasVideoCodec = (format: Record<string, unknown>): boolean => {
  const vcodec = normalizeFormatString(format.vcodec);
  return Boolean(vcodec) && vcodec !== "none";
};

const hasAudioCodec = (format: Record<string, unknown>): boolean => {
  const acodec = normalizeFormatString(format.acodec);
  return Boolean(acodec) && acodec !== "none";
};

const formatHeight = (format: Record<string, unknown>): number | null => {
  const height = Number(format.height);
  return Number.isFinite(height) && height > 0 ? Math.floor(height) : null;
};

const isMp4LikeExtension = (value: string): boolean => value === "mp4" || value === "m4v";
const isM4aLikeExtension = (value: string): boolean => value === "m4a" || value === "mp4";

const resolveVideoExtension = (format: Record<string, unknown>): string => {
  const videoExt = normalizeFormatString(format.video_ext);
  return videoExt && videoExt !== "none" ? videoExt : normalizeFormatString(format.ext);
};

const resolveAudioExtension = (format: Record<string, unknown>): string => {
  const audioExt = normalizeFormatString(format.audio_ext);
  return audioExt && audioExt !== "none" ? audioExt : normalizeFormatString(format.ext);
};

const isAvc1Video = (format: Record<string, unknown>): boolean => (
  normalizeFormatString(format.vcodec).startsWith("avc1")
);

const isMp4aAudio = (format: Record<string, unknown>): boolean => (
  normalizeFormatString(format.acodec).startsWith("mp4a")
);

const isCompatibleVideoOnly = (format: Record<string, unknown>, height: number): boolean => (
  formatHeight(format) === height
    && hasVideoCodec(format)
    && !hasAudioCodec(format)
    && isAvc1Video(format)
    && isMp4LikeExtension(resolveVideoExtension(format))
);

const isCompatibleAudioOnly = (format: Record<string, unknown>): boolean => (
  !hasVideoCodec(format)
    && hasAudioCodec(format)
    && isMp4aAudio(format)
    && isM4aLikeExtension(resolveAudioExtension(format))
);

const isCompatibleCombined = (format: Record<string, unknown>, height: number): boolean => (
  formatHeight(format) === height
    && hasVideoCodec(format)
    && hasAudioCodec(format)
    && isAvc1Video(format)
    && isMp4aAudio(format)
    && isMp4LikeExtension(resolveVideoExtension(format))
    && isM4aLikeExtension(resolveAudioExtension(format))
);

const classifyCompatibleMediaPlan = (
  format: Record<string, unknown>,
): AdvancedQualityPostProcessPlan => {
  const videoCodec = normalizeFormatString(format.vcodec);
  const audioCodec = normalizeFormatString(format.acodec);
  const ext = normalizeFormatString(format.ext);
  const videoExt = resolveVideoExtension(format);
  const videoCompatible = videoCodec === "h264" || videoCodec.startsWith("avc1");
  const audioCompatible = !audioCodec || audioCodec === "none" || audioCodec === "aac" || audioCodec.startsWith("mp4a");
  const mp4Container = isMp4LikeExtension(ext) || isMp4LikeExtension(videoExt);

  if (mp4Container && videoCompatible && audioCompatible) {
    return "none";
  }
  if (videoCompatible && audioCompatible) {
    return "remux_only";
  }
  if (videoCompatible && !audioCompatible) {
    return "audio_transcode";
  }
  return "full_transcode";
};

const singlePlanOrUnknown = (
  candidates: Array<Record<string, unknown>>,
): AdvancedQualityPostProcessPlan => {
  if (candidates.length === 0) {
    return "unknown";
  }
  const plans = new Set(candidates.map(classifyCompatibleMediaPlan));
  return plans.size === 1 ? Array.from(plans)[0] ?? "unknown" : "unknown";
};

const combineSeparatePlans = (
  videoPlan: AdvancedQualityPostProcessPlan,
  audioFormats: Array<Record<string, unknown>>,
): AdvancedQualityPostProcessPlan => {
  if (videoPlan === "unknown" || audioFormats.length === 0) {
    return "unknown";
  }
  const allAudioCompatible = audioFormats.every((format) => {
    const audioCodec = normalizeFormatString(format.acodec);
    return audioCodec === "aac" || audioCodec.startsWith("mp4a");
  });
  if (!allAudioCompatible) {
    return videoPlan === "full_transcode" ? "full_transcode" : "unknown";
  }
  return videoPlan;
};

const resolvePostProcessPlanForHeight = (
  formats: Array<Record<string, unknown>>,
  height: number,
): AdvancedQualityPostProcessPlan => {
  const heightVideoFormats = formats.filter((format) => (
    formatHeight(format) === height && hasVideoCodec(format)
  ));
  const compatibleAudioFormats = formats.filter(isCompatibleAudioOnly);

  if (
    heightVideoFormats.some((format) => isCompatibleVideoOnly(format, height))
    && compatibleAudioFormats.length > 0
  ) {
    return "none";
  }

  const mp4VideoWithM4aFormats = heightVideoFormats.filter((format) => (
    !hasAudioCodec(format)
      && isMp4LikeExtension(resolveVideoExtension(format))
      && compatibleAudioFormats.length > 0
  ));
  if (mp4VideoWithM4aFormats.length > 0) {
    return singlePlanOrUnknown(mp4VideoWithM4aFormats);
  }

  const compatibleCombinedFormats = formats.filter((format) => isCompatibleCombined(format, height));
  if (compatibleCombinedFormats.length > 0) {
    return "none";
  }

  const mp4CombinedFormats = formats.filter((format) => (
    formatHeight(format) === height
      && hasVideoCodec(format)
      && hasAudioCodec(format)
      && isMp4LikeExtension(resolveVideoExtension(format))
  ));
  if (mp4CombinedFormats.length > 0) {
    return singlePlanOrUnknown(mp4CombinedFormats);
  }

  const mp4HeightFormats = heightVideoFormats.filter((format) => (
    isMp4LikeExtension(resolveVideoExtension(format))
  ));
  if (mp4HeightFormats.length > 0) {
    return singlePlanOrUnknown(mp4HeightFormats);
  }

  const broadCombinedFormats = heightVideoFormats.filter((format) => hasAudioCodec(format));
  if (broadCombinedFormats.length > 0) {
    return singlePlanOrUnknown(broadCombinedFormats);
  }

  const audioFormats = formats.filter((format) => !hasVideoCodec(format) && hasAudioCodec(format));
  const videoPlan = singlePlanOrUnknown(heightVideoFormats);
  return combineSeparatePlans(videoPlan, audioFormats);
};

const extractVideoTitle = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const title = (payload as Record<string, unknown>).title;
  return typeof title === "string" && title.trim().length > 0 ? title.trim() : undefined;
};

export const extractAdvancedQualityOptionsFromYtDlpJson = (
  payload: unknown,
): AdvancedQualityProbeResult => {
  const heights = new Set<number>();
  const formats = extractFormats(payload);

  for (const format of formats) {
    if (!hasVideoCodec(format)) {
      continue;
    }

    const height = formatHeight(format);
    if (height == null) {
      continue;
    }

    heights.add(height);
  }

  const options = Array.from(heights)
    .sort((left, right) => right - left)
    .map((height) => ({
      id: `height_${height}`,
      label: buildQualityLabel(height),
      selector: buildSelectorForHeight(height),
      postProcessPlan: resolvePostProcessPlanForHeight(formats, height),
    }));

  return {
    options,
    videoTitle: extractVideoTitle(payload),
  };
};

const resolveProbeSourceUrl = (context: EngineInvocationContext<YtDlpRuntimeDependencies>): string => {
  const sourceUrl = context.enginePlan.sourceUrl ?? context.intent.pageUrl ?? context.intent.originalUrl;
  if (!sourceUrl) {
    throw new DownloadRuntimeError(
      "E_INVALID_ENGINE_PLAN",
      "Missing source URL for advanced quality probe",
      {
        context: {
          traceId: context.traceId,
          siteId: context.intent.siteId,
        },
      },
    );
  }
  return sourceUrl;
};

/**
 * Advanced-quality probing is a yt-dlp-only Infrastructure feature: it
 * invokes the concrete yt-dlp CLI to enumerate selectable formats. There is
 * no probe port or second implementation; the Site declares the need through
 * `plan.requirements.advancedQuality` and the runtime verifies a registered,
 * capable yt-dlp engine before calling this.
 */
export const runYtDlpAdvancedQualityProbe = async (
  context: EngineInvocationContext<YtDlpRuntimeDependencies>,
): Promise<AdvancedQualityProbeResult> => {
  const sourceUrl = resolveProbeSourceUrl(context);
  const manifest = getCliEngineManifest("yt-dlp");
  const youtubeUrl = isYouTubeUrl(sourceUrl);
  const cookiesPath = await writeCookiesFile(context.traceId, context.cookies);
  const args = [
    ...manifest.baseArgs,
    ...manifest.configIsolationArgs,
    ...manifest.encodingArgs,
    "--dump-single-json",
  ];

  if (context.intent.selectionScope === "current_item") {
    args.push("--no-playlist");
  }
  if (context.intent.pageUrl) {
    args.push("--add-header", `Referer:${context.intent.pageUrl}`);
  }
  // Reuse the yt-dlp adapter so the probe follows the same network route and
  // failure semantics as the real download. The per-Job resolution is always
  // present in the execution contract; it is never re-resolved here.
  const networkApplication = buildYtDlpNetworkApplication(context.network.route);
  logNetworkApplication(networkApplication.diagnostic);
  args.push(...networkApplication.args);
  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
  }
  if (youtubeUrl) {
    appendExtendedYouTubeYtdlpArgs(args, {
      denoPath: context.binaries.deno || null,
    });
  }
  args.push(sourceUrl);

  try {
    const result = await runCapturedCommand(context.binaries.ytDlp, args, {
      env: {
        ...networkApplication.env,
        PATH: context.binaries.ffmpeg
          ? `${path.dirname(context.binaries.ffmpeg)}${path.delimiter}${networkApplication.env.PATH ?? ""}`
          : networkApplication.env.PATH,
      },
      signal: context.abortSignal,
    });

    if (result.exitCode !== 0) {
      const stderrLines = result.stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const classification = classifyNetworkFailure(
        new Error(summarizeYtDlpFailure(
          stderrLines,
          `yt-dlp exited with code ${result.exitCode}`,
          { isYouTube: youtubeUrl },
        )),
        stderrLines,
      );
      throw new DownloadRuntimeError(
        "E_EXECUTION_FAILED",
        redactNetworkCredentials(summarizeYtDlpFailure(
          stderrLines,
          `yt-dlp exited with code ${result.exitCode}`,
          { isYouTube: youtubeUrl },
        )),
        {
          context: classification !== NETWORK_FAILURE_CLASSIFICATIONS.UNKNOWN
            ? { networkFailureClassification: classification }
            : undefined,
        },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (error) {
      throw new DownloadRuntimeError(
        "E_EXECUTION_FAILED",
        "Failed to parse advanced quality probe output",
        {
          cause: error,
        },
      );
    }

    const extracted = extractAdvancedQualityOptionsFromYtDlpJson(parsed);
    if (extracted.options.length === 0) {
      throw new DownloadRuntimeError(
        "E_EXECUTION_FAILED",
        "No usable advanced quality options were found",
      );
    }

    return extracted;
  } finally {
    await cleanupCookiesFile(cookiesPath);
  }
};
