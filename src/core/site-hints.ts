export type KnownSiteHint =
  | "youtube"
  | "bilibili"
  | "twitter-x"
  | "douyin"
  | "xiaohongshu"
  | "pinterest"
  | "generic";

export const normalizeSiteHint = (
  value: string | null | undefined,
): KnownSiteHint | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  switch (normalized) {
    case "youtube":
    case "youtu":
    case "yt":
    case "youtu.be":
      return "youtube";
    case "bilibili":
    case "bili":
    case "b23":
      return "bilibili";
    case "twitter":
    case "x":
    case "twitter-x":
      return "twitter-x";
    case "douyin":
      return "douyin";
    case "xiaohongshu":
    case "xhs":
      return "xiaohongshu";
    case "pinterest":
      return "pinterest";
    case "generic":
      return "generic";
    default:
      return undefined;
  }
};

export const detectSiteHintFromUrl = (
  value: string | null | undefined,
): KnownSiteHint | undefined => {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const lower = value.toLowerCase();

  if (lower.includes("youtube.com/") || lower.includes("youtu.be/")) {
    return "youtube";
  }
  if (
    lower.includes("bilibili.com/")
    || lower.includes("b23.tv/")
    || lower.includes("bilivideo.com/")
  ) {
    return "bilibili";
  }
  if (lower.includes("twitter.com/") || lower.includes("x.com/")) {
    return "twitter-x";
  }
  if (
    lower.includes("douyin.com/")
    || lower.includes("douyinvod.com/")
    || lower.includes("douyincdn.com/")
    || lower.includes("bytecdn")
    || lower.includes("bytedance")
  ) {
    return "douyin";
  }
  if (
    lower.includes("xiaohongshu.com/")
    || lower.includes("xhslink.com/")
    || lower.includes("xhscdn.com/")
  ) {
    return "xiaohongshu";
  }
  if (
    lower.includes("pinterest.com/")
    || lower.includes("pinimg.com/")
  ) {
    return "pinterest";
  }

  return undefined;
};

export const resolveSiteHint = (
  ...values: Array<string | null | undefined>
): KnownSiteHint | undefined => {
  for (const value of values) {
    const normalized = normalizeSiteHint(value);
    if (normalized) {
      return normalized;
    }
  }

  for (const value of values) {
    const detected = detectSiteHintFromUrl(value);
    if (detected) {
      return detected;
    }
  }

  return undefined;
};
