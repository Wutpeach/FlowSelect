(function () {
  "use strict";

  const PAGE_BRIDGE_SCRIPT_PATH = "xiaohongshu-page-bridge.js";
  const PAGE_BRIDGE_MESSAGE_SOURCE = "flowselect-xiaohongshu-page";
  const PAGE_BRIDGE_EVENT_TYPE = "FLOWSELECT_XIAOHONGSHU_NOTE_LINKS";
  const NOTE_LINK_CACHE_KEY = "__FLOWSELECT_XHS_NOTE_LINK_CACHE";
  const NOTE_LINK_CACHE_NODE_ID = "flowselect-xhs-note-link-cache";

  let pageBridgeInjected = false;
  let pageBridgeInjectionPromise = null;

  function isXiaohongshuHost() {
    return /(?:^|\.)xiaohongshu\.com$/i.test(window.location.hostname)
      || /(?:^|\.)xhslink\.com$/i.test(window.location.hostname);
  }

  function normalizeString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  function normalizeNoteId(value) {
    const normalized = normalizeString(value);
    return normalized && /^[a-zA-Z0-9]+$/.test(normalized) ? normalized : null;
  }

  function normalizeUrl(value) {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.replace(/\\u002F/gi, "/").replace(/\\\//g, "/").trim();
    if (!trimmed || /^(?:blob:|data:|file:|about:|javascript:|mailto:)/i.test(trimmed)) {
      return null;
    }

    try {
      const normalized = new URL(trimmed, window.location.href).toString();
      return /^https?:\/\//i.test(normalized) ? normalized : null;
    } catch (_) {
      return null;
    }
  }

  function getNoteLinkCache() {
    const existing = window[NOTE_LINK_CACHE_KEY];
    if (existing && typeof existing === "object") {
      return existing;
    }

    const created = Object.create(null);
    window[NOTE_LINK_CACHE_KEY] = created;
    return created;
  }

  function ensureNoteLinkCacheNode() {
    const parent = document.documentElement || document.head || document.body;
    if (!parent) {
      return null;
    }

    let node = document.getElementById(NOTE_LINK_CACHE_NODE_ID);
    if (node) {
      return node;
    }

    node = document.createElement("script");
    node.id = NOTE_LINK_CACHE_NODE_ID;
    node.type = "application/json";
    node.setAttribute("data-flowselect-role", "xiaohongshu-note-link-cache");
    node.textContent = "{}";
    parent.appendChild(node);
    return node;
  }

  function persistNoteLinkCache(cache) {
    const node = ensureNoteLinkCacheNode();
    if (!node) {
      return;
    }

    try {
      node.textContent = JSON.stringify(cache);
    } catch (_) {
      // Ignore serialization issues.
    }
  }

  function upsertNoteLinkRecords(records) {
    if (!Array.isArray(records) || records.length === 0) {
      return;
    }

    const cache = getNoteLinkCache();
    let changed = false;

    for (const record of records) {
      const noteId = normalizeNoteId(record?.noteId);
      const detailUrl = normalizeUrl(record?.detailUrl);
      if (!noteId || !detailUrl) {
        continue;
      }

      const nextRecord = {
        noteId,
        xsecToken: normalizeString(record?.xsecToken),
        xsecSource: normalizeString(record?.xsecSource),
        detailUrl,
        updatedAtMs:
          typeof record?.updatedAtMs === "number" && Number.isFinite(record.updatedAtMs)
            ? record.updatedAtMs
            : Date.now(),
      };
      const existing = cache[noteId];
      if (
        existing
        && existing.detailUrl === nextRecord.detailUrl
        && existing.xsecToken === nextRecord.xsecToken
        && existing.xsecSource === nextRecord.xsecSource
      ) {
        continue;
      }

      cache[noteId] = nextRecord;
      changed = true;
    }

    if (changed) {
      persistNoteLinkCache(cache);
    }
  }

  function injectPageBridge() {
    if (pageBridgeInjected) {
      return Promise.resolve();
    }

    if (pageBridgeInjectionPromise) {
      return pageBridgeInjectionPromise;
    }

    pageBridgeInjectionPromise = new Promise((resolve, reject) => {
      const parent = document.documentElement || document.head || document.body;
      if (!parent) {
        reject(new Error("Xiaohongshu page bridge injection target was not available"));
        return;
      }

      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(PAGE_BRIDGE_SCRIPT_PATH);
      script.async = false;

      script.onload = () => {
        script.remove();
        pageBridgeInjected = true;
        pageBridgeInjectionPromise = null;
        resolve();
      };

      script.onerror = () => {
        script.remove();
        pageBridgeInjectionPromise = null;
        reject(new Error("Xiaohongshu page bridge failed to load"));
      };

      parent.appendChild(script);
    });

    return pageBridgeInjectionPromise;
  }

  function handlePageBridgeMessage(event) {
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    if (
      !data
      || data.source !== PAGE_BRIDGE_MESSAGE_SOURCE
      || data.type !== PAGE_BRIDGE_EVENT_TYPE
    ) {
      return;
    }

    upsertNoteLinkRecords(data.records);
  }

  function isDetailPage() {
    return (
      window.location.pathname.includes("/explore/")
      || window.location.pathname.includes("/discovery/item/")
    );
  }

  function shouldKeepNativeContextMenu(event) {
    if (!(event.target instanceof Element)) {
      return !isDetailPage();
    }

    if (event.target.closest("#flowselect-xhs-download-btn, .flowselect-xhs-control-btn")) {
      return false;
    }

    return !isDetailPage();
  }

  function allowNativeContextMenu(event) {
    if (!isXiaohongshuHost() || !shouldKeepNativeContextMenu(event)) {
      return;
    }

    event.stopImmediatePropagation();
  }

  window.addEventListener("contextmenu", allowNativeContextMenu, true);
  document.addEventListener("contextmenu", allowNativeContextMenu, true);
  window.addEventListener("message", handlePageBridgeMessage, true);

  if (isXiaohongshuHost()) {
    void injectPageBridge().catch((error) => {
      console.warn("[FlowSelect XHS] Failed to inject page bridge:", error);
    });
  }
})();
