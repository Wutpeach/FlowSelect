// FlowSelect Browser Extension - Background Service Worker
// WebSocket client for communication with FlowSelect desktop app

importScripts("direct-download-quality.js");

let ws = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
const WS_URL = 'ws://127.0.0.1:39527';
const WS_RECONNECT_ALARM = 'flowselect-ws-reconnect';
const REQUEST_TIMEOUT_MS = 7000;
const CONNECTING_WAIT_TIMEOUT_MS = 500;
const VIDEO_SELECTION_CONNECT_TIMEOUT_MS = 2500;
const PROTECTED_IMAGE_DRAG_TTL_MS = 2 * 60 * 1000;
const PROTECTED_IMAGE_RESOLUTION_TIMEOUT_MS = 15000;
const CONNECTING_STATUS_TEXT = 'Connecting';
const OFFLINE_STATUS_TEXT = 'Offline';
const FALLBACK_LANGUAGE = 'en';
const LANGUAGE_STORAGE_KEY = 'flowselectCurrentLanguage';
const PENDING_DOWNLOAD_PREFERENCES_SYNC_KEY = 'flowselectPendingDownloadPreferencesSync';
const WS_ACTION_GET_LANGUAGE = 'get_language';
const WS_ACTION_LANGUAGE_INFO = 'language_info';
const WS_ACTION_LANGUAGE_CHANGED = 'language_changed';
const pendingRequests = new Map();
const protectedImageDragRegistry = new Map();
let requestCounter = 0;
let lastConnectionIssue = OFFLINE_STATUS_TEXT;

// Store current theme from desktop app
let currentTheme = 'black';
let currentLanguage = resolvePreferredLanguage(undefined, self.navigator?.language);
const directDownloadQuality = self.FlowSelectDirectDownloadQuality;
const languageInitializationPromise = initializeLanguageState();

function isEnglishVariant(normalized) {
  return normalized === 'en' || normalized.startsWith('en-');
}

function isChineseVariant(normalized) {
  return normalized === 'zh' || normalized.startsWith('zh-');
}

