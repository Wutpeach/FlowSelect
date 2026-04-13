import type { DownloadSiteStrategyEntry } from "./types.js";

export const runtimeManualSiteStrategies = [
  {
    siteId: "youtube",
    displayName: "YouTube",
    sourceId: "flowselect-manual-sites",
    strategyKind: "single_engine",
    engineOrder: ["yt-dlp"],
    matchHints: {
      hosts: ["youtube.com", "youtu.be"],
    },
  },
  {
    siteId: "bilibili",
    displayName: "Bilibili",
    sourceId: "flowselect-manual-sites",
    strategyKind: "single_engine",
    engineOrder: ["yt-dlp"],
    matchHints: {
      hosts: ["bilibili.com", "b23.tv", "bilivideo.com"],
    },
  },
  {
    siteId: "twitter-x",
    displayName: "Twitter/X",
    sourceId: "flowselect-manual-sites",
    strategyKind: "single_engine",
    engineOrder: ["yt-dlp"],
    matchHints: {
      hosts: ["x.com", "twitter.com"],
    },
  },
  {
    siteId: "douyin",
    displayName: "Douyin",
    sourceId: "flowselect-manual-sites",
    strategyKind: "conditional_direct",
    engineOrder: ["direct", "yt-dlp"],
    matchHints: {
      hosts: ["douyin.com", "douyinvod.com", "douyincdn.com"],
    },
  },
  {
    siteId: "xiaohongshu",
    displayName: "Xiaohongshu",
    sourceId: "flowselect-manual-sites",
    strategyKind: "conditional_direct",
    engineOrder: ["direct", "yt-dlp"],
    matchHints: {
      hosts: ["xiaohongshu.com", "xhslink.com", "xhscdn.com"],
    },
  },
  {
    siteId: "pinterest",
    displayName: "Pinterest",
    sourceId: "flowselect-manual-sites",
    strategyKind: "conditional_direct",
    engineOrder: ["direct", "gallery-dl"],
    matchHints: {
      hosts: ["pinterest.com", "pin.it", "pinimg.com"],
    },
  },
  {
    siteId: "weibo",
    displayName: "Weibo",
    sourceId: "flowselect-manual-sites",
    strategyKind: "ordered_fallback",
    engineOrder: ["gallery-dl", "yt-dlp"],
    matchHints: {
      hosts: ["weibo.com", "weibo.cn", "m.weibo.com", "m.weibo.cn", "video.weibo.com"],
    },
  },
  {
    siteId: "generic",
    displayName: "Generic",
    sourceId: "flowselect-manual-sites",
    strategyKind: "single_engine",
    engineOrder: ["yt-dlp"],
    notes: ["Default project strategy when no explicit site strategy matches."],
  },
] satisfies readonly DownloadSiteStrategyEntry[];

export const getRuntimeManualSiteStrategy = (
  siteId: string,
): DownloadSiteStrategyEntry => {
  const strategy = runtimeManualSiteStrategies.find((entry) => entry.siteId === siteId);
  if (!strategy) {
    throw new Error(`Missing runtime manual site strategy for ${siteId}`);
  }
  return strategy;
};
