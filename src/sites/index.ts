import type { SiteProvider } from "../core/index.js";
import { bilibiliProvider } from "./bilibili.js";
import { douyinProvider } from "./douyin.js";
import { galleryDlSupportedProvider } from "./gallery-dl-supported.js";
import { genericProvider } from "./generic.js";
import { pinterestProvider } from "./pinterest.js";
import { twitterXProvider } from "./twitter-x.js";
import { weiboProvider } from "./weibo.js";
import { xiaohongshuProvider } from "./xiaohongshu.js";
import { youtubeProvider } from "./youtube.js";

export const builtinProviders: SiteProvider[] = [
  youtubeProvider,
  douyinProvider,
  xiaohongshuProvider,
  bilibiliProvider,
  twitterXProvider,
  pinterestProvider,
  weiboProvider,
  galleryDlSupportedProvider,
  genericProvider,
];
