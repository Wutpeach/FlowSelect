(function (globalScope) {
  "use strict";

  const DIRECT_VIDEO_EXT_RE = /\.(?:mp4|m4v|mov|webm)(?:[?#]|$)/i;
  const MANIFEST_EXT_RE = /\.(?:m3u8|mpd)(?:[?#]|$)/i;
  const INDIRECT_VIDEO_HINT_RE = /(?:video|stream|play|manifest|playlist|media|mp4|m3u8|mpd)/i;

  function normalizeHttpUrl(raw, baseUrl) {
    if (typeof raw !== "string") {
      return null;
    }

    const trimmed = raw.trim();
    if (!trimmed || /^(?:blob|data|file|javascript|mailto):/i.test(trimmed)) {
      return null;
    }

    try {
      const resolved = new URL(trimmed, baseUrl || "https://flowselect.invalid/").toString();
      return /^https?:\/\//i.test(resolved) ? resolved : null;
    } catch {
      return null;
    }
  }

  function classifyVideoCandidateType(rawUrl) {
    const url = normalizeHttpUrl(rawUrl);
    if (!url) {
      return "unknown";
    }

    if (DIRECT_VIDEO_EXT_RE.test(url)) {
      return "direct_mp4";
    }

    if (MANIFEST_EXT_RE.test(url)) {
      return "manifest_m3u8";
    }

    if (INDIRECT_VIDEO_HINT_RE.test(url)) {
      return "indirect_media";
    }

    return "unknown";
  }

  function candidateStrength(candidate) {
    const type = typeof candidate?.type === "string"
      ? candidate.type
      : classifyVideoCandidateType(candidate?.url);
    const confidence = typeof candidate?.confidence === "string" ? candidate.confidence : "low";

    let score = 0;
    switch (type) {
      case "direct_cdn":
        score += 120;
        break;
      case "direct_mp4":
        score += 110;
        break;
      case "indirect_media":
        score += 70;
        break;
      case "manifest_m3u8":
        score += 40;
        break;
      default:
        score += 10;
        break;
    }

    switch (confidence) {
      case "high":
        score += 30;
        break;
      case "medium":
        score += 18;
        break;
      default:
        score += 6;
        break;
    }

    return score;
  }

  function mergeVideoCandidates(...candidateLists) {
    const merged = new Map();

    candidateLists.forEach((list) => {
      if (!Array.isArray(list)) {
        return;
      }

      list.forEach((candidate) => {
        const url = normalizeHttpUrl(candidate?.url);
        if (!url) {
          return;
        }

        const normalizedCandidate = {
          url,
          type: typeof candidate?.type === "string" ? candidate.type : classifyVideoCandidateType(url),
          confidence: typeof candidate?.confidence === "string" ? candidate.confidence : "low",
          source: typeof candidate?.source === "string" ? candidate.source : "unknown",
          mediaType:
            candidate?.mediaType === "video" || candidate?.mediaType === "image"
              ? candidate.mediaType
              : undefined,
        };

        const existing = merged.get(url);
        if (!existing || candidateStrength(normalizedCandidate) > candidateStrength(existing)) {
          merged.set(url, normalizedCandidate);
        }
      });
    });

    return Array.from(merged.values()).sort(
      (left, right) => candidateStrength(right) - candidateStrength(left),
    );
  }

  function selectPreferredVideoUrl(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return null;
    }

    return (
      candidates.find((candidate) => candidate?.type === "direct_cdn")?.url ||
      candidates.find((candidate) => candidate?.type === "direct_mp4")?.url ||
      candidates.find((candidate) => candidate?.type === "indirect_media")?.url ||
      candidates.find((candidate) => candidate?.type === "manifest_m3u8")?.url ||
      null
    );
  }

  globalScope.FlowSelectGenericVideoSelectionUtils = {
    classifyVideoCandidateType,
    mergeVideoCandidates,
    normalizeHttpUrl,
    selectPreferredVideoUrl,
  };
})(typeof self !== "undefined" ? self : globalThis);
