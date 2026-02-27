// FlowSelect Browser Extension - YouTube Video Detector
// Detects video pages and injects download buttons

(function() {
  'use strict';

  const PROCESSED_ATTR = 'data-flowselect-processed';
  const BUTTON_CLASSES = [
    'flowselect-youtube-btn',
    'flowselect-youtube-set-in-btn',
    'flowselect-youtube-set-out-btn',
  ];
  const clipState = {
    startSec: null,
    endSec: null,
  };

  // Cat icon SVG
  const CAT_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" fill-rule="evenodd" d="M11.75 6.406c-1.48 0-1.628.157-2.394.157C8.718 6.563 6.802 5 5.845 5S3.77 5.563 3.77 7.188v1.875c.002.492.18 2 .88 1.597c-.827.978-.91 2.119-.899 3.223c-.223.064-.45.137-.671.212c-.684.234-1.41.532-1.737.744a.75.75 0 0 0 .814 1.26c.156-.101.721-.35 1.408-.585l.228-.075c.046.433.161.83.332 1.19l-.024.013c-.41.216-.79.465-1.032.623l-.113.074a.75.75 0 1 0 .814 1.26l.131-.086c.245-.16.559-.365.901-.545q.12-.064.231-.116C6.763 19.475 9.87 20 11.75 20s4.987-.525 6.717-2.148q.11.052.231.116c.342.18.656.385.901.545l.131.086a.75.75 0 0 0 .814-1.26l-.113-.074a13 13 0 0 0-1.032-.623l-.024-.013c.171-.36.286-.757.332-1.19l.228.075c.687.235 1.252.484 1.409.585a.75.75 0 0 0 .813-1.26c-.327-.212-1.053-.51-1.736-.744a16 16 0 0 0-.672-.213c.012-1.104-.072-2.244-.9-3.222c.7.403.88-1.105.881-1.598V7.188C19.73 5.563 18.613 5 17.655 5c-.957 0-2.873 1.563-3.51 1.563c-.767 0-.915-.157-2.395-.157m-.675 9.194c.202-.069.441-.1.675-.1s.473.031.676.1c.1.034.22.088.328.174a.62.62 0 0 1 .246.476c0 .23-.139.39-.246.476s-.229.14-.328.174c-.203.069-.442.1-.676.1s-.473-.031-.675-.1a1.1 1.1 0 0 1-.329-.174a.62.62 0 0 1-.246-.476c0-.23.139-.39.246-.476s.23-.14.329-.174m2.845-3.1c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812m-5.96 0c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812" clip-rule="evenodd"/>
  </svg>`;
  const DIRECTION_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" style="display:block;width:24px;height:24px;fill:currentColor;">
    <rect x="3" y="11" width="12" height="2" rx="1" style="fill:currentColor;"></rect>
    <circle cx="18" cy="12" r="3" style="fill:currentColor;"></circle>
  </svg>`;

  // Check if current page is a video page
  function isVideoPage() {
    return window.location.pathname === '/watch' &&
           new URLSearchParams(window.location.search).has('v');
  }

  // Get video ID from URL
  function getVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v');
  }

  function resetClipState() {
    clipState.startSec = null;
    clipState.endSec = null;
  }

  function hasValidClipRange() {
    return clipState.startSec != null &&
      clipState.endSec != null &&
      clipState.endSec > clipState.startSec;
  }

  // Detect video player and inject button
  function detectVideoPlayer() {
    if (!isVideoPage()) return;

    const videoId = getVideoId();
    if (!videoId) return;

    // Find YouTube player controls - right controls container
    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls) return;

    // Check if already processed
    if (rightControls.hasAttribute(PROCESSED_ATTR)) return;

    console.log('[FlowSelect YouTube] Video detected:', videoId);
    injectControlButtons(rightControls);
    rightControls.setAttribute(PROCESSED_ATTR, 'true');
  }

  function getCurrentPlaybackSeconds() {
    const videoEl = document.querySelector('video.video-stream') || document.querySelector('video');
    if (!videoEl) return null;
    const current = Number(videoEl.currentTime);
    if (!Number.isFinite(current) || current < 0) return null;
    return current;
  }

  function formatTimestamp(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const hh = Math.floor(total / 3600);
    const mm = Math.floor((total % 3600) / 60);
    const ss = total % 60;
    if (hh > 0) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  function notify(message) {
    window.alert(message);
  }

  function removeInjectedButtons() {
    for (const className of BUTTON_CLASSES) {
      document.querySelectorAll(`.${className}`).forEach((el) => el.remove());
    }
  }

  function createButton({ className, title, html, text, onClick }) {
    const btn = document.createElement('button');
    btn.className = `ytp-button ${className}`;
    btn.type = 'button';
    btn.title = title;
    if (html) {
      btn.innerHTML = html;
    } else if (text) {
      const label = document.createElement('span');
      label.className = 'flowselect-youtube-btn-label';
      label.textContent = text;
      btn.appendChild(label);
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onClick();
    });
    return btn;
  }

  function sendVideoSelectedMessage(payload) {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[FlowSelect YouTube] Failed to contact background:', chrome.runtime.lastError.message);
        notify('FlowSelect extension background is unavailable. Please reload extension.');
        return;
      }

      if (!response?.success) {
        notify('FlowSelect desktop app is not connected. Please open FlowSelect and try again.');
      }
    });
  }

  function updateClipButtonsState() {
    const fullBtn = document.querySelector('.flowselect-youtube-btn');
    const inBtn = document.querySelector('.flowselect-youtube-set-in-btn');
    const outBtn = document.querySelector('.flowselect-youtube-set-out-btn');

    if (!inBtn || !outBtn || !fullBtn) return;

    if (clipState.startSec == null) {
      inBtn.removeAttribute('data-selected');
      inBtn.title = 'Set IN point';
    } else {
      inBtn.setAttribute('data-selected', 'true');
      inBtn.title = `IN: ${formatTimestamp(clipState.startSec)}`;
    }

    if (clipState.endSec == null) {
      outBtn.removeAttribute('data-selected');
      outBtn.title = 'Set OUT point';
    } else {
      outBtn.setAttribute('data-selected', 'true');
      outBtn.title = `OUT: ${formatTimestamp(clipState.endSec)}`;
    }

    if (hasValidClipRange()) {
      fullBtn.setAttribute('data-clip-ready', 'true');
      fullBtn.title = `Download clip ${formatTimestamp(clipState.startSec)} -> ${formatTimestamp(clipState.endSec)}`;
    } else {
      fullBtn.removeAttribute('data-clip-ready');
      fullBtn.title = 'Download with FlowSelect';
    }
  }

  function setInPoint() {
    const current = getCurrentPlaybackSeconds();
    if (current == null) {
      notify('Unable to read current playback time.');
      return;
    }
    clipState.startSec = current;
    console.log('[FlowSelect YouTube] IN point set:', current);
    updateClipButtonsState();
  }

  function setOutPoint() {
    const current = getCurrentPlaybackSeconds();
    if (current == null) {
      notify('Unable to read current playback time.');
      return;
    }
    clipState.endSec = current;
    console.log('[FlowSelect YouTube] OUT point set:', current);
    updateClipButtonsState();
  }

  function downloadSelectedClip() {
    const pageUrl = window.location.href;
    const title = extractVideoTitle();
    const startSec = clipState.startSec;
    const endSec = clipState.endSec;

    if (startSec == null || endSec == null) {
      notify('Please set both IN and OUT points first.');
      return;
    }

    if (endSec <= startSec) {
      notify('OUT must be later than IN.');
      return;
    }

    console.log('[FlowSelect YouTube] Clip range:', startSec, endSec);

    sendVideoSelectedMessage({
      type: 'video_selected',
      url: pageUrl,
      pageUrl,
      title,
      clipStartSec: startSec,
      clipEndSec: endSec,
    });
  }

  function handlePrimaryDownload() {
    if (hasValidClipRange()) {
      downloadSelectedClip();
      return;
    }
    downloadVideo();
  }

  // Inject buttons
  function injectControlButtons(container) {
    removeInjectedButtons();

    const fullBtn = createButton({
      className: 'flowselect-youtube-btn',
      title: 'Download with FlowSelect',
      html: CAT_ICON_SVG,
      onClick: handlePrimaryDownload,
    });

    const inBtn = createButton({
      className: 'flowselect-youtube-set-in-btn',
      title: 'Set IN point',
      html: DIRECTION_ICON_SVG,
      onClick: setInPoint,
    });

    const outBtn = createButton({
      className: 'flowselect-youtube-set-out-btn',
      title: 'Set OUT point',
      html: DIRECTION_ICON_SVG,
      onClick: setOutPoint,
    });

    const buttons = [outBtn, inBtn, fullBtn];
    for (const btn of buttons) {
      container.insertBefore(btn, container.firstChild);
    }

    updateClipButtonsState();
    console.log('[FlowSelect YouTube] Buttons injected');
  }

  // Extract video title
  function extractVideoTitle() {
    // Method 1: Try to get from video title element
    const titleEl = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string');
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim();
    }

    // Method 2: Try newer YouTube layout
    const titleEl2 = document.querySelector('#title h1 yt-formatted-string');
    if (titleEl2 && titleEl2.textContent.trim()) {
      return titleEl2.textContent.trim();
    }

    // Method 3: Fallback to document.title
    return document.title.replace(' - YouTube', '');
  }

  // Send download request
  function downloadVideo() {
    const videoId = getVideoId();
    const pageUrl = window.location.href;
    const title = extractVideoTitle();

    console.log('[FlowSelect YouTube] Video ID:', videoId);
    console.log('[FlowSelect YouTube] Page URL:', pageUrl);
    console.log('[FlowSelect YouTube] Title:', title);

    sendVideoSelectedMessage({
      type: 'video_selected',
      url: pageUrl,
      pageUrl: pageUrl,
      title: title
    });
  }

  // MutationObserver for dynamic content
  const observer = new MutationObserver(() => {
    detectVideoPlayer();
  });

  // Handle URL changes (SPA navigation)
  let lastUrl = window.location.href;
  function checkUrlChange() {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log('[FlowSelect YouTube] URL changed:', lastUrl);
      resetClipState();
      // Reset processed state for new video
      const processed = document.querySelectorAll(`[${PROCESSED_ATTR}]`);
      processed.forEach(el => el.removeAttribute(PROCESSED_ATTR));
      removeInjectedButtons();
      detectVideoPlayer();
    }
  }

  // Initialize
  function init() {
    console.log('[FlowSelect YouTube] Detector initialized');
    detectVideoPlayer();
    observer.observe(document.body, { childList: true, subtree: true });
    // Check for URL changes periodically (for SPA navigation)
    setInterval(checkUrlChange, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
