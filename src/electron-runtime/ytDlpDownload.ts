import { promises as fs } from "node:fs";
import path from "node:path";
import type { EngineExecutionContext, YtdlpQualityPreference } from "../core/index.js";
import { runStreamingCommand } from "./processRunner.js";
import { parseYtDlpProgressLine } from "./ytDlpProgress.js";
import { summarizeError } from "./runtimeUtils.js";
import type { DownloadResultPayload } from "../types/videoRuntime.js";
import { cleanupCookiesFile, writeCookiesFile } from "./sidecarCookies.js";

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

const resolveYtdlpFormatProfile = (
  quality: YtdlpQualityPreference | undefined,
  hasFfmpeg: boolean,
): {
  selector: string;
  sort: string | null;
  mergeOutputFormat: "mp4" | "mkv" | null;
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
        mergeOutputFormat: "mkv",
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
  outputStem: string,
): Promise<string[]> => (
  await fs.readdir(outputDir).catch(() => [])
).filter((entry) => entry.startsWith(`${outputStem}.`));

const cleanupTaskArtifacts = async (
  outputDir: string,
  beforeFiles: Set<string>,
  outputStem: string,
): Promise<void> => {
  const afterFiles = await collectTaskArtifacts(outputDir, outputStem);
  await Promise.all(afterFiles
    .filter((entry) => !beforeFiles.has(entry))
    .map((entry) => fs.unlink(path.join(outputDir, entry)).catch(() => undefined)));
};

export const runYtDlpDownload = async (
  context: EngineExecutionContext,
): Promise<DownloadResultPayload> => {
  const reportPath = path.join(context.outputDir, `${context.traceId}-after-move.txt`);
  const outputTemplate = path.join(context.outputDir, `${context.outputStem}.%(ext)s`);
  const beforeFiles = new Set(await collectTaskArtifacts(context.outputDir, context.outputStem));
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

  await context.onProgress({
    traceId: context.traceId,
    percent: 0,
    stage: "preparing",
    speed: "Starting...",
    eta: "",
  });

  const stderrLines: string[] = [];
  try {
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
          await context.onProgress(progress);
        }
      },
      onStderrLine: (line: string) => {
        if (line.trim()) {
          stderrLines.push(line.trim());
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
    await cleanupTaskArtifacts(context.outputDir, beforeFiles, context.outputStem);
    throw new Error(summarizeError(error));
  } finally {
    await cleanupCookiesFile(cookiesPath);
    await fs.unlink(reportPath).catch(() => undefined);
  }
};
