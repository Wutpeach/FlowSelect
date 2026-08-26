import type { YtdlpQualityPreference } from "../core/index.js";

// Infrastructure keeps its own closed CLI union: only these two engines have
// concrete CLI manifests. Domain/Application identity is open (`EngineId`).
type CliEngineId = "yt-dlp" | "gallery-dl";

type YtdlpMergeOutputFormat = "mp4" | "mp4/mkv" | null;

export type YtdlpFormatProfile = {
  selector: string;
  sort: string | null;
  mergeOutputFormat: YtdlpMergeOutputFormat;
};

type YtdlpFormatProfileSet = Record<YtdlpQualityPreference, YtdlpFormatProfile>;

type YtdlpManifest = {
  id: "yt-dlp";
  binaryKey: "ytDlp";
  configIsolationArgs: readonly string[];
  baseArgs: readonly string[];
  encodingArgs: readonly string[];
  progressArgs: readonly string[];
  progressReport: {
    finalPathPrint: string;
    titlePrint: string;
  };
  youtube: {
    extendedExtractorArgs: readonly string[];
    retryingCompatibleExtractorActivity: string;
  };
  siteFormatProfiles: Record<string, YtdlpFormatProfileSet>;
};

type GalleryDlManifest = {
  id: "gallery-dl";
  binaryKey: "galleryDl";
  configIsolationArgs: readonly string[];
  baseArgs: readonly string[];
  outputArgs: {
    directoryFlag: string;
    filenameFlag: string;
    extensionTemplate: string;
  };
  sidecarExtensions: readonly string[];
  progress: {
    lineTailLimit: number;
    resolvingActivity: string;
  };
};

type CliEngineManifest = YtdlpManifest | GalleryDlManifest;
type YtdlpSiteFormatProfiles = Record<string, YtdlpFormatProfileSet>;

