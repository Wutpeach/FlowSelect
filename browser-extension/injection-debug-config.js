(function initFlowSelectInjectionDebugConfig(root) {
  "use strict";

  const STORAGE_KEY = "flowselectExtensionInjectionDebugEnabled";

  function normalizeEnabled(value) {
    return value === true;
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

  async function getEnabled() {
    if (!chrome?.storage?.local) {
      return false;
    }

    try {
      const result = await storageGet(STORAGE_KEY);
      return normalizeEnabled(result?.[STORAGE_KEY]);
    } catch (error) {
      console.error("[FlowSelect] Failed to load injection debug config:", error);
      return false;
    }
  }

  async function setEnabled(value) {
    const normalized = normalizeEnabled(value);
    if (!chrome?.storage?.local) {
      return normalized;
    }

    await storageSet({ [STORAGE_KEY]: normalized });
    return normalized;
  }

  function observe(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    const unsubscribeFns = [];

    if (chrome?.storage?.onChanged) {
      const storageListener = (changes, areaName) => {
        if (areaName !== "local" || !Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
          return;
        }

        callback(normalizeEnabled(changes[STORAGE_KEY]?.newValue));
      };

      chrome.storage.onChanged.addListener(storageListener);
      unsubscribeFns.push(() => {
        chrome.storage.onChanged.removeListener(storageListener);
      });
    }

    if (chrome?.runtime?.onMessage) {
      const messageListener = (message) => {
        if (message?.type !== "extension_injection_debug_config_update") {
          return;
        }

        callback(normalizeEnabled(message.enabled));
      };

      chrome.runtime.onMessage.addListener(messageListener);
      unsubscribeFns.push(() => {
        chrome.runtime.onMessage.removeListener(messageListener);
      });
    }

    return () => {
      for (const unsubscribe of unsubscribeFns) {
        unsubscribe();
      }
    };
  }

  root.FlowSelectInjectionDebugConfig = {
    STORAGE_KEY,
    getEnabled,
    normalizeEnabled,
    observe,
    setEnabled,
  };
})(typeof self !== "undefined" ? self : window);
