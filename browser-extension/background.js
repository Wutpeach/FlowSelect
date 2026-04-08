// FlowSelect Browser Extension - Background Service Worker
// WebSocket client for communication with FlowSelect desktop app

importScripts(
  "direct-download-quality.js",
  "generic-video-selection-utils.js",
  "injection-debug-config.js",
  "video-selection-routing.js",
);

let ws = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
const WS_URL = 'ws://127.0.0.1:39527';
const WS_RECONNECT_ALARM = 'flowselect-ws-reconnect';
const REQUEST_TIMEOUT_MS = 7000;
const CONNECTING_WAIT_TIMEOUT_MS = 500;
const VIDEO_SELECTION_CONNECT_TIMEOUT_MS = 3500;
const VIDEO_SELECTION_RETRY_CONNECT_TIMEOUT_MS = 5000;
const PROTECTED_IMAGE_DRAG_TTL_MS = 2 * 60 * 1000;
const PROTECTED_IMAGE_RESOLUTION_TIMEOUT_MS = 15000;
const PROTECTED_IMAGE_BACKGROUND_FETCH_TIMEOUT_MS = 12000;
const XIAOHONGSHU_DRAG_TTL_MS = 2 * 60 * 1000;
const XIAOHONGSHU_DRAG_RESOLUTION_TIMEOUT_MS = 15000;
const CONNECTING_STATUS_TEXT = 'Connecting';
const OFFLINE_STATUS_TEXT = 'Offline';
const FALLBACK_LANGUAGE = 'en';
const LANGUAGE_STORAGE_KEY = 'flowselectCurrentLanguage';
const PENDING_DOWNLOAD_PREFERENCES_SYNC_KEY = 'flowselectPendingDownloadPreferencesSync';
const WS_ACTION_GET_LANGUAGE = 'get_language';
const WS_ACTION_LANGUAGE_INFO = 'language_info';
const WS_ACTION_LANGUAGE_CHANGED = 'language_changed';
const INTERNAL_VIDEO_SELECTION_MESSAGE = 'video_selection';
const INTERNAL_RESOLVE_VIDEO_SELECTION_MESSAGE = 'flowselect_resolve_video_selection';
const INTERNAL_RESOLVE_XIAOHONGSHU_CONTEXT_MEDIA_MESSAGE = 'resolve_xiaohongshu_context_media';
const INTERNAL_PAGE_IMAGE_SELECTION_MESSAGE = 'save_image_from_page';
const INTERNAL_REGISTER_XIAOHONGSHU_DRAG_MESSAGE = 'register_xiaohongshu_drag';
const APP_VIDEO_SELECTION_ACTION = 'video_selected_v2';
const CONTEXT_MENU_DOWNLOAD_VIDEO_ID = 'flowselect_download_video';
const pendingRequests = new Map();
const protectedImageDragRegistry = new Map();
const xiaohongshuDragRegistry = new Map();
let requestCounter = 0;
let lastConnectionIssue = OFFLINE_STATUS_TEXT;

// Store current theme from desktop app
let currentTheme = 'black';
let currentLanguage = resolvePreferredLanguage(undefined, self.navigator?.language);
const directDownloadQuality = self.FlowSelectDirectDownloadQuality;
const genericVideoSelectionUtils = self.FlowSelectGenericVideoSelectionUtils;
const injectionDebugConfig = self.FlowSelectInjectionDebugConfig;
const videoSelectionRouting = self.FlowSelectVideoSelectionRouting;
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

  void ensureContextMenus();

  return currentLanguage;
}

function getContextMenuTitle() {
  return currentLanguage === 'zh-CN'
    ? '使用 FlowSelect 下载当前媒体'
    : 'Download Current Media with FlowSelect';
}

function ensureContextMenus() {
  if (!chrome?.contextMenus?.removeAll || !chrome?.contextMenus?.create) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create(
        {
          id: CONTEXT_MENU_DOWNLOAD_VIDEO_ID,
          title: getContextMenuTitle(),
          contexts: ['video', 'page', 'frame', 'link', 'image'],
        },
        () => {
          if (chrome.runtime?.lastError) {
            console.warn('[FlowSelect] Failed to create context menu:', chrome.runtime.lastError.message);
            resolve(false);
            return;
          }

          resolve(true);
        },
      );
    });
  });
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

function requestLanguageFromApp(socket = ws) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    socket.send(JSON.stringify({ action: WS_ACTION_GET_LANGUAGE }));
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

function isCurrentSocket(socket) {
  return ws === socket;
}