const YTDLP_FORMAT_SELECTOR_BEST = "bestvideo+bestaudio/best";
const YTDLP_FORMAT_SELECTOR_BALANCED = [
  "bv*[height=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[height=1080][ext=mp4]+ba[ext=m4a]/",
  "b[height=1080][vcodec^=avc1][ext=mp4]/",
  "b[height=1080][ext=mp4]/",
  "best[height=1080][ext=mp4]/",
  "bv*[height<=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/",
  "b[height<=1080][vcodec^=avc1][ext=mp4]/",
  "b[height<=1080][ext=mp4]/",
  "best[height<=1080][ext=mp4]/",
  "bv*[vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[ext=mp4]+ba[ext=m4a]/",
  "b[vcodec^=avc1][ext=mp4]/",
  "b[ext=mp4]/",
  "best[ext=mp4]/",
  "best",
].join("");
const YTDLP_FORMAT_SELECTOR_DATA_SAVER = [
  "bv*[height=360][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[height=360][ext=mp4]+ba[ext=m4a]/",
  "b[height=360][vcodec^=avc1][ext=mp4]/",
  "b[height=360][ext=mp4]/",
  "best[height=360][ext=mp4]/",
  "bv*[height<360][ext=mp4]+ba[ext=m4a]/",
  "b[height<360][ext=mp4]/",
  "best[height<360][ext=mp4]/",
  "worstvideo[ext=mp4]+ba[ext=m4a]/",
  "worst[ext=mp4]/",
  "worst",
].join("");
const YTDLP_YOUTUBE_FORMAT_SELECTOR_BALANCED = [
  "bv*[height=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[height=1080][ext=mp4]+ba[ext=m4a]/",
  "b[height=1080][vcodec^=avc1][ext=mp4]/",
  "b[height=1080][ext=mp4]/",
  "best[height=1080][ext=mp4]/",
  "bv*[height<=1080][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/",
  "b[height<=1080][vcodec^=avc1][ext=mp4]/",
  "b[height<=1080][ext=mp4]/",
  "best[height<=1080][ext=mp4]/",
  "best[ext=mp4]/",
  "best",
].join("");
const YTDLP_YOUTUBE_FORMAT_SELECTOR_DATA_SAVER = [
  "bv*[height=360][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[height=360][ext=mp4]+ba[ext=m4a]/",
  "b[height=360][vcodec^=avc1][ext=mp4]/",
  "b[height=360][ext=mp4]/",
  "best[height=360][ext=mp4]/",
  "bv*[height<=360][vcodec^=avc1][ext=mp4]+ba[acodec^=mp4a][ext=m4a]/",
  "bv*[height<=360][ext=mp4]+ba[ext=m4a]/",
  "b[height<=360][vcodec^=avc1][ext=mp4]/",
  "b[height<=360][ext=mp4]/",
  "best[height<=360][ext=mp4]/",
  "worstvideo[ext=mp4]+ba[ext=m4a]/",
  "worst[ext=mp4]/",
  "worst",
].join("");
const YTDLP_YOUTUBE_SECTION_RETRY_FORMAT_SELECTOR_BEST = [
  "bv*[vcodec^=avc1][ext=mp4][protocol^=http][protocol!*=dash]+ba[acodec^=mp4a][ext=m4a][protocol^=http][protocol!*=dash]/",
  "bv*[vcodec^=avc1][ext=mp4][protocol^=http][protocol!*=dash]+ba[ext=m4a][protocol^=http][protocol!*=dash]/",
  "bv*[ext=mp4][protocol^=http][protocol!*=dash]+ba[acodec^=mp4a][ext=m4a][protocol^=http][protocol!*=dash]/",
  "bv*[ext=mp4][protocol^=http][protocol!*=dash]+ba[ext=m4a][protocol^=http][protocol!*=dash]/",
  "b[vcodec^=avc1][ext=mp4][protocol^=http][protocol!*=dash]/",
  "b[ext=mp4][protocol^=http][protocol!*=dash]/",
  "best[ext=mp4][protocol^=http][protocol!*=dash]",
].join("");
const YTDLP_YOUTUBE_SECTION_RETRY_FORMAT_SELECTOR_BALANCED = [
  "bv*[height=1080][vcodec^=avc1][ext=mp4][protocol^=http][protocol!*=dash]+ba[acodec^=mp4a][ext=m4a][protocol^=http][protocol!*=dash]/",
  "b[height=1080][vcodec^=avc1][ext=mp4][protocol^=http][protocol!*=dash]/",
  "bv*[height<=1080][vcodec^=avc1][ext=mp4][protocol^=http][protocol!*=dash]+ba[acodec^=mp4a][ext=m4a][protocol^=http][protocol!*=dash]/",
  "b[height<=1080][vcodec^=avc1][ext=mp4][protocol^=http][protocol!*=dash]/",
  "best[height<=1080][vcodec^=avc1][ext=mp4][protocol^=http][protocol!*=dash]",
].join("");
const YTDLP_YOUTUBE_SECTION_RETRY_FORMAT_SELECTOR_DATA_SAVER = [
  "bv*[height=360][vcodec^=avc1][ext=mp4][protocol^=http][protocol!*=dash]+ba[acodec^=mp4a][ext=m4a][protocol^=http][protocol!*=dash]/",
  "b[height=360][vcodec^=avc1][ext=mp4][protocol^=http][protocol!*=dash]/",
  "bv*[height<=360][vcodec^=avc1][ext=mp4][protocol^=http][protocol!*=dash]+ba[acodec^=mp4a][ext=m4a][protocol^=http][protocol!*=dash]/",
  "b[height<=360][vcodec^=avc1][ext=mp4][protocol^=http][protocol!*=dash]/",
  "worst[ext=mp4][protocol^=http][protocol!*=dash]",
].join("");

const YTDLP_SITE_FORMAT_PROFILES: YtdlpSiteFormatProfiles = {
  default: {
    best: {
      selector: YTDLP_FORMAT_SELECTOR_BEST,
      sort: "res,codec:h264,acodec:aac,ext",
      mergeOutputFormat: "mp4/mkv",
    },
    balanced: {
      selector: YTDLP_FORMAT_SELECTOR_BALANCED,
      sort: "ext:mp4:m4a",
      mergeOutputFormat: "mp4",
    },
    data_saver: {
      selector: YTDLP_FORMAT_SELECTOR_DATA_SAVER,
      sort: "ext:mp4:m4a",
      mergeOutputFormat: "mp4",
    },
  },
  youtube: {
    best: {
      selector: YTDLP_FORMAT_SELECTOR_BEST,
      sort: "res,codec:h264,acodec:aac,ext",
      mergeOutputFormat: "mp4/mkv",
    },
    balanced: {
      selector: YTDLP_YOUTUBE_FORMAT_SELECTOR_BALANCED,
      sort: "res,ext:mp4:m4a",
      mergeOutputFormat: "mp4",
    },
    data_saver: {
      selector: YTDLP_YOUTUBE_FORMAT_SELECTOR_DATA_SAVER,
      sort: "res,ext:mp4:m4a",
      mergeOutputFormat: "mp4",
    },
  },
};

