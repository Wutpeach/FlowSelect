import { createWriteStream, promises as fs } from "node:fs";
import type { EngineExecutionContext } from "../core/index.js";
import { summarizeError } from "./runtimeUtils.js";
import type { DownloadResultPayload } from "../types/videoRuntime.js";

const isTextishContentType = (value: string | null): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.toLowerCase();
  return normalized.includes("application/json")
    || normalized.includes("application/vnd.apple.mpegurl")
    || normalized.includes("application/x-mpegurl")
    || normalized.startsWith("text/");
};

export const runDirectVideoDownload = async (
  context: EngineExecutionContext,
): Promise<DownloadResultPayload> => {
  const fetchImpl = context.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("Global fetch is unavailable for direct downloads");
  }

  const outputPath = `${context.outputDir}/${context.outputStem}.mp4`;
  await context.onProgress({
    traceId: context.traceId,
    percent: -1,
    stage: "preparing",
    speed: "Starting...",
    eta: "N/A",
  });

  const headers = new Headers();
  headers.set(
    "User-Agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  );
  if (context.intent.pageUrl) {
    headers.set("Referer", context.intent.pageUrl);
  }

  const sourceUrl = context.enginePlan.sourceUrl
    || (context.intent.type === "direct" ? context.intent.directUrl : undefined)
    || context.intent.originalUrl;
  if (!sourceUrl) {
    throw new Error("Direct download source URL is missing");
  }

  const response = await fetchImpl(sourceUrl, {
    headers,
    signal: context.abortSignal,
  });
  if (!response.ok) {
    throw new Error(`Direct download failed with HTTP ${response.status}`);
  }
  if (isTextishContentType(response.headers.get("content-type"))) {
    throw new Error(
      `Direct download returned non-video payload (${response.headers.get("content-type")})`,
    );
  }
  if (!response.body) {
    throw new Error("Direct download response body was empty");
  }

  const writer = createWriteStream(outputPath);
  const reader = response.body.getReader();
  const totalBytes = Number(response.headers.get("content-length") ?? "0");
  let downloadedBytes = 0;
  let lastEmitAt = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (context.abortSignal.aborted) {
        throw new Error("Download cancelled");
      }
      writer.write(value);
      downloadedBytes += value.byteLength;

      const now = Date.now();
      if (now - lastEmitAt < 100) {
        continue;
      }
      lastEmitAt = now;
      const percent = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : -1;
      await context.onProgress({
        traceId: context.traceId,
        percent,
        stage: "downloading",
        speed: `${(downloadedBytes / 1_000_000).toFixed(1)} MB`,
        eta: "N/A",
      });
    }

    writer.end();
    return {
      traceId: context.traceId,
      success: true,
      file_path: outputPath,
    };
  } catch (error) {
    writer.destroy();
    await fs.unlink(outputPath).catch(() => undefined);
    throw new Error(summarizeError(error));
  }
};

