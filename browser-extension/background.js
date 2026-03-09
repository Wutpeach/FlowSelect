// FlowSelect Browser Extension - Background Service Worker
// WebSocket client for communication with FlowSelect desktop app

importScripts("direct-download-quality.js");

let ws = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
const WS_URL = 'ws://127.0.0.1:39527';
const REQUEST_TIMEOUT_MS = 7000;
const CONNECTING_WAIT_TIMEOUT_MS = 500;
const VIDEO_SELECTION_CONNECT_TIMEOUT_MS = 2500;
const CONNECTING_STATUS_TEXT = 'Connecting';
const OFFLINE_STATUS_TEXT = 'Offline';
const pendingRequests = new Map();
let requestCounter = 0;
let lastConnectionIssue = OFFLINE_STATUS_TEXT;

// Store current theme from desktop app
let currentTheme = 'black';
const directDownloadQuality = self.FlowSelectDirectDownloadQuality;

function isConnected() {
  return ws && ws.readyState === WebSocket.OPEN;
}

function isConnecting() {
  return ws && ws.readyState === WebSocket.CONNECTING;
}

function unavailableStatusText() {
  return OFFLINE_STATUS_TEXT;
}

function hasUnavailableIssue() {
  return lastConnectionIssue === OFFLINE_STATUS_TEXT;
}

function connectionStatusText() {
  if (isConnected()) {
    return 'Connected';
  }
  if (isConnecting()) {
    if (hasUnavailableIssue()) {
      return lastConnectionIssue;
    }
    return lastConnectionIssue || CONNECTING_STATUS_TEXT;
  }
  if (reconnectTimer !== null) {
    return lastConnectionIssue || unavailableStatusText();
  }
  return lastConnectionIssue || OFFLINE_STATUS_TEXT;
}

function notifyConnectionStatus() {
  chrome.runtime.sendMessage({
    type: 'connection_update',
    connected: isConnected(),
    connecting: Boolean(isConnecting() || reconnectTimer !== null),
    statusText: connectionStatusText(),
  }).catch(() => {});
}

function buildRequestFailure(code, requestId = null) {
  const data = { code };
  if (requestId) {
    data.requestId = requestId;
  }

  return {
    success: false,
    message: code,
    data,
  };
}

function connect(options = {}) {
  const force = options.force === true;

  if (isConnected() || isConnecting()) return;
  if (reconnectTimer !== null) {
    if (!force) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const shouldNotifyConnecting = reconnectAttempts === 0 && !hasUnavailableIssue();
  if (shouldNotifyConnecting) {
    lastConnectionIssue = CONNECTING_STATUS_TEXT;
    notifyConnectionStatus();
  }

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.info('[FlowSelect] Connected to desktop app');
    reconnectAttempts = 0;
    lastConnectionIssue = '';
    notifyConnectionStatus();
    // Query current theme after connection
    ws.send(JSON.stringify({ action: 'get_theme' }));
    void syncDownloadPreferencesToApp();
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (handlePendingRequestResponse(message)) {
        return;
      }
      handleMessage(message);
    } catch (e) {
      console.error('[FlowSelect] Failed to parse message:', e);
    }
  };

  ws.onclose = () => {
    console.info('[FlowSelect] Disconnected');
    rejectPendingRequests('ws_closed');
    ws = null;
    lastConnectionIssue = unavailableStatusText();
    notifyConnectionStatus();
    scheduleReconnect();
  };

  ws.onerror = () => {
    if (!isConnected()) {
      lastConnectionIssue = unavailableStatusText();
      console.warn('[FlowSelect] WebSocket unavailable. Open the FlowSelect desktop app to enable browser-extension features.');
      notifyConnectionStatus();
      return;
    }
    console.error('[FlowSelect] WebSocket error while connected.');
  };
}

function scheduleReconnect() {
  if (reconnectTimer !== null) {
    return;
  }

  reconnectAttempts++;
  const delay = Math.min(500 * Math.pow(1.5, reconnectAttempts), 5000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function nextRequestId() {
  requestCounter += 1;
  return `req_${Date.now()}_${requestCounter}`;
}

function handlePendingRequestResponse(message) {
  const requestId = message?.data?.requestId || message?.data?.request_id;
  if (!requestId) {
    return false;
  }

  const pending = pendingRequests.get(requestId);
  if (!pending) {
    return false;
  }

  pendingRequests.delete(requestId);
  clearTimeout(pending.timer);
  pending.resolve(message);
  return true;
}

function rejectPendingRequests(reason) {
  for (const [requestId, pending] of pendingRequests.entries()) {
    clearTimeout(pending.timer);
    pending.resolve(buildRequestFailure(reason, requestId));
  }
  pendingRequests.clear();
}

function handleMessage(message) {
  // Compatible with: top-level action, type, or wrapped data.action
  const action = message.action || message.type || message.data?.action;

  switch (action) {
    case 'theme_changed':
      currentTheme = message.data?.theme || 'black';
      // Notify popup if open (ignore errors if popup is closed)
      chrome.runtime.sendMessage({ type: 'theme_update', theme: currentTheme }).catch(() => {});
      break;
    case 'theme_info':
      // Compatible with: message.data.theme or message.theme
      currentTheme = message.data?.theme || message.theme || 'black';
      chrome.runtime.sendMessage({ type: 'theme_update', theme: currentTheme }).catch(() => {});
      break;
    case 'start_picker':
      startPicker(message.tabId);
      break;
    case 'stop_picker':
      stopPicker(message.tabId);
      break;
  }
}

async function startPicker(tabId) {
  const tab = tabId ? { id: tabId } : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: 'start_picker' });
  }
}

