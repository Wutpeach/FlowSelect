(function initFlowSelectDirectDownloadQuality(root) {
  "use strict";

  const STORAGE_KEY = "defaultVideoDownloadQuality";
  const LEGACY_STORAGE_KEY = "defaultDirectDownloadQuality";
  const DEFAULT_QUALITY_PREFERENCE = "best";
  const QUALITY_PREFERENCE_OPTIONS = Object.freeze([
    {
      value: "best",
      label: "Auto",
      description: "Keep the current best-available behavior.",
    },
    {
      value: "balanced",
      label: "1080p",
      description: "Ask yt-dlp for 1080p when available, then fall back gracefully.",
    },
    {
      value: "data_saver",
      label: "360p",
      description: "Ask yt-dlp for 360p, otherwise fall back to the lowest available tier.",
    },
  ]);

  const QUALITY_SCORE_RULES = [
    { pattern: /(?:^|[^\d])(4320|8k)(?:p|[^\d]|$)/i, score: 4320 },
    { pattern: /(?:^|[^\d])2160(?:p|[^\d]|$)|\b4k\b|\buhd\b/i, score: 2160 },
    { pattern: /(?:^|[^\d])1440(?:p|[^\d]|$)|\b2k\b|\bqhd\b/i, score: 1440 },
    { pattern: /(?:^|[^\d])1080(?:p|[^\d]|$)|\bfhd\b|fullhd/i, score: 1080 },
    { pattern: /(?:^|[^\d])960(?:p|[^\d]|$)/i, score: 960 },
    { pattern: /(?:^|[^\d])720(?:p|[^\d]|$)|\bhd\b/i, score: 720 },
    { pattern: /(?:^|[^\d])540(?:p|[^\d]|$)/i, score: 540 },
    { pattern: /(?:^|[^\d])480(?:p|[^\d]|$)|\bsd\b/i, score: 480 },
    { pattern: /(?:^|[^\d])360(?:p|[^\d]|$)|\bld\b|\blow\b|\bsmooth\b/i, score: 360 },
    { pattern: /(?:^|[^\d])240(?:p|[^\d]|$)/i, score: 240 },
  ];

  function normalizeQualityPreference(value) {
    if (value === "high") return "balanced";
    if (value === "standard") return "data_saver";
    if (QUALITY_PREFERENCE_OPTIONS.some((option) => option.value === value)) {
      return value;
    }
    return DEFAULT_QUALITY_PREFERENCE;
  }

  function decodeToken(value) {
    if (typeof value !== "string") return "";
    try {
      return decodeURIComponent(value);
    } catch (_) {
      return value;
    }
  }

  function inferQualityScoreFromText(value) {
    const text = decodeToken(value).toLowerCase();
    if (!text) return null;

    let bestScore = null;
    for (const rule of QUALITY_SCORE_RULES) {
      if (rule.pattern.test(text)) {
        bestScore = Math.max(bestScore ?? 0, rule.score);
      }
    }

    return bestScore;
  }

  function inferQualityScoreFromUrl(url) {
    if (typeof url !== "string" || !url) return null;

    let bestScore = inferQualityScoreFromText(url);
    try {
      const parsed = new URL(url);
      for (const [key, value] of parsed.searchParams.entries()) {
        bestScore = Math.max(
          bestScore ?? 0,
          inferQualityScoreFromText(`${key}=${value}`) ?? 0
        );
      }
    } catch (_) {
      // Ignore invalid URLs and fall back to plain string heuristics.
    }

    return bestScore && bestScore > 0 ? bestScore : null;
  }

  function getDirectPlatform(urls) {
    for (const rawUrl of urls) {
      if (typeof rawUrl !== "string" || !rawUrl) continue;
      const url = rawUrl.toLowerCase();
      if (url.includes("douyin.com") || url.includes("douyinvod.com") || url.includes("douyincdn.com")) {
        return "douyin";
      }
      if (url.includes("xiaohongshu.com") || url.includes("xhslink.com") || url.includes("xhscdn.com")) {
        return "xiaohongshu";
      }
    }
    return null;
  }

  function isDirectUrlForPlatform(platform, url) {
    if (typeof url !== "string" || !url) return false;
    const lower = url.toLowerCase();
    if (lower.startsWith("blob:") || /\.m3u8(\?|$)/i.test(lower)) return false;

    if (platform === "douyin") {
      return (
        lower.includes("douyinvod.com") ||
        lower.includes("douyincdn.com") ||
        lower.includes("bytecdn") ||
        lower.includes("bytedance")
      );
    }

    if (platform === "xiaohongshu") {
      return lower.includes("xhscdn.com");
    }

    return false;
  }

  function prioritizeCandidatesForHighestQuality(candidates, platform) {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];
    if (!platform) {
      return candidates.slice();
    }

    const directEntries = [];
    const passthroughEntries = [];

    candidates.forEach((candidate, index) => {
      if (isDirectUrlForPlatform(platform, candidate?.url)) {
        directEntries.push({
          candidate,
          index,
          qualityScore: inferQualityScoreFromUrl(candidate.url),
        });
      } else {
        passthroughEntries.push({ candidate, index });
      }
    });

    if (directEntries.length === 0 || directEntries.every((entry) => entry.qualityScore == null)) {
      return candidates.slice();
    }

    directEntries.sort((left, right) => {
      const leftScore = left.qualityScore;
      const rightScore = right.qualityScore;
      if (leftScore == null && rightScore == null) return left.index - right.index;
      if (leftScore == null) return 1;
      if (rightScore == null) return -1;
      if (rightScore !== leftScore) return rightScore - leftScore;
      return left.index - right.index;
    });

    return directEntries
      .map((entry) => entry.candidate)
      .concat(passthroughEntries.map((entry) => entry.candidate));
  }

  function selectPreferredVideoUrl(candidates, platform, fallbackVideoUrl) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return fallbackVideoUrl || null;
    }

    const preferredDirect = candidates.find((candidate) =>
      isDirectUrlForPlatform(platform, candidate?.url)
    );
    if (preferredDirect?.url) {
      return preferredDirect.url;
    }

    const preferredGeneric = candidates.find(
      (candidate) => typeof candidate?.url === "string" && candidate.type !== "manifest_m3u8"
    );
    return preferredGeneric?.url || fallbackVideoUrl || null;
  }

  function storageGet(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(key, (result) => {
        if (chrome.runtime?.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(result);
      });
    });
  }

  function storageSet(payload) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(payload, () => {
        if (chrome.runtime?.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }

  async function getQualityPreference() {
    if (!chrome?.storage?.local) {
      return DEFAULT_QUALITY_PREFERENCE;
    }

    try {
      const result = await storageGet([STORAGE_KEY, LEGACY_STORAGE_KEY]);
      return normalizeQualityPreference(result?.[STORAGE_KEY] ?? result?.[LEGACY_STORAGE_KEY]);
    } catch (error) {
      console.error("[FlowSelect] Failed to load quality preference:", error);
      return DEFAULT_QUALITY_PREFERENCE;
    }
  }

  async function setQualityPreference(value) {
    const normalized = normalizeQualityPreference(value);
    if (!chrome?.storage?.local) {
      return normalized;
    }

    await storageSet({ [STORAGE_KEY]: normalized });
    return normalized;
  }

  root.FlowSelectDirectDownloadQuality = {
    STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    DEFAULT_QUALITY_PREFERENCE,
    QUALITY_PREFERENCE_OPTIONS,
    getDirectPlatform,
    getQualityPreference,
    inferQualityScoreFromUrl,
    normalizeQualityPreference,
    prioritizeCandidatesForHighestQuality,
    selectPreferredVideoUrl,
    setQualityPreference,
  };
})(typeof self !== "undefined" ? self : window);
