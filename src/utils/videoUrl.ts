/**
 * Video URL detection utility
 * Supports: YouTube, Bilibili, Twitter/X, Douyin, and generic video URLs
 */

const VIDEO_PATTERNS = [
  // YouTube
  /^https?:\/\/(www\.)?youtube\.com\/watch/i,
  /^https?:\/\/youtu\.be\//i,
  /^https?:\/\/(www\.)?youtube\.com\/shorts\//i,

  // Bilibili
  /^https?:\/\/(www\.)?bilibili\.com\/video\//i,
  /^https?:\/\/b23\.tv\//i,

  // Twitter/X (with /status/)
  /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[^/]+\/status\//i,

  // Douyin
  /^https?:\/\/(www\.)?douyin\.com\//i,
  /^https?:\/\/v\.douyin\.com\//i,

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
