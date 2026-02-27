// FlowSelect Browser Extension - Bilibili Video Detector
// Detects video pages and injects download/screenshot controls

(function() {
  'use strict';

  const PROCESSED_ATTR = 'data-flowselect-processed';
  const BUTTON_CLASSES = ['flowselect-bilibili-btn', 'flowselect-bilibili-screenshot-btn'];
  const SCREENSHOT_PANEL_ID = 'flowselect-bilibili-screenshot-panel';
  const SCREENSHOT_LIST_ID = 'flowselect-bilibili-screenshot-list';
  const MAX_SCREENSHOTS = 20;
  const screenshots = [];
  const controlStyleUtils = window.FlowSelectControlStyleUtils || null;

  const CAT_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" fill-rule="evenodd" d="M11.75 6.406c-1.48 0-1.628.157-2.394.157C8.718 6.563 6.802 5 5.845 5S3.77 5.563 3.77 7.188v1.875c.002.492.18 2 .88 1.597c-.827.978-.91 2.119-.899 3.223c-.223.064-.45.137-.671.212c-.684.234-1.41.532-1.737.744a.75.75 0 0 0 .814 1.26c.156-.101.721-.35 1.408-.585l.228-.075c.046.433.161.83.332 1.19l-.024.013c-.41.216-.79.465-1.032.623l-.113.074a.75.75 0 1 0 .814 1.26l.131-.086c.245-.16.559-.365.901-.545q.12-.064.231-.116C6.763 19.475 9.87 20 11.75 20s4.987-.525 6.717-2.148q.11.052.231.116c.342.18.656.385.901.545l.131.086a.75.75 0 0 0 .814-1.26l-.113-.074a13 13 0 0 0-1.032-.623l-.024-.013c.171-.36.286-.757.332-1.19l.228.075c.687.235 1.252.484 1.409.585a.75.75 0 0 0 .813-1.26c-.327-.212-1.053-.51-1.736-.744a16 16 0 0 0-.672-.213c.012-1.104-.072-2.244-.9-3.222c.7.403.88-1.105.881-1.598V7.188C19.73 5.563 18.613 5 17.655 5c-.957 0-2.873 1.563-3.51 1.563c-.767 0-.915-.157-2.395-.157m-.675 9.194c.202-.069.441-.1.675-.1s.473.031.676.1c.1.034.22.088.328.174a.62.62 0 0 1 .246.476c0 .23-.139.39-.246.476s-.229.14-.328.174c-.203.069-.442.1-.676.1s-.473-.031-.675-.1a1.1 1.1 0 0 1-.329-.174a.62.62 0 0 1-.246-.476c0-.23.139-.39.246-.476s.23-.14.329-.174m2.845-3.1c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812m-5.96 0c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812" clip-rule="evenodd"/>
  </svg>`;
  const CAMERA_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M9 4.5a2 2 0 0 0-1.79 1.11l-.47.94H5.5A3.5 3.5 0 0 0 2 10.05v7.45A3.5 3.5 0 0 0 5.5 21h13a3.5 3.5 0 0 0 3.5-3.5v-7.45A3.5 3.5 0 0 0 18.5 6.5h-1.24l-.47-.94A2 2 0 0 0 15 4.5H9Zm3 13a4.5 4.5 0 1 1 0-9a4.5 4.5 0 0 1 0 9Zm0-1.75a2.75 2.75 0 1 0 0-5.5a2.75 2.75 0 0 0 0 5.5Z"/>
  </svg>`;

  function isVideoPage() {
    return window.location.pathname.startsWith('/video/') ||
      window.location.pathname.startsWith('/bangumi/play/');
  }

  function getVideoId() {
    const bvMatch = window.location.pathname.match(/\/video\/(BV[\w]+)/);
    if (bvMatch) return bvMatch[1];

    const avMatch = window.location.pathname.match(/\/video\/av(\d+)/);
    if (avMatch) return `av${avMatch[1]}`;

    const epMatch = window.location.pathname.match(/\/bangumi\/play\/(ep\d+|ss\d+)/);
    if (epMatch) return epMatch[1];

    return null;
  }

  function getCurrentVideoKey() {
    if (!isVideoPage()) {
      return window.location.pathname;
    }
    const videoId = getVideoId() || '';
    return `${window.location.pathname}?v=${videoId}`;
  }

  function detectVideoPlayer() {
    if (!isVideoPage()) return;

    const videoId = getVideoId();
    if (!videoId) return;

    const controlsSelectors = [
      '.bpx-player-control-bottom-right',
      '.bilibili-player-video-control-bottom-right',
      '.squirtle-controller-wrap-right',
    ];

    let controls = null;
    for (const selector of controlsSelectors) {
      controls = document.querySelector(selector);
      if (controls) break;
    }

    if (!controls) return;
    if (controls.hasAttribute(PROCESSED_ATTR)) return;

    const nativeBaseClass = getNativeControlButtonBaseClass(controls);
    if (!isControlBarReady(controls, nativeBaseClass)) return;

    console.log('[FlowSelect Bilibili] Video detected:', videoId);
    injectControlButtons(controls, nativeBaseClass);
    controls.setAttribute(PROCESSED_ATTR, 'true');
  }

  function isControlBarReady(container, nativeBaseClass) {
    if (controlStyleUtils?.isControlBarReady) {
      return controlStyleUtils.isControlBarReady(container, {
        excludeClasses: BUTTON_CLASSES,
        requiredClass: nativeBaseClass || null,
      });
    }

    return isRenderableControlBarFallback(container) &&
      hasRenderableNativeControlChildFallback(container, nativeBaseClass);
  }

  function isRenderableControlBarFallback(controls) {
    if (!(controls instanceof HTMLElement) || !controls.isConnected) {
      return false;
    }

    const style = window.getComputedStyle(controls);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    const rect = controls.getBoundingClientRect();
    if (rect.width < 16 || rect.height < 16) {
      return false;
    }

    return rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth;
  }

  function hasRenderableNativeControlChildFallback(container, nativeBaseClass) {
    const children = Array.from(container.children).filter((child) => child instanceof HTMLElement);
    if (children.length === 0) {
      return false;
    }

    return children.some((child) => {
      const isInjectedButton = BUTTON_CLASSES.some((className) => child.classList.contains(className));
      if (isInjectedButton) {
        return false;
      }

      if (nativeBaseClass && !child.classList.contains(nativeBaseClass)) {
        return false;
      }

      const style = window.getComputedStyle(child);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }

      const rect = child.getBoundingClientRect();
      return rect.width >= 8 && rect.height >= 8;
    });
  }

  function removeInjectedButtons() {
    for (const className of BUTTON_CLASSES) {
      document.querySelectorAll(`.${className}`).forEach((el) => el.remove());
    }
  }

  function injectControlButtons(container, resolvedNativeBaseClass = null) {
    removeInjectedButtons();

    const nativeBaseClass = resolvedNativeBaseClass || getNativeControlButtonBaseClass(container);
    const screenshotButton = createControlButton({
      className: 'flowselect-bilibili-screenshot-btn',
      title: 'Screenshot',
      icon: CAMERA_ICON_SVG,
      nativeBaseClass,
      onClick: takeScreenshot,
    });
    const downloadButton = createControlButton({
      className: 'flowselect-bilibili-btn',
      title: 'Download with FlowSelect',
      icon: CAT_ICON_SVG,
      nativeBaseClass,
      onClick: downloadVideo,
    });

    syncButtonSpacingWithNative(container, [screenshotButton, downloadButton], nativeBaseClass);
    container.insertBefore(downloadButton, container.firstChild);
    container.insertBefore(screenshotButton, container.firstChild);
    console.log('[FlowSelect Bilibili] Control buttons injected');
  }

  function syncButtonSpacingWithNative(container, customButtons, nativeBaseClass) {
    if (controlStyleUtils?.syncHorizontalMarginsFromNative) {
      controlStyleUtils.syncHorizontalMarginsFromNative(container, customButtons, {
        excludeClasses: BUTTON_CLASSES,
        requiredClass: nativeBaseClass || null,
      });
      return;
    }

    const nativeButtons = Array.from(container.children).filter((child) => {
      if (!(child instanceof HTMLElement)) return false;

      const isInjectedButton = BUTTON_CLASSES.some((className) => child.classList.contains(className));
      if (isInjectedButton) return false;

      if (nativeBaseClass && !child.classList.contains(nativeBaseClass)) {
        return false;
      }

      const style = window.getComputedStyle(child);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }

      const rect = child.getBoundingClientRect();
      return rect.width >= 8 && rect.height >= 8;
    });

    if (nativeButtons.length === 0) return;

    const withSpacing = nativeButtons.find((button) => {
      const style = window.getComputedStyle(button);
      return Number.parseFloat(style.marginLeft) > 0 || Number.parseFloat(style.marginRight) > 0;
    });
    const reference = withSpacing || nativeButtons[0];
    const referenceStyle = window.getComputedStyle(reference);

    for (const button of customButtons) {
      button.style.marginLeft = referenceStyle.marginLeft;
      button.style.marginRight = referenceStyle.marginRight;
    }
  }

  function createControlButton({ className, title, icon, nativeBaseClass, onClick }) {
    const button = document.createElement('div');
    button.className = className;
    if (nativeBaseClass) {
      button.classList.add(nativeBaseClass);
    }

    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.title = title;
    button.innerHTML = icon;

    const clickHandler = (e) => {
      e.stopPropagation();
      e.preventDefault();
      onClick();
    };
    button.addEventListener('click', clickHandler);
    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        clickHandler(e);
      }
    });

    return button;
  }

  function getNativeControlButtonBaseClass(container) {
    const baseClassPatterns = [
      /^bpx-player-ctrl-btn$/,
      /^bilibili-player-video-btn$/,
      /^squirtle.*btn$/,
    ];

    const children = Array.from(container.children);
    for (const child of children) {
      if (!(child instanceof HTMLElement)) continue;
      for (const className of child.classList) {
        if (baseClassPatterns.some((pattern) => pattern.test(className))) {
          return className;
        }
      }
    }

    if (container.classList.contains('bpx-player-control-bottom-right')) {
      return 'bpx-player-ctrl-btn';
    }
    if (container.classList.contains('bilibili-player-video-control-bottom-right')) {
      return 'bilibili-player-video-btn';
    }
    return null;
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
    item.className = 'flowselect-bilibili-screenshot-item';

    const img = document.createElement('img');
    img.src = screenshot.url;
    img.alt = screenshot.filename;
    img.loading = 'lazy';

    const overlay = document.createElement('div');
    overlay.className = 'flowselect-bilibili-screenshot-overlay';

    const timestamp = document.createElement('span');
    timestamp.className = 'flowselect-bilibili-screenshot-time';
    timestamp.textContent = screenshot.playbackLabel;

    const saveButton = createOverlayActionButton('保存', () => saveScreenshot(screenshot));
    const copyButton = createOverlayActionButton('复制', () => copyScreenshot(screenshot, copyButton));
    const deleteButton = createOverlayActionButton('删除', () => removeScreenshot(screenshot.id));
    deleteButton.classList.add('flowselect-danger');

    overlay.append(saveButton, copyButton, deleteButton, timestamp);
    item.append(img, overlay);
    return item;
  }

  function createOverlayActionButton(text, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      handler();
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
    const video = getActiveVideoElement();
    if (!(video instanceof HTMLVideoElement)) {
      window.alert('未找到可截图的视频元素');
      return;
    }

    try {
      const screenshot = await captureVideoFrame(video);
      if (!screenshot) {
        window.alert('截图失败，请稍后重试');
        return;
      }
      addScreenshot(screenshot);
    } catch (error) {
      console.error('[FlowSelect Bilibili] Screenshot failed:', error);
      window.alert('截图失败，请稍后重试');
    }
  }

  function getActiveVideoElement() {
    const videos = Array.from(document.querySelectorAll('video'));
    const active = videos.find((video) => (
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      video.videoHeight > 0 &&
      video.getBoundingClientRect().width > 0 &&
      video.getBoundingClientRect().height > 0
    ));
    return active || videos[0] || null;
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

    const playbackLabel = formatPlaybackTime(video.currentTime);
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: URL.createObjectURL(blob),
      blob,
      playbackLabel,
      filename: buildScreenshotFileName(playbackLabel),
    };
  }

  function formatPlaybackTime(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value)) return '00:00';

    const totalSeconds = Math.max(0, Math.floor(value));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function buildScreenshotFileName(playbackLabel) {
    const title = extractVideoTitle()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'bilibili-video';
    const time = playbackLabel.replace(/:/g, '-');
    return `${title}@${time}-${Date.now()}.png`;
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
      console.error('[FlowSelect Bilibili] Save screenshot via app failed:', error);
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
      window.alert('当前浏览器不支持复制图片');
      return;
    }

    try {
      await navigator.clipboard.write([new clipboardItem({
        [screenshot.blob.type]: screenshot.blob,
      })]);
      button.dataset.copied = 'true';
      button.textContent = '已复制';
      window.setTimeout(() => {
        button.dataset.copied = 'false';
        button.textContent = '复制';
      }, 900);
    } catch (error) {
      console.error('[FlowSelect Bilibili] Copy screenshot failed:', error);
      window.alert('复制失败，请检查浏览器权限');
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
    const titleEl = document.querySelector('.video-title');
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim();
    }

    const bangumiTitle = document.querySelector('.mediainfo_mediaTitle__Zyiqh');
    if (bangumiTitle && bangumiTitle.textContent.trim()) {
      return bangumiTitle.textContent.trim();
    }

    const oldTitle = document.querySelector('h1[title]');
    if (oldTitle && oldTitle.textContent.trim()) {
      return oldTitle.textContent.trim();
    }

    return document.title.replace(/_哔哩哔哩.*$/, '').replace(/_bilibili.*$/i, '');
  }

  function downloadVideo() {
    const videoId = getVideoId();
    const pageUrl = window.location.href;
    const title = extractVideoTitle();

    console.log('[FlowSelect Bilibili] Video ID:', videoId);
    console.log('[FlowSelect Bilibili] Page URL:', pageUrl);
    console.log('[FlowSelect Bilibili] Title:', title);

    chrome.runtime.sendMessage({
      type: 'video_selected',
      url: pageUrl,
      pageUrl,
      title,
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
        console.log('[FlowSelect Bilibili] Video changed:', lastUrl);
        lastVideoKey = currentVideoKey;
        const processed = document.querySelectorAll(`[${PROCESSED_ATTR}]`);
        processed.forEach((el) => el.removeAttribute(PROCESSED_ATTR));
        removeInjectedButtons();
        cleanupScreenshotPanel();
      }
      detectVideoPlayer();
    }
  }

  function init() {
    console.log('[FlowSelect Bilibili] Detector initialized');
    detectVideoPlayer();
    observer.observe(document.body, { childList: true, subtree: true });
    window.setInterval(checkUrlChange, 500);
    window.addEventListener('beforeunload', cleanupScreenshotPanel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
