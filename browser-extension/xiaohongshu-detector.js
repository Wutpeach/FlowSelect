// FlowSelect Browser Extension - Xiaohongshu Video Detector
// Detects playable video source on note pages and injects a download button.

(function() {
  'use strict';

  const BUTTON_ID = 'flowselect-xhs-download-btn';
  const CONTROL_BUTTON_CLASS = 'flowselect-xhs-control-btn';
  const DRAG_PAYLOAD_MARKER = 'FLOWSELECT_XIAOHONGSHU_DRAG';
  const DRAG_PAYLOAD_MIME = 'application/x-flowselect-xiaohongshu-drag';
  const INTERNAL_REGISTER_XIAOHONGSHU_DRAG_MESSAGE = 'register_xiaohongshu_drag';
  const RESOLVE_XIAOHONGSHU_DRAG_MESSAGE = 'resolve_xiaohongshu_drag';
  const RESOLVE_XIAOHONGSHU_CONTEXT_MEDIA_MESSAGE = 'resolve_xiaohongshu_context_media';
  const NAVIGATE_XIAOHONGSHU_NOTE_MESSAGE = 'navigate_xiaohongshu_note';
  const NOTE_LINK_CACHE_KEY = '__FLOWSELECT_XHS_NOTE_LINK_CACHE';
  const NOTE_LINK_CACHE_NODE_ID = 'flowselect-xhs-note-link-cache';
  const CONTEXT_SELECTION_TTL_MS = 10_000;
  const XIAOHONGSHU_FEED_API_PATH = '/api/sns/web/v1/feed';
  const XIAOHONGSHU_NOTE_DETAIL_PATH = '/api/sns/web/v1/note';
  const XIAOHONGSHU_IMAGE_SCENES = ['CRD_PRV_WEBP', 'CRD_WM_WEBP', 'CRD_WM_JPG'];
  const CAT_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" fill-rule="evenodd" d="M11.75 6.406c-1.48 0-1.628.157-2.394.157C8.718 6.563 6.802 5 5.845 5S3.77 5.563 3.77 7.188v1.875c.002.492.18 2 .88 1.597c-.827.978-.91 2.119-.899 3.223c-.223.064-.45.137-.671.212c-.684.234-1.41.532-1.737.744a.75.75 0 0 0 .814 1.26c.156-.101.721-.35 1.408-.585l.228-.075c.046.433.161.83.332 1.19l-.024.013c-.41.216-.79.465-1.032.623l-.113.074a.75.75 0 1 0 .814 1.26l.131-.086c.245-.16.559-.365.901-.545q.12-.064.231-.116C6.763 19.475 9.87 20 11.75 20s4.987-.525 6.717-2.148q.11.052.231.116c.342.18.656.385.901.545l.131.086a.75.75 0 0 0 .814-1.26l-.113-.074a13 13 0 0 0-1.032-.623l-.024-.013c.171-.36.286-.757.332-1.19l.228.075c.687.235 1.252.484 1.409.585a.75.75 0 0 0 .813-1.26c-.327-.212-1.053-.51-1.736-.744a16 16 0 0 0-.672-.213c.012-1.104-.072-2.244-.9-3.222c.7.403.88-1.105.881-1.598V7.188C19.73 5.563 18.613 5 17.655 5c-.957 0-2.873 1.563-3.51 1.563c-.767 0-.915-.157-2.395-.157m-.675 9.194c.202-.069.441-.1.675-.1s.473.031.676.1c.1.034.22.088.328.174a.62.62 0 0 1 .246.476c0 .23-.139.39-.246.476s-.229.14-.328.174c-.203.069-.442.1-.676.1s-.473-.031-.675-.1a1.1 1.1 0 0 1-.329-.174a.62.62 0 0 1-.246-.476c0-.23.139-.39.246-.476s.23-.14.329-.174m2.845-3.1c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812m-5.96 0c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812" clip-rule="evenodd"/>
  </svg>`;
  let lastContextPayload = null;
  const NOTE_LINK_SELECTOR = 'a[href*="/explore/"], a[href*="/discovery/item/"], a[href*="/user/profile/"]';

  function redactToken(token) {
    if (typeof token !== 'string' || !token) {
      return null;
    }
    return token.length <= 12
      ? token
      : `${token.slice(0, 8)}...${token.slice(-4)}`;
  }

  function previewCandidates(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return [];
    }
    return candidates.slice(0, 3).map((candidate) => ({
      type: candidate?.type || null,
      source: candidate?.source || null,
      url: typeof candidate?.url === 'string' ? candidate.url.slice(0, 140) : null,
    }));
  }

  function logXhsDragResolution(stage, details = {}) {
    console.info(`[FlowSelect XHS] ${stage}`, details);
  }

  function isVideoPage() {
    return Boolean(normalizeNoteUrl(window.location.href));
  }

  function normalizeNoteUrl(url) {
    const normalized = normalizeUrl(url);
    if (!normalized) return null;

    try {
      const parsed = new URL(normalized);
      if (!/\.?(xiaohongshu\.com|xhslink\.com)$/i.test(parsed.hostname)) {
        return null;
      }

      const isLegacyNotePath =
        parsed.pathname.includes('/explore/') || parsed.pathname.includes('/discovery/item/');
      const profileNoteMatch = parsed.pathname.match(/^\/user\/profile\/[^/?#]+\/([a-zA-Z0-9]+)(?:[/?#]|$)/i);
      if (!isLegacyNotePath && !profileNoteMatch) {
        return null;
      }
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    } catch (_) {
      return null;
    }
  }

  function encodeUtf8Base64(value) {
    try {
      return btoa(
        encodeURIComponent(value).replace(/%([0-9A-F]{2})/gi, (_, hex) =>
          String.fromCharCode(Number.parseInt(hex, 16)),
        ),
      );
    } catch (_) {
      return '';
    }
  }

  function buildDragPayloadText(payload) {
    const encoded = encodeUtf8Base64(JSON.stringify(payload));
    return encoded ? `${DRAG_PAYLOAD_MARKER}:${encoded}` : '';
  }

  function normalizeUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const normalized = url.replace(/\\u002F/g, '/').trim();
    if (!normalized.startsWith('http') || normalized.startsWith('blob:')) return null;
    return normalized;
  }

  function nextToken() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `flowselect-xhs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeNoteId(raw) {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return /^[a-zA-Z0-9]+$/.test(trimmed) ? trimmed : null;
  }

  function getXiaohongshuNoteLinkCache() {
    const directCache = window[NOTE_LINK_CACHE_KEY];
    if (directCache && typeof directCache === 'object') {
      return directCache;
    }

    const cacheNode = document.getElementById(NOTE_LINK_CACHE_NODE_ID);
    if (!cacheNode?.textContent) {
      return null;
    }

    try {
      const parsed = JSON.parse(cacheNode.textContent);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function getCachedXiaohongshuNoteLink(noteId) {
    const normalizedNoteId = normalizeNoteId(noteId);
    if (!normalizedNoteId) {
      return null;
    }

    const cache = getXiaohongshuNoteLinkCache();
    if (!cache || typeof cache !== 'object') {
      return null;
    }

    const record = cache[normalizedNoteId];
    if (!record || typeof record !== 'object') {
      return null;
    }

    const detailUrl = normalizeUrl(record.detailUrl);
    if (!detailUrl || !/[?&]xsec_token=/i.test(detailUrl)) {
      return null;
    }

    return {
      noteId: normalizedNoteId,
      detailUrl,
      xsecToken:
        typeof record.xsecToken === 'string' && record.xsecToken.trim()
          ? record.xsecToken.trim()
          : null,
      xsecSource:
        typeof record.xsecSource === 'string' && record.xsecSource.trim()
          ? record.xsecSource.trim()
          : null,
      updatedAtMs:
        typeof record.updatedAtMs === 'number' && Number.isFinite(record.updatedAtMs)
          ? record.updatedAtMs
          : null,
    };
  }

  function extractNoteIdFromUrl(url) {
    const normalized = normalizeNoteUrl(url);
    if (!normalized) return null;

    try {
      const parsed = new URL(normalized);
      const match = parsed.pathname.match(
        /\/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)|^\/user\/profile\/[^/?#]+\/([a-zA-Z0-9]+)(?:[/?#]|$)/i,
      );
      return normalizeNoteId(match?.[1] || match?.[2] || null);
    } catch (_) {
      return null;
    }
  }

  function isLikelyVideoUrl(url) {
    const normalized = normalizeUrl(url);
    if (!normalized) return false;
    if (/\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp|css|js|json|txt|woff2?|ttf)(?:[?#]|$)/i.test(normalized)) {
      return false;
    }
    return (
      /\.(mp4|m4v|mov|m3u8)(?:[?#]|$)/i.test(normalized)
      || /:\/\/[^/]*video[^/]*\.xhscdn\.com\//i.test(normalized)
    );
  }

  function normalizeImageUrl(url) {
    const normalized = normalizeUrl(url);
    if (
      !normalized
      || isLikelyVideoUrl(normalized)
      || /\.(?:css|js|json|txt|map|woff2?|ttf)(?:[?#]|$)/i.test(normalized)
    ) {
      return null;
    }

    try {
      const parsed = new URL(normalized);
      if (/(?:^|\.)xhscdn\.com$/i.test(parsed.hostname) && (!parsed.pathname || parsed.pathname === '/')) {
        return null;
      }
    } catch (_) {
      return null;
    }

    return normalized;
  }

  function looksLikeImageUrl(url) {
    if (/\.(?:css|js|json|txt|map|woff2?|ttf)(?:[?#]|$)/i.test(url)) {
      return false;
    }
    try {
      const parsed = new URL(url);
      if (/(?:^|\.)xhscdn\.com$/i.test(parsed.hostname) && (!parsed.pathname || parsed.pathname === '/')) {
        return false;
      }
    } catch (_) {
      return false;
    }
    return (
      /sns-webpic[^/]*\.xhscdn\.com/i.test(url)
      || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i.test(url)
      || /(?:imageView2|format\/(?:jpe?g|png|webp|gif)|notes_pre_post|!nc_)/i.test(url)
    );
  }

  function resolveImageUrlCandidate(raw) {
    const normalized = normalizeImageUrl(raw);
    return normalized && looksLikeImageUrl(normalized) ? normalized : null;
  }

  function extractCssImageUrl(value) {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    for (const match of value.matchAll(/url\((?:"([^"]+)"|'([^']+)'|([^)"']+))\)/gi)) {
      const candidate = resolveImageUrlCandidate(match[1] || match[2] || match[3]);
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  function resolveImageUrlFromElement(element) {
    if (!(element instanceof Element)) {
      return null;
    }

    if (element instanceof HTMLImageElement) {
      return (
        resolveImageUrlCandidate(element.currentSrc)
        || resolveImageUrlCandidate(element.src)
        || resolveImageUrlCandidate(element.getAttribute('src'))
        || resolveImageUrlCandidate(element.getAttribute('data-src'))
        || null
      );
    }

    for (const attribute of [
      'data-image',
      'data-image-url',
      'data-src',
      'data-url',
      'src',
      'href',
    ]) {
      const candidate = resolveImageUrlCandidate(element.getAttribute(attribute));
      if (candidate) {
        return candidate;
      }
    }

    const inlineBackground = extractCssImageUrl(element.getAttribute('style'));
    if (inlineBackground) {
      return inlineBackground;
    }

    const computedBackground = extractCssImageUrl(window.getComputedStyle(element).backgroundImage);
    if (computedBackground) {
      return computedBackground;
    }

    return null;
  }

  function findImageUrlInElementSubtree(element) {
    if (!(element instanceof Element)) {
      return null;
    }

    const nestedImage = element.querySelector('img');
    if (nestedImage instanceof HTMLImageElement) {
      const nestedImageUrl =
        resolveImageUrlCandidate(nestedImage.currentSrc)
        || resolveImageUrlCandidate(nestedImage.src)
        || resolveImageUrlCandidate(nestedImage.getAttribute('src'))
        || resolveImageUrlCandidate(nestedImage.getAttribute('data-src'));
      if (nestedImageUrl) {
        return nestedImageUrl;
      }
    }

    const styledNode = element.querySelector("[style*='background-image'], [data-image], [data-image-url], [data-src]");
    if (styledNode instanceof Element) {
      return resolveImageUrlFromElement(styledNode);
    }

    return null;
  }

  function resolveDraggedImageUrl(target, scope = null) {
    if (!(target instanceof Element)) {
      return null;
    }

    let current = target;
    let depth = 0;

    while (current && depth < 6) {
      const elementUrl = resolveImageUrlFromElement(current);
      if (elementUrl) {
        return elementUrl;
      }

      const subtreeUrl = findImageUrlInElementSubtree(current);
      if (subtreeUrl) {
        return subtreeUrl;
      }

      if (scope instanceof Element && current === scope) {
        break;
      }

      current = current.parentElement;
      depth += 1;
    }

    return null;
  }

  function isM3u8Url(url) {
    return /\.m3u8(\?|$)/i.test(url);
  }

  function isDirectCdnVideoUrl(url) {
    if (/\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp|css|js|json|txt|woff2?|ttf)(?:[?#]|$)/i.test(url)) {
      return false;
    }
    return (
      /xhscdn\.com/i.test(url)
      && (
        /\.(mp4|m4v|mov)(?:[?#]|$)/i.test(url)
        || /:\/\/[^/]*video[^/]*\.xhscdn\.com\//i.test(url)
      )
    );
  }

  function classifyCandidateType(url) {
    const lower = url.toLowerCase();
    if (isM3u8Url(lower)) return 'manifest_m3u8';
    if (isDirectCdnVideoUrl(lower)) return 'direct_cdn';
    if (/\.mp4(\?|$)/.test(lower)) return 'direct_mp4';
    return 'indirect_media';
  }

  function candidateTypeScore(type) {
    switch (type) {
      case 'direct_cdn':
        return 100;
      case 'direct_mp4':
        return 90;
      case 'indirect_media':
        return 45;
      case 'manifest_m3u8':
        return 10;
      default:
        return 0;
    }
  }

  function sourceScore(source) {
    switch (source) {
      case 'video_element':
        return 20;
      case 'video_source':
        return 18;
      case 'json_ld':
        return 14;
      case 'performance_resource':
        return 10;
      case 'script_scan':
        return 6;
      default:
        return 0;
    }
  }

  function confidenceForScore(score) {
    if (score >= 110) return 'high';
    if (score >= 70) return 'medium';
    return 'low';
  }

  function extractVideoCandidates(root = document, options = {}) {
    const seen = new Set();
    const candidates = [];
    const scope = root instanceof Document ? root : root instanceof Element ? root : document;
    const includeDocumentWideSignals = options.includeDocumentWideSignals === true;

    const collectCandidate = (raw, source) => {
      const candidateUrl = normalizeUrl(raw);
      if (!candidateUrl || seen.has(candidateUrl)) return;
      seen.add(candidateUrl);
      if (!isLikelyVideoUrl(candidateUrl)) return;

      const type = classifyCandidateType(candidateUrl);
      const score = candidateTypeScore(type) + sourceScore(source);
      candidates.push({
        url: candidateUrl,
        type,
        confidence: confidenceForScore(score),
        source,
        mediaType: 'video',
        score,
      });
    };

    // Method 1: direct video element
    const videos = Array.from(scope.querySelectorAll('video'));
    for (const video of videos) {
      collectCandidate(video.currentSrc, 'video_element');
      collectCandidate(video.src, 'video_element');
      collectCandidate(video.getAttribute('src'), 'video_element');
      const source = video.querySelector('source');
      collectCandidate(source?.src, 'video_source');
      collectCandidate(source?.getAttribute('src'), 'video_source');
    }

    // Method 2: JSON-LD block
    const ldScripts = Array.from(scope.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of ldScripts) {
      try {
        const payload = JSON.parse(script.textContent || '{}');
        collectCandidate(payload?.contentUrl || payload?.video?.contentUrl, 'json_ld');
      } catch (_) {
        // Ignore malformed json-ld.
      }
    }

    // Method 3: Performance resources (blob-backed players usually still fetch real media URLs)
    if (includeDocumentWideSignals) {
      const resources = performance.getEntriesByType('resource') || [];
      for (let i = resources.length - 1; i >= 0; i -= 1) {
        collectCandidate(resources[i]?.name, 'performance_resource');
      }
    }

    // Method 4: Script text scan for encoded/embedded media URLs
    const scriptTags = Array.from(scope.querySelectorAll('script'));
    const urlRegex = /https?:\/\/[^\s"'\\]+/g;
    for (const script of scriptTags) {
      const rawText = script.textContent || '';
      if (!rawText) continue;
      const text = rawText.replace(/\\u002F/g, '/');
      const matches = text.match(urlRegex) || [];
      for (const match of matches) {
        collectCandidate(match, 'script_scan');
      }
    }

    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(({ score, ...candidate }) => candidate);
  }

  function scoreImageElement(image) {
    if (!(image instanceof HTMLImageElement)) {
      return 0;
    }

    const rect = image.getBoundingClientRect();
    const naturalArea = Math.max(image.naturalWidth || 0, 1) * Math.max(image.naturalHeight || 0, 1);
    const rectArea = Math.max(rect.width || 0, 1) * Math.max(rect.height || 0, 1);
    const maxNaturalDimension = Math.max(image.naturalWidth || 0, image.naturalHeight || 0);
    const maxRectDimension = Math.max(rect.width || 0, rect.height || 0);

    if (maxNaturalDimension < 160 && maxRectDimension < 120) {
      return 0;
    }

    const isVisible = rect.bottom > 0
      && rect.right > 0
      && rect.top < window.innerHeight
      && rect.left < window.innerWidth;
    const withinMain = image.closest('main, [class*="note"], [class*="swiper"], [class*="carousel"]')
      ? 18
      : 0;
    const visibleBonus = isVisible ? 24 : 0;
    const naturalScore = Math.min(48, Math.floor(naturalArea / 50000));
    const rectScore = Math.min(28, Math.floor(rectArea / 20000));

    return 20 + withinMain + visibleBonus + naturalScore + rectScore;
  }

  function extractPrimaryImageUrl(root = document) {
    const seen = new Set();
    const candidates = [];

    const collectImage = (raw, source, score) => {
      const imageUrl = normalizeImageUrl(raw);
      if (!imageUrl || seen.has(imageUrl)) return;
      seen.add(imageUrl);
      candidates.push({
        url: imageUrl,
        source,
        score,
      });
    };

    if (root === document) {
      const metaSelectors = [
        'meta[property="og:image"]',
        'meta[name="og:image"]',
        'meta[name="twitter:image"]',
        'meta[property="twitter:image"]',
      ];
      for (const selector of metaSelectors) {
        const metaImage = document.querySelector(selector)?.getAttribute('content');
        collectImage(metaImage, 'meta_image', 42);
      }
    }

    const imageRoot = root instanceof Document ? root : root instanceof Element ? root : document;
    const images = Array.from(imageRoot.querySelectorAll('img'));
    for (const image of images) {
      const score = scoreImageElement(image);
      if (score <= 0) continue;
      collectImage(image.currentSrc, 'image_element', score);
      collectImage(image.src, 'image_element', score);
      collectImage(image.getAttribute('src'), 'image_element', score);
      collectImage(image.getAttribute('data-src'), 'image_element', score - 4);
    }

    const best = candidates.sort((a, b) => b.score - a.score)[0];
    return best?.url || null;
  }

  function normalizeXiaohongshuImageIdentity(url) {
    const normalized = resolveImageUrlCandidate(url);
    if (!normalized) {
      return null;
    }

    try {
      const parsed = new URL(normalized);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const tail = segments[segments.length - 1] || '';
      if (tail) {
        return tail.replace(/!nc_[^/]+$/i, '');
      }
      parsed.search = '';
      parsed.hash = '';
      parsed.pathname = parsed.pathname.replace(/!nc_[^/]+$/i, '');
      return parsed.toString();
    } catch (_) {
      return normalized;
    }
  }

  function resolveDragPageUrl(target) {
    if (!(target instanceof Element)) {
      return isVideoPage() ? normalizeNoteUrl(window.location.href) : null;
    }

    const anchor = target.closest(NOTE_LINK_SELECTOR);
    if (anchor instanceof HTMLAnchorElement) {
      const pageUrl = normalizeNoteUrl(anchor.href);
      if (pageUrl) {
        return pageUrl;
      }
    }

    return isVideoPage() ? normalizeNoteUrl(window.location.href) : null;
  }

  function collectScopedNoteUrls(scope) {
    if (!(scope instanceof Element)) {
      return [];
    }

    const noteUrls = new Set();
    if (scope instanceof HTMLAnchorElement) {
      const normalized = normalizeNoteUrl(scope.href);
      if (normalized) {
        noteUrls.add(normalized);
      }
    }

    for (const anchor of scope.querySelectorAll(NOTE_LINK_SELECTOR)) {
      if (!(anchor instanceof HTMLAnchorElement)) {
        continue;
      }

      const normalized = normalizeNoteUrl(anchor.href);
      if (normalized) {
        noteUrls.add(normalized);
      }
    }

    return Array.from(noteUrls);
  }

  function isSingleNoteScope(scope, anchorPageUrl = null) {
    const noteUrls = collectScopedNoteUrls(scope);
    if (noteUrls.length === 0) {
      return false;
    }

    if (noteUrls.length === 1) {
      return !anchorPageUrl || noteUrls[0] === anchorPageUrl;
    }

    return false;
  }

  function resolveDragScope(target) {
    if (!(target instanceof Element)) {
      return document.body;
    }

    const anchor = target.closest(NOTE_LINK_SELECTOR);
    if (!(anchor instanceof Element)) {
      return document.body;
    }

    const anchorPageUrl = anchor instanceof HTMLAnchorElement
      ? normalizeNoteUrl(anchor.href)
      : null;
    let best = anchor;
    let current = anchor.parentElement;
    const anchorRect = anchor.getBoundingClientRect();
    const anchorArea = Math.max(anchorRect.width * anchorRect.height, 1);

    for (let depth = 0; current && depth < 4; depth += 1) {
      const parent = current.parentElement;
      if (!(current instanceof HTMLElement)) {
        break;
      }

      const rect = current.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 120) {
        break;
      }

      const area = Math.max(rect.width * rect.height, 1);
      if (area > anchorArea * 6) {
        break;
      }

      if (!isSingleNoteScope(current, anchorPageUrl)) {
        break;
      }

      best = current;
      current = parent;
    }

    return best;
  }

  function clampVideoIntentConfidence(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
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

  function mergeVideoCandidateLists(...candidateLists) {
    const merged = [];
    const seen = new Set();

    for (const candidateList of candidateLists) {
      if (!Array.isArray(candidateList)) {
        continue;
      }

      for (const candidate of candidateList) {
        const candidateUrl = normalizeUrl(candidate?.url);
        if (!candidateUrl || seen.has(candidateUrl)) {
          continue;
        }

        seen.add(candidateUrl);
        merged.push({
          ...candidate,
          url: candidateUrl,
        });
      }
    }

    return merged;
  }

  function unwrapInitialStateValue(value) {
    if (value && typeof value === 'object' && '_rawValue' in value) {
      return value._rawValue;
    }
    return value;
  }

  function getXiaohongshuInitialState() {
    const state = window.__INITIAL_STATE__;
    return state && typeof state === 'object' ? state : null;
  }

  function isStateNoteLike(entry) {
    return Boolean(
      entry
      && typeof entry === 'object'
      && (
        entry.noteCard
        || entry.note
        || entry.cover
        || entry.displayTitle
        || entry.title
        || entry.type
      )
    );
  }

  function extractStateNoteId(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const candidates = [
      entry.noteCard?.note?.noteId,
      entry.noteCard?.note?.id,
      entry.noteCard?.noteId,
      entry.noteCard?.id,
      entry.note?.noteId,
      entry.note?.id,
      entry.noteId,
      entry.id,
    ];

    for (const candidate of candidates) {
      const normalized = normalizeNoteId(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  function extractStateNoteType(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const candidates = [
      entry.noteCard?.note?.type,
      entry.noteCard?.type,
      entry.note?.type,
      entry.type,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim().toLowerCase();
      }
    }

    return null;
  }

  function extractStateNoteCoverImage(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const cover = entry.noteCard?.cover || entry.note?.cover || entry.cover || null;
    if (!cover || typeof cover !== 'object') {
      return null;
    }

    const directCandidates = [
      cover.urlDefault,
      cover.urlPre,
      cover.url,
    ];
    for (const candidate of directCandidates) {
      const resolved = resolveImageUrlCandidate(candidate);
      if (resolved) {
        return resolved;
      }
    }

    const infoList = Array.isArray(cover.infoList) ? cover.infoList : [];
    for (const item of infoList) {
      const resolved = resolveImageUrlCandidate(item?.url);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  function extractXsecSourceFromUrl(url) {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      return null;
    }

    try {
      const parsed = new URL(normalized);
      const querySource = parsed.searchParams.get('xsec_source');
      if (typeof querySource === 'string' && querySource.trim()) {
        return querySource.trim();
      }

      if (/^\/user\/profile\//i.test(parsed.pathname)) {
        return 'pc_user';
      }
      if (/^\/explore\//i.test(parsed.pathname)) {
        return 'pc_user';
      }
    } catch (_) {
      return null;
    }

    return null;
  }

  function resolveStateNoteDetailUrlCandidates(entry) {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const candidates = [
      entry.detailUrl,
      entry.detail_url,
      entry.noteLink,
      entry.note_link,
      entry.shareLink,
      entry.share_link,
      entry.jumpUrl,
      entry.jump_url,
      entry.url,
      entry.href,
      entry.note?.detailUrl,
      entry.note?.detail_url,
      entry.note?.shareLink,
      entry.note?.share_link,
      entry.noteCard?.detailUrl,
      entry.noteCard?.detail_url,
      entry.noteCard?.note?.detailUrl,
      entry.noteCard?.note?.detail_url,
    ];

    return candidates
      .map((candidate) => normalizeUrl(candidate))
      .filter(Boolean);
  }

  function extractStateNoteXsecToken(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const candidates = [
      entry.noteCard?.note?.xsecToken,
      entry.noteCard?.xsecToken,
      entry.note?.xsecToken,
      entry.xsecToken,
      entry.noteCard?.note?.xsec_token,
      entry.noteCard?.xsec_token,
      entry.note?.xsec_token,
      entry.xsec_token,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    return null;
  }

  function extractStateNoteDetailUrl(entry, noteId, fallbackPageUrl) {
    const directDetailUrl = resolveStateNoteDetailUrlCandidates(entry).find(
      (candidate) => /[?&]xsec_token=/i.test(candidate),
    ) || null;
    if (directDetailUrl) {
      return directDetailUrl;
    }

    const normalizedNoteId = normalizeNoteId(noteId) || extractStateNoteId(entry);
    const xsecToken = extractStateNoteXsecToken(entry);
    if (!normalizedNoteId || !xsecToken) {
      return null;
    }

    const xsecSource = extractXsecSourceFromUrl(fallbackPageUrl) || 'pc_user';
    try {
      const detailUrl = new URL(`https://www.xiaohongshu.com/explore/${normalizedNoteId}`);
      detailUrl.searchParams.set('xsec_token', xsecToken);
      detailUrl.searchParams.set('xsec_source', xsecSource);
      return detailUrl.toString();
    } catch (_) {
      return null;
    }
  }

  function extractStateNoteVideoCandidates(entry) {
    const candidates = [];
    const seen = new Set();

    const addVideoCandidate = (rawUrl, source) => {
      if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        return;
      }

      const normalizedSourceUrl = rawUrl.startsWith('http')
        ? rawUrl
        : `https://sns-video-bd.xhscdn.com/${rawUrl.replace(/^\/+/, '')}`;
      const candidateUrl = normalizeUrl(normalizedSourceUrl);
      if (!candidateUrl || seen.has(candidateUrl) || !isLikelyVideoUrl(candidateUrl)) {
        return;
      }

      seen.add(candidateUrl);
      const type = classifyCandidateType(candidateUrl);
      const score = candidateTypeScore(type) + sourceScore('script_scan') + 14;
      candidates.push({
        url: candidateUrl,
        type,
        confidence: confidenceForScore(score),
        source,
        mediaType: 'video',
      });
    };

    const videoObjects = [
      entry?.noteCard?.video,
      entry?.noteCard?.note?.video,
      entry?.note?.video,
      entry?.video,
    ].filter((value) => value && typeof value === 'object');

    for (const video of videoObjects) {
      addVideoCandidate(video?.consumer?.originVideoKey, 'initial_state_origin_video_key');
      addVideoCandidate(video?.media?.stream?.h265?.[0]?.masterUrl, 'initial_state_h265_master');
      addVideoCandidate(video?.media?.stream?.h265?.[0]?.master_url, 'initial_state_h265_master');
      addVideoCandidate(video?.media?.stream?.h264?.[0]?.masterUrl, 'initial_state_h264_master');
      addVideoCandidate(video?.media?.stream?.h264?.[0]?.master_url, 'initial_state_h264_master');
      addVideoCandidate(video?.masterUrl, 'initial_state_master');
      addVideoCandidate(video?.master_url, 'initial_state_master');
    }

    return candidates;
  }

  function collectStateNoteGroups(state) {
    const groups = [];

    const pushGroups = (value, source) => {
      const unwrapped = unwrapInitialStateValue(value);
      if (!Array.isArray(unwrapped)) {
        return;
      }

      if (unwrapped.some((entry) => isStateNoteLike(entry))) {
        groups.push({ items: unwrapped, source });
      }

      unwrapped.forEach((entry, index) => {
        const nested = unwrapInitialStateValue(entry);
        if (Array.isArray(nested) && nested.some((item) => isStateNoteLike(item))) {
          groups.push({
            items: nested,
            source: `${source}[${index}]`,
          });
        }
      });
    };

    pushGroups(state?.user?.notes, '__INITIAL_STATE__.user.notes');
    pushGroups(state?.feed?.feeds, '__INITIAL_STATE__.feed.feeds');
    pushGroups(state?.search?.feeds, '__INITIAL_STATE__.search.feeds');

    return groups;
  }

  function resolveScopeStateNote({ scope, noteId, preferredImageUrl }) {
    const state = getXiaohongshuInitialState();
    if (!state) {
      return null;
    }

    const normalizedNoteId = normalizeNoteId(noteId);
    if (normalizedNoteId) {
      const detailNote = state?.note?.noteDetailMap?.[normalizedNoteId]?.note;
      if (detailNote && typeof detailNote === 'object') {
        return {
          raw: detailNote,
          source: `__INITIAL_STATE__.note.noteDetailMap[${normalizedNoteId}].note`,
        };
      }
    }

    const groups = collectStateNoteGroups(state);
    if (normalizedNoteId) {
      for (const group of groups) {
        const matchedIndex = group.items.findIndex((entry) => extractStateNoteId(entry) === normalizedNoteId);
        if (matchedIndex >= 0) {
          return {
            raw: group.items[matchedIndex],
            source: `${group.source}[${matchedIndex}]`,
          };
        }
      }
    }

    const noteItem = scope instanceof Element ? scope.closest('.note-item[data-index]') : null;
    const scopeIndex = Number.parseInt(noteItem?.getAttribute('data-index') || '', 10);
    if (Number.isInteger(scopeIndex) && scopeIndex >= 0) {
      for (const group of groups) {
        const entry = group.items[scopeIndex];
        if (isStateNoteLike(entry)) {
          return {
            raw: entry,
            source: `${group.source}[${scopeIndex}]`,
          };
        }
      }
    }

    const normalizedPreferredImage = normalizeXiaohongshuImageIdentity(preferredImageUrl);
    if (normalizedPreferredImage) {
      for (const group of groups) {
        const matchedIndex = group.items.findIndex((entry) => (
          normalizeXiaohongshuImageIdentity(extractStateNoteCoverImage(entry)) === normalizedPreferredImage
        ));
        if (matchedIndex >= 0) {
          return {
            raw: group.items[matchedIndex],
            source: `${group.source}[${matchedIndex}]`,
          };
        }
      }
    }

    const visit = (value, path, seen = new WeakSet(), depth = 0) => {
      if (!value || depth > 12) {
        return null;
      }

      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
          const match = visit(value[index], `${path}[${index}]`, seen, depth + 1);
          if (match) {
            return match;
          }
        }
        return null;
      }

      if (typeof value !== 'object') {
        return null;
      }

      if (seen.has(value)) {
        return null;
      }
      seen.add(value);

      if (isStateNoteLike(value)) {
        if (normalizedNoteId && extractStateNoteId(value) === normalizedNoteId) {
          return {
            raw: value,
            source: path,
          };
        }
        if (
          normalizedPreferredImage
          && normalizeXiaohongshuImageIdentity(extractStateNoteCoverImage(value)) === normalizedPreferredImage
        ) {
          return {
            raw: value,
            source: path,
          };
        }
      }

      for (const [key, entry] of Object.entries(value)) {
        const match = visit(entry, `${path}.${key}`, seen, depth + 1);
        if (match) {
          return match;
        }
      }

      return null;
    };

    return visit(state, '__INITIAL_STATE__');

  }

  function detectXiaohongshuVideoIntent({ scope, noteId, preferredImageUrl }) {
    const sources = [];
    let confidence = 0;
    const hasScopedVideoElement = scope instanceof Element && Boolean(scope.querySelector('video'));
    const hasScopedPlayIcon = scope instanceof Element && Boolean(
      scope.querySelector('.play-icon, [class*="play-icon"], [class*="video-play"], [class*="video-mask"]'),
    );
    const stateNote = resolveScopeStateNote({ scope, noteId, preferredImageUrl });
    const stateVideoCandidates = [];
    const stateImageCandidates = [];
    const seenVideoUrls = new Set();
    const seenImageUrls = new Set();

    const addStateVideoCandidate = (rawUrl, source) => {
      const candidateUrl = normalizeUrl(rawUrl);
      if (!candidateUrl || seenVideoUrls.has(candidateUrl) || !isLikelyVideoUrl(candidateUrl)) {
        return;
      }

      seenVideoUrls.add(candidateUrl);
      const type = classifyCandidateType(candidateUrl);
      const score = candidateTypeScore(type) + sourceScore('script_scan') + 10;
      stateVideoCandidates.push({
        url: candidateUrl,
        type,
        confidence: confidenceForScore(score),
        source,
        mediaType: 'video',
      });
    };

    const addStateImageCandidate = (rawUrl, source) => {
      const candidateUrl = resolveImageUrlCandidate(rawUrl);
      if (!candidateUrl || seenImageUrls.has(candidateUrl)) {
        return;
      }

      seenImageUrls.add(candidateUrl);
      stateImageCandidates.push({
        url: candidateUrl,
        source,
      });
    };

    if (stateNote?.raw && typeof stateNote.raw === 'object') {
      collectMediaFromValue(stateNote.raw, addStateVideoCandidate, addStateImageCandidate);
      extractStateNoteVideoCandidates(stateNote.raw).forEach((candidate) => {
        addStateVideoCandidate(candidate.url, candidate.source);
      });
      const stateType = extractStateNoteType(stateNote.raw);
      if (stateType === 'video') {
        confidence = 1;
        sources.push(`${stateNote.source}.type`);
      }

      if (
        stateNote.raw.noteCard?.video
        || stateNote.raw.noteCard?.note?.video
        || stateNote.raw.note?.video
        || stateNote.raw.video
      ) {
        confidence = 1;
        sources.push(`${stateNote.source}.video`);
      }

      if (stateVideoCandidates.length > 0) {
        confidence = Math.max(confidence, 1);
        sources.push(`${stateNote.source}.media`);
      }
    }

    if (hasScopedVideoElement) {
      confidence = Math.max(confidence, 0.95);
      sources.push('scoped-video-element');
    }

    if (hasScopedPlayIcon) {
      confidence = Math.max(confidence, stateNote ? 0.85 : 0.65);
      sources.push('play-icon-dom');
    }

    return {
      hasScopedVideoElement,
      hasScopedPlayIcon,
      videoIntentConfidence: clampVideoIntentConfidence(confidence),
      videoIntentSources: Array.from(new Set(sources)),
      videoCandidates: stateVideoCandidates,
      videoUrl: extractVideoUrl(stateVideoCandidates),
      imageUrl: pickPreferredResolvedImage(preferredImageUrl, stateImageCandidates)
        || extractStateNoteCoverImage(stateNote?.raw)
        || null,
    };
  }

  function findScopeForNote(noteId, pageUrl, preferredImageUrl) {
    const candidates = [];
    const noteSelectors = [];

    if (noteId) {
      noteSelectors.push(`a[href*="/explore/${noteId}"]`);
      noteSelectors.push(`a[href*="/discovery/item/${noteId}"]`);
      noteSelectors.push(`a[href*="/user/profile/"][href*="/${noteId}"]`);
    }
    if (pageUrl) {
      noteSelectors.push(`a[href="${pageUrl}"]`);
    }

    for (const selector of noteSelectors) {
      for (const anchor of document.querySelectorAll(selector)) {
        if (!(anchor instanceof Element)) {
          continue;
        }

        const scope = resolveDragScope(anchor);
        const rect = scope.getBoundingClientRect();
        const area = Math.max(rect.width, 1) * Math.max(rect.height, 1);
        const noteUrlCount = collectScopedNoteUrls(scope).length;
        const visibleArea = Math.max(
          0,
          Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0),
        ) * Math.max(
          0,
          Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0),
        );
        const exactImageMatch = preferredImageUrl
          && normalizeXiaohongshuImageIdentity(resolveDraggedImageUrl(anchor, scope))
            === normalizeXiaohongshuImageIdentity(preferredImageUrl)
          ? 1
          : 0;
        candidates.push({
          scope,
          score:
            (exactImageMatch ? 1_000_000 : 0)
            + Math.min(visibleArea, 200_000)
            - Math.floor(area / 20)
            - Math.max(0, noteUrlCount - 1) * 250_000,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.scope ?? document.body;
  }

  function findNoteNavigationAnchor({ scope, noteId, pageUrl }) {
    const selectors = [];
    if (noteId) {
      selectors.push(`a[href*="/explore/${noteId}"]`);
      selectors.push(`a[href*="/discovery/item/${noteId}"]`);
      selectors.push(`a[href*="/user/profile/"][href*="/${noteId}"]`);
    }
    if (pageUrl) {
      selectors.push(`a[href="${pageUrl}"]`);
    }

    const roots = [];
    if (scope instanceof Element) {
      roots.push(scope);
    }
    roots.push(document);

    for (const root of roots) {
      for (const selector of selectors) {
        const anchor = root.querySelector(selector);
        if (anchor instanceof HTMLAnchorElement) {
          return anchor;
        }
      }
    }

    return null;
  }

  function resolvePreferredDetailUrl({ detailUrl, noteId, stateNote, fallbackPageUrl }) {
    const normalizedNoteId = normalizeNoteId(noteId);
    const directDetailUrl = normalizeUrl(detailUrl);
    if (directDetailUrl && /[?&]xsec_token=/i.test(directDetailUrl)) {
      return directDetailUrl;
    }

    const cachedDetailUrl = getCachedXiaohongshuNoteLink(normalizedNoteId)?.detailUrl || null;
    if (cachedDetailUrl) {
      return cachedDetailUrl;
    }

    const stateDetailUrl = extractStateNoteDetailUrl(stateNote?.raw || stateNote, normalizedNoteId, fallbackPageUrl);
    if (stateDetailUrl) {
      return stateDetailUrl;
    }

    return directDetailUrl || null;
  }

  function navigateToXiaohongshuNote({ noteId, pageUrl, detailUrl }) {
    const scope = findScopeForNote(noteId, pageUrl, null);
    const stateNote = resolveScopeStateNote({ scope, noteId, preferredImageUrl: null });
    const extractedDetailUrl = resolvePreferredDetailUrl({
      detailUrl,
      noteId,
      stateNote,
      fallbackPageUrl: window.location.href,
    });
    const anchor = findNoteNavigationAnchor({ scope, noteId, pageUrl });

    if (anchor instanceof HTMLAnchorElement) {
      const anchorHref = normalizeUrl(anchor.href);
      try {
        anchor.scrollIntoView({
          block: 'center',
          inline: 'center',
          behavior: 'instant',
        });
      } catch (_) {
        // Ignore scroll failures in background tabs.
      }

      anchor.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
      anchor.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      anchor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      anchor.click();

      return {
        success: true,
        clicked: true,
        pageUrl: anchorHref || normalizeUrl(window.location.href),
        detailUrl: extractedDetailUrl || anchorHref,
      };
    }

    return {
      success: false,
      clicked: false,
      pageUrl: normalizeUrl(window.location.href),
      detailUrl: extractedDetailUrl,
      code: 'xiaohongshu_note_anchor_missing',
    };
  }

  function collectNoteSpecificScriptSnippets(noteId, pageUrl) {
    const snippets = [];
    const markers = [noteId, pageUrl].filter((value) => typeof value === 'string' && value);
    if (markers.length === 0) {
      return snippets;
    }

    for (const script of Array.from(document.querySelectorAll('script'))) {
      const text = (script.textContent || '').replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
      if (!text) {
        continue;
      }

      for (const marker of markers) {
        const index = text.indexOf(marker);
        if (index < 0) {
          continue;
        }

        const start = Math.max(0, index - 6000);
        const end = Math.min(text.length, index + 6000);
        snippets.push(text.slice(start, end));
      }
    }

    return snippets;
  }

  function snippetSuggestsVideo(snippets) {
    return snippets.some((snippet) => (
      /"type"\s*:\s*"video"/i.test(snippet)
      || /"note_?type"\s*:\s*"video"/i.test(snippet)
      || /"hasVideo"\s*:\s*true/i.test(snippet)
      || /master[_-]?url/i.test(snippet)
      || /stream\/[A-Za-z0-9_-]+/i.test(snippet)
      || /video[_-]?(?:id|info|media|consumer)/i.test(snippet)
    ));
  }

  function valueSuggestsVideoNote(value, seen = new WeakSet(), depth = 0) {
    if (value == null || depth > 12) {
      return false;
    }

    if (typeof value === 'string') {
      return (
        /^video$/i.test(value.trim())
        || /(?:^|["'{,\s])(?:type|note_?type)["']?\s*[:=]\s*["']video["']/i.test(value)
        || /hasVideo["']?\s*[:=]\s*true/i.test(value)
        || /master[_-]?url/i.test(value)
        || /stream\/[A-Za-z0-9_-]+/i.test(value)
      );
    }

    if (Array.isArray(value)) {
      return value.some((entry) => valueSuggestsVideoNote(entry, seen, depth + 1));
    }

    if (typeof value !== 'object') {
      return false;
    }

    if (seen.has(value)) {
      return false;
    }
    seen.add(value);

    return Object.entries(value).some(([key, entry]) => {
      if (/^type$|note_?type/i.test(key) && typeof entry === 'string') {
        return /^video$/i.test(entry.trim());
      }
      if (/hasVideo/i.test(key) && entry === true) {
        return true;
      }
      if (/^video$|video[_-]?(?:info|media|consumer|id)/i.test(key) && entry != null) {
        return true;
      }
      if (/master[_-]?url|stream|h26[45]/i.test(key) && entry != null) {
        return true;
      }
      return valueSuggestsVideoNote(entry, seen, depth + 1);
    });
  }

  function collectVideoCandidatesFromSnippets(snippets) {
    const candidates = [];
    const seen = new Set();

    const addVideoCandidate = (rawUrl, source) => {
      const candidateUrl = normalizeUrl(rawUrl);
      if (!candidateUrl || seen.has(candidateUrl) || !isLikelyVideoUrl(candidateUrl)) {
        return;
      }
      seen.add(candidateUrl);
      const type = classifyCandidateType(candidateUrl);
      const score = candidateTypeScore(type) + sourceScore('script_scan') + 12;
      candidates.push({
        url: candidateUrl,
        type,
        confidence: confidenceForScore(score),
        source,
        mediaType: 'video',
        score,
      });
    };

    for (const snippet of snippets) {
      collectUrlsFromString(snippet, addVideoCandidate, () => {});
    }

    return candidates
      .sort((a, b) => b.score - a.score)
      .map(({ score, ...candidate }) => candidate)
      .slice(0, 12);
  }

  function collectPerformanceVideoCandidates() {
    const seen = new Set();
    const candidates = [];
    const resources = performance.getEntriesByType('resource') || [];

    for (let i = resources.length - 1; i >= 0; i -= 1) {
      const candidateUrl = normalizeUrl(resources[i]?.name);
      if (!candidateUrl || seen.has(candidateUrl) || !isLikelyVideoUrl(candidateUrl)) {
        continue;
      }
      seen.add(candidateUrl);
      const type = classifyCandidateType(candidateUrl);
      const score = candidateTypeScore(type) + sourceScore('performance_resource') + 6;
      candidates.push({
        url: candidateUrl,
        type,
        confidence: confidenceForScore(score),
        source: 'performance_resource',
        mediaType: 'video',
        score,
      });
    }

    return candidates
      .sort((a, b) => b.score - a.score)
      .map(({ score, ...candidate }) => candidate)
      .slice(0, 12);
  }

  function resolveCurrentDocumentMedia({ noteId, pageUrl, preferredImageUrl, expectedMediaType }) {
    const scope = findScopeForNote(noteId, pageUrl, preferredImageUrl);
    const normalizedCurrentPageUrl = normalizeNoteUrl(window.location.href);
    const videoIntent = detectXiaohongshuVideoIntent({
      scope,
      noteId,
      preferredImageUrl,
    });
    const hasScopedVideoElement = videoIntent.hasScopedVideoElement;
    const allowDocumentWideVideoSignals =
      normalizedCurrentPageUrl === pageUrl
      || hasScopedVideoElement
      || videoIntent.hasScopedPlayIcon
      || videoIntent.videoIntentConfidence >= 0.7;

    const scopeCandidates = mergeVideoCandidateLists(
      videoIntent.videoCandidates,
      extractVideoCandidates(scope, {
        includeDocumentWideSignals: allowDocumentWideVideoSignals,
      }),
    );
    if (scopeCandidates.length > 0) {
      logXhsDragResolution('resolveCurrentDocumentMedia -> scopeCandidates', {
        pageUrl,
        noteId,
        expectedMediaType: expectedMediaType || null,
        hasScopedVideoElement,
        allowDocumentWideVideoSignals,
        videoIntentConfidence: videoIntent.videoIntentConfidence,
        videoIntentSources: videoIntent.videoIntentSources,
        scopeVideoCandidatesCount: scopeCandidates.length,
        scopeVideoCandidates: previewCandidates(scopeCandidates),
      });
      return {
        kind: 'video',
        pageUrl,
        imageUrl: preferredImageUrl || videoIntent.imageUrl || extractPrimaryImageUrl(scope),
        videoUrl: videoIntent.videoUrl || extractVideoUrl(scopeCandidates),
        videoCandidates: scopeCandidates,
        videoIntentConfidence: videoIntent.videoIntentConfidence,
        videoIntentSources: videoIntent.videoIntentSources,
      };
    }

    const snippets = collectNoteSpecificScriptSnippets(noteId, pageUrl);
    const snippetCandidates = collectVideoCandidatesFromSnippets(snippets);
    if (snippetCandidates.length > 0) {
      logXhsDragResolution('resolveCurrentDocumentMedia -> snippetCandidates', {
        pageUrl,
        noteId,
        expectedMediaType: expectedMediaType || null,
        videoIntentConfidence: videoIntent.videoIntentConfidence,
        videoIntentSources: videoIntent.videoIntentSources,
        snippetCount: snippets.length,
        snippetCandidatesCount: snippetCandidates.length,
        snippetCandidates: previewCandidates(snippetCandidates),
      });
      return {
        kind: 'video',
        pageUrl,
        imageUrl: preferredImageUrl || videoIntent.imageUrl || extractPrimaryImageUrl(scope),
        videoUrl: extractVideoUrl(snippetCandidates),
        videoCandidates: snippetCandidates,
        videoIntentConfidence: Math.max(videoIntent.videoIntentConfidence, 0.8),
        videoIntentSources: Array.from(new Set([
          ...videoIntent.videoIntentSources,
          'snippet-video-candidates',
        ])),
      };
    }

    const performanceCandidates = allowDocumentWideVideoSignals
      ? collectPerformanceVideoCandidates()
      : [];
    if (performanceCandidates.length > 0 && (
      snippetSuggestsVideo(snippets)
      || videoIntent.videoIntentConfidence >= 0.7
    )) {
      logXhsDragResolution('resolveCurrentDocumentMedia -> performanceCandidates', {
        pageUrl,
        noteId,
        expectedMediaType: expectedMediaType || null,
        allowDocumentWideVideoSignals,
        videoIntentConfidence: videoIntent.videoIntentConfidence,
        videoIntentSources: videoIntent.videoIntentSources,
        performanceCandidatesCount: performanceCandidates.length,
        performanceCandidates: previewCandidates(performanceCandidates),
      });
      return {
        kind: 'video',
        pageUrl,
        imageUrl: preferredImageUrl || videoIntent.imageUrl || extractPrimaryImageUrl(scope),
        videoUrl: extractVideoUrl(performanceCandidates),
        videoCandidates: performanceCandidates,
        videoIntentConfidence: Math.max(videoIntent.videoIntentConfidence, 0.75),
        videoIntentSources: Array.from(new Set([
          ...videoIntent.videoIntentSources,
          'performance-video-candidates',
        ])),
      };
    }

    if (
      videoIntent.videoIntentConfidence >= 0.7
      || (allowDocumentWideVideoSignals && snippetSuggestsVideo(snippets))
    ) {
      logXhsDragResolution('resolveCurrentDocumentMedia -> videoIntentNoDirectUrl', {
        pageUrl,
        noteId,
        expectedMediaType: expectedMediaType || null,
        allowDocumentWideVideoSignals,
        videoIntentConfidence: videoIntent.videoIntentConfidence,
        videoIntentSources: videoIntent.videoIntentSources,
        snippetCount: snippets.length,
      });
      return {
        kind: 'video',
        pageUrl,
        imageUrl: preferredImageUrl || videoIntent.imageUrl || extractPrimaryImageUrl(scope),
        videoUrl: null,
        videoCandidates: [],
        videoIntentConfidence: Math.max(videoIntent.videoIntentConfidence, 0.7),
        videoIntentSources: videoIntent.videoIntentSources,
      };
    }

    const resolvedImageUrl = preferredImageUrl || videoIntent.imageUrl || extractPrimaryImageUrl(scope);
    if (resolvedImageUrl) {
      if (expectedMediaType === 'image') {
        logXhsDragResolution('resolveCurrentDocumentMedia -> deferImageFallbackForVerification', {
          pageUrl,
          noteId,
          expectedMediaType,
          resolvedImageUrl,
          videoIntentConfidence: videoIntent.videoIntentConfidence,
          videoIntentSources: videoIntent.videoIntentSources,
        });
        return null;
      }
      logXhsDragResolution('resolveCurrentDocumentMedia -> imageFallback', {
        pageUrl,
        noteId,
        expectedMediaType: expectedMediaType || null,
        resolvedImageUrl,
        videoIntentConfidence: videoIntent.videoIntentConfidence,
        videoIntentSources: videoIntent.videoIntentSources,
      });
      return {
        kind: 'image',
        pageUrl,
        imageUrl: resolvedImageUrl,
        videoUrl: null,
        videoCandidates: [],
        videoIntentConfidence: videoIntent.videoIntentConfidence,
        videoIntentSources: videoIntent.videoIntentSources,
      };
    }

    logXhsDragResolution('resolveCurrentDocumentMedia -> noMatch', {
      pageUrl,
      noteId,
      expectedMediaType: expectedMediaType || null,
      hasScopedVideoElement,
      allowDocumentWideVideoSignals,
      videoIntentConfidence: videoIntent.videoIntentConfidence,
      videoIntentSources: videoIntent.videoIntentSources,
    });
    return null;
  }

  function resolveDragNoteId(target, pageUrl = null) {
    if (target instanceof Element) {
      const noteHost = target.closest('[data-note-id], [data-noteid], [data-id]');
      if (noteHost instanceof Element) {
        const directId =
          noteHost.getAttribute('data-note-id')
          || noteHost.getAttribute('data-noteid')
          || noteHost.getAttribute('data-id');
        const normalizedId = normalizeNoteId(directId);
        if (normalizedId) {
          return normalizedId;
        }
      }

      const anchor = target.closest(NOTE_LINK_SELECTOR);
      if (anchor instanceof HTMLAnchorElement) {
        const anchorId = extractNoteIdFromUrl(anchor.href);
        if (anchorId) {
          return anchorId;
        }
      }
    }

    return extractNoteIdFromUrl(pageUrl || window.location.href);
  }

  function extractTitleFromScope(scope, options = {}) {
    if (scope instanceof Element) {
      const headingSelectors = [
        'h1',
        'h2',
        'h3',
        '[data-note-title]',
        '[class*="title"]',
        '[class*="desc"]',
      ];
      for (const selector of headingSelectors) {
        const element = scope.querySelector(selector);
        const text = element?.textContent?.trim();
        if (text) {
          return text;
        }
      }

      const scopedTitle = scope.querySelector('img[alt]')?.getAttribute('alt');
      if (scopedTitle && scopedTitle.trim()) {
        return scopedTitle.trim();
      }
    }

    if (options.allowDocumentFallback === false) {
      return null;
    }

    return extractTitle();
  }

  function buildDragPayload(scope, pageUrl, target) {
    const noteId = resolveDragNoteId(target, pageUrl);
    const exactImageUrl = resolveDraggedImageUrl(target, scope);
    const baseImageUrl = exactImageUrl || extractPrimaryImageUrl(scope);
    const scopeStateNote = resolveScopeStateNote({
      scope,
      noteId,
      preferredImageUrl: baseImageUrl,
    });
    const cachedNoteLink = getCachedXiaohongshuNoteLink(noteId);
    const detailUrl = resolvePreferredDetailUrl({
      noteId,
      stateNote: scopeStateNote,
      fallbackPageUrl: window.location.href,
      detailUrl: cachedNoteLink?.detailUrl || null,
    });
    const videoIntent = detectXiaohongshuVideoIntent({
      scope,
      noteId,
      preferredImageUrl: baseImageUrl,
    });
    const hasScopedVideoElement = videoIntent.hasScopedVideoElement;
    const videoCandidates = mergeVideoCandidateLists(
      videoIntent.videoCandidates,
      extractVideoCandidates(scope, {
        includeDocumentWideSignals:
          normalizeNoteUrl(window.location.href) === pageUrl
          || hasScopedVideoElement
          || videoIntent.hasScopedPlayIcon
          || videoIntent.videoIntentConfidence >= 0.7,
      }),
    );
    const videoUrl = videoIntent.videoUrl || extractVideoUrl(videoCandidates);
    const imageUrl = exactImageUrl || videoIntent.imageUrl || extractPrimaryImageUrl(scope);
    const mediaType = videoUrl
      || videoCandidates.length > 0
      || hasScopedVideoElement
      || videoIntent.videoIntentConfidence >= 0.7
      ? 'video'
      : imageUrl
        ? 'image'
        : null;

    return {
      token: nextToken(),
      pageUrl,
      detailUrl,
      sourcePageUrl: normalizeUrl(window.location.href) || window.location.href,
      noteId,
      exactImageUrl,
      imageUrl,
      videoUrl,
      videoCandidates,
      hasScopedVideoElement,
      videoIntentConfidence: videoIntent.videoIntentConfidence || null,
      videoIntentSources: videoIntent.videoIntentSources,
      mediaType,
      title: extractTitleFromScope(scope, { allowDocumentFallback: false }),
    };
  }

  function enrichDragDataTransfer(event, payload) {
    if (!(event instanceof DragEvent) || !event.dataTransfer || !payload?.pageUrl) {
      return;
    }

    const payloadText = buildDragPayloadText(payload);
    if (!payloadText) {
      return;
    }

    const existingPlain = event.dataTransfer.getData('text/plain');
    const plainText = existingPlain && existingPlain.trim()
      ? `${existingPlain}\n${payloadText}`
      : `${payload.pageUrl}\n${payloadText}`;

    event.dataTransfer.setData('text/plain', plainText);
    event.dataTransfer.setData('text/uri-list', payload.pageUrl);
    event.dataTransfer.setData(DRAG_PAYLOAD_MIME, payloadText);
  }

  function registerXiaohongshuDrag(payload) {
    if (!payload?.token || !payload?.pageUrl) {
      return;
    }

    chrome.runtime.sendMessage({
      type: INTERNAL_REGISTER_XIAOHONGSHU_DRAG_MESSAGE,
      token: payload.token,
      pageUrl: payload.pageUrl,
      detailUrl: payload.detailUrl || null,
      noteId: payload.noteId,
      imageUrl: payload.exactImageUrl || payload.imageUrl || null,
      mediaType: payload.mediaType || null,
      videoIntentConfidence: payload.videoIntentConfidence ?? null,
      videoIntentSources: payload.videoIntentSources || [],
      title: payload.title || null,
    }).catch((error) => {
      console.warn('[FlowSelect XHS] Failed to register drag token:', error);
    });
  }

  function buildJsonRequestOptions(body) {
    return {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json;charset=UTF-8',
      },
      body: JSON.stringify(body),
    };
  }

  async function readJsonResponse(response) {
    const text = await response.text();
    if (!text.trim()) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }

  function collectUrlsFromString(raw, addVideoCandidate, addImageCandidate) {
    if (typeof raw !== 'string' || !raw) {
      return;
    }

    const normalized = raw
      .replace(/\\u002F/gi, '/')
      .replace(/\\\//g, '/')
      .replace(/&amp;/gi, '&');
    const matches = normalized.match(/https?:\/\/[^\s"'\\<>]+/g) || [];
    for (const match of matches) {
      if (isLikelyVideoUrl(match)) {
        addVideoCandidate(match, 'detail_api');
        continue;
      }

      const imageUrl = resolveImageUrlCandidate(match);
      if (imageUrl) {
        addImageCandidate(imageUrl, 'detail_api');
      }
    }
  }

  function collectMediaFromValue(value, addVideoCandidate, addImageCandidate, seen = new WeakSet(), depth = 0) {
    if (value == null || depth > 12) {
      return;
    }

    if (typeof value === 'string') {
      collectUrlsFromString(value, addVideoCandidate, addImageCandidate);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        collectMediaFromValue(item, addVideoCandidate, addImageCandidate, seen, depth + 1);
      }
      return;
    }

    if (typeof value !== 'object') {
      return;
    }

    if (seen.has(value)) {
      return;
    }
    seen.add(value);

    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'string') {
        if (/video|stream|master|play(?:_?url)?|h26[45]/i.test(key)) {
          addVideoCandidate(entry, 'detail_api');
        }
        collectUrlsFromString(entry, addVideoCandidate, addImageCandidate);
        if (/image|cover|poster|thumbnail/i.test(key)) {
          const imageUrl = resolveImageUrlCandidate(entry);
          if (imageUrl) {
            addImageCandidate(imageUrl, key);
          }
        }
      } else {
        collectMediaFromValue(entry, addVideoCandidate, addImageCandidate, seen, depth + 1);
      }
    }
  }

  function pickPreferredResolvedImage(preferredImageUrl, imageCandidates) {
    const normalizedPreferredIdentity = normalizeXiaohongshuImageIdentity(preferredImageUrl);
    if (normalizedPreferredIdentity) {
      const preferredMatch = imageCandidates.find(
        (candidate) => normalizeXiaohongshuImageIdentity(candidate.url) === normalizedPreferredIdentity,
      );
      if (preferredMatch) {
        return preferredMatch.url;
      }
    }

    return imageCandidates[0]?.url || preferredImageUrl || null;
  }

  async function fetchXiaohongshuApiMedia(noteId, pageUrl, preferredImageUrl) {
    if (!noteId || !pageUrl) {
      return null;
    }

    const feedEndpoint = new URL(XIAOHONGSHU_FEED_API_PATH, pageUrl).toString();
    const detailEndpoint = new URL(
      `${XIAOHONGSHU_NOTE_DETAIL_PATH}/${noteId}/detail`,
      pageUrl,
    ).toString();
    const videoCandidates = [];
    const imageCandidates = [];
    const seenVideoUrls = new Set();
    const seenImageUrls = new Set();
    let detectedVideoIntent = false;

    const addVideoCandidate = (rawUrl, source) => {
      const candidateUrl = normalizeUrl(rawUrl);
      if (!candidateUrl || seenVideoUrls.has(candidateUrl) || !isLikelyVideoUrl(candidateUrl)) {
        return;
      }

      seenVideoUrls.add(candidateUrl);
      const type = classifyCandidateType(candidateUrl);
      const score = candidateTypeScore(type) + sourceScore('script_scan') + 8;
      videoCandidates.push({
        url: candidateUrl,
        type,
        confidence: confidenceForScore(score),
        source,
        mediaType: 'video',
        score,
      });
    };

    const addImageCandidate = (rawUrl, source) => {
      const imageUrl = resolveImageUrlCandidate(rawUrl);
      if (!imageUrl || seenImageUrls.has(imageUrl)) {
        return;
      }
      seenImageUrls.add(imageUrl);
      imageCandidates.push({
        url: imageUrl,
        source,
      });
    };

    const requests = [
      async () => {
        const response = await fetch(feedEndpoint, buildJsonRequestOptions({
          source_note_id: noteId,
          image_scenes: XIAOHONGSHU_IMAGE_SCENES,
        }));
        if (!response.ok) {
          return null;
        }
        return readJsonResponse(response);
      },
      async () => {
        const response = await fetch(detailEndpoint, {
          credentials: 'include',
          cache: 'no-store',
          headers: {
            Accept: 'application/json, text/plain, */*',
          },
        });
        if (!response.ok) {
          return null;
        }
        return readJsonResponse(response);
      },
    ];

    for (const runRequest of requests) {
      try {
        const data = await runRequest();
        if (!data) {
          continue;
        }

        detectedVideoIntent = detectedVideoIntent || valueSuggestsVideoNote(data);
        collectMediaFromValue(data, addVideoCandidate, addImageCandidate);
        logXhsDragResolution('fetchXiaohongshuApiMedia -> response', {
          pageUrl,
          noteId,
          detectedVideoIntent,
          apiVideoCandidatesCount: videoCandidates.length,
          apiImageCandidatesCount: imageCandidates.length,
          apiVideoCandidates: previewCandidates(videoCandidates),
          apiImagePreview: imageCandidates.slice(0, 2).map((candidate) => candidate.url),
        });
        if (videoCandidates.length > 0 || imageCandidates.length > 0) {
          break;
        }
      } catch (_) {
        // Ignore detail API failures and fall back to html/page heuristics.
      }
    }

    if (videoCandidates.length === 0 && imageCandidates.length === 0) {
      return null;
    }

    const orderedCandidates = videoCandidates
      .sort((a, b) => b.score - a.score)
      .map(({ score, ...candidate }) => candidate)
      .slice(0, 12);
    const videoUrl = extractVideoUrl(orderedCandidates);
    const imageUrl = pickPreferredResolvedImage(preferredImageUrl, imageCandidates);

    if (videoUrl || orderedCandidates.length > 0) {
      logXhsDragResolution('fetchXiaohongshuApiMedia -> resolvedVideo', {
        pageUrl,
        noteId,
        detectedVideoIntent,
        videoUrl: videoUrl || null,
        orderedCandidatesCount: orderedCandidates.length,
        orderedCandidates: previewCandidates(orderedCandidates),
      });
      return {
        kind: 'video',
        pageUrl,
        videoUrl: videoUrl || null,
        videoCandidates: orderedCandidates,
        imageUrl,
      };
    }

    if (detectedVideoIntent) {
      logXhsDragResolution('fetchXiaohongshuApiMedia -> resolvedVideoIntentWithoutUrl', {
        pageUrl,
        noteId,
        imageUrl,
      });
      return {
        kind: 'video',
        pageUrl,
        imageUrl,
        videoUrl: null,
        videoCandidates: [],
      };
    }

    if (imageUrl) {
      logXhsDragResolution('fetchXiaohongshuApiMedia -> resolvedImage', {
        pageUrl,
        noteId,
        imageUrl,
      });
      return {
        kind: 'image',
        pageUrl,
        imageUrl,
        videoUrl: null,
        videoCandidates: [],
      };
    }

    logXhsDragResolution('fetchXiaohongshuApiMedia -> noResult', {
      pageUrl,
      noteId,
      preferredImageUrl: preferredImageUrl || null,
    });
    return null;
  }

  async function fetchXiaohongshuHtmlMedia(pageUrl, preferredImageUrl, detailUrl) {
    const requestUrl = normalizeUrl(detailUrl) || pageUrl;
    if (!requestUrl) {
      return null;
    }

    try {
      const response = await fetch(requestUrl, {
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      if (!response.ok) {
        return null;
      }

      const html = await response.text();
      const videoCandidates = [];
      const imageCandidates = [];
      const seenVideoUrls = new Set();
      const seenImageUrls = new Set();
      const detectedVideoIntent = valueSuggestsVideoNote(html);

      const addVideoCandidate = (rawUrl, source) => {
        const candidateUrl = normalizeUrl(rawUrl);
        if (!candidateUrl || seenVideoUrls.has(candidateUrl) || !isLikelyVideoUrl(candidateUrl)) {
          return;
        }

        seenVideoUrls.add(candidateUrl);
        const type = classifyCandidateType(candidateUrl);
        const score = candidateTypeScore(type) + sourceScore('script_scan');
        videoCandidates.push({
          url: candidateUrl,
          type,
          confidence: confidenceForScore(score),
          source,
          mediaType: 'video',
          score,
        });
      };

      const addImageCandidate = (rawUrl, source) => {
        const imageUrl = resolveImageUrlCandidate(rawUrl);
        if (!imageUrl || seenImageUrls.has(imageUrl)) {
          return;
        }
        seenImageUrls.add(imageUrl);
        imageCandidates.push({
          url: imageUrl,
          source,
        });
      };

      collectUrlsFromString(html, addVideoCandidate, addImageCandidate);
      const ogImage = html.match(
        /<meta\b[^>]*(?:property|name)=(?:"(?:og:image|twitter:image)"|'(?:og:image|twitter:image)'|(?:og:image|twitter:image))[^>]*\bcontent=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i,
      );
      addImageCandidate(ogImage?.[1] || ogImage?.[2] || ogImage?.[3], 'meta_image');

      const orderedCandidates = videoCandidates
        .sort((a, b) => b.score - a.score)
        .map(({ score, ...candidate }) => candidate)
        .slice(0, 12);
      const videoUrl = extractVideoUrl(orderedCandidates);
      const imageUrl = pickPreferredResolvedImage(preferredImageUrl, imageCandidates);

        if (videoUrl || orderedCandidates.length > 0) {
          logXhsDragResolution('fetchXiaohongshuHtmlMedia -> resolvedVideo', {
            pageUrl,
            requestUrl,
            videoUrl: videoUrl || null,
            htmlVideoCandidatesCount: orderedCandidates.length,
            detectedVideoIntent,
            htmlVideoCandidates: previewCandidates(orderedCandidates),
          });
        return {
          kind: 'video',
          pageUrl,
          videoUrl: videoUrl || null,
          videoCandidates: orderedCandidates,
          imageUrl,
        };
      }

      if (detectedVideoIntent) {
        const imageUrl = pickPreferredResolvedImage(preferredImageUrl, imageCandidates);
        logXhsDragResolution('fetchXiaohongshuHtmlMedia -> resolvedVideoIntentWithoutUrl', {
          pageUrl,
          requestUrl,
          detectedVideoIntent,
          imageUrl,
          htmlImageCandidatesCount: imageCandidates.length,
        });
        return {
          kind: 'video',
          pageUrl,
          imageUrl,
          videoUrl: null,
          videoCandidates: [],
        };
      }

        if (imageUrl) {
          logXhsDragResolution('fetchXiaohongshuHtmlMedia -> resolvedImage', {
            pageUrl,
            requestUrl,
            imageUrl,
            detectedVideoIntent,
            htmlImageCandidatesCount: imageCandidates.length,
          });
        return {
          kind: 'image',
          pageUrl,
          imageUrl,
          videoUrl: null,
          videoCandidates: [],
        };
      }
    } catch (_) {
      // Ignore html fallback failure.
    }

    logXhsDragResolution('fetchXiaohongshuHtmlMedia -> noResult', {
      pageUrl,
      requestUrl,
      preferredImageUrl: preferredImageUrl || null,
    });
    return null;
  }

  async function resolveXiaohongshuMedia({
    pageUrl,
    detailUrl,
    noteId,
    preferredImageUrl,
    expectedMediaType,
    videoIntentConfidence,
    videoIntentSources,
  }) {
    const normalizedPageUrl = normalizeNoteUrl(pageUrl) || normalizeUrl(pageUrl);
    const normalizedVideoIntentConfidence = clampVideoIntentConfidence(videoIntentConfidence);
    const normalizedVideoIntentSources = Array.isArray(videoIntentSources)
      ? Array.from(new Set(videoIntentSources.filter((value) => typeof value === 'string' && value.trim())))
      : [];
    if (!normalizedPageUrl) {
      return {
        kind:
          expectedMediaType === 'image' && normalizedVideoIntentConfidence < 0.7
            ? 'image'
            : 'unknown',
        pageUrl: pageUrl || window.location.href,
        imageUrl: preferredImageUrl || null,
        videoUrl: null,
        videoCandidates: [],
        videoIntentConfidence: normalizedVideoIntentConfidence || null,
        videoIntentSources: normalizedVideoIntentSources,
      };
    }

    const normalizedNoteId = normalizeNoteId(noteId) || extractNoteIdFromUrl(normalizedPageUrl);
    const normalizedDetailUrl = resolvePreferredDetailUrl({
      detailUrl,
      noteId: normalizedNoteId,
      stateNote: null,
      fallbackPageUrl: normalizedPageUrl,
    });
    logXhsDragResolution('resolveXiaohongshuMedia -> start', {
      pageUrl: normalizedPageUrl,
      detailUrl: normalizedDetailUrl || null,
      noteId: normalizedNoteId,
      expectedMediaType: expectedMediaType || null,
      preferredImageUrl: preferredImageUrl || null,
      videoIntentConfidence: normalizedVideoIntentConfidence || null,
      videoIntentSources: normalizedVideoIntentSources,
    });
    const resolvedFromCurrentDocument = resolveCurrentDocumentMedia({
      noteId: normalizedNoteId,
      pageUrl: normalizedPageUrl,
      preferredImageUrl,
      expectedMediaType,
    });
    if (resolvedFromCurrentDocument) {
      logXhsDragResolution('resolveXiaohongshuMedia -> currentDocumentHit', {
        pageUrl: normalizedPageUrl,
        noteId: normalizedNoteId,
        resultKind: resolvedFromCurrentDocument.kind,
        resultVideoUrl: resolvedFromCurrentDocument.videoUrl || null,
        resultVideoCandidatesCount: resolvedFromCurrentDocument.videoCandidates.length,
        resultImageUrl: resolvedFromCurrentDocument.imageUrl || null,
        resultVideoIntentConfidence: resolvedFromCurrentDocument.videoIntentConfidence ?? null,
        resultVideoIntentSources: resolvedFromCurrentDocument.videoIntentSources ?? [],
      });
      return resolvedFromCurrentDocument;
    }

    if (expectedMediaType === 'image' && normalizedVideoIntentConfidence < 0.7) {
      logXhsDragResolution('resolveXiaohongshuMedia -> deferExpectedImageFallbackUntilAfterApi', {
        pageUrl: normalizedPageUrl,
        noteId: normalizedNoteId,
        preferredImageUrl: preferredImageUrl || null,
      });
    }

    const resolvedFromApi = await fetchXiaohongshuApiMedia(
      normalizedNoteId,
      normalizedPageUrl,
      preferredImageUrl,
    );
    if (resolvedFromApi) {
      if (resolvedFromApi.kind === 'image' && normalizedVideoIntentConfidence >= 0.7) {
        return {
          kind: 'video',
          pageUrl: resolvedFromApi.pageUrl,
          imageUrl: resolvedFromApi.imageUrl || preferredImageUrl || null,
          videoUrl: null,
          videoCandidates: [],
          videoIntentConfidence: normalizedVideoIntentConfidence,
          videoIntentSources: normalizedVideoIntentSources,
        };
      }
      logXhsDragResolution('resolveXiaohongshuMedia -> apiHit', {
        pageUrl: normalizedPageUrl,
        noteId: normalizedNoteId,
        resultKind: resolvedFromApi.kind,
        resultVideoUrl: resolvedFromApi.videoUrl || null,
        resultVideoCandidatesCount: resolvedFromApi.videoCandidates.length,
        resultImageUrl: resolvedFromApi.imageUrl || null,
      });
      return resolvedFromApi;
    }

    const resolvedFromHtml = await fetchXiaohongshuHtmlMedia(
      normalizedPageUrl,
      preferredImageUrl,
      normalizedDetailUrl,
    );
    if (resolvedFromHtml) {
      if (resolvedFromHtml.kind === 'image' && normalizedVideoIntentConfidence >= 0.7) {
        return {
          kind: 'video',
          pageUrl: resolvedFromHtml.pageUrl,
          imageUrl: resolvedFromHtml.imageUrl || preferredImageUrl || null,
          videoUrl: null,
          videoCandidates: [],
          videoIntentConfidence: normalizedVideoIntentConfidence,
          videoIntentSources: normalizedVideoIntentSources,
        };
      }
      logXhsDragResolution('resolveXiaohongshuMedia -> htmlHit', {
        pageUrl: normalizedPageUrl,
        noteId: normalizedNoteId,
        resultKind: resolvedFromHtml.kind,
        resultVideoUrl: resolvedFromHtml.videoUrl || null,
        resultVideoCandidatesCount: resolvedFromHtml.videoCandidates.length,
        resultImageUrl: resolvedFromHtml.imageUrl || null,
      });
      return resolvedFromHtml;
    }

    logXhsDragResolution('resolveXiaohongshuMedia -> finalFallback', {
      pageUrl: normalizedPageUrl,
      noteId: normalizedNoteId,
      expectedMediaType: expectedMediaType || null,
      preferredImageUrl: preferredImageUrl || null,
      videoIntentConfidence: normalizedVideoIntentConfidence || null,
      videoIntentSources: normalizedVideoIntentSources,
    });
    if (normalizedVideoIntentConfidence >= 0.7) {
      return {
        kind: 'video',
        pageUrl: normalizedPageUrl,
        imageUrl: preferredImageUrl || null,
        videoUrl: null,
        videoCandidates: [],
        videoIntentConfidence: normalizedVideoIntentConfidence,
        videoIntentSources: normalizedVideoIntentSources,
      };
    }
    return {
      kind: preferredImageUrl ? 'image' : 'unknown',
      pageUrl: normalizedPageUrl,
      imageUrl: preferredImageUrl || null,
      videoUrl: null,
      videoCandidates: [],
      videoIntentConfidence: normalizedVideoIntentConfidence || null,
      videoIntentSources: normalizedVideoIntentSources,
    };
  }

  function handleDragStart(event) {
    if (!(event instanceof DragEvent) || !event.dataTransfer) {
      return;
    }

    const pageUrl = resolveDragPageUrl(event.target);
    if (!pageUrl) {
      return;
    }

    const scope = resolveDragScope(event.target);
    const payload = buildDragPayload(scope, pageUrl, event.target);
    if (!payload.mediaType) {
      return;
    }

    console.info('[FlowSelect XHS] Drag payload prepared', {
      pageUrl,
      detailUrl: payload.detailUrl || null,
      noteId: payload.noteId,
      mediaType: payload.mediaType,
      hasScopedVideoElement: payload.hasScopedVideoElement,
      videoIntentConfidence: payload.videoIntentConfidence ?? null,
      videoIntentSources: payload.videoIntentSources ?? [],
      hasVideoUrl: Boolean(payload.videoUrl),
      videoCandidatesCount: payload.videoCandidates.length,
      hasExactImageUrl: Boolean(payload.exactImageUrl),
      hasImageUrl: Boolean(payload.imageUrl),
    });
    registerXiaohongshuDrag(payload);
    enrichDragDataTransfer(event, payload);
  }

  function rememberContextPayload(event) {
    const pageUrl = resolveDragPageUrl(event.target);
    if (!pageUrl) {
      lastContextPayload = null;
      return;
    }

    const scope = resolveDragScope(event.target);
    const payload = buildDragPayload(scope, pageUrl, event.target);
    if (!payload?.pageUrl) {
      lastContextPayload = null;
      return;
    }

    lastContextPayload = {
      ...payload,
      createdAt: Date.now(),
    };
  }

  function getFreshContextPayload() {
    if (!lastContextPayload) {
      return null;
    }

    if (Date.now() - lastContextPayload.createdAt > CONTEXT_SELECTION_TTL_MS) {
      lastContextPayload = null;
      return null;
    }

    return lastContextPayload;
  }

  function extractVideoUrl(candidates = extractVideoCandidates()) {
    const bestDirect = candidates.find(
      (candidate) => candidate.type === 'direct_cdn' || candidate.type === 'direct_mp4'
    );
    return bestDirect?.url || null;
  }

  function extractTitle() {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
    if (ogTitle && ogTitle.trim()) {
      return ogTitle.trim();
    }
    return document.title || '';
  }

  async function handleDownload() {
    const pageUrl = window.location.href;
    const videoCandidates = extractVideoCandidates();
    const videoUrl = extractVideoUrl(videoCandidates);
    const noteId = extractNoteIdFromUrl(pageUrl);
    const imageUrl = !videoUrl && videoCandidates.length === 0 ? extractPrimaryImageUrl() : null;
    const title = extractTitle();

    console.info('[FlowSelect XHS] Download clicked', {
      pageUrl,
      noteId,
      videoUrl,
      imageUrl,
      videoCandidatesCount: videoCandidates.length,
      title,
    });

    let resolvedMedia = null;
    if (!videoUrl && videoCandidates.length === 0) {
      resolvedMedia = await resolveXiaohongshuMedia({
        pageUrl,
        detailUrl: normalizeUrl(window.location.href),
        noteId,
        preferredImageUrl: imageUrl,
      });
    }

    if (
      videoUrl
      || videoCandidates.length > 0
      || (resolvedMedia?.kind === 'video' && (resolvedMedia.videoUrl || resolvedMedia.videoCandidates.length > 0))
    ) {
      chrome.runtime.sendMessage({
        type: 'video_selection',
        url: videoUrl || resolvedMedia?.videoUrl || pageUrl,
        pageUrl,
        videoUrl: videoUrl || resolvedMedia?.videoUrl || null,
        videoCandidates: videoCandidates.length > 0 ? videoCandidates : (resolvedMedia?.videoCandidates || []),
        title,
      });
      return;
    }

    const resolvedImageUrl = resolvedMedia?.kind === 'image'
      ? resolvedMedia.imageUrl
      : imageUrl;

    if (resolvedImageUrl) {
      chrome.runtime.sendMessage({
        type: 'save_image_from_page',
        url: resolvedImageUrl,
        pageUrl,
        title,
      });
      return;
    }

    console.warn('[FlowSelect XHS] No downloadable media resolved for note', pageUrl);
  }

  function createControlBarButton() {
    const button = document.createElement('xg-pip');
    button.className = `xgplayer-pip ${CONTROL_BUTTON_CLASS}`;
    button.title = 'Download with FlowSelect';

    const icon = document.createElement('xg-icon');
    icon.className = 'xgplayer-icon';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'flowselect-xhs-icon';
    iconWrap.innerHTML = CAT_ICON_SVG;

    icon.appendChild(iconWrap);
    button.appendChild(icon);
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleDownload();
    });

    return button;
  }

  function resolveControlAnchor(controls) {
    const playback = controls.querySelector('xg-playbackrate');
    if (playback && playback.parentNode === controls) {
      return { anchor: playback, playback };
    }

    const nativePip = Array.from(controls.querySelectorAll('xg-pip')).find(
      (el) => !el.classList.contains(CONTROL_BUTTON_CLASS) && el.parentNode === controls
    );
    if (nativePip) {
      return { anchor: nativePip, playback: null };
    }

    const fullscreen = controls.querySelector('xg-fullscreen');
    if (fullscreen && fullscreen.parentNode === controls) {
      return { anchor: fullscreen, playback: null };
    }

    return { anchor: null, playback: null };
  }

  function syncButtonOrder(button, playback) {
    if (!playback) {
      button.style.removeProperty('order');
      return;
    }

    const playbackOrder = window.getComputedStyle(playback).order;
    if (playbackOrder && playbackOrder !== '0') {
      // Match xgplayer's flex order so the custom control stays in the same group.
      button.style.order = playbackOrder;
      return;
    }

    button.style.removeProperty('order');
  }

  function isRenderableControlBar(controls) {
    if (!controls || !controls.isConnected) return false;
    const style = window.getComputedStyle(controls);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    const rect = controls.getBoundingClientRect();
    if (rect.width < 16 || rect.height < 16) {
      return false;
    }

    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

  function resolveBestControlBar() {
    const candidates = Array.from(
      document.querySelectorAll('xg-controls.xgplayer-controls, .xgplayer-controls')
    );
    const visible = candidates.filter(isRenderableControlBar);
    if (visible.length === 0) return null;

    const ranked = visible
      .map((controls) => {
        const rect = controls.getBoundingClientRect();
        const area = rect.width * rect.height;
        const inPlayer = controls.closest('xg-player, xgplayer, .xgplayer') ? 1 : 0;
        return { controls, area, inPlayer, bottom: rect.bottom };
      })
      .sort((a, b) => {
        if (b.inPlayer !== a.inPlayer) return b.inPlayer - a.inPlayer;
        if (b.area !== a.area) return b.area - a.area;
        return b.bottom - a.bottom;
      });

    return ranked[0].controls;
  }

  function cleanupStaleControlButtons(activeControls) {
    document.querySelectorAll(`.${CONTROL_BUTTON_CLASS}`).forEach((button) => {
      if (button.parentNode !== activeControls) {
        button.remove();
      }
    });
  }

  function ensureControlBarButton() {
    const controls = resolveBestControlBar();
    if (!controls) return false;

    cleanupStaleControlButtons(controls);

    let button = controls.querySelector(`.${CONTROL_BUTTON_CLASS}`);
    if (!button) {
      button = createControlBarButton();
      console.info('[FlowSelect XHS] Control button injected');
    }

    const { anchor, playback } = resolveControlAnchor(controls);
    if (anchor) {
      if (button.parentNode !== controls || button.nextSibling !== anchor) {
        controls.insertBefore(button, anchor);
      }
    } else if (button.parentNode !== controls) {
      controls.appendChild(button);
    }

    syncButtonOrder(button, playback);
    return true;
  }

  function ensureButton() {
    if (!isVideoPage()) {
      const existing = document.getElementById(BUTTON_ID);
      if (existing) existing.remove();
      document.querySelectorAll(`.${CONTROL_BUTTON_CLASS}`).forEach((el) => el.remove());
      return;
    }

    const injectedInControlBar = ensureControlBarButton();

    // Keep floating button as fallback when control bar is not available.
    if (injectedInControlBar) {
      const floating = document.getElementById(BUTTON_ID);
      if (floating) floating.remove();
      return;
    }

    const existing = document.getElementById(BUTTON_ID);
    if (existing) return;

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.className = 'flowselect-xhs-download-btn';
    button.title = 'Download with FlowSelect';
    button.innerHTML = CAT_ICON_SVG;
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleDownload();
    });
    document.body.appendChild(button);
    console.info('[FlowSelect XHS] Floating button injected');
  }

  function init() {
    window.__flowselectXhsLoaded = true;
    console.info('[FlowSelect XHS] Detector loaded at', window.location.href);
    ensureButton();
    document.addEventListener('dragstart', handleDragStart, true);
    document.addEventListener('contextmenu', rememberContextPayload, true);

    const observer = new MutationObserver(() => ensureButton());
    observer.observe(document.documentElement, { childList: true, subtree: true });

    let lastUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        ensureButton();
      }
    }, 800);

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === RESOLVE_XIAOHONGSHU_CONTEXT_MEDIA_MESSAGE) {
        const cached = getFreshContextPayload();
        const pageUrl = normalizeNoteUrl(message.pageUrl)
          || normalizeNoteUrl(message.linkUrl)
          || cached?.pageUrl
          || (isVideoPage() ? normalizeNoteUrl(window.location.href) : null);
        const noteId = typeof message.noteId === 'string' && message.noteId
          ? message.noteId
          : cached?.noteId || extractNoteIdFromUrl(pageUrl);
        const preferredImageUrl = resolveImageUrlCandidate(message.imageUrl)
          || cached?.exactImageUrl
          || cached?.imageUrl
          || null;
        const detailUrl = resolvePreferredDetailUrl({
          detailUrl: normalizeUrl(message.detailUrl) || cached?.detailUrl || null,
          noteId,
          stateNote: null,
          fallbackPageUrl: pageUrl,
        });
        const title = cached?.title || null;

        if (!pageUrl) {
          sendResponse({
            success: false,
            code: 'xiaohongshu_context_note_missing',
          });
          return true;
        }

        console.info('[FlowSelect XHS] Resolving context media in content script', {
          pageUrl,
          detailUrl,
          noteId,
          preferredImageUrl,
          mediaType: message.mediaType || cached?.mediaType || null,
          videoIntentConfidence:
            typeof message.videoIntentConfidence === 'number'
              ? message.videoIntentConfidence
              : cached?.videoIntentConfidence ?? null,
          videoIntentSources: Array.isArray(message.videoIntentSources) && message.videoIntentSources.length > 0
            ? message.videoIntentSources
            : cached?.videoIntentSources || [],
        });

        void resolveXiaohongshuMedia({
          pageUrl,
          detailUrl,
          noteId,
          preferredImageUrl,
          expectedMediaType:
            message.mediaType === 'image' || message.mediaType === 'video'
              ? message.mediaType
              : cached?.mediaType || null,
          videoIntentConfidence:
            typeof message.videoIntentConfidence === 'number'
              ? message.videoIntentConfidence
              : cached?.videoIntentConfidence ?? null,
          videoIntentSources: Array.isArray(message.videoIntentSources) && message.videoIntentSources.length > 0
            ? message.videoIntentSources
            : cached?.videoIntentSources || [],
        }).then((result) => {
          sendResponse({
            success: true,
            payload: {
              ...result,
              pageUrl: result?.pageUrl || pageUrl,
              detailUrl,
              title,
            },
          });
        }).catch((error) => {
          console.warn('[FlowSelect XHS] Failed to resolve context media in content script', error);
          sendResponse({
            success: false,
            code: 'xiaohongshu_context_resolution_failed',
            error: error instanceof Error ? error.message : String(error),
          });
        });

        return true;
      }

      if (message?.type === NAVIGATE_XIAOHONGSHU_NOTE_MESSAGE) {
        const result = navigateToXiaohongshuNote({
          noteId: typeof message.noteId === 'string' ? message.noteId : null,
          pageUrl: normalizeNoteUrl(message.pageUrl) || normalizeNoteUrl(window.location.href),
          detailUrl: normalizeUrl(message.detailUrl),
        });
        sendResponse(result);
        return true;
      }

      if (message?.type !== RESOLVE_XIAOHONGSHU_DRAG_MESSAGE) {
        return true;
      }

      const dragPageUrl = typeof message.pageUrl === 'string'
        ? message.pageUrl
        : window.location.href;
      const dragNoteId = typeof message.noteId === 'string' ? message.noteId : null;
      const dragDetailUrl = resolvePreferredDetailUrl({
        detailUrl: normalizeUrl(message.detailUrl),
        noteId: dragNoteId,
        stateNote: null,
        fallbackPageUrl: dragPageUrl,
      });

      console.info('[FlowSelect XHS] Resolving drag media in content script', {
        token: redactToken(typeof message.token === 'string' ? message.token : ''),
        pageUrl: dragPageUrl,
        detailUrl: dragDetailUrl,
        noteId: dragNoteId,
        preferredImageUrl: resolveImageUrlCandidate(message.imageUrl),
        mediaType: message.mediaType === 'image' || message.mediaType === 'video'
          ? message.mediaType
          : null,
        videoIntentConfidence:
          typeof message.videoIntentConfidence === 'number'
            ? message.videoIntentConfidence
            : null,
        videoIntentSources: Array.isArray(message.videoIntentSources)
          ? message.videoIntentSources
          : [],
      });

      void resolveXiaohongshuMedia({
        pageUrl: dragPageUrl,
        detailUrl: dragDetailUrl,
        noteId: dragNoteId,
        preferredImageUrl: resolveImageUrlCandidate(message.imageUrl),
        expectedMediaType:
          message.mediaType === 'image' || message.mediaType === 'video'
            ? message.mediaType
            : null,
        videoIntentConfidence:
          typeof message.videoIntentConfidence === 'number'
            ? message.videoIntentConfidence
            : null,
        videoIntentSources: Array.isArray(message.videoIntentSources)
          ? message.videoIntentSources
          : [],
      }).then((result) => {
        console.info('[FlowSelect XHS] Resolved drag media in content script', {
          kind: result?.kind ?? 'unknown',
          pageUrl: result?.pageUrl ?? null,
          imageUrl: result?.imageUrl ?? null,
          videoUrl: result?.videoUrl ?? null,
          videoIntentConfidence: result?.videoIntentConfidence ?? null,
          videoIntentSources: result?.videoIntentSources ?? [],
          videoCandidatesCount: Array.isArray(result?.videoCandidates)
            ? result.videoCandidates.length
            : 0,
        });
        sendResponse({
          success: true,
          detailUrl: dragDetailUrl,
          ...result,
        });
      }).catch((error) => {
        console.warn('[FlowSelect XHS] Failed to resolve drag media in content script', error);
        sendResponse({
          success: false,
          kind: 'unknown',
          pageUrl: dragPageUrl,
          detailUrl: dragDetailUrl,
          imageUrl: resolveImageUrlCandidate(message.imageUrl),
          videoUrl: null,
          videoCandidates: [],
          code: 'xiaohongshu_drag_resolution_failed',
          error: error instanceof Error ? error.message : String(error),
        });
      });

      return true;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
