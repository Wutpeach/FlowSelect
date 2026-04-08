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
const GALLERY_DL_ACTIVITY_FALLBACK = "activity:galleryDl.resolvingMedia";

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

const normalizeGalleryDlActivity = (line: string): string | null => {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const withoutPrefix = trimmed
    .replace(/^\[gallery-dl\]\[(?:info|warning|debug)\]\s*/i, "")
    .replace(/^\[[^\]]+\]\s*/, "");
  const normalized = withoutPrefix.toLowerCase();

  if (!normalized) {
    return null;
  }

  if (/\b(error|forbidden|failed|traceback|exception)\b/i.test(normalized)) {
    return null;
  }
  if (/\bcollect(?:ing)?\b.*\b(metadata|pin)\b/i.test(normalized)) {
    return "activity:galleryDl.collectingMetadata";
  }
  if (/\b(metadata|extract(?:ing|or)?)\b/i.test(normalized)) {
    return "activity:galleryDl.extractingMedia";
  }
  if (/\b(download|retriev|request|fetch)\b/i.test(normalized)) {
    return "activity:galleryDl.downloadingMedia";
  }
  if (/\b(already exists|already downloaded|exists on disk|skip(ping)?)\b/i.test(normalized)) {
    return "activity:galleryDl.checkingExistingFile";
  }
  if (/\b(write|saving|moving|finaliz|finish)\b/i.test(normalized)) {
    return "activity:galleryDl.savingFile";
  }

  return GALLERY_DL_ACTIVITY_FALLBACK;
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
  const beforeFiles = new Set(await collectTaskArtifacts(context.outputDir, context.outputStem));
  const args = [
    "--config-ignore",
    "--write-info-json",
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
    let lastActivityLabel: string | null = null;
    const emitGalleryDlActivity = async (line?: string): Promise<void> => {
      const activity = line ? normalizeGalleryDlActivity(line) : GALLERY_DL_ACTIVITY_FALLBACK;
      if (!activity || activity === lastActivityLabel) {
        return;
      }
      lastActivityLabel = activity;
      await context.onProgress({
        traceId: context.traceId,
        percent: -1,
        stage: "downloading",
        speed: activity,
        eta: "",
      });
    };
    cookiesPath = await writeCookiesFile(context.traceId, context.intent.cookies);
    if (cookiesPath) {
      args.unshift(cookiesPath);
      args.unshift("--cookies");
    }
    await emitGalleryDlActivity();
    const exitCode = await runStreamingCommand(context.binaries.galleryDl, args, {
      signal: context.abortSignal,
      onStdoutLine: async (line: string) => {
        pushTailLine(stdoutLines, line);
        if (!line.trim()) {
          return;
        }
        await emitGalleryDlActivity(line);
      },
      onStderrLine: async (line: string) => {
        pushTailLine(stderrLines, line);
        await emitGalleryDlActivity(line);
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
    await cleanupTaskArtifacts(context.outputDir, beforeFiles, context.outputStem);
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
