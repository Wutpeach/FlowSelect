import type { MediaCandidate } from "./media-candidate.js";
import type { DownloadSelectionScope, YtdlpQualityPreference } from "./raw-download-input.js";

type BaseIntent = {
  siteId: string;
  originalUrl: string;
  pageUrl?: string;
  title?: string;
  cookies?: string;
  userAgent?: string;
  referer?: string;
  priority: number;
  candidates: MediaCandidate[];
  selectionScope?: DownloadSelectionScope;
  ytdlpQuality?: YtdlpQualityPreference;
  extensionData?: Record<string, unknown>;
};

export type VideoDownloadIntent = BaseIntent & {
  type: "video";
  preferredFormat: "mp4" | "webm" | "best";
  clipStartSec?: number;
  clipEndSec?: number;
};

export type ImageDownloadIntent = BaseIntent & {
  type: "image";
  saveAsAlbum?: boolean;
};

export type SegmentDownloadIntent = BaseIntent & {
  type: "segment";
  startTime: number;
  endTime: number;
};

export type BatchDownloadIntent = BaseIntent & {
  type: "batch";
  itemCountHint?: number;
};

export type DirectDownloadIntent = BaseIntent & {
  type: "direct";
  directUrl: string;
};

export type DownloadIntent =
  | VideoDownloadIntent
  | ImageDownloadIntent
  | SegmentDownloadIntent
  | BatchDownloadIntent
  | DirectDownloadIntent;
