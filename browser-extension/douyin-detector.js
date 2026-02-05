// FlowSelect Browser Extension - Douyin Video Detector
// Detects video pages and injects download buttons

(function() {
  'use strict';

  const PROCESSED_ATTR = 'data-flowselect-processed';

  // Check if current page is a video page
  function isVideoPage() {
    return window.location.pathname.startsWith('/video/');
  }

  // Extract video ID from URL
  function getVideoId() {
    const match = window.location.pathname.match(/\/video\/(\d+)/);
    return match ? match[1] : null;
  }

  // Detect video player and inject button
  function detectVideoPlayer() {
    if (!isVideoPage()) return;

    const videoId = getVideoId();
    if (!videoId) return;

    // Find video container - Douyin uses xg-video-container
    const videoContainer = document.querySelector('.xg-video-container');
    if (!videoContainer) return;

    // Check if already processed
    if (videoContainer.hasAttribute(PROCESSED_ATTR)) return;

    console.log('[FlowSelect Douyin] Video detected:', videoId);
    injectDownloadButton(videoContainer);
    videoContainer.setAttribute(PROCESSED_ATTR, 'true');
  }

  // Inject download button
  function injectDownloadButton(container) {
    // Remove existing button if any
    const existing = document.querySelector('.flowselect-douyin-btn');
    if (existing) existing.remove();

    const btn = document.createElement('div');
    btn.className = 'flowselect-douyin-btn';
    // Cat icon SVG
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" fill-rule="evenodd" d="M11.75 6.406c-1.48 0-1.628.157-2.394.157C8.718 6.563 6.802 5 5.845 5S3.77 5.563 3.77 7.188v1.875c.002.492.18 2 .88 1.597c-.827.978-.91 2.119-.899 3.223c-.223.064-.45.137-.671.212c-.684.234-1.41.532-1.737.744a.75.75 0 0 0 .814 1.26c.156-.101.721-.35 1.408-.585l.228-.075c.046.433.161.83.332 1.19l-.024.013c-.41.216-.79.465-1.032.623l-.113.074a.75.75 0 1 0 .814 1.26l.131-.086c.245-.16.559-.365.901-.545q.12-.064.231-.116C6.763 19.475 9.87 20 11.75 20s4.987-.525 6.717-2.148q.11.052.231.116c.342.18.656.385.901.545l.131.086a.75.75 0 0 0 .814-1.26l-.113-.074a13 13 0 0 0-1.032-.623l-.024-.013c.171-.36.286-.757.332-1.19l.228.075c.687.235 1.252.484 1.409.585a.75.75 0 0 0 .813-1.26c-.327-.212-1.053-.51-1.736-.744a16 16 0 0 0-.672-.213c.012-1.104-.072-2.244-.9-3.222c.7.403.88-1.105.881-1.598V7.188C19.73 5.563 18.613 5 17.655 5c-.957 0-2.873 1.563-3.51 1.563c-.767 0-.915-.157-2.395-.157m-.675 9.194c.202-.069.441-.1.675-.1s.473.031.676.1c.1.034.22.088.328.174a.62.62 0 0 1 .246.476c0 .23-.139.39-.246.476s-.229.14-.328.174c-.203.069-.442.1-.676.1s-.473-.031-.675-.1a1.1 1.1 0 0 1-.329-.174a.62.62 0 0 1-.246-.476c0-.23.139-.39.246-.476s.23-.14.329-.174m2.845-3.1c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812m-5.96 0c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812" clip-rule="evenodd"/>
    </svg>`;
    btn.title = 'Download with FlowSelect';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      downloadVideo();
    });

    // Append to video container
    container.appendChild(btn);
    console.log('[FlowSelect Douyin] Button injected');
  }

  // Extract video URL from page
  function extractVideoUrl() {
    // Method 1: Try to get from video element directly
    const videoEl = document.querySelector('video');
    if (videoEl && videoEl.src && !videoEl.src.startsWith('blob:')) {
      console.log('[FlowSelect Douyin] Found video src:', videoEl.src);
      return videoEl.src;
    }

    // Method 2: Try to get from source element
    const sourceEl = document.querySelector('video source');
    if (sourceEl && sourceEl.src) {
      console.log('[FlowSelect Douyin] Found source src:', sourceEl.src);
      return sourceEl.src;
    }

    // Method 3: Try RENDER_DATA
    try {
      const script = document.getElementById('RENDER_DATA');
      if (script) {
        const decoded = decodeURIComponent(script.textContent);
        const data = JSON.parse(decoded);

        if (data.app?.videoDetail?.video) {
          const video = data.app.videoDetail.video;
          if (video.playAddr?.[0]?.src) return video.playAddr[0].src;
          if (video.play_addr?.url_list?.[0]) return video.play_addr.url_list[0];
        }
      }
    } catch (e) {
      console.error('[FlowSelect Douyin] RENDER_DATA parse error:', e);
    }

    console.log('[FlowSelect Douyin] Video URL not found');
    return null;
  }

  // Send download request
  function downloadVideo() {
    const pageUrl = window.location.href;
    const videoUrl = extractVideoUrl();

    console.log('[FlowSelect Douyin] Page URL:', pageUrl);
    console.log('[FlowSelect Douyin] Video URL:', videoUrl);

    chrome.runtime.sendMessage({
      type: 'video_selected',
      url: videoUrl || pageUrl,
      pageUrl: pageUrl,
      videoUrl: videoUrl,
      title: document.title
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
      console.log('[FlowSelect Douyin] URL changed:', lastUrl);
      // Reset processed state for new video
      const processed = document.querySelectorAll(`[${PROCESSED_ATTR}]`);
      processed.forEach(el => el.removeAttribute(PROCESSED_ATTR));
      detectVideoPlayer();
    }
  }

  // Initialize
  function init() {
    console.log('[FlowSelect Douyin] Detector initialized');
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
