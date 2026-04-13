import type { DownloadErrorCode } from "../constants/error-codes.js";
import type { DownloadFailureClassification } from "../constants/error-classifications.js";

export type EngineId = "yt-dlp" | "gallery-dl" | "direct";

export type EnginePlan = {
  engine: EngineId;
  priority: number;
  when: "primary" | "fallback";
  reason: string;
  sourceUrl?: string;
  fallbackOn?: DownloadErrorCode[] | "any";
  fallbackOnClassifications?: DownloadFailureClassification[];
  options?: Record<string, unknown>;
};

export type ResolvedDownloadPlan = {
  providerId: string;
  label: string;
  intent: import("./download-intent.js").DownloadIntent;
  engines: EnginePlan[];
};
