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
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18">
      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor"/>
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
