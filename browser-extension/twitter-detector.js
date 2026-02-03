// FlowSelect Browser Extension - Twitter Video Detector
// Detects video tweets and injects download buttons

(function() {
  'use strict';

  const PROCESSED_ATTR = 'data-flowselect-processed';

  // 检测视频推文
  function detectVideoTweets() {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    console.log('[FlowSelect Twitter] Found tweets:', tweets.length);
    tweets.forEach(processTweet);
  }

  // 处理单个推文
  function processTweet(tweet) {
    if (tweet.hasAttribute(PROCESSED_ATTR)) return;

    // 检查是否包含视频
    const hasVideo = tweet.querySelector('video') !== null;
    console.log('[FlowSelect Twitter] Tweet has video:', hasVideo);
    if (!hasVideo) return;

    // 提取推文 URL
    const tweetUrl = extractTweetUrl(tweet);
    console.log('[FlowSelect Twitter] Tweet URL:', tweetUrl);
    if (!tweetUrl) return;

    // 注入下载按钮
    injectDownloadButton(tweet, tweetUrl);
    tweet.setAttribute(PROCESSED_ATTR, 'true');
  }

  // 提取推文 URL
  function extractTweetUrl(tweet) {
    const timeLink = tweet.querySelector('a[href*="/status/"] time');
    return timeLink?.parentElement?.href;
  }

  // 注入下载按钮
  function injectDownloadButton(tweet, tweetUrl) {
    // 找到操作栏（回复、转发、点赞的容器）
    const actionBar = tweet.querySelector('[role="group"]');
    console.log('[FlowSelect Twitter] ActionBar found:', actionBar);
    if (!actionBar) return;

    const btn = document.createElement('div');
    btn.className = 'flowselect-download-btn';
    // 使用与 Twitter/X 风格一致的线条图标
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" class="r-4qtqp9 r-yyyyoo r-dnmrzs r-bnwqim r-lrvibr r-m6rgpd r-50lct3 r-1srniue">
      <g><path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z" transform="rotate(180 12 12)"></path></g>
    </svg>`;
    btn.title = 'Download with FlowSelect';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      downloadVideo(tweetUrl);
    });
    actionBar.appendChild(btn);
    console.log('[FlowSelect Twitter] Button injected');
  }

  // 发送下载请求
  function downloadVideo(tweetUrl) {
    console.log('[FlowSelect Twitter] Downloading:', tweetUrl);
    chrome.runtime.sendMessage({
      type: 'video_selected',
      url: tweetUrl,
      title: document.title
    });
  }

  // MutationObserver 监听新推文
  const observer = new MutationObserver(() => {
    detectVideoTweets();
  });

  // 初始化
  function init() {
    console.log('[FlowSelect Twitter] Detector initialized');
    detectVideoTweets();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
