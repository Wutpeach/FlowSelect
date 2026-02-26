/**
 * Video URL detection utility
 * Supports: YouTube, Bilibili, Twitter/X, Douyin, and generic video URLs
 */

const VIDEO_PATTERNS = [
  // YouTube
  /^https?:\/\/(www\.)?youtube\.com\/watch/i,
  /^https?:\/\/youtu\.be\//i,
  /^https?:\/\/(www\.)?youtube\.com\/shorts\//i,

  // Bilibili (B站)
  /^https?:\/\/(www\.)?bilibili\.com\/video\//i,
  /^https?:\/\/b23\.tv\//i,

  // Twitter/X (with /status/)
  /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[^/]+\/status\//i,

  // Douyin (抖音)
  /^https?:\/\/(www\.)?douyin\.com\//i,
  /^https?:\/\/v\.douyin\.com\//i,

  // Kuaishou (快手)
  /^https?:\/\/(www\.)?kuaishou\.com\//i,
  /^https?:\/\/(www\.)?gifshow\.com\//i,

  // Xiaohongshu (小红书)
  /^https?:\/\/(www\.)?xiaohongshu\.com\//i,
  /^https?:\/\/xhslink\.com\//i,

  // Tencent Video (腾讯视频)
  /^https?:\/\/v\.qq\.com\//i,

  // iQiyi (爱奇艺)
  /^https?:\/\/(www\.)?iqiyi\.com\//i,

  // Youku (优酷)
  /^https?:\/\/(www\.)?youku\.com\//i,

  // CCTV (央视)
  /^https?:\/\/(www\.)?(cctv\.com|cctv\.cn)\//i,

  // Weibo (微博)
  /^https?:\/\/(www\.)?(weibo\.com|weibo\.cn)\//i,

  // AcFun (A站)
  /^https?:\/\/(www\.)?acfun\.cn\//i,

  // Mango TV (芒果TV)
  /^https?:\/\/(www\.)?mgtv\.com\//i,

  // Xigua Video (西瓜视频)
  /^https?:\/\/(www\.)?(xigua\.com|ixigua\.com)\//i,

  // Zhihu (知乎)
  /^https?:\/\/(www\.)?zhihu\.com\/zvideo\//i,

  // Generic video path pattern
  /^https?:\/\/[^/]+\/video\//i,
];

/**
 * Check if a URL is a supported video URL
 */
export function isVideoUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Must be HTTP/HTTPS URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false;
  }

  return VIDEO_PATTERNS.some(pattern => pattern.test(url));
}
