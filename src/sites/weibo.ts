import type { RawDownloadInput, ResolvedDownloadPlan, SiteProvider } from "../core/index.js";
import {
  buildGalleryDlVideoIntent,
  isWeiboTvShowUrl,
  resolveWeiboSourceUrl,
  resolveWeiboGalleryDlSourceUrl,
} from "./gallery-dl-support.js";

export const weiboProvider: SiteProvider = {
  id: "weibo",
  matches(input: RawDownloadInput): boolean {
    return input.siteHint === "weibo"
      || Boolean(resolveWeiboSourceUrl(input.pageUrl))
      || Boolean(resolveWeiboSourceUrl(input.url));
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
    const originalSourceUrl = input.pageUrl ?? input.url;
    const resolvedSourceUrl = resolveWeiboSourceUrl(originalSourceUrl) ?? originalSourceUrl;

    if (isWeiboTvShowUrl(resolvedSourceUrl)) {
      return {
        providerId: "weibo",
        label: input.title?.trim() || input.pageUrl || input.url,
        intent: buildGalleryDlVideoIntent(input, "weibo"),
        engines: [
          {
            engine: "yt-dlp",
            priority: 96,
            when: "primary",
            reason: "Weibo tv/show pages are supported by yt-dlp but not by gallery-dl",
            sourceUrl: resolvedSourceUrl,
            fallbackOn: "any",
          },
        ],
      };
    }

    const galleryDlSourceUrl = resolveWeiboGalleryDlSourceUrl(resolvedSourceUrl) ?? resolvedSourceUrl;

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
          sourceUrl: resolvedSourceUrl,
          fallbackOn: "any",
        },
      ],
    };
  },
};