function detachSocketHandlers(socket) {
  if (!socket) {
    return;
  }

  socket.onopen = null;
  socket.onmessage = null;
  socket.onclose = null;
  socket.onerror = null;
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

function normalizeMediaSelectionPayload(message) {
  const requestedUrl = normalizeHttpUrl(message?.url);
  const pageUrl = normalizeHttpUrl(message?.pageUrl);
  const selectionScope = normalizeSelectionScope(message?.selectionScope) || 'current_item';
  const videoCandidates = normalizeVideoCandidates(message?.videoCandidates);
  const videoUrl = normalizeHttpUrl(message?.videoUrl);
  const siteHint = deriveSiteHint([
    message?.siteHint,
    pageUrl,
    requestedUrl,
    videoUrl,
  ]);
  const clipStartSec = normalizeClipTimeSeconds(message?.clipStartSec);
  const clipEndSec = normalizeClipTimeSeconds(message?.clipEndSec);

  return {
    requestedUrl,
    pageUrl,
    selectionScope,
    videoCandidates,
    videoUrl,
    siteHint,
    clipStartSec,
    clipEndSec,
    title: typeof message?.title === 'string' ? message.title : undefined,
  };
}

function buildSelectionCandidateFromUrl(rawUrl, source = 'context_menu_src') {
  const url = normalizeHttpUrl(rawUrl);
  if (!url) {
    return [];
  }

  const type = genericVideoSelectionUtils?.classifyVideoCandidateType
    ? genericVideoSelectionUtils.classifyVideoCandidateType(url)
    : 'indirect_media';

  return [{
    url,
    type,
    confidence: type === 'direct_mp4' ? 'high' : 'medium',
    source,
    mediaType: 'video',
  }];
}

function isLikelyContentPageUrl(rawUrl) {
  const normalized = normalizeHttpUrl(rawUrl);
  if (!normalized) {
    return false;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.pathname === '/' || parsed.pathname === '') {
      return false;
    }

    if (
      /(?:^|\.)xiaohongshu\.com$/i.test(parsed.hostname)
      && /^\/user\/profile\//i.test(parsed.pathname)
    ) {
      return false;
    }

    return !/\.(?:mp4|m4v|mov|webm|m3u8|mpd|jpg|jpeg|png|webp|gif|svg)(?:[?#]|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isLikelyImageUrl(rawUrl) {
  const normalized = normalizeHttpUrl(rawUrl);
  if (!normalized) {
    return false;
  }

  try {
    const parsed = new URL(normalized);
    return (
      /\.(?:jpg|jpeg|png|webp|gif|bmp|svg|avif)(?:[?#]|$)/i.test(parsed.pathname)
      || /(?:imageView2|format\/(?:jpe?g|png|webp|gif)|notes_pre_post|!nc_)/i.test(normalized)
      || (/xhscdn\.com/i.test(parsed.hostname) && !/\.(?:mp4|m4v|mov|m3u8|mpd)(?:[?#]|$)/i.test(normalized))
    );
  } catch {
    return false;
  }
}

function buildContextMenuFallbackSelection(info, tab) {
  const pageUrl = selectFirstHttpUrl(info?.linkUrl, info?.pageUrl, info?.frameUrl, tab?.url);
  const directVideoUrl = normalizeHttpUrl(info?.srcUrl);
  const routeUrl = isLikelyContentPageUrl(pageUrl) ? pageUrl : (directVideoUrl || pageUrl);
  if (!routeUrl) {
    return null;
  }

  return {
    url: routeUrl,
    pageUrl: pageUrl || routeUrl,
    videoUrl: directVideoUrl || undefined,
    videoCandidates: buildSelectionCandidateFromUrl(directVideoUrl, 'context_menu_src'),
    title: typeof tab?.title === 'string' ? tab.title : undefined,
    selectionScope: 'current_item',
  };
}

function normalizeOriginalFilename(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null;
}

function buildContextMenuImageSelection(info, tab) {
  const imageUrl = normalizeHttpUrl(info?.srcUrl);
  if (!imageUrl) {
    return null;
  }

  const pageUrl = selectFirstHttpUrl(info?.linkUrl, info?.pageUrl, info?.frameUrl, tab?.url, imageUrl);
  return {
    url: imageUrl,
    pageUrl: pageUrl || imageUrl,
    originalFilename: normalizeOriginalFilename(info?.selectionText) || deriveFilenameFromUrl(imageUrl) || undefined,
  };
}

function handlePageImageSelectionRequest(message, senderContext = {}) {
  const imageUrl = normalizeHttpUrl(message?.url || message?.imageUrl);
  const pageUrl = selectFirstHttpUrl(
    message?.pageUrl,
    message?.linkUrl,
    senderContext.tabUrl,
    imageUrl,
  );
  const originalFilename = normalizeOriginalFilename(message?.originalFilename);

  if (!imageUrl) {
    return Promise.resolve({
      success: false,
      connected: isConnected(),
      reason: 'invalid_image_url',
    });
  }

  return downloadProtectedImageViaDesktopApp(
    imageUrl,
    pageUrl || senderContext.tabUrl || imageUrl,
    null,
    originalFilename || undefined,
  ).then((result) => {
    if (!result?.success) {
      console.warn(
        '[FlowSelect] Image selection request was not completed:',
        result?.data?.code || result?.message || 'unknown',
      );
    }

    return {
      success: Boolean(result?.success),
      connected: isConnected(),
      reason: result?.data?.code || null,
    };
  }).catch((error) => {
    console.error('[FlowSelect] Failed to prepare image selection request:', error);
    return {
      success: false,
      connected: isConnected(),
      reason: 'prepare_failed',
    };
  });
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

function shouldRetryVideoSelectionRequest(result) {
  if (result?.success) {
    return false;
  }

  const code = result?.data?.code || result?.message || '';
  return code === 'not_connected' || code === 'send_failed';
}

function notifyExtensionInjectionDebugConfigUpdate(enabled) {
  chrome.runtime.sendMessage({
    type: 'extension_injection_debug_config_update',
    enabled: enabled === true,
  }).catch(() => {});
}

async function setExtensionInjectionDebugEnabled(enabled) {
  const normalized = enabled === true;

  if (!injectionDebugConfig?.setEnabled) {
    return normalized;
  }

  try {
    await injectionDebugConfig.setEnabled(normalized);
    notifyExtensionInjectionDebugConfigUpdate(normalized);
    return normalized;
  } catch (error) {
    console.error('[FlowSelect] Failed to persist injection debug config:', error);
    return normalized;
  }
}

function syncExtensionInjectionDebugConfigFromApp() {
  return sendRequestToApp(
    'get_extension_debug_config',
    {},
    REQUEST_TIMEOUT_MS,
    {
      forceConnect: true,
    }
  ).then((response) => {
    if (!response?.success) {
      console.warn(
        '[FlowSelect] Failed to sync extension injection debug config:',
        response?.data?.code || response?.message || 'unknown'
      );
      return false;
    }

    const enabled = response?.data?.enabled === true;
    return setExtensionInjectionDebugEnabled(enabled).then(() => true);
  }).catch((error) => {
    console.error('[FlowSelect] Failed to sync extension injection debug config:', error);
    return false;
  });
}

function clearExtensionInjectionDebugConfigOnDisconnect() {
  void setExtensionInjectionDebugEnabled(false);
}

function resetSocketForRetry() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  clearReconnectAlarm();

  if (!ws) {
    return;
  }

  const socket = ws;
  detachSocketHandlers(socket);
  ws = null;

  try {
    socket.close();
  } catch (_) {
    // Ignore close failures while forcing a fresh connection for retry.
  }
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

function normalizeSiteHint(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === 'youtube' || normalized === 'yt' || normalized === 'youtu' || normalized === 'youtu.be') {
    return 'youtube';
  }
  if (normalized === 'bilibili' || normalized === 'bili' || normalized === 'b23') {
    return 'bilibili';
  }
  if (normalized === 'twitter' || normalized === 'x' || normalized === 'twitter-x') {
    return 'twitter-x';
  }
  if (normalized === 'douyin') {
    return 'douyin';
  }
  if (normalized === 'xiaohongshu' || normalized === 'xhs') {
    return 'xiaohongshu';
  }
  if (normalized === 'pinterest') {
    return 'pinterest';
  }
  if (normalized === 'weibo' || normalized === 'weibo.cn') {
    return 'weibo';
  }
  if (normalized === 'generic') {
    return 'generic';
  }

  return null;
}

function deriveSiteHint(values) {
  for (const value of values) {
    const normalized = normalizeSiteHint(value);
    if (normalized) {
      return normalized;
    }
  }

  for (const rawValue of values) {
    const value = typeof rawValue === 'string' ? rawValue.toLowerCase() : '';
    if (!value) continue;

    if (value.includes('youtube.com/') || value.includes('youtu.be/')) {
      return 'youtube';
    }
    if (value.includes('bilibili.com/') || value.includes('b23.tv/') || value.includes('bilivideo.com/')) {
      return 'bilibili';
    }
    if (value.includes('twitter.com/') || value.includes('x.com/')) {
      return 'twitter-x';
    }
    if (
      value.includes('douyin.com/')
      || value.includes('douyinvod.com/')
      || value.includes('douyincdn.com/')
      || value.includes('bytecdn')
      || value.includes('bytedance')
    ) {
      return 'douyin';
    }
    if (value.includes('xiaohongshu.com/') || value.includes('xhslink.com/') || value.includes('xhscdn.com/')) {
      return 'xiaohongshu';
    }
    if (value.includes('pinterest.com/') || value.includes('pinimg.com/')) {
      return 'pinterest';
    }
    if (
      value.includes('weibo.com/')
      || value.includes('weibo.cn/')
      || value.includes('m.weibo.com/')
      || value.includes('m.weibo.cn/')
      || value.includes('video.weibo.com/')
    ) {
      return 'weibo';
    }
  }

  return null;
}

function summarizeVideoSelectionForDebug(payload) {
  const normalizedTitle = typeof payload?.title === 'string' ? payload.title.trim() : '';
  const normalizedCandidates = Array.isArray(payload?.videoCandidates) ? payload.videoCandidates : [];

  return {
    url: normalizeHttpUrl(payload?.url) || null,
    pageUrl: normalizeHttpUrl(payload?.pageUrl) || null,
    videoUrl: normalizeHttpUrl(payload?.videoUrl) || null,
    selectionScope: typeof payload?.selectionScope === 'string' ? payload.selectionScope : null,
    siteHint: typeof payload?.siteHint === 'string' ? payload.siteHint : null,
    titlePresent: normalizedTitle.length > 0,
    cookiesPresent: typeof payload?.cookies === 'string' && payload.cookies.trim().length > 0,
    videoCandidateCount: normalizedCandidates.length,
    clipStartSec: Number.isFinite(payload?.clipStartSec) ? payload.clipStartSec : null,
    clipEndSec: Number.isFinite(payload?.clipEndSec) ? payload.clipEndSec : null,
    ytdlpQualityPreference:
      typeof payload?.ytdlpQualityPreference === 'string' ? payload.ytdlpQualityPreference : null,
  };
}

function logInjectedVideoSelectionDebug(message, payload) {
  if (typeof payload === 'undefined') {
    console.info(`[FlowSelect] ${message}`);
    return;
  }

  console.info(`[FlowSelect] ${message}`, payload);
}

function cleanupProtectedImageDragRegistry() {
  const now = Date.now();
  for (const [token, entry] of protectedImageDragRegistry.entries()) {
    if (!entry || typeof entry.createdAt !== 'number' || now - entry.createdAt > PROTECTED_IMAGE_DRAG_TTL_MS) {
      protectedImageDragRegistry.delete(token);
    }
  }
}

function cleanupXiaohongshuDragRegistry() {
  const now = Date.now();
  for (const [token, entry] of xiaohongshuDragRegistry.entries()) {
    if (!entry || typeof entry.createdAt !== 'number' || now - entry.createdAt > XIAOHONGSHU_DRAG_TTL_MS) {
      xiaohongshuDragRegistry.delete(token);
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

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => reject(new Error('Failed to read protected image blob'));
    reader.readAsDataURL(blob);
  });
}

function buildCookieHeader(cookies) {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return '';
  }

  return cookies
    .filter((cookie) => typeof cookie?.name === 'string' && typeof cookie?.value === 'string')
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

async function getCookieHeaderForRequestUrl(url) {
  const normalizedUrl = normalizeHttpUrl(url);
  if (!normalizedUrl) {
    return '';
  }

  try {
    const cookies = await chrome.cookies.getAll({ url: normalizedUrl });
    return buildCookieHeader(cookies);
  } catch (error) {
    console.warn('[FlowSelect] Failed to read cookies for protected image request:', error);
    return '';
  }
}

async function fetchProtectedImageInBackground(imageUrl, pageUrl) {
  const normalizedUrl = normalizeHttpUrl(imageUrl);
  if (!normalizedUrl) {
    return {
      success: false,
      code: 'protected_image_invalid_url',
      error: 'Invalid protected image URL',
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error('Protected image background fetch timed out'));
  }, PROTECTED_IMAGE_BACKGROUND_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(normalizedUrl, {
      credentials: 'include',
      cache: 'force-cache',
      referrer: normalizeHttpUrl(pageUrl) || undefined,
      referrerPolicy: 'strict-origin-when-cross-origin',
      headers: {
        Accept: 'image/*,*/*;q=0.8',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        success: false,
        code: 'protected_image_fetch_failed',
        error: `Protected image background fetch failed with status ${response.status}`,
      };
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      return {
        success: false,
        code: 'protected_image_non_image_response',
        error: 'Protected image background fetch returned non-image content',
      };
    }

    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return {
        success: false,
        code: 'protected_image_blob_encode_failed',
        error: 'Protected image background blob encoding failed',
      };
    }

    return {
      success: true,
      dataUrl,
      filename: deriveFilenameFromUrl(response.url || normalizedUrl),
    };
  } catch (error) {
    return {
      success: false,
      code: 'protected_image_background_fetch_failed',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function downloadProtectedImageViaDesktopApp(imageUrl, pageUrl, targetDir, originalFilename) {
  const normalizedUrl = normalizeHttpUrl(imageUrl);
  if (!normalizedUrl) {
    return buildRequestFailure('protected_image_invalid_url');
  }

  const normalizedPageUrl = normalizeHttpUrl(pageUrl);
  let originHeader;
  try {
    originHeader = normalizedPageUrl ? new URL(normalizedPageUrl).origin : undefined;
  } catch (error) {
    originHeader = undefined;
  }

  const headers = {
    Accept: 'image/*,*/*;q=0.8',
    Referer: normalizedPageUrl || undefined,
    Origin: originHeader,
    'User-Agent': self.navigator?.userAgent || undefined,
  };
  const cookieHeader = await getCookieHeaderForRequestUrl(normalizedUrl);
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  return sendRequestToApp(
    'save_image',
    {
      url: normalizedUrl,
      targetDir,
      originalFilename,
      requestHeaders: headers,
      referrer: normalizedPageUrl || undefined,
    },
    PROTECTED_IMAGE_RESOLUTION_TIMEOUT_MS,
  );
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

async function reportXiaohongshuDragResolutionResult(requestId, result) {
  if (!requestId) {
    return;
  }

  const response = await sendRequestToApp(
    'xiaohongshu_drag_resolution_result',
    {
      correlationRequestId: requestId,
      success: result?.success === true,
      kind: typeof result?.kind === 'string' ? result.kind : 'unknown',
      pageUrl: normalizeHttpUrl(result?.pageUrl),
      imageUrl: normalizeHttpUrl(result?.imageUrl),
      videoUrl: normalizeHttpUrl(result?.videoUrl),
      videoCandidates: normalizeVideoCandidates(result?.videoCandidates),
      code: typeof result?.code === 'string' ? result.code : undefined,
      error: typeof result?.error === 'string' ? result.error : undefined,
    },
    XIAOHONGSHU_DRAG_RESOLUTION_TIMEOUT_MS,
  );

  if (!response?.success) {
    console.warn(
      '[FlowSelect] xiaohongshu_drag_resolution_result was not acknowledged:',
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
    let resolution = await sendMessageToTab(
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
      console.warn(
        '[FlowSelect] Protected image tab resolution failed, trying extension background fetch:',
        resolution?.code || resolution?.error || 'unknown'
      );
      resolution = await fetchProtectedImageInBackground(imageUrl, pageUrl);
    }

    if (!resolution?.success || typeof resolution?.dataUrl !== 'string') {
      console.warn(
        '[FlowSelect] Protected image byte resolution failed, trying desktop authenticated download:',
        resolution?.code || resolution?.error || 'unknown'
      );
      const desktopDownloadResult = await downloadProtectedImageViaDesktopApp(
        imageUrl,
        pageUrl,
        targetDir,
        typeof resolution?.filename === 'string' && resolution.filename.trim()
          ? resolution.filename.trim()
          : deriveFilenameFromUrl(imageUrl) || undefined,
      );

      if (
        desktopDownloadResult?.success
        && typeof desktopDownloadResult.message === 'string'
        && desktopDownloadResult.message.trim()
      ) {
        console.info(
          '[FlowSelect] Protected image fallback saved via authenticated desktop download:',
          desktopDownloadResult.message.trim()
        );
        await reportProtectedImageResolutionResult(requestId, {
          success: true,
          filePath: desktopDownloadResult.message.trim(),
        });
        return;
      }

      await reportProtectedImageResolutionResult(requestId, {
        success: false,
        code: typeof desktopDownloadResult?.data?.code === 'string'
          ? desktopDownloadResult.data.code
          : typeof resolution?.code === 'string'
            ? resolution.code
            : 'protected_image_resolution_failed',
        error: typeof desktopDownloadResult?.message === 'string'
          ? desktopDownloadResult.message
          : typeof resolution?.error === 'string'
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

async function handleXiaohongshuDragResolveRequest(data) {
  cleanupXiaohongshuDragRegistry();

  const requestId = typeof data?.requestId === 'string' ? data.requestId.trim() : '';
  const token = typeof data?.token === 'string' ? data.token.trim() : '';
  console.info('[FlowSelect] Resolving Xiaohongshu drag in extension background:', {
    requestId,
    token,
    pageUrl: normalizeHttpUrl(data?.pageUrl) || null,
    noteId: typeof data?.noteId === 'string' ? data.noteId : null,
    imageUrl: normalizeHttpUrl(data?.imageUrl) || null,
    mediaType: typeof data?.mediaType === 'string' ? data.mediaType : null,
  });
  if (!requestId || !token) {
    await reportXiaohongshuDragResolutionResult(requestId, {
      success: false,
      kind: 'unknown',
      code: 'xiaohongshu_drag_missing_request',
      error: 'Missing Xiaohongshu drag request metadata',
    });
    return;
  }

  const entry = xiaohongshuDragRegistry.get(token);
  if (!entry) {
    console.warn('[FlowSelect] Xiaohongshu drag token was missing in registry:', {
      requestId,
      token,
    });
    await reportXiaohongshuDragResolutionResult(requestId, {
      success: false,
      kind: 'unknown',
      code: 'xiaohongshu_drag_token_missing',
      error: 'Xiaohongshu drag token was missing or expired',
    });
    return;
  }

  try {
    const resolution = await sendMessageToTab(
      entry.tabId,
      {
        type: 'resolve_xiaohongshu_drag',
        token,
        pageUrl: normalizeHttpUrl(data?.pageUrl) || entry.pageUrl,
        noteId: typeof data?.noteId === 'string' && data.noteId.trim() ? data.noteId.trim() : entry.noteId,
        imageUrl: normalizeHttpUrl(data?.imageUrl) || entry.imageUrl,
        mediaType:
          typeof data?.mediaType === 'string' && data.mediaType.trim()
            ? data.mediaType.trim()
            : entry.mediaType,
      },
      { frameId: entry.frameId },
    );

    console.info('[FlowSelect] Xiaohongshu drag tab resolution completed:', {
      requestId,
      token,
      tabId: entry.tabId,
      frameId: entry.frameId,
      success: resolution?.success === true,
      kind: typeof resolution?.kind === 'string' ? resolution.kind : 'unknown',
      imageUrl: normalizeHttpUrl(resolution?.imageUrl) || null,
      videoUrl: normalizeHttpUrl(resolution?.videoUrl) || null,
      videoCandidatesCount: Array.isArray(resolution?.videoCandidates)
        ? resolution.videoCandidates.length
        : 0,
      code: typeof resolution?.code === 'string' ? resolution.code : null,
      error: typeof resolution?.error === 'string' ? resolution.error : null,
    });

    await reportXiaohongshuDragResolutionResult(requestId, {
      success: resolution?.success === true,
      kind: typeof resolution?.kind === 'string' ? resolution.kind : 'unknown',
      pageUrl: normalizeHttpUrl(resolution?.pageUrl) || entry.pageUrl,
      imageUrl: normalizeHttpUrl(resolution?.imageUrl) || entry.imageUrl,
      videoUrl: normalizeHttpUrl(resolution?.videoUrl),
      videoCandidates: normalizeVideoCandidates(resolution?.videoCandidates),
      code: typeof resolution?.code === 'string' ? resolution.code : undefined,
      error: typeof resolution?.error === 'string' ? resolution.error : undefined,
    });
  } catch (error) {
    console.warn('[FlowSelect] Xiaohongshu drag resolution failed in extension background:', {
      requestId,
      token,
      error: error instanceof Error ? error.message : String(error),
    });
    await reportXiaohongshuDragResolutionResult(requestId, {
      success: false,
      kind: 'unknown',
      pageUrl: entry.pageUrl,
      imageUrl: entry.imageUrl,
      code: 'xiaohongshu_drag_resolution_failed',
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

  if (ws) {
    detachSocketHandlers(ws);
  }

  const shouldNotifyConnecting = reconnectAttempts === 0 && !hasUnavailableIssue();
  if (shouldNotifyConnecting) {
    lastConnectionIssue = CONNECTING_STATUS_TEXT;
    notifyConnectionStatus();
  }

  const socket = new WebSocket(WS_URL);
  ws = socket;

  socket.onopen = () => {
    if (!isCurrentSocket(socket)) {
      return;
    }

    console.info('[FlowSelect] Connected to desktop app');
    reconnectAttempts = 0;
    lastConnectionIssue = '';
    notifyConnectionStatus();
    clearReconnectAlarm();

    try {
      // Query current theme after connection.
      socket.send(JSON.stringify({ action: 'get_theme' }));
    } catch (error) {
      console.warn('[FlowSelect] Failed to request theme from desktop app:', error);
    }

    requestLanguageFromApp(socket);
    void bootstrapDownloadPreferencesSync();
    void syncExtensionInjectionDebugConfigFromApp();
  };

  socket.onmessage = (event) => {
    if (!isCurrentSocket(socket)) {
      return;
    }

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

  socket.onclose = () => {
    if (!isCurrentSocket(socket)) {
      return;
    }

    console.info('[FlowSelect] Disconnected');
    clearExtensionInjectionDebugConfigOnDisconnect();
    rejectPendingRequests('ws_closed');
    detachSocketHandlers(socket);
    ws = null;
    lastConnectionIssue = unavailableStatusText();
    notifyConnectionStatus();
    scheduleReconnect();
  };

  socket.onerror = () => {
    if (!isCurrentSocket(socket)) {
      return;
    }

    if (!isConnected()) {
      clearExtensionInjectionDebugConfigOnDisconnect();
      lastConnectionIssue = unavailableStatusText();
      console.warn('[FlowSelect] WebSocket unavailable. Open the FlowSelect desktop app to enable browser-extension features.');
      notifyConnectionStatus();
      scheduleReconnect();
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
    case 'extension_debug_config_changed':
    case 'extension_debug_config_info':
      void setExtensionInjectionDebugEnabled(message.data?.enabled === true || message.enabled === true);
      break;
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
    case 'resolve_xiaohongshu_drag':
      void handleXiaohongshuDragResolveRequest(message.data || {});
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
  const sendSelectionRequest = (action) => sendRequestToApp(
    action,
    data,
    REQUEST_TIMEOUT_MS,
    {
      connectTimeoutMs: VIDEO_SELECTION_CONNECT_TIMEOUT_MS,
      forceConnect: true,
    }
  );

  return sendSelectionRequest(APP_VIDEO_SELECTION_ACTION).then(async (result) => {
    if (!shouldRetryVideoSelectionRequest(result)) {
      return result;
    }

    console.info(
      '[FlowSelect] Retrying video selection after recoverable connection failure:',
      result?.data?.code || result?.message || 'unknown'
    );
    resetSocketForRetry();

    const connected = await ensureConnection(
      VIDEO_SELECTION_RETRY_CONNECT_TIMEOUT_MS,
      { force: true }
    );
    if (!connected) {
      return result;
    }

    return sendSelectionRequest(APP_VIDEO_SELECTION_ACTION);
  });
}

function normalizeVideoCandidates(rawCandidates) {
  if (!Array.isArray(rawCandidates)) return [];

  const normalizeMediaType = (value) => {
    if (value === 'video' || value === 'image') {
      return value;
    }
    return undefined;
  };

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
      mediaType: normalizeMediaType(candidate.mediaType ?? candidate.media_type),
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

function handleVideoSelectionRequest(message, senderContext = {}) {
  const normalized = normalizeMediaSelectionPayload(message);
  const requestedUrl = normalized.requestedUrl;
  const pageUrl = selectFirstHttpUrl(normalized.pageUrl, senderContext.tabUrl, requestedUrl);
  const selectionScope = normalized.selectionScope;
  const videoCandidates = normalized.videoCandidates;
  const siteHint = deriveSiteHint([
    normalized.siteHint,
    pageUrl,
    requestedUrl,
    normalized.videoUrl,
    senderContext.tabUrl,
  ]);

  return Promise.all([
    getCookiesForUrl(pageUrl || requestedUrl || ''),
    directDownloadQuality.getQualityPreference(),
    injectionDebugConfig?.getEnabled ? injectionDebugConfig.getEnabled() : Promise.resolve(false),
  ]).then(([cookies, qualityPreference, injectionDebugEnabled]) => {
    console.info('[FlowSelect] Using yt-dlp quality preference:', qualityPreference);
    const resolvedRouting = videoSelectionRouting?.resolveVideoSelectionRouting
      ? videoSelectionRouting.resolveVideoSelectionRouting({
          requestedUrl,
          pageUrl,
          senderTabUrl: senderContext.tabUrl,
          fallbackUrl: message.url,
        })
      : {
          routeUrl: requestedUrl || pageUrl || normalizeHttpUrl(senderContext.tabUrl) || normalizeHttpUrl(message.url),
          pageUrl: pageUrl || normalizeHttpUrl(senderContext.tabUrl) || requestedUrl || normalizeHttpUrl(message.url),
        };

    const forwardedPayload = {
      url: resolvedRouting.routeUrl || requestedUrl || message.url,
      pageUrl: resolvedRouting.pageUrl || pageUrl || requestedUrl || message.pageUrl || senderContext.tabUrl || message.url,
      siteHint,
      title: normalized.title,
      videoUrl: normalized.videoUrl,
      videoCandidates,
      selectionScope,
      clipStartSec: normalized.clipStartSec,
      clipEndSec: normalized.clipEndSec,
      ytdlpQualityPreference: qualityPreference,
      cookies,
    };

    if (injectionDebugEnabled) {
      logInjectedVideoSelectionDebug(
        'Injected video_selection request received',
        {
          ...summarizeVideoSelectionForDebug({
            ...message,
            pageUrl,
            selectionScope,
            siteHint,
            clipStartSec: normalized.clipStartSec,
            clipEndSec: normalized.clipEndSec,
          }),
          senderTabUrl: normalizeHttpUrl(senderContext.tabUrl) || null,
        },
      );
      logInjectedVideoSelectionDebug(
        'Forwarding video_selected_v2 payload',
        summarizeVideoSelectionForDebug(forwardedPayload),
      );
    }

    return queueVideoSelectionToApp(forwardedPayload);
  }).then((result) => ({
    success: Boolean(result?.success),
    connected: isConnected(),
    reason: result?.data?.code || null,
  })).catch((error) => {
    console.error('[FlowSelect] Failed to prepare video selection request:', error);
    return {
      success: false,
      connected: isConnected(),
      reason: 'prepare_failed',
    };
  });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function requestResolvedVideoSelection(tabId, options = {}) {
  try {
    const response = await sendMessageToTab(
      tabId,
      {
        type: INTERNAL_RESOLVE_VIDEO_SELECTION_MESSAGE,
        source: options.source || 'popup',
        requestedSrcUrl: options.requestedSrcUrl || undefined,
      },
      typeof options.frameId === 'number' ? { frameId: options.frameId } : {},
    );

    if (response?.success && response.payload && typeof response.payload === 'object') {
      return response.payload;
    }
  } catch (error) {
    console.warn('[FlowSelect] Failed to resolve in-tab video selection:', error);
  }

  return null;
}

async function requestResolvedXiaohongshuContextMedia(tabId, options = {}) {
  try {
    const response = await sendMessageToTab(
      tabId,
      {
        type: INTERNAL_RESOLVE_XIAOHONGSHU_CONTEXT_MEDIA_MESSAGE,
        source: options.source || 'context_menu',
        linkUrl: options.linkUrl || undefined,
        imageUrl: options.imageUrl || undefined,
        frameUrl: options.frameUrl || undefined,
        pageUrl: options.pageUrl || undefined,
        mediaType: options.mediaType || undefined,
      },
      typeof options.frameId === 'number' ? { frameId: options.frameId } : {},
    );

    if (response?.success && response.payload && typeof response.payload === 'object') {
      return response.payload;
    }
  } catch (error) {
    console.warn('[FlowSelect] Failed to resolve Xiaohongshu context media:', error);
  }

  return null;
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === INTERNAL_VIDEO_SELECTION_MESSAGE) {
    handleVideoSelectionRequest(message, {
      tabUrl: sender.tab?.url,
    }).then(sendResponse);
  } else if (message.type === INTERNAL_PAGE_IMAGE_SELECTION_MESSAGE) {
    handlePageImageSelectionRequest(message, {
      tabUrl: sender.tab?.url,
    }).then(sendResponse);
    return true;
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
  } else if (message.type === INTERNAL_REGISTER_XIAOHONGSHU_DRAG_MESSAGE) {
    const token = typeof message.token === 'string' ? message.token.trim() : '';
    const pageUrl = normalizeHttpUrl(message.pageUrl || sender.tab?.url);
    const noteId = typeof message.noteId === 'string' && message.noteId.trim()
      ? message.noteId.trim()
      : null;
    const imageUrl = normalizeHttpUrl(message.imageUrl);
    const mediaType = typeof message.mediaType === 'string' && message.mediaType.trim()
      ? message.mediaType.trim()
      : null;
    const tabId = sender.tab?.id;

    if (!token || !pageUrl || typeof tabId !== 'number') {
      sendResponse({
        success: false,
        reason: 'invalid_xiaohongshu_drag',
      });
      return true;
    }

    cleanupXiaohongshuDragRegistry();
    xiaohongshuDragRegistry.set(token, {
      tabId,
      frameId: typeof sender.frameId === 'number' ? sender.frameId : undefined,
      pageUrl,
      noteId,
      imageUrl,
      mediaType,
      createdAt: Date.now(),
    });
    console.info('[FlowSelect] Registered Xiaohongshu drag token:', {
      token,
      tabId,
      frameId: sender.frameId,
      pageUrl,
      noteId,
      imageUrl,
      mediaType,
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
  } else if (message.type === 'download_current_video') {
    getActiveTab().then(async (tab) => {
      if (!tab?.id) {
        sendResponse({
          success: false,
          connected: isConnected(),
          reason: 'no_active_tab',
        });
        return;
      }

      const resolvedSelection = await requestResolvedVideoSelection(tab.id, {
        source: 'popup',
      });

      if (!resolvedSelection) {
        sendResponse({
          success: false,
          connected: isConnected(),
          reason: 'no_video_found',
        });
        return;
      }

      const result = await handleVideoSelectionRequest(resolvedSelection, {
        tabUrl: tab.url,
      });
      sendResponse(result);
    }).catch((error) => {
      console.error('[FlowSelect] Failed to trigger current video download:', error);
      sendResponse({
        success: false,
        connected: isConnected(),
        reason: 'prepare_failed',
      });
    });
    return true;
  }
  return true;
});

if (chrome?.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_DOWNLOAD_VIDEO_ID || !tab?.id) {
      return;
    }

    const siteHint = deriveSiteHint([
      info?.linkUrl,
      info?.srcUrl,
      info?.pageUrl,
      info?.frameUrl,
      tab?.url,
    ]);
    const frameId = typeof info.frameId === 'number' ? info.frameId : undefined;
    const normalizedMediaType = info?.mediaType === 'image' || info?.mediaType === 'video'
      ? info.mediaType
      : undefined;

    void Promise.resolve().then(async () => {
      if (siteHint === 'xiaohongshu') {
        const resolvedMedia = await requestResolvedXiaohongshuContextMedia(tab.id, {
          source: 'context_menu',
          frameId,
          linkUrl: info?.linkUrl,
          imageUrl: info?.srcUrl,
          frameUrl: info?.frameUrl,
          pageUrl: info?.pageUrl,
          mediaType: normalizedMediaType,
        });

        if (resolvedMedia?.kind === 'image' && resolvedMedia.imageUrl) {
          return handlePageImageSelectionRequest({
            url: resolvedMedia.imageUrl,
            pageUrl: resolvedMedia.pageUrl || info?.linkUrl || info?.pageUrl,
          }, {
            tabUrl: tab.url,
          });
        }

        if (resolvedMedia?.pageUrl) {
          return handleVideoSelectionRequest({
            url: resolvedMedia.videoUrl || resolvedMedia.pageUrl,
            pageUrl: resolvedMedia.pageUrl,
            videoUrl: resolvedMedia.videoUrl || null,
            videoCandidates: resolvedMedia.videoCandidates || [],
            title: resolvedMedia.title,
            selectionScope: 'current_item',
          }, {
            tabUrl: tab.url,
          });
        }

        if (isLikelyImageUrl(info?.srcUrl)) {
          return handlePageImageSelectionRequest({
            url: info.srcUrl,
            pageUrl: info?.linkUrl || info?.pageUrl || info?.frameUrl || tab?.url,
          }, {
            tabUrl: tab.url,
          });
        }
      }

      if (normalizedMediaType === 'image' || isLikelyImageUrl(info?.srcUrl)) {
        const imageSelection = buildContextMenuImageSelection(info, tab);
        if (imageSelection) {
          return handlePageImageSelectionRequest(imageSelection, {
            tabUrl: tab.url,
          });
        }
      }

      const resolvedSelection = await requestResolvedVideoSelection(tab.id, {
        source: 'context_menu',
        requestedSrcUrl: info.srcUrl,
        frameId,
      });
      const payload = resolvedSelection || buildContextMenuFallbackSelection(info, tab);
      if (!payload) {
        console.warn('[FlowSelect] Context menu selection could not be resolved');
        return null;
      }

      return handleVideoSelectionRequest(payload, {
        tabUrl: tab.url,
      });
    }).then((result) => {
      if (!result || result.success) {
        return;
      }

      console.warn(
        '[FlowSelect] Context menu media request was not queued:',
        result.reason || 'unknown',
      );
    }).catch((error) => {
      console.error('[FlowSelect] Failed to queue context-menu media selection:', error);
    });
  });
}

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
    void ensureContextMenus();
    connect({ force: true });
    void bootstrapDownloadPreferencesSync();
  });
}

if (chrome?.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    void ensureContextMenus();
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
clearExtensionInjectionDebugConfigOnDisconnect();
void ensureContextMenus();
connect();
void bootstrapDownloadPreferencesSync();