async function stopPicker(tabId) {
  const tab = tabId ? { id: tabId } : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: 'stop_picker' });
  }
}

function sendToApp(data) {
  if (isConnected()) {
    ws.send(JSON.stringify(data));
    return true;
  }
  connect({ force: true });
  return false;
}

function syncDownloadPreferencesToApp() {
  return Promise.all([
    directDownloadQuality.getQualityPreference(),
    directDownloadQuality.getAeFriendlyConversionEnabled(),
  ])
    .then(([qualityPreference, aeFriendlyConversionEnabled]) => {
      return sendToApp({
        action: 'sync_download_preferences',
        data: {
          ytdlpQualityPreference: qualityPreference,
          aeFriendlyConversionEnabled,
        },
      });
    })
    .catch((error) => {
      console.error('[FlowSelect] Failed to sync download preferences:', error);
      return false;
    });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForConnection(timeoutMs) {
  if (isConnected()) {
    return true;
  }

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (isConnected()) {
      return true;
    }
    await sleep(80);
  }
  return isConnected();
}

async function ensureConnection(timeoutMs, options = {}) {
  if (isConnected()) {
    return true;
  }

  connect({ force: options.force === true });
  return waitForConnection(timeoutMs);
}

async function sendRequestToApp(action, data = {}, timeoutMs = REQUEST_TIMEOUT_MS, options = {}) {
  const connectTimeoutMs = typeof options.connectTimeoutMs === 'number'
    ? options.connectTimeoutMs
    : CONNECTING_WAIT_TIMEOUT_MS;
  const forceConnect = options.forceConnect === true;

  if (!isConnected()) {
    const connected = await ensureConnection(connectTimeoutMs, { force: forceConnect });
    if (!connected) {
      return buildRequestFailure('not_connected');
    }
  }

  if (!isConnected()) {
    return buildRequestFailure('not_connected');
  }

  const requestId = nextRequestId();
  const payload = {
    action,
    data: {
      ...data,
      requestId,
    },
  };

  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!pendingRequests.has(requestId)) {
        return;
      }
      pendingRequests.delete(requestId);
      resolve(buildRequestFailure('request_timeout', requestId));
    }, timeoutMs);

    pendingRequests.set(requestId, { resolve, timer });

    try {
      ws.send(JSON.stringify(payload));
    } catch (error) {
      clearTimeout(timer);
      pendingRequests.delete(requestId);
      resolve(buildRequestFailure('send_failed', requestId));
    }
  });
}

function queueVideoSelectionToApp(data) {
  return sendRequestToApp(
    'video_selected',
    data,
    REQUEST_TIMEOUT_MS,
    {
      connectTimeoutMs: VIDEO_SELECTION_CONNECT_TIMEOUT_MS,
      forceConnect: true,
    }
  );
}

function normalizeVideoCandidates(rawCandidates) {
  if (!Array.isArray(rawCandidates)) return [];

  const normalized = [];
  for (const candidate of rawCandidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
    if (!url || !url.startsWith('http') || url.startsWith('blob:')) continue;
    normalized.push({
      url,
      type: typeof candidate.type === 'string' ? candidate.type : 'unknown',
      confidence: typeof candidate.confidence === 'string' ? candidate.confidence : 'low',
      source: typeof candidate.source === 'string' ? candidate.source : 'unknown',
    });
  }

  return normalized;
}