export const CLI_ENGINE_MANIFESTS = {
  "yt-dlp": {
    id: "yt-dlp",
    binaryKey: "ytDlp",
    configIsolationArgs: ["--ignore-config", "--no-plugin-dirs"],
    baseArgs: [
      "--newline",
      "--no-warnings",
    ],
    progressArgs: ["--progress"],
    encodingArgs: ["--encoding", "utf-8"],
    progressReport: {
      finalPathPrint: "after_move:filepath",
      titlePrint: "after_move:title",
    },
    youtube: {
      extendedExtractorArgs: [
        "--extractor-args",
        "youtube:player_js_variant=tv",
      ],
      retryingCompatibleExtractorActivity: "activity:youtube.retryingCompatibleExtractor",
    },
    siteFormatProfiles: YTDLP_SITE_FORMAT_PROFILES,
  },
  "gallery-dl": {
    id: "gallery-dl",
    binaryKey: "galleryDl",
    configIsolationArgs: ["--config-ignore"],
    baseArgs: ["--write-info-json"],
    outputArgs: {
      directoryFlag: "--directory",
      filenameFlag: "--filename",
      extensionTemplate: "{extension}",
    },
    sidecarExtensions: ["json", "txt", "part"],
    progress: {
      lineTailLimit: 20,
      resolvingActivity: "activity:galleryDl.resolvingMedia",
    },
  },
} as const satisfies Record<CliEngineId, CliEngineManifest>;

export const getCliEngineManifest = <TId extends CliEngineId>(
  engineId: TId,
): (typeof CLI_ENGINE_MANIFESTS)[TId] => CLI_ENGINE_MANIFESTS[engineId];

const resolveYtdlpSiteProfileKey = (
  siteId: string | undefined,
  options?: { isYouTube?: boolean },
): string => {
  if (options?.isYouTube === true) {
    return "youtube";
  }
  return siteId ?? "default";
};

export const resolveYtdlpFormatProfile = (
  quality: YtdlpQualityPreference | undefined,
  hasFfmpeg: boolean,
  options?: { isYouTube?: boolean; siteId?: string },
): YtdlpFormatProfile => {
  const manifest = getCliEngineManifest("yt-dlp");
  const normalized = quality ?? "best";
  if (!hasFfmpeg) {
    switch (normalized) {
      case "balanced":
        return {
          selector: "best[height<=1080][ext=mp4]/best[ext=mp4]/best",
          sort: "ext:mp4:m4a",
          mergeOutputFormat: null,
        };
      case "data_saver":
        return {
          selector: "best[height<=360][ext=mp4]/worst[ext=mp4]/worst",
          sort: "ext:mp4:m4a",
          mergeOutputFormat: null,
        };
      case "best":
      default:
        return {
          selector: "best[ext=mp4]/best",
          sort: "res,codec:h264,acodec:aac,ext",
          mergeOutputFormat: null,
        };
    }
  }

  const siteProfileKey = resolveYtdlpSiteProfileKey(options?.siteId, options);
  const siteProfiles = manifest.siteFormatProfiles[siteProfileKey]
    ?? manifest.siteFormatProfiles.default;
  return siteProfiles[normalized];
};

export const resolveYtdlpSectionRetryFormatProfile = (
  quality: YtdlpQualityPreference | undefined,
  options?: { isYouTube?: boolean; siteId?: string },
): YtdlpFormatProfile | null => {
  if (options?.isYouTube !== true && options?.siteId !== "youtube") {
    return null;
  }

  switch (quality ?? "best") {
    case "balanced":
      return {
        selector: YTDLP_YOUTUBE_SECTION_RETRY_FORMAT_SELECTOR_BALANCED,
        sort: "proto:https,res,codec:h264,acodec:aac,ext:mp4:m4a",
        mergeOutputFormat: "mp4",
      };
    case "data_saver":
      return {
        selector: YTDLP_YOUTUBE_SECTION_RETRY_FORMAT_SELECTOR_DATA_SAVER,
        sort: "proto:https,res,codec:h264,acodec:aac,ext:mp4:m4a",
        mergeOutputFormat: "mp4",
      };
    case "best":
    default:
      return {
        selector: YTDLP_YOUTUBE_SECTION_RETRY_FORMAT_SELECTOR_BEST,
        sort: "proto:https,res,codec:h264,acodec:aac,ext:mp4:m4a",
        mergeOutputFormat: "mp4",
      };
  }
};
