(function initFlowSelectLocaleUtils(root) {
  "use strict";

  const FALLBACK_LANGUAGE = "en";
  const LANGUAGE_STORAGE_KEY = "flowselectCurrentLanguage";
  const DEFAULT_NAMESPACES = ["extension", "common"];

  function isEnglishVariant(normalized) {
    return normalized === "en" || normalized.startsWith("en-");
  }

  function isChineseVariant(normalized) {
    return normalized === "zh" || normalized.startsWith("zh-");
  }

  function normalizeAppLanguage(value) {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim().replace(/_/g, "-").toLowerCase();
    if (!normalized) {
      return null;
    }

    if (isEnglishVariant(normalized)) {
      return "en";
    }

    if (isChineseVariant(normalized)) {
      return "zh-CN";
    }

    return null;
  }

  function resolvePreferredLanguage(cachedLanguage, navigatorLanguage) {
    return (
      normalizeAppLanguage(cachedLanguage) ||
      normalizeAppLanguage(navigatorLanguage) ||
      FALLBACK_LANGUAGE
    );
  }

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      if (!root.chrome?.storage?.local) {
        resolve({});
        return;
      }

      root.chrome.storage.local.get(keys, (result) => {
        if (root.chrome.runtime?.lastError) {
          reject(root.chrome.runtime.lastError);
          return;
        }
        resolve(result);
      });
    });
  }

  async function getCachedLanguage() {
    try {
      const result = await storageGet(LANGUAGE_STORAGE_KEY);
      return normalizeAppLanguage(result?.[LANGUAGE_STORAGE_KEY]);
    } catch (error) {
      console.error("[FlowSelect] Failed to load cached language:", error);
      return null;
    }
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      if (!root.chrome?.runtime?.sendMessage) {
        resolve(null);
        return;
      }

      try {
        root.chrome.runtime.sendMessage(message, (response) => {
          if (root.chrome.runtime?.lastError) {
            resolve(null);
            return;
          }
          resolve(response ?? null);
        });
      } catch (error) {
        console.error("[FlowSelect] Failed to send runtime message:", error);
        resolve(null);
      }
    });
  }

  async function resolveCurrentLanguage(navigatorLanguage = root.navigator?.language) {
    const backgroundResponse = await sendRuntimeMessage({ type: "get_language" });
    const backgroundLanguage = normalizeAppLanguage(backgroundResponse?.language);
    if (backgroundLanguage) {
      return backgroundLanguage;
    }

    const cachedLanguage = await getCachedLanguage();
    return resolvePreferredLanguage(cachedLanguage, navigatorLanguage);
  }

  async function loadLocaleNamespace(language, namespace) {
    if (!root.chrome?.runtime?.getURL) {
      throw new Error("chrome.runtime.getURL is unavailable");
    }

    const url = root.chrome.runtime.getURL(`locales/${language}/${namespace}.json`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load locale namespace: ${namespace}`);
    }

    return response.json();
  }

  async function loadLocaleBundle(language, options = {}) {
    const namespaces = Array.isArray(options.namespaces) && options.namespaces.length > 0
      ? options.namespaces
      : DEFAULT_NAMESPACES;
    const normalizedLanguage = resolvePreferredLanguage(
      language,
      options.navigatorLanguage ?? root.navigator?.language
    );

    try {
      const loadedNamespaces = await Promise.all(
        namespaces.map((namespace) => loadLocaleNamespace(normalizedLanguage, namespace))
      );

      const bundle = {
        language: normalizedLanguage,
        _namespaces: [...namespaces],
      };

      namespaces.forEach((namespace, index) => {
        bundle[namespace] = loadedNamespaces[index];
      });

      return bundle;
    } catch (error) {
      console.error("[FlowSelect] Failed to load locale bundle:", error);

      if (normalizedLanguage !== FALLBACK_LANGUAGE) {
        return loadLocaleBundle(FALLBACK_LANGUAGE, options);
      }

      const fallbackBundle = {
        language: FALLBACK_LANGUAGE,
        _namespaces: [...namespaces],
      };

      namespaces.forEach((namespace) => {
        fallbackBundle[namespace] = {};
      });

      return fallbackBundle;
    }
  }

  function readPath(source, path) {
    if (!source || typeof source !== "object") {
      return null;
    }

    const segments = path.split(".");
    let current = source;

    for (const segment of segments) {
      if (!current || typeof current !== "object" || !(segment in current)) {
        return null;
      }
      current = current[segment];
    }

    return typeof current === "string" ? current : null;
  }

  function translate(bundle, key, fallback = "") {
    const namespaces = Array.isArray(bundle?._namespaces) && bundle._namespaces.length > 0
      ? bundle._namespaces
      : ["extension", "common"];

    for (const namespace of namespaces) {
      const value = readPath(bundle?.[namespace], key);
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }

    return fallback || key;
  }

  function formatTemplate(template, values = {}) {
    if (typeof template !== "string" || template.length === 0) {
      return "";
    }

    return template.replace(/\{(\w+)\}/g, (match, key) => {
      if (!(key in values) || values[key] == null) {
        return match;
      }
      return String(values[key]);
    });
  }

  function translateTemplate(bundle, key, values, fallback = "") {
    return formatTemplate(translate(bundle, key, fallback), values);
  }

  root.FlowSelectLocaleUtils = {
    DEFAULT_NAMESPACES,
    FALLBACK_LANGUAGE,
    LANGUAGE_STORAGE_KEY,
    formatTemplate,
    getCachedLanguage,
    loadLocaleBundle,
    loadLocaleNamespace,
    normalizeAppLanguage,
    readPath,
    resolveCurrentLanguage,
    resolvePreferredLanguage,
    sendRuntimeMessage,
    storageGet,
    translate,
    translateTemplate,
  };
})(typeof self !== "undefined" ? self : window);