function normalizeClipTimeSeconds(value) {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;

  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

// Convert cookies to Netscape format for yt-dlp
function cookiesToNetscape(cookies) {
  // Netscape cookie file header is required
  const header = '# Netscape HTTP Cookie File\n# https://curl.haxx.se/docs/http-cookies.html\n# This file was generated by FlowSelect\n\n';
  const lines = cookies.map(cookie => {
    const secure = cookie.secure ? 'TRUE' : 'FALSE';
    const expiry = cookie.expirationDate ? Math.floor(cookie.expirationDate) : 0;
    // Keep domain as-is from Chrome API, set includeSubdomains based on leading dot
    const includeSubdomains = cookie.domain.startsWith('.') ? 'TRUE' : 'FALSE';
    return `${cookie.domain}\t${includeSubdomains}\t${cookie.path}\t${secure}\t${expiry}\t${cookie.name}\t${cookie.value}`;
  }).join('\n');
  return header + lines;
}

// Get cookies for a URL (including parent domain)
async function getCookiesForUrl(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Extract base domain (e.g., www.douyin.com -> douyin.com)
    const parts = hostname.split('.');
    const baseDomain = parts.length > 2 ? parts.slice(-2).join('.') : hostname;

    // Get cookies from both hostname and base domain
    const [hostCookies, baseCookies] = await Promise.all([
      chrome.cookies.getAll({ domain: hostname }),
      chrome.cookies.getAll({ domain: baseDomain })
    ]);

    // Merge and deduplicate cookies
    const cookieMap = new Map();
    [...hostCookies, ...baseCookies].forEach(cookie => {
      const key = `${cookie.domain}|${cookie.path}|${cookie.name}`;
      cookieMap.set(key, cookie);
    });

    const allCookies = Array.from(cookieMap.values());
    if (allCookies.length > 0) {
      return cookiesToNetscape(allCookies);
    }
  } catch (e) {
    console.error('[FlowSelect] Failed to get cookies:', e);
  }
  return '';
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'video_selected') {
    // Get cookies and send to app
    const pageUrl = message.pageUrl || sender.tab?.url || message.url;
    const platform = directDownloadQuality.getDirectPlatform([
      pageUrl,
      message.pageUrl,
      message.videoUrl,
      message.url,
    ]);
    const videoCandidates = normalizeVideoCandidates(message.videoCandidates);
    const clipStartSec = normalizeClipTimeSeconds(message.clipStartSec);
    const clipEndSec = normalizeClipTimeSeconds(message.clipEndSec);
    Promise.all([
      getCookiesForUrl(pageUrl),
      directDownloadQuality.getQualityPreference(),
      directDownloadQuality.getAeFriendlyConversionEnabled(),
    ]).then(([cookies, qualityPreference, aeFriendlyConversionEnabled]) => {
      console.info('[FlowSelect] Using yt-dlp quality preference:', qualityPreference);
      const prioritizedCandidates = directDownloadQuality.prioritizeCandidatesForHighestQuality(
        videoCandidates,
        platform
      );
      const preferredVideoUrl = directDownloadQuality.selectPreferredVideoUrl(
        prioritizedCandidates,
        platform,
        message.videoUrl
      );
      return queueVideoSelectionToApp({
        url: preferredVideoUrl || message.url,
        pageUrl: pageUrl,
        title: message.title,
        videoUrl: preferredVideoUrl,
        videoCandidates: prioritizedCandidates,
        clipStartSec: clipStartSec,
        clipEndSec: clipEndSec,
        ytdlpQualityPreference: qualityPreference,
        aeFriendlyConversionEnabled: aeFriendlyConversionEnabled,
        cookies: cookies
      });
    }).then((result) => {
      if (!result?.success) {
        console.warn(
          '[FlowSelect] Video selection request was not queued:',
          result?.data?.code || result?.message || 'unknown'
        );
      }

      sendResponse({
        success: Boolean(result?.success),
        connected: isConnected(),
        reason: result?.data?.code || null,
      });
    }).catch((error) => {
      console.error('[FlowSelect] Failed to prepare video selection request:', error);
      sendResponse({
        success: false,
        connected: isConnected(),
        reason: 'prepare_failed',
      });
    });
  } else if (message.type === 'connect') {
    connect({ force: true });
    sendResponse({
      success: true,
      connected: isConnected()
    });
  } else if (message.type === 'save_screenshot') {
    const dataUrl = typeof message.dataUrl === 'string' ? message.dataUrl : '';
    const filename = typeof message.filename === 'string' ? message.filename : null;

    if (!dataUrl.startsWith('data:')) {
      sendResponse({
        success: false,
        connected: isConnected(),
        error: 'invalid_data_url',
      });
      return true;
    }

    sendRequestToApp('save_data_url', {
      dataUrl,
      originalFilename: filename,
      requireRenameEnabled: true,
    }).then((result) => {
      if (!result?.success) {
        console.warn('[FlowSelect] save_screenshot fallback reason:', result?.data?.code || result?.message || 'unknown');
      }
      sendResponse({
        success: Boolean(result?.success),
        connected: isConnected(),
        reason: result?.data?.code || null,
      });
    });
    return true;
  } else if (message.type === 'get_status') {
    sendResponse({
      connected: isConnected(),
      connecting: isConnecting() || reconnectTimer !== null,
      statusText: connectionStatusText(),
    });
  } else if (message.type === 'get_theme') {
    sendResponse({ theme: currentTheme });
  }
  return true;
});

if (chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    if (
      !changes?.[directDownloadQuality.STORAGE_KEY]
      && !changes?.[directDownloadQuality.LEGACY_STORAGE_KEY]
      && !changes?.[directDownloadQuality.AE_FRIENDLY_CONVERSION_STORAGE_KEY]
    ) {
      return;
    }

    void syncDownloadPreferencesToApp();
  });
}

// Auto-connect on startup
connect();
