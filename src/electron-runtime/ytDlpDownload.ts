import { promises as fs } from "node:fs";
import path from "node:path";
import type { RuntimeDownloadContext } from "./contracts";
import { runStreamingCommand } from "./processRunner";
import { parseYtDlpProgressLine } from "./ytDlpProgress";
import { summarizeError } from "./runtimeUtils";
import type { DownloadResultPayload } from "../types/videoRuntime";

const isYouTubeUrl = (value: string): boolean =>
  value.includes("youtube.com/") || value.includes("youtu.be/");

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

export const runYtDlpDownload = async (
  context: RuntimeDownloadContext,
): Promise<DownloadResultPayload> => {
  const reportPath = path.join(context.outputDir, `${context.traceId}-after-move.txt`);
  const outputTemplate = path.join(context.outputDir, `${context.outputStem}.%(ext)s`);
  const ffmpegDir = path.dirname(context.binaries.ffmpeg);
  const args = [
    "-f",
    "bestvideo*+bestaudio/best",
    "--merge-output-format",
    "mp4",
    "--newline",
    "--progress",
    "--encoding",
    "utf-8",
    "--ignore-config",
    "--print-to-file",
    "after_move:filepath",
    reportPath,
    "-o",
    outputTemplate,
  ];

  if (context.binaries.ffmpeg) {
    args.push("--ffmpeg-location", ffmpegDir);
  }
  if (isYouTubeUrl(context.request.url)) {
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
  args.push(context.request.url);

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
    throw new Error(summarizeError(error));
  } finally {
    await fs.unlink(reportPath).catch(() => undefined);
  }
};
