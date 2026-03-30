import { mkdirSync } from "node:fs";
import path from "node:path";
import type { ElectronRuntimeEnvironment } from "./contracts.js";

let traceSequence = 0;

const WINDOWS_RESERVED_FILE_STEM_PATTERN =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?=\.|$)/i;

export const nextDownloadTraceId = (): string => {
  traceSequence += 1;
  return `video-${Date.now()}-${traceSequence}`;
};

export const sanitizeFileStem = (input: string): string => {
  const sanitized = input
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*]/g, " ")
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 0x20 || code === 0x09;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96)
    .replace(/[. ]+$/g, "")
    || "flowselect-video";

  return WINDOWS_RESERVED_FILE_STEM_PATTERN.test(sanitized)
    ? sanitized.replace(WINDOWS_RESERVED_FILE_STEM_PATTERN, "$1_")
    : sanitized;
};

export const summarizeError = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return String(error ?? "Unknown error").trim() || "Unknown error";
};

export const parseJsonObject = (raw: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

export const resolveOutputDir = (
  environment: ElectronRuntimeEnvironment,
  config: Record<string, unknown>,
): string => {
  const configured = typeof config.outputPath === "string" ? config.outputPath.trim() : "";
  const outputDir = configured
    || (environment.desktopDir
      ? path.join(environment.desktopDir, "FlowSelect_Received")
      : path.join(environment.repoRoot, "FlowSelect_Received"));
  mkdirSync(outputDir, { recursive: true });
  return outputDir;
};

export const resolveRenameEnabled = (config: Record<string, unknown>): boolean => {
  if (typeof config.renameMediaOnDownload === "boolean") {
    return config.renameMediaOnDownload;
  }
  if (typeof config.videoKeepOriginalName === "boolean") {
    return !config.videoKeepOriginalName;
  }
  return false;
};

export const buildOutputStem = (
  traceId: string,
  url: string,
  config: Record<string, unknown>,
  preferredTitle?: string,
): string => {
  const renameEnabled = resolveRenameEnabled(config);
  if (renameEnabled) {
    return traceId;
  }
  if (typeof preferredTitle === "string" && preferredTitle.trim()) {
    return sanitizeFileStem(preferredTitle);
  }
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const lastSegment = segments.length > 0 ? segments[segments.length - 1] : undefined;
    if (lastSegment) {
      const decodedSegment = (() => {
        try {
          return decodeURIComponent(lastSegment);
        } catch {
          return lastSegment;
        }
      })();
      const withoutExt = decodedSegment.replace(/\.[a-z0-9]{1,8}$/i, "");
      return sanitizeFileStem(withoutExt);
    }
  } catch {
    // Fall through to trace-based naming.
  }
  return sanitizeFileStem(traceId);
};
