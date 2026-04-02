import type { RawDownloadInput, ResolvedDownloadPlan, SiteProvider } from "../core/index.js";
import {
  buildGalleryDlVideoIntent,
  isWeiboUrl,
  resolveWeiboGalleryDlSourceUrl,
} from "./gallery-dl-support.js";

export const weiboProvider: SiteProvider = {
  id: "weibo",
  matches(input: RawDownloadInput): boolean {
    return input.siteHint === "weibo" || isWeiboUrl(input.pageUrl) || isWeiboUrl(input.url);
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
    const originalSourceUrl = input.pageUrl ?? input.url;
    const galleryDlSourceUrl = resolveWeiboGalleryDlSourceUrl(originalSourceUrl) ?? originalSourceUrl;

    return {
      providerId: "weibo",
      label: input.title?.trim() || input.pageUrl || input.url,
      intent: buildGalleryDlVideoIntent(input, "weibo"),
      engines: [
        {
          engine: "gallery-dl",
          priority: 92,
          when: "primary",
          reason: galleryDlSourceUrl === originalSourceUrl
            ? "Weibo downloads should prefer gallery-dl extraction"
            : "Normalize Weibo links to a canonical detail URL before gallery-dl extraction",
          sourceUrl: galleryDlSourceUrl,
          fallbackOn: "any",
        },
        {
          engine: "yt-dlp",
          priority: 54,
          when: "fallback",
          reason: "Use yt-dlp as a safe fallback when gallery-dl cannot resolve the Weibo page",
          sourceUrl: originalSourceUrl,
          fallbackOn: "any",
        },
      ],
    };
  },
};
