import type { MediaCandidate } from "./media-candidate.js";

export type DownloadSelectionScope = "current_item" | "playlist";

export type YtdlpQualityPreference = "best" | "balanced" | "data_saver";

export type RawDownloadInput = {
  url: string;
  pageUrl?: string;
  videoUrl?: string;
  videoCandidates?: MediaCandidate[];
  title?: string;
  cookies?: string;
  selectionScope?: DownloadSelectionScope;
  clipStartSec?: number;
  clipEndSec?: number;
  ytdlpQuality?: YtdlpQualityPreference;
  siteHint?: string;
  diagnostics?: Record<string, unknown>;
};
