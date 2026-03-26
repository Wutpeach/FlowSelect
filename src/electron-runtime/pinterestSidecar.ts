import { promises as fs } from "node:fs";
import path from "node:path";
import type { RuntimeDownloadContext } from "./contracts";
import { runStreamingCommand } from "./processRunner";
import { summarizeError } from "./runtimeUtils";
import type { DownloadResultPayload, PinterestRuntimePayload } from "../types/videoRuntime";

const pinIdFromUrl = (value: string): number => {
  const matched = value.match(/\/pin\/(\d+)/i);
  if (matched) {
    return Number(matched[1]);
  }
  return Math.abs(
    Array.from(value).reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) | 0, 0),
  );
};

const resolveHintVideoUrl = (context: RuntimeDownloadContext): string | null =>
  context.request.videoUrl
  ?? context.request.videoCandidates?.find((candidate) => candidate.url.trim().length > 0)?.url
  ?? null;

export const runPinterestSidecarDownload = async (
  context: RuntimeDownloadContext,
): Promise<DownloadResultPayload> => {
  const videoUrl = resolveHintVideoUrl(context);
  if (!videoUrl) {
    throw new Error("Pinterest download requires a direct video hint for the Electron sidecar");
  }

  const payloadPath = path.join(context.outputDir, `${context.traceId}-pinterest.json`);
  const payload: PinterestRuntimePayload = {
    traceId: context.traceId,
    pageUrl: context.request.pageUrl ?? context.request.url,
    pinId: pinIdFromUrl(context.request.pageUrl ?? context.request.url),
    title: context.outputStem,
    origin: context.request.pageUrl ?? context.request.url,
    cookiesHeader: null,
    image: {
      url: context.request.pageUrl ?? context.request.url,
    },
    video: {
      url: videoUrl,
    },
    outputDir: context.outputDir,
  };
  await fs.writeFile(payloadPath, JSON.stringify(payload), "utf8");

  let finalPath: string | null = null;

  try {
    const exitCode = await runStreamingCommand(
      context.binaries.pinterestDownloader,
      ["--input-json", payloadPath],
      {
        signal: context.abortSignal,
        env: {
          ...process.env,
          PATH: `${path.dirname(context.binaries.ffmpeg)}${path.delimiter}${process.env.PATH ?? ""}`,
        },
        onStdoutLine: async (line) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return;
          }
          if (trimmed.startsWith("FLOWSELECT_PINTEREST_STAGE\t")) {
            const stage = trimmed.split("\t")[1] ?? "preparing";
            await context.onProgress({
              traceId: context.traceId,
              percent: stage === "downloading" ? 0 : -1,
              stage: stage === "downloading" ? "downloading" : "preparing",
              speed: stage,
              eta: "",
            });
            return;
          }
          if (trimmed.startsWith("FLOWSELECT_PINTEREST_PROGRESS\t")) {
            const [, doneRaw, totalRaw] = trimmed.split("\t");
            const done = Number(doneRaw ?? "0");
            const total = Number(totalRaw ?? "1");
            const percent = total > 0 ? (done / total) * 100 : -1;
            await context.onProgress({
              traceId: context.traceId,
              percent,
              stage: "downloading",
              speed: `${Math.round(done)}/${Math.round(total)}`,
              eta: "",
            });
            return;
          }
          if (trimmed.startsWith("FLOWSELECT_PINTEREST_RESULT\t")) {
            finalPath = trimmed.split("\t").slice(1).join("\t").trim();
          }
        },
      },
    );

    if (exitCode !== 0) {
      throw new Error(`Pinterest downloader exited with code ${exitCode}`);
    }
    if (!finalPath) {
      throw new Error("Pinterest downloader exited successfully but produced no output path");
    }

    return {
      traceId: context.traceId,
      success: true,
      file_path: finalPath,
    };
  } catch (error) {
    throw new Error(summarizeError(error));
  } finally {
    await fs.unlink(payloadPath).catch(() => undefined);
  }
};

