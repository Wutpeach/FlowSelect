(function () {
  "use strict";

  const PAGE_BRIDGE_FLAG = "__flowselectXiaohongshuPageBridgeInstalled";
  const PAGE_MESSAGE_SOURCE = "flowselect-xiaohongshu-page";
  const PAGE_EVENT_TYPE = "FLOWSELECT_XIAOHONGSHU_NOTE_LINKS";

  if (window[PAGE_BRIDGE_FLAG]) {
    return;
  }
  window[PAGE_BRIDGE_FLAG] = true;

  const noteCache = new Map();

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

  function deriveDefaultXsecSource() {
    try {
      const parsed = new URL(window.location.href);
      const querySource = normalizeString(parsed.searchParams.get("xsec_source"));
      if (querySource) {
        return querySource;
      }

      if (/^\/user\/profile\//i.test(parsed.pathname)) {
        return "pc_user";
      }
    } catch (_) {
      // Ignore URL parse failures.
    }

    return "pc_feed";
  }

  function buildDetailUrl(noteId, xsecToken, xsecSource) {
    const normalizedNoteId = normalizeNoteId(noteId);
    const normalizedToken = normalizeString(xsecToken);
    if (!normalizedNoteId || !normalizedToken) {
      return null;
    }

    try {
      const detailUrl = new URL(`https://www.xiaohongshu.com/explore/${normalizedNoteId}`);
      detailUrl.searchParams.set("xsec_token", normalizedToken);
      detailUrl.searchParams.set("xsec_source", normalizeString(xsecSource) || deriveDefaultXsecSource());
      return detailUrl.toString();
    } catch (_) {
      return null;
    }
  }

  function resolveXsecSource(value) {
    const direct = normalizeString(
      value?.xsecSource
      || value?.xsec_source
      || value?.note?.xsecSource
      || value?.note?.xsec_source
      || value?.noteCard?.xsecSource
      || value?.noteCard?.xsec_source
      || value?.noteCard?.note?.xsecSource
      || value?.noteCard?.note?.xsec_source,
    );
    return direct || deriveDefaultXsecSource();
  }

  function resolveDetailUrlCandidates(value) {
    const candidates = [
      value?.detailUrl,
      value?.detail_url,
      value?.noteLink,
      value?.note_link,
      value?.shareLink,
      value?.share_link,
      value?.jumpUrl,
      value?.jump_url,
      value?.url,
      value?.href,
      value?.note?.detailUrl,
      value?.note?.detail_url,
      value?.note?.shareLink,
      value?.note?.share_link,
      value?.noteCard?.detailUrl,
      value?.noteCard?.detail_url,
      value?.noteCard?.note?.detailUrl,
      value?.noteCard?.note?.detail_url,
    ];

    return candidates
      .map((candidate) => normalizeUrl(candidate))
      .filter(Boolean);
  }

  function resolveNoteTokenRecord(value) {
    if (!value || typeof value !== "object") {
      return null;
    }

    const noteId = [
      value.noteCard?.note?.noteId,
      value.noteCard?.note?.id,
      value.noteCard?.noteId,
      value.noteCard?.id,
      value.note?.noteId,
      value.note?.id,
      value.noteId,
      value.id,
    ].map((candidate) => normalizeNoteId(candidate)).find(Boolean) || null;

    const xsecToken = [
      value.noteCard?.note?.xsecToken,
      value.noteCard?.note?.xsec_token,
      value.noteCard?.xsecToken,
      value.noteCard?.xsec_token,
      value.note?.xsecToken,
      value.note?.xsec_token,
      value.xsecToken,
      value.xsec_token,
    ].map((candidate) => normalizeString(candidate)).find(Boolean) || null;

    const detailUrlFromFields = resolveDetailUrlCandidates(value).find((candidate) => /[?&]xsec_token=/i.test(candidate)) || null;
    if (!noteId && !detailUrlFromFields) {
      return null;
    }

    let resolvedNoteId = noteId;
    let resolvedToken = xsecToken;
    let resolvedSource = resolveXsecSource(value);
    let detailUrl = detailUrlFromFields;

    if (detailUrlFromFields) {
      try {
        const parsed = new URL(detailUrlFromFields);
        const parsedNoteId = normalizeNoteId(
          parsed.pathname.match(/\/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/i)?.[1],
        );
        if (parsedNoteId) {
          resolvedNoteId = parsedNoteId;
        }
        const parsedToken = normalizeString(parsed.searchParams.get("xsec_token"));
        if (parsedToken) {
          resolvedToken = parsedToken;
        }
        const parsedSource = normalizeString(parsed.searchParams.get("xsec_source"));
        if (parsedSource) {
          resolvedSource = parsedSource;
        }
      } catch (_) {
        // Ignore malformed detail URLs.
      }
    }

    if (!detailUrl && resolvedNoteId && resolvedToken) {
      detailUrl = buildDetailUrl(resolvedNoteId, resolvedToken, resolvedSource);
    }

    if (!resolvedNoteId || !detailUrl) {
      return null;
    }

    return {
      noteId: resolvedNoteId,
      xsecToken: resolvedToken,
      xsecSource: resolvedSource,
      detailUrl,
    };
  }

  function publishRecords(records) {
    if (!Array.isArray(records) || records.length === 0) {
      return;
    }

    const payload = [];
    for (const record of records) {
      if (!record?.noteId || !record?.detailUrl) {
        continue;
      }

      const existing = noteCache.get(record.noteId);
      if (
        existing
        && existing.detailUrl === record.detailUrl
        && existing.xsecToken === record.xsecToken
        && existing.xsecSource === record.xsecSource
      ) {
        continue;
      }

      const nextRecord = {
        noteId: record.noteId,
        xsecToken: record.xsecToken || null,
        xsecSource: record.xsecSource || deriveDefaultXsecSource(),
        detailUrl: record.detailUrl,
        updatedAtMs: Date.now(),
      };
      noteCache.set(record.noteId, nextRecord);
      payload.push(nextRecord);
    }

    if (payload.length === 0) {
      return;
    }

    window.postMessage({
      source: PAGE_MESSAGE_SOURCE,
      type: PAGE_EVENT_TYPE,
      records: payload,
    }, "*");
  }

  function collectRecords(value, results, seen = new WeakSet(), depth = 0) {
    if (value == null || depth > 12) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => collectRecords(entry, results, seen, depth + 1));
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    if (seen.has(value)) {
      return;
    }
    seen.add(value);

    const record = resolveNoteTokenRecord(value);
    if (record) {
      results.push(record);
    }

    Object.values(value).forEach((entry) => collectRecords(entry, results, seen, depth + 1));
  }

  function inspectValue(value) {
    if (!value || typeof value !== "object") {
      return;
    }

    const records = [];
    collectRecords(value, records);
    publishRecords(records);
  }

  async function inspectJsonResponse(response, responseUrl) {
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!/application\/json|text\/plain/.test(contentType)) {
      return;
    }

    const url = normalizeUrl(responseUrl || response.url);
    if (!url || !/xiaohongshu\.com|xhslink\.com/i.test(url)) {
      return;
    }

    if (!/\/api\/sns\/web\/v1\/(?:feed|note|search|user)|\/api\/sec\//i.test(url)) {
      return;
    }

    try {
      const data = await response.clone().json();
      inspectValue(data);
    } catch (_) {
      // Ignore non-JSON or unreadable bodies.
    }
  }

  function inspectInitialState() {
    try {
      inspectValue(window.__INITIAL_STATE__);
    } catch (_) {
      // Ignore unavailable page state.
    }
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function flowselectXhsFetch(...args) {
      const response = await originalFetch.apply(this, args);
      Promise.resolve().then(() => inspectJsonResponse(response, typeof args[0] === "string" ? args[0] : args[0]?.url));
      return response;
    };
  }

  const OriginalXHR = window.XMLHttpRequest;
  if (typeof OriginalXHR === "function") {
    const open = OriginalXHR.prototype.open;
    const send = OriginalXHR.prototype.send;

    OriginalXHR.prototype.open = function flowselectXhsOpen(method, url, ...rest) {
      this.__flowselectXhsResponseUrl = typeof url === "string" ? url : null;
      return open.call(this, method, url, ...rest);
    };

    OriginalXHR.prototype.send = function flowselectXhsSend(...args) {
      this.addEventListener("load", () => {
        const responseType = this.responseType;
        if (responseType && responseType !== "text" && responseType !== "") {
          return;
        }
        const responseUrl = normalizeUrl(this.responseURL || this.__flowselectXhsResponseUrl);
        if (!responseUrl || !/\/api\/sns\/web\/v1\/(?:feed|note|search|user)|\/api\/sec\//i.test(responseUrl)) {
          return;
        }

        try {
          const text = typeof this.responseText === "string" ? this.responseText : "";
          if (!text.trim()) {
            return;
          }
          const data = JSON.parse(text);
          inspectValue(data);
        } catch (_) {
          // Ignore malformed responses.
        }
      }, { once: true });

      return send.apply(this, args);
    };
  }

  inspectInitialState();
  window.addEventListener("DOMContentLoaded", inspectInitialState, { once: true });
  window.setTimeout(inspectInitialState, 1200);
})();
