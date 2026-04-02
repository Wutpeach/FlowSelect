import type { RawDownloadInput, ResolvedDownloadPlan, SiteProvider } from "../core/index.js";
import {
  buildGalleryDlVideoIntent,
  isGalleryDlSupportedUrl,
  resolveGalleryDlSiteId,
} from "./gallery-dl-support.js";

export const galleryDlSupportedProvider: SiteProvider = {
  id: "gallery-dl-supported",
  matches(input: RawDownloadInput): boolean {
    return isGalleryDlSupportedUrl(input.pageUrl) || isGalleryDlSupportedUrl(input.url);
  },
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan {
    const sourceUrl = input.pageUrl ?? input.url;
    const siteId = resolveGalleryDlSiteId(sourceUrl, input.siteHint);

    return {
      providerId: "gallery-dl-supported",
      label: input.title?.trim() || input.pageUrl || input.url,
      intent: buildGalleryDlVideoIntent(input, siteId),
      engines: [
        {
          engine: "gallery-dl",
          priority: 88,
          when: "primary",
          reason: "This site is listed by gallery-dl and should use its maintained extractor first",
          sourceUrl,
          fallbackOn: "any",
        },
        {
          engine: "yt-dlp",
          priority: 52,
          when: "fallback",
          reason: "Use yt-dlp as the generic fallback when gallery-dl cannot complete the extraction",
          sourceUrl,
          fallbackOn: "any",
        },
      ],
    };
  },
};
