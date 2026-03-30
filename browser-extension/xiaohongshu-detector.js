// FlowSelect Browser Extension - Xiaohongshu Video Detector
// Detects playable video source on note pages and injects a download button.

(function() {
  'use strict';

  const BUTTON_ID = 'flowselect-xhs-download-btn';
  const CONTROL_BUTTON_CLASS = 'flowselect-xhs-control-btn';
  const CAT_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" fill-rule="evenodd" d="M11.75 6.406c-1.48 0-1.628.157-2.394.157C8.718 6.563 6.802 5 5.845 5S3.77 5.563 3.77 7.188v1.875c.002.492.18 2 .88 1.597c-.827.978-.91 2.119-.899 3.223c-.223.064-.45.137-.671.212c-.684.234-1.41.532-1.737.744a.75.75 0 0 0 .814 1.26c.156-.101.721-.35 1.408-.585l.228-.075c.046.433.161.83.332 1.19l-.024.013c-.41.216-.79.465-1.032.623l-.113.074a.75.75 0 1 0 .814 1.26l.131-.086c.245-.16.559-.365.901-.545q.12-.064.231-.116C6.763 19.475 9.87 20 11.75 20s4.987-.525 6.717-2.148q.11.052.231.116c.342.18.656.385.901.545l.131.086a.75.75 0 0 0 .814-1.26l-.113-.074a13 13 0 0 0-1.032-.623l-.024-.013c.171-.36.286-.757.332-1.19l.228.075c.687.235 1.252.484 1.409.585a.75.75 0 0 0 .813-1.26c-.327-.212-1.053-.51-1.736-.744a16 16 0 0 0-.672-.213c.012-1.104-.072-2.244-.9-3.222c.7.403.88-1.105.881-1.598V7.188C19.73 5.563 18.613 5 17.655 5c-.957 0-2.873 1.563-3.51 1.563c-.767 0-.915-.157-2.395-.157m-.675 9.194c.202-.069.441-.1.675-.1s.473.031.676.1c.1.034.22.088.328.174a.62.62 0 0 1 .246.476c0 .23-.139.39-.246.476s-.229.14-.328.174c-.203.069-.442.1-.676.1s-.473-.031-.675-.1a1.1 1.1 0 0 1-.329-.174a.62.62 0 0 1-.246-.476c0-.23.139-.39.246-.476s.23-.14.329-.174m2.845-3.1c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812m-5.96 0c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812" clip-rule="evenodd"/>
  </svg>`;

  function isVideoPage() {
    return window.location.pathname.includes('/explore/') ||
      window.location.pathname.includes('/discovery/item/');
  }

  function normalizeUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const normalized = url.replace(/\\u002F/g, '/').trim();
    if (!normalized.startsWith('http') || normalized.startsWith('blob:')) return null;
    return normalized;
  }

  function isLikelyMediaUrl(url) {
    const normalized = normalizeUrl(url);
    if (!normalized) return false;
    return /xhscdn\.com|xiaohongshu|xhslink|\.mp4(\?|$)|\.m3u8(\?|$)/i.test(normalized);
  }

  function isM3u8Url(url) {
    return /\.m3u8(\?|$)/i.test(url);
  }

  function classifyCandidateType(url) {
    const lower = url.toLowerCase();
    if (isM3u8Url(lower)) return 'manifest_m3u8';
    if (/xhscdn\.com/.test(lower)) return 'direct_cdn';
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

  function extractVideoCandidates() {
    const seen = new Set();
    const candidates = [];

    const collectCandidate = (raw, source) => {
      const candidateUrl = normalizeUrl(raw);
      if (!candidateUrl || seen.has(candidateUrl)) return;
      seen.add(candidateUrl);
      if (!isLikelyMediaUrl(candidateUrl)) return;

      const type = classifyCandidateType(candidateUrl);
      const score = candidateTypeScore(type) + sourceScore(source);
      candidates.push({
        url: candidateUrl,
        type,
        confidence: confidenceForScore(score),
        source,
        score,
      });
    };

    // Method 1: direct video element
    const videos = Array.from(document.querySelectorAll('video'));
    for (const video of videos) {
      collectCandidate(video.currentSrc, 'video_element');
      collectCandidate(video.src, 'video_element');
      collectCandidate(video.getAttribute('src'), 'video_element');
      const source = video.querySelector('source');
      collectCandidate(source?.src, 'video_source');
      collectCandidate(source?.getAttribute('src'), 'video_source');
    }

    // Method 2: JSON-LD block
    const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of ldScripts) {
      try {
        const payload = JSON.parse(script.textContent || '{}');
        collectCandidate(payload?.contentUrl || payload?.video?.contentUrl, 'json_ld');
      } catch (_) {
        // Ignore malformed json-ld.
      }
    }

    // Method 3: Performance resources (blob-backed players usually still fetch real media URLs)
    const resources = performance.getEntriesByType('resource') || [];
    for (let i = resources.length - 1; i >= 0; i -= 1) {
      collectCandidate(resources[i]?.name, 'performance_resource');
    }

    // Method 4: Script text scan for encoded/embedded media URLs
    const scriptTags = Array.from(document.querySelectorAll('script'));
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

  function handleDownload() {
    const pageUrl = window.location.href;
    const videoCandidates = extractVideoCandidates();
    const videoUrl = extractVideoUrl(videoCandidates);
    const title = extractTitle();

    console.log('[FlowSelect XHS] Download clicked', { pageUrl, videoUrl, title });

    chrome.runtime.sendMessage({
      type: 'video_selection',
      url: videoUrl || pageUrl,
      pageUrl,
      videoUrl: videoUrl,
      videoCandidates,
      title,
    });
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
      console.log('[FlowSelect XHS] Control button injected');
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
    console.log('[FlowSelect XHS] Floating button injected');
  }

  function init() {
    window.__flowselectXhsLoaded = true;
    console.log('[FlowSelect XHS] Detector loaded at', window.location.href);
    ensureButton();

    const observer = new MutationObserver(() => ensureButton());
    observer.observe(document.documentElement, { childList: true, subtree: true });

    let lastUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        ensureButton();
      }
    }, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
