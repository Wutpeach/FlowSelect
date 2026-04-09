(function (globalScope) {
  "use strict";

  function normalizeMediaType(value) {
    return value === "image" || value === "video" ? value : null;
  }

  function normalizeConfidence(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return 0;
    }
    if (value <= 0) {
      return 0;
    }
    if (value >= 1) {
      return 1;
    }
    return Math.round(value * 1000) / 1000;
  }

  function hasResolvedXiaohongshuDragMedia(result, options = {}) {
    if (!result || typeof result !== "object") {
      return false;
    }

    const normalizedMediaType = normalizeMediaType(options.mediaType);
    const videoIntentConfidence = Math.max(
      normalizeConfidence(options.videoIntentConfidence),
      normalizeConfidence(result.videoIntentConfidence),
    );
    const videoUrl = typeof result.videoUrl === "string" ? result.videoUrl.trim() : "";
    const videoCandidates = Array.isArray(result.videoCandidates) ? result.videoCandidates : [];
    const imageUrl = typeof result.imageUrl === "string" ? result.imageUrl.trim() : "";

    if (result.kind === "video" || videoUrl || videoCandidates.length > 0 || videoIntentConfidence >= 0.7) {
      return true;
    }

    return normalizedMediaType === "image" && result.kind === "image" && Boolean(imageUrl);
  }

  globalScope.FlowSelectXiaohongshuDragResolutionUtils = {
    hasResolvedXiaohongshuDragMedia,
  };
})(typeof self !== "undefined" ? self : globalThis);
