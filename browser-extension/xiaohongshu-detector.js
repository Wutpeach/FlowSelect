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

  function isLikelyMediaUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (!url.startsWith('http') || url.startsWith('blob:')) return false;
    return /xhscdn\.com|xiaohongshu|xhslink|\.mp4(\?|$)|\.m3u8(\?|$)/i.test(url);
  }

  function extractVideoUrl() {
    // Method 1: direct video element
    const videos = Array.from(document.querySelectorAll('video'));
    for (const video of videos) {
      const candidates = [video.currentSrc, video.src];
      for (const candidate of candidates) {
        if (isLikelyMediaUrl(candidate)) {
          return candidate;
        }
      }
      const source = video.querySelector('source');
      if (isLikelyMediaUrl(source?.src)) {
        return source.src;
      }
    }

    // Method 2: JSON-LD block
    const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of ldScripts) {
      try {
        const payload = JSON.parse(script.textContent || '{}');
        const contentUrl = payload?.contentUrl || payload?.video?.contentUrl;
        if (isLikelyMediaUrl(contentUrl)) {
          return contentUrl;
        }
      } catch (_) {
        // Ignore malformed json-ld
      }
    }

    // Method 3: Performance resources (blob-backed players usually still fetch real media URLs)
    const resources = performance.getEntriesByType('resource') || [];
    for (let i = resources.length - 1; i >= 0; i -= 1) {
      const name = resources[i]?.name;
      if (isLikelyMediaUrl(name)) {
        return name;
      }
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
        if (isLikelyMediaUrl(match)) {
          return match;
        }
      }
    }

    return null;
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
    const videoUrl = extractVideoUrl();
    const title = extractTitle();

    console.log('[FlowSelect XHS] Download clicked', { pageUrl, videoUrl, title });

    chrome.runtime.sendMessage({
      type: 'video_selected',
      url: videoUrl || pageUrl,
      pageUrl,
      videoUrl: videoUrl,
      title,
    });
  }

  function ensureControlBarButton() {
    const controls = document.querySelector('xg-controls.xgplayer-controls, .xgplayer-controls');
    if (!controls) return false;

    let existing = controls.querySelector(`.${CONTROL_BUTTON_CLASS}`);
    if (existing) return true;

    // Build button with xgplayer-like structure so layout matches native controls.
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

    // Place to the left of playback rate button when available.
    const playback = controls.querySelector('xg-playbackrate');
    const pip = controls.querySelector('xg-pip');
    const fullscreen = controls.querySelector('xg-fullscreen');
    if (playback && playback.parentNode === controls) {
      controls.insertBefore(button, playback);
    } else if (pip && pip.parentNode === controls) {
      controls.insertBefore(button, pip);
    } else if (fullscreen && fullscreen.parentNode === controls) {
      controls.insertBefore(button, fullscreen);
    } else {
      controls.appendChild(button);
    }

    console.log('[FlowSelect XHS] Control button injected');
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
