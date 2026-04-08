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
    // 使用猫咪图标
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" class="r-4qtqp9 r-yyyyoo r-dnmrzs r-bnwqim r-lrvibr r-m6rgpd r-50lct3 r-1srniue">
      <path fill="currentColor" fill-rule="evenodd" d="M11.75 6.406c-1.48 0-1.628.157-2.394.157C8.718 6.563 6.802 5 5.845 5S3.77 5.563 3.77 7.188v1.875c.002.492.18 2 .88 1.597c-.827.978-.91 2.119-.899 3.223c-.223.064-.45.137-.671.212c-.684.234-1.41.532-1.737.744a.75.75 0 0 0 .814 1.26c.156-.101.721-.35 1.408-.585l.228-.075c.046.433.161.83.332 1.19l-.024.013c-.41.216-.79.465-1.032.623l-.113.074a.75.75 0 1 0 .814 1.26l.131-.086c.245-.16.559-.365.901-.545q.12-.064.231-.116C6.763 19.475 9.87 20 11.75 20s4.987-.525 6.717-2.148q.11.052.231.116c.342.18.656.385.901.545l.131.086a.75.75 0 0 0 .814-1.26l-.113-.074a13 13 0 0 0-1.032-.623l-.024-.013c.171-.36.286-.757.332-1.19l.228.075c.687.235 1.252.484 1.409.585a.75.75 0 0 0 .813-1.26c-.327-.212-1.053-.51-1.736-.744a16 16 0 0 0-.672-.213c.012-1.104-.072-2.244-.9-3.222c.7.403.88-1.105.881-1.598V7.188C19.73 5.563 18.613 5 17.655 5c-.957 0-2.873 1.563-3.51 1.563c-.767 0-.915-.157-2.395-.157m-.675 9.194c.202-.069.441-.1.675-.1s.473.031.676.1c.1.034.22.088.328.174a.62.62 0 0 1 .246.476c0 .23-.139.39-.246.476s-.229.14-.328.174c-.203.069-.442.1-.676.1s-.473-.031-.675-.1a1.1 1.1 0 0 1-.329-.174a.62.62 0 0 1-.246-.476c0-.23.139-.39.246-.476s.23-.14.329-.174m2.845-3.1c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812m-5.96 0c.137-.228.406-.5.81-.5s.674.272.81.5c.142.239.21.527.21.813s-.068.573-.21.811c-.136.229-.406.501-.81.501s-.673-.272-.81-.5a1.6 1.6 0 0 1-.21-.812c0-.286.068-.574.21-.812" clip-rule="evenodd"/>
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
      type: 'video_selection',
      url: tweetUrl,
      pageUrl: tweetUrl,
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