function normalizeAppLanguage(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/_/g, '-').toLowerCase();
  if (!normalized) {
    return null;
  }

  if (isEnglishVariant(normalized)) {
    return 'en';
  }

  if (isChineseVariant(normalized)) {
    return 'zh-CN';
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
    chrome.storage.local.get(keys, (result) => {
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

async function setPendingDownloadPreferencesSync(pending) {
  if (!chrome?.storage?.local) {
    return;
  }

  try {
    await storageSet({
      [PENDING_DOWNLOAD_PREFERENCES_SYNC_KEY]: pending === true,
    });
  } catch (error) {
    console.error('[FlowSelect] Failed to persist pending preference sync state:', error);
  }
}

async function getCachedLanguage() {
  if (!chrome?.storage?.local) {
    return null;
  }

  try {
    const result = await storageGet(LANGUAGE_STORAGE_KEY);
    return normalizeAppLanguage(result?.[LANGUAGE_STORAGE_KEY]);
  } catch (error) {
    console.error('[FlowSelect] Failed to load cached language:', error);
    return null;
  }
}

async function cacheLanguage(language) {
  if (!chrome?.storage?.local) {
    return;
  }

  try {
    await storageSet({ [LANGUAGE_STORAGE_KEY]: language });
  } catch (error) {
    console.error('[FlowSelect] Failed to cache language:', error);
  }
}

function notifyLanguageUpdate() {
  chrome.runtime.sendMessage({
    type: 'language_update',
    language: currentLanguage,
  }).catch(() => {});
}

function setCurrentLanguage(nextLanguage, options = {}) {
  const normalized = normalizeAppLanguage(nextLanguage);
  if (!normalized) {
    return currentLanguage;
  }

  const changed = normalized !== currentLanguage;
  currentLanguage = normalized;

  if (options.persist !== false) {
    void cacheLanguage(normalized);
  }

  if (options.broadcast !== false && changed) {
    notifyLanguageUpdate();
  }

  return currentLanguage;
}

async function initializeLanguageState() {
  const cachedLanguage = await getCachedLanguage();
  const initialLanguage = resolvePreferredLanguage(cachedLanguage, self.navigator?.language);
  setCurrentLanguage(initialLanguage, {
    persist: cachedLanguage !== initialLanguage,
    broadcast: false,
  });
  return currentLanguage;
}

function requestLanguageFromApp() {
  if (!isConnected()) {
    return false;
  }

  try {
    ws.send(JSON.stringify({ action: WS_ACTION_GET_LANGUAGE }));
    return true;
  } catch (error) {
    console.error('[FlowSelect] Failed to request language from desktop app:', error);
    return false;
  }
}

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

function connectionState() {
  if (isConnected()) {
    return 'connected';
  }

  if (lastConnectionIssue === CONNECTING_STATUS_TEXT && !hasUnavailableIssue()) {
    return 'connecting';
  }

  return 'offline';
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
    state: connectionState(),
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

function normalizeHttpUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const resolved = new URL(trimmed).toString();
    return resolved.startsWith('http://') || resolved.startsWith('https://')
      ? resolved
      : null;
  } catch (error) {
    return null;
  }
}

function selectFirstHttpUrl(...values) {
  for (const value of values) {
    const normalized = normalizeHttpUrl(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function cleanupProtectedImageDragRegistry() {
  const now = Date.now();
  for (const [token, entry] of protectedImageDragRegistry.entries()) {
    if (!entry || typeof entry.createdAt !== 'number' || now - entry.createdAt > PROTECTED_IMAGE_DRAG_TTL_MS) {
      protectedImageDragRegistry.delete(token);
    }
  }
}

function deriveFilenameFromUrl(rawUrl) {
  const normalized = normalizeHttpUrl(rawUrl);
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    const rawName = parsed.pathname.split('/').filter(Boolean).pop() || '';
    return rawName ? decodeURIComponent(rawName) : null;
  } catch (error) {
    return null;
  }
}

function sendMessageToTab(tabId, message, options = {}) {
  return new Promise((resolve, reject) => {
    const callback = (response) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    };

    try {
      if (typeof options.frameId === 'number' && options.frameId >= 0) {
        chrome.tabs.sendMessage(tabId, message, { frameId: options.frameId }, callback);
      } else {
        chrome.tabs.sendMessage(tabId, message, callback);
      }
    } catch (error) {
      reject(error);
    }
  });
}

async function reportProtectedImageResolutionResult(requestId, result) {
  if (!requestId) {
    return;
  }

  const response = await sendRequestToApp(
    'protected_image_resolution_result',
    {
      correlationRequestId: requestId,
      success: result?.success === true,
      filePath: typeof result?.filePath === 'string' ? result.filePath : undefined,
      code: typeof result?.code === 'string' ? result.code : undefined,
      error: typeof result?.error === 'string' ? result.error : undefined,
    },
    PROTECTED_IMAGE_RESOLUTION_TIMEOUT_MS,
  );

  if (!response?.success) {
    console.warn(
      '[FlowSelect] protected_image_resolution_result was not acknowledged:',
      response?.data?.code || response?.message || 'unknown'
    );
  }
}

async function handleProtectedImageResolveRequest(data) {
  cleanupProtectedImageDragRegistry();

  const requestId = typeof data?.requestId === 'string' ? data.requestId : '';
  const token = typeof data?.token === 'string' ? data.token.trim() : '';
  if (!requestId || !token) {
    await reportProtectedImageResolutionResult(requestId, {
      success: false,
      code: 'protected_image_missing_request',
      error: 'Missing protected image request metadata',
    });
    return;
  }

  const entry = protectedImageDragRegistry.get(token);
  if (!entry) {
    await reportProtectedImageResolutionResult(requestId, {
      success: false,
      code: 'protected_image_token_missing',
      error: 'Protected image drag token was missing or expired',
    });
    return;
  }
  protectedImageDragRegistry.delete(token);

  const imageUrl = normalizeHttpUrl(data?.imageUrl) || entry.imageUrl;
  const pageUrl = normalizeHttpUrl(data?.pageUrl) || entry.pageUrl;
  const targetDir = typeof data?.targetDir === 'string' && data.targetDir.trim()
    ? data.targetDir
    : undefined;

  console.info('[FlowSelect] Resolving protected image fallback:', {
    requestId,
    token,
    tabId: entry.tabId,
    frameId: entry.frameId,
    imageUrl,
    pageUrl,
  });

  if (!imageUrl) {
    await reportProtectedImageResolutionResult(requestId, {
      success: false,
      code: 'protected_image_invalid_url',
      error: 'Protected image URL was missing or invalid',
    });
    return;
  }

  try {
    const resolution = await sendMessageToTab(
      entry.tabId,
      {
        type: 'resolve_protected_image',
        token,
        imageUrl,
        pageUrl,
      },
      { frameId: entry.frameId },
    );

    if (!resolution?.success || typeof resolution?.dataUrl !== 'string') {
      await reportProtectedImageResolutionResult(requestId, {
        success: false,
        code: typeof resolution?.code === 'string'
          ? resolution.code
          : 'protected_image_resolution_failed',
        error: typeof resolution?.error === 'string'
          ? resolution.error
          : 'Protected image resolver did not return image bytes',
      });
      return;
    }

    const saveResult = await sendRequestToApp(
      'save_data_url',
      {
        dataUrl: resolution.dataUrl,
        originalFilename:
          typeof resolution.filename === 'string' && resolution.filename.trim()
            ? resolution.filename.trim()
            : deriveFilenameFromUrl(imageUrl) || undefined,
        targetDir,
      },
      PROTECTED_IMAGE_RESOLUTION_TIMEOUT_MS,
    );

    if (saveResult?.success && typeof saveResult.message === 'string' && saveResult.message.trim()) {
      console.info('[FlowSelect] Protected image fallback saved via FlowSelect:', saveResult.message.trim());
      await reportProtectedImageResolutionResult(requestId, {
        success: true,
        filePath: saveResult.message.trim(),
      });
      return;
    }

    await reportProtectedImageResolutionResult(requestId, {
      success: false,
      code: typeof saveResult?.data?.code === 'string'
        ? saveResult.data.code
        : 'save_data_url_failed',
      error: typeof saveResult?.message === 'string'
        ? saveResult.message
        : 'Protected image save_data_url fallback failed',
    });
  } catch (error) {
    console.warn('[FlowSelect] Protected image fallback failed:', error);
    await reportProtectedImageResolutionResult(requestId, {
      success: false,
      code: 'protected_image_resolution_failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function connect(options = {}) {
  const force = options.force === true;

  if (isConnected() || isConnecting()) return;
  if (reconnectTimer !== null) {
    if (!force) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  clearReconnectAlarm();

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
    clearReconnectAlarm();
    // Query current theme after connection
    ws.send(JSON.stringify({ action: 'get_theme' }));
    requestLanguageFromApp();
    void bootstrapDownloadPreferencesSync();
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
  scheduleReconnectAlarm(delay);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function scheduleReconnectAlarm(delayMs) {
  if (!chrome?.alarms?.create) {
    return;
  }

  try {
    chrome.alarms.create(WS_RECONNECT_ALARM, {
      when: Date.now() + Math.max(1000, delayMs),
    });
  } catch (error) {
    console.error('[FlowSelect] Failed to schedule reconnect alarm:', error);
  }
}

function clearReconnectAlarm() {
  if (!chrome?.alarms?.clear) {
    return;
  }

  try {
    chrome.alarms.clear(WS_RECONNECT_ALARM, () => {});
  } catch (error) {
    console.error('[FlowSelect] Failed to clear reconnect alarm:', error);
  }
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
    case WS_ACTION_LANGUAGE_CHANGED:
    case WS_ACTION_LANGUAGE_INFO: {
      const nextLanguage = message.data?.language || message.language;
      setCurrentLanguage(nextLanguage);
      break;
    }
    case 'request_download_preferences':
      void bootstrapDownloadPreferencesSync();
      break;
    case 'start_picker':
      startPicker(message.tabId);
      break;
    case 'stop_picker':
      stopPicker(message.tabId);
      break;
    case 'resolve_protected_image':
      void handleProtectedImageResolveRequest(message.data || {});
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
  return directDownloadQuality
    .getQualityPreference()
    .then(async (qualityPreference) => {
      const response = await sendRequestToApp(
        'sync_download_preferences',
        {
          ytdlpQualityPreference: qualityPreference,
        },
        REQUEST_TIMEOUT_MS,
        {
          forceConnect: true,
        }
      );
      const success = Boolean(response?.success);
      await setPendingDownloadPreferencesSync(!success);
      if (!success) {
        console.warn(
          '[FlowSelect] Download preferences sync was not acknowledged:',
          response?.data?.code || response?.message || 'unknown'
        );
      }
      return success;
    })
    .catch(async (error) => {
      console.error('[FlowSelect] Failed to sync download preferences:', error);
      await setPendingDownloadPreferencesSync(true);
      return false;
    });
}

function bootstrapDownloadPreferencesSync() {
  return setPendingDownloadPreferencesSync(true).then(() => {
    return syncDownloadPreferencesToApp();
  });
}

function markDownloadPreferencesDirtyAndSync() {
  void bootstrapDownloadPreferencesSync();
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

function normalizeSelectionScope(value) {
  if (value === 'current_item') return 'current_item';
  if (value === 'playlist') return 'playlist';
  return null;
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
    const pageUrl = selectFirstHttpUrl(message.pageUrl, sender.tab?.url, message.url);
    const requestedUrl = selectFirstHttpUrl(message.url, pageUrl);
    const selectionScope = normalizeSelectionScope(message.selectionScope);
    const platform = directDownloadQuality.getDirectPlatform([
      pageUrl,
      requestedUrl,
      message.pageUrl,
      message.videoUrl,
      message.url,
    ]);
    const videoCandidates = normalizeVideoCandidates(message.videoCandidates);
    const clipStartSec = normalizeClipTimeSeconds(message.clipStartSec);
    const clipEndSec = normalizeClipTimeSeconds(message.clipEndSec);
    Promise.all([
      getCookiesForUrl(pageUrl || requestedUrl || ''),
      directDownloadQuality.getQualityPreference(),
    ]).then(([cookies, qualityPreference]) => {
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
        url: preferredVideoUrl || requestedUrl || message.url,
        pageUrl: pageUrl || requestedUrl || message.pageUrl || sender.tab?.url || message.url,
        title: message.title,
        videoUrl: preferredVideoUrl,
        videoCandidates: prioritizedCandidates,
        selectionScope,
        clipStartSec: clipStartSec,
        clipEndSec: clipEndSec,
        ytdlpQualityPreference: qualityPreference,
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
  } else if (message.type === 'register_protected_image_drag') {
    const token = typeof message.token === 'string' ? message.token.trim() : '';
    const imageUrl = normalizeHttpUrl(message.imageUrl);
    const pageUrl = normalizeHttpUrl(message.pageUrl || sender.tab?.url);
    const tabId = sender.tab?.id;

    if (!token || !imageUrl || typeof tabId !== 'number') {
      sendResponse({
        success: false,
        reason: 'invalid_protected_image_drag',
      });
      return true;
    }

    cleanupProtectedImageDragRegistry();
    protectedImageDragRegistry.set(token, {
      tabId,
      frameId: typeof sender.frameId === 'number' ? sender.frameId : undefined,
      imageUrl,
      pageUrl,
      createdAt: Date.now(),
    });
    console.info('[FlowSelect] Registered protected image drag token:', {
      token,
      tabId,
      frameId: sender.frameId,
      imageUrl,
      pageUrl,
    });
    sendResponse({
      success: true,
    });
    return true;
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
      state: connectionState(),
      statusText: connectionStatusText(),
    });
  } else if (message.type === 'get_theme') {
    sendResponse({ theme: currentTheme });
  } else if (message.type === 'get_language') {
    Promise.resolve(languageInitializationPromise)
      .catch(() => currentLanguage)
      .then(() => {
        sendResponse({ language: currentLanguage });
      });
    return true;
  }
  return true;
});

if (chrome?.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name !== WS_RECONNECT_ALARM) {
      return;
    }

    if (!isConnected() && !isConnecting()) {
      connect({ force: true });
    }
  });
}

if (chrome?.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    connect({ force: true });
    void bootstrapDownloadPreferencesSync();
  });
}

if (chrome?.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    connect({ force: true });
    void bootstrapDownloadPreferencesSync();
  });
}

if (chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    if (
      !changes?.[directDownloadQuality.STORAGE_KEY]
      && !changes?.[directDownloadQuality.LEGACY_STORAGE_KEY]
    ) {
      return;
    }

    markDownloadPreferencesDirtyAndSync();
  });
}

// Auto-connect on startup
connect();
void bootstrapDownloadPreferencesSync();
