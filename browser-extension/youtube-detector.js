// FlowSelect Browser Extension - YouTube Video Detector
// Detects video pages and injects download/screenshot buttons

(function() {
  'use strict';

  const PROCESSED_ATTR = 'data-flowselect-processed';
  const BUTTON_CLASSES = [
    'flowselect-youtube-btn',
    'flowselect-youtube-set-in-btn',
    'flowselect-youtube-set-out-btn',
    'flowselect-youtube-screenshot-btn',
  ];
  const SCREENSHOT_PANEL_ID = 'flowselect-youtube-screenshot-panel';
  const SCREENSHOT_LIST_ID = 'flowselect-youtube-screenshot-list';
  const MAX_SCREENSHOTS = 20;
  const screenshots = [];
  const clipState = {
    startSec: null,
    endSec: null,
  };
  const localeUtils = window.FlowSelectLocaleUtils || null;
  const controlStyleUtils = window.FlowSelectControlStyleUtils || null;
  const FALLBACK_LANGUAGE = localeUtils?.FALLBACK_LANGUAGE || 'en';
  let currentBundle = {
    language: FALLBACK_LANGUAGE,
    common: {},
    extension: {},
    _namespaces: ['extension', 'common'],
  };

  const CAT_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" fill-rule="evenodd" d="M11.75 6.406c-1.48 0-1.628.157-2.394.157C8.718 6.563 6.802 5 5.845 5S3.77 5.563 3.77 7.188v1.875c.002.492.18 2 .88 1.597c-.827.978-.91 2.119-.899 3.223c-.223.064-.45.137-.671.212c-.684.234-1.41.532-1.737.744a.75.75 0 0 0 .814 1.26c.156-.101.721-.35 1.408-.585l.228-.075c.046.433.161.83.332 1.19l-.024.013c-.41.216-.79.465-1.032.623l-.113.074a.75.75 0 1 0 .814 1.26l.131-.086c.245-.16.559-.365.901-.545q.12-.064.231-.116C6.763 19.475 9.87 20 11.75 20s4.987-.525 6.717-2.148q.11.052.231.116c.342.18.656.385.901.545l.131.086a.75.75 0 0 0 .814-1.26l-.113-.074a13 13 0 0 0-1.032-.623l-.024-.013c.171-.36.286-.757.332-1.19l.228.075c.687.235 1.252.484 1.409.585a.75.75 0 0 0 .813-1.26c-.327-.212-1.053-.51-1.736-.744a16 16 0 0 0-.672-.213c.012-1.104-.072-2.244-.9-3.222c.7.403.88-1.105.881-1.598V7.188C19.73 5.563 18.613 5 17.655 5c-.957 0-2.873 1.563-3.51 1.563c-.767 0-.915-.157-2.395-.157m-.675 9.194c.202-.069.441-.1.675-.1s.473.031.676.1c.1.034.22.088.328.174a.62.62 0 0 1 .246.476c0 .23-.139.39-.246.476s-.229.14-.328.174c-.203.069-.442.1-.676.1s-.473-.031-.675-.1a1.1 1.1 0 0 1-.329-.174a.62.62 0 0 1-.246-.476c0-.23.139-.39.246-.476s.23-.14.329-.174m2.845-3.1c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812m-5.96 0c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812" clip-rule="evenodd"/>
  </svg>`;
  const CLIP_POINT_ICON_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block;">
    <path d="M8.5796 16.3287C8.20841 16.019 7.99992 15.5989 8 15.161V4.99686C8.00201 4.46777 8.25488 3.96084 8.70341 3.58672C9.15193 3.2126 9.75969 3.00168 10.394 3H15L15 21C14.4749 21 13.9713 20.826 13.6 20.5163L8.5796 16.3287Z" fill="black" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  const CAMERA_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M9 4.5a2 2 0 0 0-1.79 1.11l-.47.94H5.5A3.5 3.5 0 0 0 2 10.05v7.45A3.5 3.5 0 0 0 5.5 21h13a3.5 3.5 0 0 0 3.5-3.5v-7.45A3.5 3.5 0 0 0 18.5 6.5h-1.24l-.47-.94A2 2 0 0 0 15 4.5H9Zm3 13a4.5 4.5 0 1 1 0-9a4.5 4.5 0 0 1 0 9Zm0-1.75a2.75 2.75 0 1 0 0-5.5a2.75 2.75 0 0 0 0 5.5Z"/>
  </svg>`;
  const SCREENSHOT_SAVE_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
    <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/>
    <path d="M7 3v4a1 1 0 0 0 1 1h7"/>
  </svg>`;
  const SCREENSHOT_COPY_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
  </svg>`;
  const SCREENSHOT_DELETE_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 11v6"/>
    <path d="M14 11v6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
    <path d="M3 6h18"/>
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>`;
  const SCREENSHOT_COPIED_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6 7 17l-5-5"/>
    <path d="m22 10-7.5 7.5L13 16"/>
  </svg>`;

  function isVideoPage() {
    return window.location.pathname === '/watch' &&
      new URLSearchParams(window.location.search).has('v');
  }

  function getVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v');
  }

  function buildCurrentItemDownloadUrl() {
    const pageUrl = window.location.href;
    const videoId = getVideoId();
    if (!videoId) {
      return pageUrl;
    }

    try {
      const currentUrl = new URL(pageUrl);
      const canonicalUrl = new URL('/watch', currentUrl.origin);
      canonicalUrl.searchParams.set('v', videoId);
      return canonicalUrl.toString();
    } catch (error) {
      return pageUrl;
    }
  }

  function getCurrentVideoKey() {
    if (!isVideoPage()) {
      return window.location.pathname;
    }
    const videoId = getVideoId() || '';
    return `${window.location.pathname}?v=${videoId}`;
  }

  function getVideoElement() {
    return document.querySelector('video.video-stream') || document.querySelector('video');
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

  function detectVideoPlayer() {
    if (!isVideoPage()) return;

    const videoId = getVideoId();
    if (!videoId) return;

    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls) return;
    if (rightControls.hasAttribute(PROCESSED_ATTR)) return;
    if (!isControlBarReady(rightControls)) return;

    console.log('[FlowSelect YouTube] Video detected:', videoId);
    injectControlButtons(rightControls);
    rightControls.setAttribute(PROCESSED_ATTR, 'true');
  }

  function isControlBarReady(container) {
    if (controlStyleUtils?.isControlBarReady) {
      return controlStyleUtils.isControlBarReady(container, {
        excludeClasses: BUTTON_CLASSES,
      });
    }

    return isRenderableControlBarFallback(container) &&
      hasRenderableNativeControlChildFallback(container);
  }

  function isRenderableControlBarFallback(container) {
    if (!(container instanceof HTMLElement) || !container.isConnected) {
      return false;
    }

    const style = window.getComputedStyle(container);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    const rect = container.getBoundingClientRect();
    if (rect.width < 16 || rect.height < 16) {
      return false;
    }

    return rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth;
  }

  function hasRenderableNativeControlChildFallback(container) {
    const children = Array.from(container.children).filter((child) => child instanceof HTMLElement);
    if (children.length === 0) {
      return false;
    }

    return children.some((child) => {
      if (!(child instanceof HTMLElement)) {
        return false;
      }

      const isInjectedButton = BUTTON_CLASSES.some((className) => child.classList.contains(className));
      if (isInjectedButton) {
        return false;
      }

      const style = window.getComputedStyle(child);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }

      const rect = child.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) {
        return false;
      }

      return rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth;
    });
  }

  function getCurrentPlaybackSeconds() {
    const videoEl = getVideoElement();
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

  function t(key, fallback) {
    return localeUtils?.translate(currentBundle, key, fallback) || fallback || key;
  }

  function tt(key, values, fallback) {
    return localeUtils?.translateTemplate(currentBundle, key, values, fallback) || fallback || key;
  }

  async function applyLanguage(nextLanguage) {
    if (!localeUtils?.loadLocaleBundle) {
      return;
    }

    currentBundle = await localeUtils.loadLocaleBundle(nextLanguage);
    refreshLocalizedUi();
  }

  function setButtonTitle(button, title) {
    if (!(button instanceof HTMLElement)) {
      return;
    }

    button.title = title;
    button.setAttribute('aria-label', title);
  }

  function updateStaticControlLabels() {
    const screenshotBtn = document.querySelector('.flowselect-youtube-screenshot-btn');
    setButtonTitle(
      screenshotBtn,
      t('injected.playerControls.buttons.screenshot', 'Screenshot'),
    );
  }

  function refreshLocalizedUi() {
    updateStaticControlLabels();
    updateClipButtonsState();
    if (document.getElementById(SCREENSHOT_PANEL_ID)) {
      renderScreenshotPanel();
    }
  }

  function removeInjectedButtons() {
    for (const className of BUTTON_CLASSES) {
      document.querySelectorAll(`.${className}`).forEach((el) => el.remove());
    }
  }

  function createButton({ className, title, html, text, onClick, onContextMenu }) {
    const btn = document.createElement('button');
    btn.className = `ytp-button ${className}`;
    btn.type = 'button';
    btn.title = title;
    btn.setAttribute('aria-label', title);
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
    if (typeof onContextMenu === 'function') {
      btn.addEventListener('contextmenu', (e) => {
        onContextMenu(e);
      });
    }
    return btn;
  }

  function getClipPointButtonTitle(pointLabel, seconds) {
    if (seconds == null) {
      return pointLabel === 'IN'
        ? t('injected.playerControls.buttons.setIn', 'Set IN point')
        : t('injected.playerControls.buttons.setOut', 'Set OUT point');
    }

    const formattedTime = formatTimestamp(seconds);
    return pointLabel === 'IN'
      ? tt(
        'injected.playerControls.clip.inSelected',
        { time: formattedTime },
        `IN: ${formattedTime} (right-click to clear)`,
      )
      : tt(
        'injected.playerControls.clip.outSelected',
        { time: formattedTime },
        `OUT: ${formattedTime} (right-click to clear)`,
      );
  }

  function sendVideoSelectedMessage(payload) {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[FlowSelect YouTube] Failed to contact background:', chrome.runtime.lastError.message);
        notify(
          t(
            'injected.playerControls.alerts.backgroundUnavailable',
            'FlowSelect extension background is unavailable. Please reload the extension.',
          ),
        );
        return;
      }

      if (!response?.success) {
        notify(
          t(
            'injected.playerControls.alerts.desktopUnavailable',
            'FlowSelect desktop app is not connected. Please open FlowSelect and try again.',
          ),
        );
      }
    });
  }

  function clearClipPoint(pointKey) {
    if (clipState[pointKey] == null) {
      return;
    }

    clipState[pointKey] = null;
    updateClipButtonsState();
  }

  function handleClipPointContextMenu(event, pointKey) {
    if (clipState[pointKey] == null) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    clearClipPoint(pointKey);
  }

  function updateClipButtonsState() {
    const fullBtn = document.querySelector('.flowselect-youtube-btn');
    const inBtn = document.querySelector('.flowselect-youtube-set-in-btn');
    const outBtn = document.querySelector('.flowselect-youtube-set-out-btn');

    if (!inBtn || !outBtn || !fullBtn) return;

    if (clipState.startSec == null) {
      inBtn.removeAttribute('data-selected');
      setButtonTitle(inBtn, getClipPointButtonTitle('IN', null));
    } else {
      inBtn.setAttribute('data-selected', 'true');
      setButtonTitle(inBtn, getClipPointButtonTitle('IN', clipState.startSec));
    }

    if (clipState.endSec == null) {
      outBtn.removeAttribute('data-selected');
      setButtonTitle(outBtn, getClipPointButtonTitle('OUT', null));
    } else {
      outBtn.setAttribute('data-selected', 'true');
      setButtonTitle(outBtn, getClipPointButtonTitle('OUT', clipState.endSec));
    }

    if (hasValidClipRange()) {
      fullBtn.setAttribute('data-clip-ready', 'true');
      setButtonTitle(
        fullBtn,
        tt(
          'injected.playerControls.clip.downloadSelection',
          {
            start: formatTimestamp(clipState.startSec),
            end: formatTimestamp(clipState.endSec),
          },
          `Download clip ${formatTimestamp(clipState.startSec)} -> ${formatTimestamp(clipState.endSec)}`,
        ),
      );
    } else {
      fullBtn.removeAttribute('data-clip-ready');
      setButtonTitle(
        fullBtn,
        t('injected.playerControls.buttons.download', 'Download with FlowSelect'),
      );
    }
  }

  function setInPoint() {
    const current = getCurrentPlaybackSeconds();
    if (current == null) {
      notify(
        t(
          'injected.playerControls.alerts.playbackTimeUnavailable',
          'Unable to read current playback time.',
        ),
      );
      return;
    }
    clipState.startSec = current;
    console.log('[FlowSelect YouTube] IN point set:', current);
    updateClipButtonsState();
  }

  function setOutPoint() {
    const current = getCurrentPlaybackSeconds();
    if (current == null) {
      notify(
        t(
          'injected.playerControls.alerts.playbackTimeUnavailable',
          'Unable to read current playback time.',
        ),
      );
      return;
    }
    clipState.endSec = current;
    console.log('[FlowSelect YouTube] OUT point set:', current);
    updateClipButtonsState();
  }

  function downloadSelectedClip() {
    const pageUrl = window.location.href;
    const downloadUrl = buildCurrentItemDownloadUrl();
    const title = extractVideoTitle();
    const startSec = clipState.startSec;
    const endSec = clipState.endSec;

    if (startSec == null || endSec == null) {
      notify(
        t(
          'injected.playerControls.alerts.clipPointsRequired',
          'Please set both IN and OUT points first.',
        ),
      );
      return;
    }

    if (endSec <= startSec) {
      notify(
        t(
          'injected.playerControls.alerts.clipRangeInvalid',
          'OUT must be later than IN.',
        ),
      );
      return;
    }

    console.log('[FlowSelect YouTube] Clip range:', startSec, endSec);

    sendVideoSelectedMessage({
      type: 'video_selected',
      url: downloadUrl,
      pageUrl,
      title,
      selectionScope: 'current_item',
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

  function injectControlButtons(container) {
    removeInjectedButtons();

    const screenshotBtn = createButton({
      className: 'flowselect-youtube-screenshot-btn',
      title: t('injected.playerControls.buttons.screenshot', 'Screenshot'),
      html: CAMERA_ICON_SVG,
      onClick: takeScreenshot,
    });
    const fullBtn = createButton({
      className: 'flowselect-youtube-btn',
      title: t('injected.playerControls.buttons.download', 'Download with FlowSelect'),
      html: CAT_ICON_SVG,
      onClick: handlePrimaryDownload,
    });
    const inBtn = createButton({
      className: 'flowselect-youtube-set-in-btn',
      title: t('injected.playerControls.buttons.setIn', 'Set IN point'),
      html: CLIP_POINT_ICON_SVG,
      onClick: setInPoint,
      onContextMenu: (event) => handleClipPointContextMenu(event, 'startSec'),
    });
    const outBtn = createButton({
      className: 'flowselect-youtube-set-out-btn',
      title: t('injected.playerControls.buttons.setOut', 'Set OUT point'),
      html: CLIP_POINT_ICON_SVG,
      onClick: setOutPoint,
      onContextMenu: (event) => handleClipPointContextMenu(event, 'endSec'),
    });

    const buttons = [outBtn, inBtn, fullBtn, screenshotBtn];
    for (const btn of buttons) {
      container.insertBefore(btn, container.firstChild);
    }

    updateClipButtonsState();
    console.log('[FlowSelect YouTube] Buttons injected');
  }

  function ensureScreenshotPanel() {
    let panel = document.getElementById(SCREENSHOT_PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = SCREENSHOT_PANEL_ID;
      panel.className = 'flowselect-hidden';
      panel.innerHTML = `<div id="${SCREENSHOT_LIST_ID}"></div>`;
      document.body.appendChild(panel);
    }

    let list = document.getElementById(SCREENSHOT_LIST_ID);
    if (!list) {
      list = document.createElement('div');
      list.id = SCREENSHOT_LIST_ID;
      panel.appendChild(list);
    }

    return { panel, list };
  }

  function renderScreenshotPanel() {
    const { panel, list } = ensureScreenshotPanel();
    list.innerHTML = '';

    if (screenshots.length === 0) {
      panel.classList.add('flowselect-hidden');
      return;
    }

    panel.classList.remove('flowselect-hidden');
    for (const screenshot of screenshots) {
      list.appendChild(createScreenshotItem(screenshot));
    }
  }

  function createScreenshotItem(screenshot) {
    const item = document.createElement('div');
    item.className = 'flowselect-youtube-screenshot-item';

    const img = document.createElement('img');
    img.src = screenshot.url;
    img.alt = screenshot.filename;
    img.loading = 'lazy';

    const overlay = document.createElement('div');
    overlay.className = 'flowselect-youtube-screenshot-overlay';

    const timestamp = document.createElement('span');
    timestamp.className = 'flowselect-youtube-screenshot-time';
    timestamp.textContent = screenshot.playbackLabel;

    const saveButton = createOverlayActionButton({
      title: t('injected.playerControls.overlayActions.save', 'Save'),
      icon: SCREENSHOT_SAVE_ICON_SVG,
      onClick: () => saveScreenshot(screenshot),
    });
    const copyButton = createOverlayActionButton({
      title: t('injected.playerControls.overlayActions.copy', 'Copy'),
      icon: SCREENSHOT_COPY_ICON_SVG,
      onClick: () => copyScreenshot(screenshot, copyButton),
    });
    const deleteButton = createOverlayActionButton({
      title: t('injected.playerControls.overlayActions.delete', 'Delete'),
      icon: SCREENSHOT_DELETE_ICON_SVG,
      onClick: () => removeScreenshot(screenshot.id),
    });
    deleteButton.classList.add('flowselect-danger');

    overlay.append(saveButton, copyButton, deleteButton, timestamp);
    item.append(img, overlay);
    return item;
  }

  function createOverlayActionButton({ title, icon, onClick }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = icon;
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onClick();
    });
    return button;
  }

  function addScreenshot(screenshot) {
    screenshots.unshift(screenshot);
    while (screenshots.length > MAX_SCREENSHOTS) {
      const removed = screenshots.pop();
      if (removed) {
        URL.revokeObjectURL(removed.url);
      }
    }
    renderScreenshotPanel();
  }

  async function takeScreenshot() {
    const video = getVideoElement();
    if (!(video instanceof HTMLVideoElement)) {
      notify(
        t(
          'injected.playerControls.alerts.videoElementUnavailable',
          'Unable to locate a video element.',
        ),
      );
      return;
    }

    try {
      const screenshot = await captureVideoFrame(video);
      if (!screenshot) {
        notify(
          t('injected.playerControls.alerts.screenshotFailed', 'Screenshot failed. Please try again.'),
        );
        return;
      }
      addScreenshot(screenshot);
    } catch (error) {
      console.error('[FlowSelect YouTube] Screenshot failed:', error);
      notify(
        t('injected.playerControls.alerts.screenshotFailed', 'Screenshot failed. Please try again.'),
      );
    }
  }

  async function captureVideoFrame(video) {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/png');
    });
    if (!(blob instanceof Blob)) {
      return null;
    }

    const playbackLabel = formatTimestamp(video.currentTime);
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: URL.createObjectURL(blob),
      blob,
      playbackLabel,
      filename: buildScreenshotFileName(playbackLabel),
    };
  }

  function buildScreenshotFileName(playbackLabel) {
    const title = extractVideoTitle()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'youtube-video';
    return `${title}@${playbackLabel.replace(/:/g, '-')}-${Date.now()}.png`;
  }

  async function saveScreenshot(screenshot) {
    const savedByFlowSelect = await saveScreenshotViaFlowSelect(screenshot);
    if (savedByFlowSelect) {
      return;
    }
    saveScreenshotByBrowser(screenshot);
  }

  async function saveScreenshotViaFlowSelect(screenshot) {
    if (!chrome?.runtime?.sendMessage) {
      return false;
    }

    try {
      const dataUrl = await blobToDataUrl(screenshot.blob);
      if (!dataUrl.startsWith('data:')) {
        return false;
      }

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'save_screenshot',
            dataUrl,
            filename: screenshot.filename,
          },
          (result) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false });
              return;
            }
            resolve(result || { success: false });
          },
        );
      });

      return Boolean(response?.success);
    } catch (error) {
      console.error('[FlowSelect YouTube] Save screenshot via app failed:', error);
      return false;
    }
  }

  function saveScreenshotByBrowser(screenshot) {
    const link = document.createElement('a');
    link.href = screenshot.url;
    link.download = screenshot.filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }
        reject(new Error('Invalid data URL result'));
      };
      reader.onerror = () => {
        reject(reader.error || new Error('Failed to read blob'));
      };
      reader.readAsDataURL(blob);
    });
  }

  async function copyScreenshot(screenshot, button) {
    const clipboardItem = window.ClipboardItem;
    if (!navigator.clipboard?.write || typeof clipboardItem === 'undefined') {
      notify(
        t(
          'injected.playerControls.alerts.copyUnsupported',
          'Current browser does not support image copy.',
        ),
      );
      return;
    }

    try {
      await navigator.clipboard.write([new clipboardItem({
        [screenshot.blob.type]: screenshot.blob,
      })]);
      const defaultLabel = t('injected.playerControls.overlayActions.copy', 'Copy');
      const copiedLabel = t('injected.playerControls.overlayActions.copied', 'Copied');
      button.dataset.copied = 'true';
      button.title = copiedLabel;
      button.setAttribute('aria-label', copiedLabel);
      button.innerHTML = SCREENSHOT_COPIED_ICON_SVG;
      window.setTimeout(() => {
        button.dataset.copied = 'false';
        button.title = defaultLabel;
        button.setAttribute('aria-label', defaultLabel);
        button.innerHTML = SCREENSHOT_COPY_ICON_SVG;
      }, 1200);
    } catch (error) {
      console.error('[FlowSelect YouTube] Copy screenshot failed:', error);
      notify(
        t(
          'injected.playerControls.alerts.copyFailed',
          'Copy failed. Please check clipboard permission.',
        ),
      );
    }
  }

  function removeScreenshot(id) {
    const index = screenshots.findIndex((item) => item.id === id);
    if (index < 0) return;

    const [removed] = screenshots.splice(index, 1);
    URL.revokeObjectURL(removed.url);
    renderScreenshotPanel();
  }

  function clearScreenshots({ render = true } = {}) {
    while (screenshots.length > 0) {
      const removed = screenshots.pop();
      if (removed) {
        URL.revokeObjectURL(removed.url);
      }
    }
    if (render && document.getElementById(SCREENSHOT_PANEL_ID)) {
      renderScreenshotPanel();
    }
  }

  function cleanupScreenshotPanel() {
    clearScreenshots({ render: false });
    const panel = document.getElementById(SCREENSHOT_PANEL_ID);
    if (panel) {
      panel.remove();
    }
  }

  function extractVideoTitle() {
    const titleEl = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string');
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim();
    }

    const titleEl2 = document.querySelector('#title h1 yt-formatted-string');
    if (titleEl2 && titleEl2.textContent.trim()) {
      return titleEl2.textContent.trim();
    }

    return document.title.replace(' - YouTube', '');
  }

  function downloadVideo() {
    const videoId = getVideoId();
    const pageUrl = window.location.href;
    const downloadUrl = buildCurrentItemDownloadUrl();
    const title = extractVideoTitle();

    console.log('[FlowSelect YouTube] Video ID:', videoId);
    console.log('[FlowSelect YouTube] Page URL:', pageUrl);
    console.log('[FlowSelect YouTube] Download URL:', downloadUrl);
    console.log('[FlowSelect YouTube] Title:', title);

    sendVideoSelectedMessage({
      type: 'video_selected',
      url: downloadUrl,
      pageUrl,
      title,
      selectionScope: 'current_item',
    });
  }

  const observer = new MutationObserver(() => {
    detectVideoPlayer();
  });

  let lastUrl = window.location.href;
  let lastVideoKey = getCurrentVideoKey();
  function checkUrlChange() {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      const currentVideoKey = getCurrentVideoKey();
      if (currentVideoKey !== lastVideoKey) {
        console.log('[FlowSelect YouTube] Video changed:', lastUrl);
        lastVideoKey = currentVideoKey;
        resetClipState();
        const processed = document.querySelectorAll(`[${PROCESSED_ATTR}]`);
        processed.forEach((el) => el.removeAttribute(PROCESSED_ATTR));
        removeInjectedButtons();
        cleanupScreenshotPanel();
      }
      detectVideoPlayer();
    }
  }

  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type !== 'language_update') {
        return;
      }

      const nextLanguage = localeUtils?.normalizeAppLanguage?.(message.language);
      if (nextLanguage) {
        void applyLanguage(nextLanguage);
      }
    });
  }

  async function init() {
    console.log('[FlowSelect YouTube] Detector initialized');

    if (localeUtils?.resolveCurrentLanguage) {
      const initialLanguage = await localeUtils.resolveCurrentLanguage(navigator.language);
      await applyLanguage(initialLanguage);
    }

    detectVideoPlayer();
    observer.observe(document.body, { childList: true, subtree: true });
    window.setInterval(checkUrlChange, 500);
    window.addEventListener('beforeunload', cleanupScreenshotPanel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void init();
    });
  } else {
    void init();
  }
})();
