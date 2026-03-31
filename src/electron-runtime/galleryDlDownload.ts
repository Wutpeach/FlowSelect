import { promises as fs } from "node:fs";
import path from "node:path";
import { DownloadRuntimeError, type EngineExecutionContext } from "../core/index.js";
import type { DownloadResultPayload } from "../types/videoRuntime.js";
import { runStreamingCommand } from "./processRunner.js";
import { summarizeError } from "./runtimeUtils.js";
import { cleanupCookiesFile, writeCookiesFile } from "./sidecarCookies.js";

const isGallerySidecar = (entryPath: string, outputStem: string): boolean =>
  entryPath.startsWith(outputStem) && /\.(json|txt|part)$/i.test(entryPath);

const GALLERY_DL_LINE_TAIL_LIMIT = 20;

const pushTailLine = (target: string[], line: string): void => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  target.push(trimmed);
  if (target.length > GALLERY_DL_LINE_TAIL_LIMIT) {
    target.shift();
  }
};

const summarizeGalleryDlFailure = (
  exitCode: number,
  stderrLines: string[],
  stdoutLines: string[],
): string => {
  const detail = stderrLines[stderrLines.length - 1] ?? stdoutLines[stdoutLines.length - 1] ?? "";
  if (!detail) {
    return `gallery-dl exited with code ${exitCode}`;
  }
  return `gallery-dl exited with code ${exitCode}: ${detail}`;
};

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

  let cookiesPath: string | null = null;
  try {
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    cookiesPath = await writeCookiesFile(context.traceId, context.intent.cookies);
    if (cookiesPath) {
      args.unshift(cookiesPath);
      args.unshift("--cookies");
    }
    const exitCode = await runStreamingCommand(context.binaries.galleryDl, args, {
      signal: context.abortSignal,
      onStdoutLine: async (line: string) => {
        pushTailLine(stdoutLines, line);
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
      onStderrLine: (line: string) => {
        pushTailLine(stderrLines, line);
      },
    });

    if (exitCode !== 0) {
      throw new DownloadRuntimeError(
        "E_EXECUTION_FAILED",
        summarizeGalleryDlFailure(exitCode, stderrLines, stdoutLines),
        {
          context: {
            sourceUrl,
            stderrTail: stderrLines,
            stdoutTail: stdoutLines,
          },
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
  } finally {
    await cleanupCookiesFile(cookiesPath);
  }
};
