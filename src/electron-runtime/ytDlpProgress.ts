import type { DownloadProgressPayload, DownloadStage } from "../types/videoRuntime.js";

const percentPattern = /\[download\]\s+(\d+(?:\.\d+)?)%/i;
const speedPattern = /at\s+(.+?)\s+ETA/i;
const etaPattern = /ETA\s+([0-9:]+)/i;

const trimOrEmpty = (value: string | undefined): string => value?.trim() ?? "";

const isPostProcessingLine = (line: string): boolean => {
  const normalized = line.toLowerCase();
  return normalized.includes("post-process")
    || normalized.includes("embedding metadata")
    || normalized.includes("deleting original file");
};

const stageFromLine = (line: string): DownloadStage => {
  const normalized = line.toLowerCase();
  if (normalized.includes("merging")) {
    return "merging";
  }
  if (isPostProcessingLine(normalized)) {
    return "post_processing";
  }
  if (normalized.includes("[download]")) {
    return "downloading";
  }
  return "preparing";
};

export const parseYtDlpProgressLine = (
  traceId: string,
  line: string,
): DownloadProgressPayload | null => {
  const normalized = line.toLowerCase();
  const percentMatch = percentPattern.exec(line);
  const percent = percentMatch ? Number(percentMatch[1]) : null;
  if (
    percent === null
    && !normalized.includes("merging")
    && !isPostProcessingLine(normalized)
  ) {
    return null;
  }

  return {
    traceId,
    percent: percent ?? 100,
    stage: stageFromLine(line),
    speed: trimOrEmpty(speedPattern.exec(line)?.[1]) || stageFromLine(line),
    eta: trimOrEmpty(etaPattern.exec(line)?.[1]),
  };
};

