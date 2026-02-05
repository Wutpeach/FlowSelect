// FlowSelect Browser Extension - Douyin Video Detector
// Detects video pages and injects download buttons
// Supports: /video/ pages, discover/featured, video covers, search results, user profiles

(function() {
  'use strict';

  const PROCESSED_ATTR = 'data-flowselect-processed';

  // Cat icon SVG
  const CAT_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" fill-rule="evenodd" d="M11.75 6.406c-1.48 0-1.628.157-2.394.157C8.718 6.563 6.802 5 5.845 5S3.77 5.563 3.77 7.188v1.875c.002.492.18 2 .88 1.597c-.827.978-.91 2.119-.899 3.223c-.223.064-.45.137-.671.212c-.684.234-1.41.532-1.737.744a.75.75 0 0 0 .814 1.26c.156-.101.721-.35 1.408-.585l.228-.075c.046.433.161.83.332 1.19l-.024.013c-.41.216-.79.465-1.032.623l-.113.074a.75.75 0 1 0 .814 1.26l.131-.086c.245-.16.559-.365.901-.545q.12-.064.231-.116C6.763 19.475 9.87 20 11.75 20s4.987-.525 6.717-2.148q.11.052.231.116c.342.18.656.385.901.545l.131.086a.75.75 0 0 0 .814-1.26l-.113-.074a13 13 0 0 0-1.032-.623l-.024-.013c.171-.36.286-.757.332-1.19l.228.075c.687.235 1.252.484 1.409.585a.75.75 0 0 0 .813-1.26c-.327-.212-1.053-.51-1.736-.744a16 16 0 0 0-.672-.213c.012-1.104-.072-2.244-.9-3.222c.7.403.88-1.105.881-1.598V7.188C19.73 5.563 18.613 5 17.655 5c-.957 0-2.873 1.563-3.51 1.563c-.767 0-.915-.157-2.395-.157m-.675 9.194c.202-.069.441-.1.675-.1s.473.031.676.1c.1.034.22.088.328.174a.62.62 0 0 1 .246.476c0 .23-.139.39-.246.476s-.229.14-.328.174c-.203.069-.442.1-.676.1s-.473-.031-.675-.1a1.1 1.1 0 0 1-.329-.174a.62.62 0 0 1-.246-.476c0-.23.139-.39.246-.476s.23-.14.329-.174m2.845-3.1c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812m-5.96 0c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812" clip-rule="evenodd"/>
  </svg>`;

  // Page type detection
  function getPageType() {
    const path = window.location.pathname;
    if (path.startsWith('/video/')) return 'video';
    if (path === '/' || path === '/discover' || path.startsWith('/discover/')) return 'discover';
    if (path.startsWith('/search/')) return 'search';
    if (path.startsWith('/user/')) return 'user';
    if (path === '/follow' || path === '/following') return 'follow';
    if (path === '/hot' || path.startsWith('/hot/')) return 'hot';
    return 'other';
  }

  // Check if current page is a video detail page
  function isVideoPage() {
    return window.location.pathname.startsWith('/video/');
  }

  // Extract video ID from URL
  function getVideoId() {
    const match = window.location.pathname.match(/\/video\/(\d+)/);
    return match ? match[1] : null;
  }

  // ============================================
  // Video Detail Page Handler
  // ============================================
  function detectVideoPlayer() {
    if (!isVideoPage()) return;

    const videoId = getVideoId();
    if (!videoId) return;

    // Find xgplayer control bar - try multiple selectors
    const controlSelectors = [
      '.xg-right-grid',           // xgplayer right controls area
      '.xg-right-bar',            // Alternative right bar
      '.xgplayer-right-controls'  // Another variant
    ];

    let controls = null;
    for (const selector of controlSelectors) {
      controls = document.querySelector(selector);
      if (controls) break;
    }

    if (!controls) {
      return;
    }

    // Check if already processed
    if (controls.hasAttribute(PROCESSED_ATTR)) return;

    console.log('[FlowSelect Douyin] Video detected:', videoId);
    injectControlBarButton(controls);
    controls.setAttribute(PROCESSED_ATTR, 'true');
  }

  // Inject button into player control bar
  function injectControlBarButton(controls) {
    // Remove existing control bar button if any
    document.querySelectorAll('.flowselect-douyin-control-btn').forEach(el => el.remove());

    const btn = document.createElement('div');
    btn.className = 'flowselect-douyin-control-btn';
    btn.innerHTML = CAT_ICON_SVG;
    btn.title = 'Download with FlowSelect';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      downloadVideo();
    });

    // Insert at the beginning of controls
    controls.insertBefore(btn, controls.firstChild);
    console.log('[FlowSelect Douyin] Control bar button injected');
  }

  // ============================================
  // Video Cover/Card Handler (Discover, Search, User Profile, Feed)
  // ============================================
  function detectVideoCovers() {
    // Selectors for video cards/covers on different pages
    const coverSelectors = [
      // Discover/Featured page video items
      '[data-e2e="scroll-list"] > div',
      // Search results
      '[data-e2e="search-result-list"] li',
      // User profile video list
      '[data-e2e="user-post-list"] > div',
      // Recommend feed items
      '.recommend-video-card',
      // General video card containers
      '.video-card',
      // Explore items (from aixdownloader reference)
      '.explore-item',
      // Feed video items
      '[data-e2e="feed-video"]'
    ];

    const selector = coverSelectors.join(', ');
    const covers = document.querySelectorAll(selector);

    covers.forEach(cover => {
      if (cover.hasAttribute(PROCESSED_ATTR)) return;

      // Find video link within the cover
      const videoLink = cover.querySelector('a[href*="/video/"]');
      if (!videoLink) return;

      // Extract video URL
      const videoUrl = videoLink.href;
      if (!videoUrl) return;

      injectCoverButton(cover, videoUrl);
      cover.setAttribute(PROCESSED_ATTR, 'true');
    });
  }

  // Inject button on video cover/card
  function injectCoverButton(cover, videoUrl) {
    const btn = document.createElement('div');
    btn.className = 'flowselect-douyin-cover-btn';
    btn.innerHTML = CAT_ICON_SVG;
    btn.title = 'Download with FlowSelect';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      downloadVideoByUrl(videoUrl, extractCoverTitle(cover));
    });

    // Make sure cover has relative positioning for absolute button
    const computedStyle = window.getComputedStyle(cover);
    if (computedStyle.position === 'static') {
      cover.style.position = 'relative';
    }

    cover.appendChild(btn);
    console.log('[FlowSelect Douyin] Cover button injected for:', videoUrl);
  }

  // Extract title from cover element
  function extractCoverTitle(cover) {
    // Try to find title/description in the cover
    const titleEl = cover.querySelector('[data-e2e="video-desc"]') ||
                    cover.querySelector('.title') ||
                    cover.querySelector('p') ||
                    cover.querySelector('span');
    return titleEl ? titleEl.textContent.trim() : '';
  }

  // ============================================
  // Fullscreen/Modal Video Handler
  // ============================================
  function detectModalVideo() {
    // Detect fullscreen video modal (when clicking on a video cover)
    const modalSelectors = [
      '.DivPlayerContainer',  // From aixdownloader reference
      '[data-e2e="feed-active-video"]',
      '.feed-video-player'
    ];

    for (const selector of modalSelectors) {
      const modal = document.querySelector(selector);
      if (modal && !modal.hasAttribute(PROCESSED_ATTR)) {
        // Try to find control bar
        const controls = modal.querySelector('.xg-right-grid') ||
                        modal.querySelector('.xg-right-bar');
        if (controls && !controls.hasAttribute(PROCESSED_ATTR)) {
          injectControlBarButton(controls);
          controls.setAttribute(PROCESSED_ATTR, 'true');
          console.log('[FlowSelect Douyin] Modal control bar button injected');
        }
      }
    }
  }

  // ============================================
  // Video URL Extraction
  // ============================================
  function extractVideoUrl() {
    // Method 1: Try to get from video element directly
    const videoEl = document.querySelector('video');
    if (videoEl) {
      console.log('[FlowSelect Douyin] Video element found');
      if (videoEl.src && !videoEl.src.startsWith('blob:')) {
        return videoEl.src;
      }
      if (videoEl.currentSrc && !videoEl.currentSrc.startsWith('blob:')) {
        return videoEl.currentSrc;
      }
    }

    // Method 2: Try to get from source element
    const sourceEl = document.querySelector('video source');
    if (sourceEl && sourceEl.src) {
      console.log('[FlowSelect Douyin] Found source src');
      return sourceEl.src;
    }

    // Method 3: Try RENDER_DATA (works on initial page load)
    try {
      const script = document.getElementById('RENDER_DATA');
      if (script && script.textContent) {
        const decoded = decodeURIComponent(script.textContent);
        const data = JSON.parse(decoded);

        const video = data.app?.videoDetail?.video
          || data['36']?.awemeDetail?.video
          || data['37']?.awemeDetail?.video;

        if (video) {
          const url = video.playAddr?.[0]?.src
            || video.play_addr?.url_list?.[0]
            || video.playApi;
          if (url) {
            console.log('[FlowSelect Douyin] Found URL from RENDER_DATA');
            return url;
          }
        }
      }
    } catch (e) {
      console.error('[FlowSelect Douyin] RENDER_DATA parse error:', e);
    }

    // Method 4: Try React Fiber (for SPA navigation)
    try {
      const container = document.querySelector('.xg-video-container');
      if (container) {
        const fiberKey = Object.keys(container).find(k => k.startsWith('__reactFiber$'));
        if (fiberKey) {
          let fiber = container[fiberKey];
          for (let i = 0; i < 20 && fiber; i++) {
            const props = fiber.memoizedProps || fiber.pendingProps;
            if (props?.videoData?.video?.playApi) {
              console.log('[FlowSelect Douyin] Found URL from React Fiber');
              return props.videoData.video.playApi;
            }
            fiber = fiber.return;
          }
        }
      }
    } catch (e) {
      console.error('[FlowSelect Douyin] React Fiber error:', e);
    }

    console.log('[FlowSelect Douyin] Video URL not found');
    return null;
  }

  // Extract video title from page
  function extractVideoTitle() {
    // Method 1: Try video description element
    const descEl = document.querySelector('[data-e2e="video-desc"]');
    if (descEl && descEl.textContent.trim()) {
      return descEl.textContent.trim();
    }

    // Method 2: Try title element in detail page
    const titleEl = document.querySelector('.video-info-detail .title');
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim();
    }

    // Method 3: Fallback to document.title
    return document.title;
  }

  // ============================================
  // Download Functions
  // ============================================
  function downloadVideo() {
    const pageUrl = window.location.href;
    const videoUrl = extractVideoUrl();
    const title = extractVideoTitle();

    console.log('[FlowSelect Douyin] Downloading video');
    console.log('[FlowSelect Douyin] Page URL:', pageUrl);
    console.log('[FlowSelect Douyin] Video URL:', videoUrl);
    console.log('[FlowSelect Douyin] Title:', title);

    chrome.runtime.sendMessage({
      type: 'video_selected',
      url: videoUrl || pageUrl,
      pageUrl: pageUrl,
      videoUrl: videoUrl,
      title: title
    });
  }

  // Download video by URL (for cover buttons)
  function downloadVideoByUrl(pageUrl, title) {
    console.log('[FlowSelect Douyin] Downloading by URL:', pageUrl);
    console.log('[FlowSelect Douyin] Title:', title);

    chrome.runtime.sendMessage({
      type: 'video_selected',
      url: pageUrl,
      pageUrl: pageUrl,
      title: title || ''
    });
  }

  // ============================================
  // Main Detection Orchestration
  // ============================================
  function detectAll() {
    const pageType = getPageType();
    console.log('[FlowSelect Douyin] Page type:', pageType);

    // Always try to detect video player on video pages
    if (pageType === 'video') {
      detectVideoPlayer();
    }

    // Detect video covers on list pages
    detectVideoCovers();

    // Detect modal/fullscreen videos
    detectModalVideo();
  }

  // MutationObserver for dynamic content
  const observer = new MutationObserver(() => {
    detectAll();
  });

  // Handle URL changes (SPA navigation)
  let lastUrl = window.location.href;
  function checkUrlChange() {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log('[FlowSelect Douyin] URL changed:', lastUrl);
      // Reset processed state for new page
      const processed = document.querySelectorAll(`[${PROCESSED_ATTR}]`);
      processed.forEach(el => el.removeAttribute(PROCESSED_ATTR));
      detectAll();
    }
  }

  // Initialize
  function init() {
    console.log('[FlowSelect Douyin] Detector initialized');
    detectAll();
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
