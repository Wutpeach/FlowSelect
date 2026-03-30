import { promises as fs } from "node:fs";
import path from "node:path";
import { DownloadRuntimeError, type EngineExecutionContext } from "../core/index.js";
import type { DownloadResultPayload } from "../types/videoRuntime.js";
import { runStreamingCommand } from "./processRunner.js";
import { summarizeError } from "./runtimeUtils.js";

const isGallerySidecar = (entryPath: string, outputStem: string): boolean =>
  entryPath.startsWith(outputStem) && /\.(json|txt|part)$/i.test(entryPath);

export const runGalleryDlDownload = async (
  context: EngineExecutionContext,
): Promise<DownloadResultPayload> => {
  const sourceUrl = context.enginePlan.sourceUrl ?? context.intent.pageUrl ?? context.intent.originalUrl;
  if (!sourceUrl) {
    throw new DownloadRuntimeError(
      "E_INVALID_ENGINE_PLAN",
      "gallery-dl source URL is missing",
      {
        context: {
          providerId: context.plan.providerId,
          traceId: context.traceId,
        },
      },
    );
  }

  if (!context.binaries.galleryDl) {
    throw new DownloadRuntimeError(
      "E_ENGINE_UNAVAILABLE",
      "gallery-dl binary is missing",
      {
        context: { sourceUrl },
      },
    );
  }

  const prefix = `${context.outputStem}.`;
  const beforeFiles = new Set(
    (await fs.readdir(context.outputDir).catch(() => []))
      .filter((entry) => entry.startsWith(prefix)),
  );
  const args = [
    "--config-ignore",
    "--directory",
    context.outputDir,
    "--filename",
    `${context.outputStem}.{extension}`,
    sourceUrl,
  ];

  await context.onProgress({
    traceId: context.traceId,
    percent: 0,
    stage: "preparing",
    speed: "Starting...",
    eta: "",
  });

  try {
    const exitCode = await runStreamingCommand(context.binaries.galleryDl, args, {
      signal: context.abortSignal,
      onStdoutLine: async (line: string) => {
        if (!line.trim()) {
          return;
        }
        await context.onProgress({
          traceId: context.traceId,
          percent: -1,
          stage: "downloading",
          speed: "gallery-dl",
          eta: "",
        });
      },
    });

    if (exitCode !== 0) {
      throw new DownloadRuntimeError(
        "E_EXECUTION_FAILED",
        `gallery-dl exited with code ${exitCode}`,
        {
          context: { sourceUrl },
        },
      );
    }

    const afterFiles = await fs.readdir(context.outputDir).catch(() => []);
    const created = afterFiles
      .filter((entry) => entry.startsWith(prefix))
      .filter((entry) => !beforeFiles.has(entry))
      .filter((entry) => !isGallerySidecar(entry, context.outputStem));

    const finalPath = created[0] ? path.join(context.outputDir, created[0]) : null;

    if (!finalPath) {
      throw new DownloadRuntimeError(
        "E_OUTPUT_NOT_FOUND",
        "gallery-dl finished without producing an output file",
        {
          context: { sourceUrl, outputDir: context.outputDir },
        },
      );
    }

    return {
      traceId: context.traceId,
      success: true,
      file_path: finalPath,
    };
  } catch (error) {
    const runtimeError = error instanceof DownloadRuntimeError ? error : null;
    throw new DownloadRuntimeError(
      runtimeError?.code ?? "E_EXECUTION_FAILED",
      summarizeError(error),
      {
        cause: error,
      },
    );
  }
};
