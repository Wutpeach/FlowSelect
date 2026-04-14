import type { RawDownloadInput, ResolvedDownloadPlan, SiteProvider } from "../core/index.js";
import { buildEnginePlansFromStrategySources } from "../download-capabilities/strategy-plans.js";
import { getRuntimeManualSiteStrategy } from "../download-capabilities/runtime-site-strategies.js";
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
    const strategy = getRuntimeManualSiteStrategy("weibo");

    if (isWeiboTvShowUrl(resolvedSourceUrl)) {
      return {
        providerId: "weibo",
        label: input.title?.trim() || input.pageUrl || input.url,
        intent: buildGalleryDlVideoIntent(input, "weibo"),
        engines: buildEnginePlansFromStrategySources(strategy, {
          "yt-dlp": {
            sourceUrl: resolvedSourceUrl,
            reason: "Weibo tv/show pages are supported by yt-dlp but not by gallery-dl",
          },
        }),
      };
    }

    const galleryDlSourceUrl = resolveWeiboGalleryDlSourceUrl(resolvedSourceUrl) ?? resolvedSourceUrl;

    return {
      providerId: "weibo",
      label: input.title?.trim() || input.pageUrl || input.url,
      intent: buildGalleryDlVideoIntent(input, "weibo"),
      engines: buildEnginePlansFromStrategySources(strategy, {
        "gallery-dl": {
          sourceUrl: galleryDlSourceUrl,
          reason: galleryDlSourceUrl === originalSourceUrl
            ? "Weibo downloads should prefer gallery-dl extraction"
            : "Normalize Weibo links to a canonical detail URL before gallery-dl extraction",
        },
        "yt-dlp": {
          sourceUrl: resolvedSourceUrl,
          reason: "Use yt-dlp as a safe fallback when gallery-dl cannot resolve the Weibo page",
        },
      }),
    };
  },
};
