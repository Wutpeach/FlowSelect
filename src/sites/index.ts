import type { SiteProvider } from "../core/index.js";
import { douyinProvider } from "./douyin.js";
import { genericProvider } from "./generic.js";
import { pinterestProvider } from "./pinterest.js";
import { youtubeProvider } from "./youtube.js";

export const builtinProviders: SiteProvider[] = [
  youtubeProvider,
  douyinProvider,
  pinterestProvider,
  genericProvider,
];
