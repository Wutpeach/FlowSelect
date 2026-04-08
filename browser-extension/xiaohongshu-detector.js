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
  const CONTEXT_SELECTION_TTL_MS = 10_000;
  const XIAOHONGSHU_FEED_API_PATH = '/api/sns/web/v1/feed';
  const XIAOHONGSHU_NOTE_DETAIL_PATH = '/api/sns/web/v1/note';
  const XIAOHONGSHU_IMAGE_SCENES = ['CRD_PRV_WEBP', 'CRD_WM_WEBP', 'CRD_WM_JPG'];
  const CAT_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" fill-rule="evenodd" d="M11.75 6.406c-1.48 0-1.628.157-2.394.157C8.718 6.563 6.802 5 5.845 5S3.77 5.563 3.77 7.188v1.875c.002.492.18 2 .88 1.597c-.827.978-.91 2.119-.899 3.223c-.223.064-.45.137-.671.212c-.684.234-1.41.532-1.737.744a.75.75 0 0 0 .814 1.26c.156-.101.721-.35 1.408-.585l.228-.075c.046.433.161.83.332 1.19l-.024.013c-.41.216-.79.465-1.032.623l-.113.074a.75.75 0 1 0 .814 1.26l.131-.086c.245-.16.559-.365.901-.545q.12-.064.231-.116C6.763 19.475 9.87 20 11.75 20s4.987-.525 6.717-2.148q.11.052.231.116c.342.18.656.385.901.545l.131.086a.75.75 0 0 0 .814-1.26l-.113-.074a13 13 0 0 0-1.032-.623l-.024-.013c.171-.36.286-.757.332-1.19l.228.075c.687.235 1.252.484 1.409.585a.75.75 0 0 0 .813-1.26c-.327-.212-1.053-.51-1.736-.744a16 16 0 0 0-.672-.213c.012-1.104-.072-2.244-.9-3.222c.7.403.88-1.105.881-1.598V7.188C19.73 5.563 18.613 5 17.655 5c-.957 0-2.873 1.563-3.51 1.563c-.767 0-.915-.157-2.395-.157m-.675 9.194c.202-.069.441-.1.675-.1s.473.031.676.1c.1.034.22.088.328.174a.62.62 0 0 1 .246.476c0 .23-.139.39-.246.476s-.229.14-.328.174c-.203.069-.442.1-.676.1s-.473-.031-.675-.1a1.1 1.1 0 0 1-.329-.174a.62.62 0 0 1-.246-.476c0-.23.139-.39.246-.476s.23-.14.329-.174m2.845-3.1c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812m-5.96 0c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812" clip-rule="evenodd"/>
  </svg>`;
  let lastContextPayload = null;
  const NOTE_LINK_SELECTOR = 'a[href*="/explore/"], a[href*="/discovery/item/"], a[href*="/user/profile/"]';

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
    if (!normalized || isLikelyVideoUrl(normalized)) {
      return null;
    }
    return normalized;
  }

  function looksLikeImageUrl(url) {
    return (
      /xhscdn\.com/i.test(url)
      || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i.test(url)
      || /(?:imageView2|notes_pre_post|!nc_)/i.test(url)
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
    const hasScopedVideoElement = scope instanceof Element && Boolean(scope.querySelector('video'));
    const allowDocumentWideVideoSignals =
      normalizedCurrentPageUrl === pageUrl || hasScopedVideoElement;

    if (expectedMediaType === 'image') {
      const resolvedImageUrl = preferredImageUrl || extractPrimaryImageUrl(scope);
      if (resolvedImageUrl) {
        return {
          kind: 'image',
          pageUrl,
          imageUrl: resolvedImageUrl,
          videoUrl: null,
          videoCandidates: [],
        };
      }
    }

    const scopeCandidates = extractVideoCandidates(scope, {
      includeDocumentWideSignals: allowDocumentWideVideoSignals,
    });
    if (scopeCandidates.length > 0) {
      return {
        kind: 'video',
        pageUrl,
        imageUrl: preferredImageUrl || extractPrimaryImageUrl(scope),
        videoUrl: extractVideoUrl(scopeCandidates),
        videoCandidates: scopeCandidates,
      };
    }

    const snippets = collectNoteSpecificScriptSnippets(noteId, pageUrl);
    const snippetCandidates = collectVideoCandidatesFromSnippets(snippets);
    if (snippetCandidates.length > 0) {
      return {
        kind: 'video',
        pageUrl,
        imageUrl: preferredImageUrl || extractPrimaryImageUrl(scope),
        videoUrl: extractVideoUrl(snippetCandidates),
        videoCandidates: snippetCandidates,
      };
    }

    const performanceCandidates = allowDocumentWideVideoSignals
      ? collectPerformanceVideoCandidates()
      : [];
    if (performanceCandidates.length > 0 && snippetSuggestsVideo(snippets)) {
      return {
        kind: 'video',
        pageUrl,
        imageUrl: preferredImageUrl || extractPrimaryImageUrl(scope),
        videoUrl: extractVideoUrl(performanceCandidates),
        videoCandidates: performanceCandidates,
      };
    }

    if (allowDocumentWideVideoSignals && snippetSuggestsVideo(snippets)) {
      return {
        kind: 'video',
        pageUrl,
        imageUrl: preferredImageUrl || extractPrimaryImageUrl(scope),
        videoUrl: null,
        videoCandidates: [],
      };
    }

    const resolvedImageUrl = preferredImageUrl || extractPrimaryImageUrl(scope);
    if (resolvedImageUrl) {
      return {
        kind: 'image',
        pageUrl,
        imageUrl: resolvedImageUrl,
        videoUrl: null,
        videoCandidates: [],
      };
    }

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
    const hasScopedVideoElement = scope instanceof Element && Boolean(scope.querySelector('video'));
    const videoCandidates = extractVideoCandidates(scope, {
      includeDocumentWideSignals:
        normalizeNoteUrl(window.location.href) === pageUrl || hasScopedVideoElement,
    });
    const videoUrl = extractVideoUrl(videoCandidates);
    const exactImageUrl = resolveDraggedImageUrl(target, scope);
    const imageUrl = exactImageUrl || extractPrimaryImageUrl(scope);
    const mediaType = videoUrl || videoCandidates.length > 0 || hasScopedVideoElement
      ? 'video'
      : imageUrl
        ? 'image'
        : null;

    return {
      token: nextToken(),
      pageUrl,
      noteId,
      exactImageUrl,
      imageUrl,
      videoUrl,
      videoCandidates,
      hasScopedVideoElement,
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
      noteId: payload.noteId,
      imageUrl: payload.exactImageUrl || payload.imageUrl || null,
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
    if (value == null || depth > 8) {
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

    return preferredImageUrl || imageCandidates[0]?.url || null;
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

        collectMediaFromValue(data, addVideoCandidate, addImageCandidate);
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
      return {
        kind: 'video',
        pageUrl,
        videoUrl: videoUrl || null,
        videoCandidates: orderedCandidates,
        imageUrl,
      };
    }

    if (imageUrl) {
      return {
        kind: 'image',
        pageUrl,
        imageUrl,
        videoUrl: null,
        videoCandidates: [],
      };
    }

    return null;
  }

  async function fetchXiaohongshuHtmlMedia(pageUrl, preferredImageUrl) {
    if (!pageUrl) {
      return null;
    }

    try {
      const response = await fetch(pageUrl, {
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
        return {
          kind: 'video',
          pageUrl,
          videoUrl: videoUrl || null,
          videoCandidates: orderedCandidates,
          imageUrl,
        };
      }

      if (imageUrl) {
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

    return null;
  }

  async function resolveXiaohongshuMedia({ pageUrl, noteId, preferredImageUrl, expectedMediaType }) {
    const normalizedPageUrl = normalizeNoteUrl(pageUrl) || normalizeUrl(pageUrl);
    if (!normalizedPageUrl) {
      return {
        kind: expectedMediaType === 'image' ? 'image' : 'unknown',
        pageUrl: pageUrl || window.location.href,
        imageUrl: preferredImageUrl || null,
        videoUrl: null,
        videoCandidates: [],
      };
    }

    const normalizedNoteId = normalizeNoteId(noteId) || extractNoteIdFromUrl(normalizedPageUrl);
    const resolvedFromCurrentDocument = resolveCurrentDocumentMedia({
      noteId: normalizedNoteId,
      pageUrl: normalizedPageUrl,
      preferredImageUrl,
      expectedMediaType,
    });
    if (resolvedFromCurrentDocument) {
      return resolvedFromCurrentDocument;
    }

    if (expectedMediaType === 'image') {
      return {
        kind: preferredImageUrl ? 'image' : 'unknown',
        pageUrl: normalizedPageUrl,
        imageUrl: preferredImageUrl || null,
        videoUrl: null,
        videoCandidates: [],
      };
    }

    const resolvedFromApi = await fetchXiaohongshuApiMedia(
      normalizedNoteId,
      normalizedPageUrl,
      preferredImageUrl,
    );
    if (resolvedFromApi) {
      return resolvedFromApi;
    }

    const resolvedFromHtml = await fetchXiaohongshuHtmlMedia(normalizedPageUrl, preferredImageUrl);
    if (resolvedFromHtml) {
      return resolvedFromHtml;
    }

    return {
      kind: preferredImageUrl ? 'image' : 'unknown',
      pageUrl: normalizedPageUrl,
      imageUrl: preferredImageUrl || null,
      videoUrl: null,
      videoCandidates: [],
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
      noteId: payload.noteId,
      mediaType: payload.mediaType,
      hasScopedVideoElement: payload.hasScopedVideoElement,
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
          noteId,
          preferredImageUrl,
          mediaType: message.mediaType || cached?.mediaType || null,
        });

        void resolveXiaohongshuMedia({
          pageUrl,
          noteId,
          preferredImageUrl,
          expectedMediaType:
            message.mediaType === 'image' || message.mediaType === 'video'
              ? message.mediaType
              : cached?.mediaType || null,
        }).then((result) => {
          sendResponse({
            success: true,
            payload: {
              ...result,
              pageUrl: result?.pageUrl || pageUrl,
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

      if (message?.type !== RESOLVE_XIAOHONGSHU_DRAG_MESSAGE) {
        return true;
      }

      console.info('[FlowSelect XHS] Resolving drag media in content script', {
        token: typeof message.token === 'string' ? message.token : null,
        pageUrl: typeof message.pageUrl === 'string' ? message.pageUrl : window.location.href,
        noteId: typeof message.noteId === 'string' ? message.noteId : null,
        preferredImageUrl: resolveImageUrlCandidate(message.imageUrl),
      });

      void resolveXiaohongshuMedia({
        pageUrl: typeof message.pageUrl === 'string' ? message.pageUrl : window.location.href,
        noteId: typeof message.noteId === 'string' ? message.noteId : null,
        preferredImageUrl: resolveImageUrlCandidate(message.imageUrl),
        expectedMediaType:
          message.mediaType === 'image' || message.mediaType === 'video'
            ? message.mediaType
            : null,
      }).then((result) => {
        console.info('[FlowSelect XHS] Resolved drag media in content script', {
          kind: result?.kind ?? 'unknown',
          pageUrl: result?.pageUrl ?? null,
          imageUrl: result?.imageUrl ?? null,
          videoUrl: result?.videoUrl ?? null,
          videoCandidatesCount: Array.isArray(result?.videoCandidates)
            ? result.videoCandidates.length
            : 0,
        });
        sendResponse({
          success: true,
          ...result,
        });
      }).catch((error) => {
        console.warn('[FlowSelect XHS] Failed to resolve drag media in content script', error);
        sendResponse({
          success: false,
          kind: 'unknown',
          pageUrl: typeof message.pageUrl === 'string' ? message.pageUrl : window.location.href,
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
