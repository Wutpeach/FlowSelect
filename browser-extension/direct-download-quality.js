(function initFlowSelectDirectDownloadQuality(root) {
  "use strict";

  const STORAGE_KEY = "defaultVideoDownloadQuality";
  const LEGACY_STORAGE_KEY = "defaultDirectDownloadQuality";
  const DEFAULT_QUALITY_PREFERENCE = "balanced";
  const QUALITY_PREFERENCE_OPTIONS = Object.freeze([
    {
      value: "best",
      labelKey: "preferences.downloadQuality.options.best.label",
      descriptionKey: "preferences.downloadQuality.options.best.description",
    },
    {
      value: "balanced",
      labelKey: "preferences.downloadQuality.options.balanced.label",
      descriptionKey: "preferences.downloadQuality.options.balanced.description",
    },
    {
      value: "data_saver",
      labelKey: "preferences.downloadQuality.options.data_saver.label",
      descriptionKey: "preferences.downloadQuality.options.data_saver.description",
    },
  ]);

  function normalizeQualityPreference(value) {
    if (value === "high") return "balanced";
    if (value === "standard") return "data_saver";
    if (QUALITY_PREFERENCE_OPTIONS.some((option) => option.value === value)) {
      return value;
    }
    return DEFAULT_QUALITY_PREFERENCE;
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

    await storageSet({
      [STORAGE_KEY]: normalized,
      [LEGACY_STORAGE_KEY]: normalized,
    });
    return normalized;
  }

  root.FlowSelectDirectDownloadQuality = {
    STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    DEFAULT_QUALITY_PREFERENCE,
    QUALITY_PREFERENCE_OPTIONS,
    getQualityPreference,
    normalizeQualityPreference,
    setQualityPreference,
  };
})(typeof self !== "undefined" ? self : window);
