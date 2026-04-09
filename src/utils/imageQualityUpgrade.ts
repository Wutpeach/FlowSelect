import { resolveMaxurlUpgrade } from "./maxurlAdapter";
import { upgradeTwitterXImageUrl } from "./twitterX";
import { upgradeWeiboImageUrl } from "./weiboImageUpgrade";

export type ImageQualityUpgradeResult = {
  originalUrl: string;
  upgradedUrl: string | null;
  strategy: "none" | "weibo_override" | "twitter_x_override" | "maxurl";
  confidence: "low" | "medium" | "high";
  notes: string[];
  requestHeaders?: Record<string, string>;
};

function parseHttpUrl(raw: string): URL | null {
  if (typeof raw !== "string" || !/^https?:\/\//i.test(raw.trim())) {
    return null;
  }

  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export async function upgradeImageUrl(input: {
  imageUrl: string;
  pageUrl?: string | null;
}): Promise<ImageQualityUpgradeResult> {
  const originalUrl = parseHttpUrl(input.imageUrl);
  if (!originalUrl) {
    return {
      originalUrl: input.imageUrl,
      upgradedUrl: null,
      strategy: "none",
      confidence: "low",
      notes: ["image quality upgrade only supports HTTP(S) URLs"],
    };
  }

  const weiboUpgradedUrl = upgradeWeiboImageUrl(originalUrl.toString());
  if (weiboUpgradedUrl && weiboUpgradedUrl !== originalUrl.toString()) {
    return {
      originalUrl: originalUrl.toString(),
      upgradedUrl: weiboUpgradedUrl,
      strategy: "weibo_override",
      confidence: "high",
      notes: ["matched known sinaimg size bucket and upgraded to a larger variant"],
    };
  }

  const twitterXUpgradedUrl = upgradeTwitterXImageUrl(originalUrl.toString());
  if (twitterXUpgradedUrl && twitterXUpgradedUrl !== originalUrl.toString()) {
    return {
      originalUrl: originalUrl.toString(),
      upgradedUrl: twitterXUpgradedUrl,
      strategy: "twitter_x_override",
      confidence: "high",
      notes: ["matched known pbs.twimg.com variant and upgraded to the original image size"],
    };
  }

  try {
    const maxurlUpgrade = await resolveMaxurlUpgrade(originalUrl.toString());
    if (maxurlUpgrade && maxurlUpgrade.url !== originalUrl.toString()) {
      return {
        originalUrl: originalUrl.toString(),
        upgradedUrl: maxurlUpgrade.url,
        strategy: "maxurl",
        confidence: maxurlUpgrade.confidence,
        notes: maxurlUpgrade.notes,
        requestHeaders: Object.keys(maxurlUpgrade.headers).length > 0
          ? maxurlUpgrade.headers
          : undefined,
      };
    }
  } catch (error) {
    return {
      originalUrl: originalUrl.toString(),
      upgradedUrl: null,
      strategy: "none",
      confidence: "low",
      notes: [
        "maxurl upgrade failed; falling back to the original image URL",
        error instanceof Error ? error.message : String(error),
      ],
    };
  }

  return {
    originalUrl: originalUrl.toString(),
    upgradedUrl: null,
    strategy: "none",
    confidence: "low",
    notes: ["no safe larger image candidate was found"],
  };
}
