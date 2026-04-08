import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const detectorPath = path.resolve("browser-extension/generic-video-detector.js");
const detectorSource = readFileSync(detectorPath, "utf8");

function createSelectionUtils() {
  return {
    normalizeHttpUrl(raw, baseUrl = "https://example.com/") {
      if (typeof raw !== "string") {
        return null;
      }

      const trimmed = raw.trim();
      if (!trimmed || /^(?:blob|data|file|javascript|mailto):/i.test(trimmed)) {
        return null;
      }

      try {
        const resolved = new URL(trimmed, baseUrl).toString();
        return /^https?:\/\//i.test(resolved) ? resolved : null;
      } catch {
        return null;
      }
    },
    classifyVideoCandidateType() {
      return "indirect_media";
    },
    mergeVideoCandidates(...lists) {
      return lists.flat().filter(Boolean);
    },
    selectPreferredVideoUrl(candidates) {
      return Array.isArray(candidates) && candidates.length > 0
        ? candidates[0].url || null
        : null;
    },
  };
}

function loadDetectorHooks(currentUrl) {
  const parsedCurrentUrl = new URL(currentUrl);
  const window = {
    location: {
      href: parsedCurrentUrl.toString(),
      pathname: parsedCurrentUrl.pathname,
    },
    innerWidth: 1440,
    innerHeight: 900,
    FlowSelectDomInjectionUtils: {
      isRenderableElement() {
        return false;
      },
      resolveScopedContentUrl() {
        return null;
      },
      resolveCanonicalUrl() {
        return null;
      },
    },
    FlowSelectGenericVideoSelectionUtils: createSelectionUtils(),
  };

  const context = {
    window,
    self: {},
    globalThis: {},
    URL,
    console,
    Date,
    Map,
    Set,
    WeakMap,
    Math,
    Array,
    Number,
    Element: class Element {},
    HTMLElement: class HTMLElement {},
    HTMLAnchorElement: class HTMLAnchorElement {},
    HTMLVideoElement: class HTMLVideoElement {},
    MouseEvent: class MouseEvent {},
    chrome: {
      runtime: {
        onMessage: {
          addListener() {},
        },
      },
    },
    performance: {
      getEntriesByType() {
        return [];
      },
    },
    document: {
      addEventListener() {},
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    },
  };

  vm.runInNewContext(detectorSource, context, { filename: detectorPath });
  return context.window.FlowSelectGenericVideoDetectorTestHooks;
}

describe("generic video detector", () => {
  it("normalizes xiaohongshu note urls and strips search params", () => {
    const hooks = loadDetectorHooks("https://www.xiaohongshu.com/explore/1234567890abcdef?foo=1");

    expect(
      hooks.normalizeXiaohongshuNoteUrl(
        "https://www.xiaohongshu.com/explore/1234567890abcdef?channel_type=web_feed&xsec_token=abc#note",
      ),
    ).toBe("https://www.xiaohongshu.com/explore/1234567890abcdef");
  });

  it("accepts xiaohongshu profile note urls as canonical note pages", () => {
    const hooks = loadDetectorHooks(
      "https://www.xiaohongshu.com/user/profile/64e721f3000000000200c2b9/69d4a1b200000000230214b0?xsec_source=pc_user",
    );

    expect(
      hooks.normalizeXiaohongshuNoteUrl(
        "https://www.xiaohongshu.com/user/profile/64e721f3000000000200c2b9/69d4a1b200000000230214b0?xsec_source=pc_user#hash",
      ),
    ).toBe(
      "https://www.xiaohongshu.com/user/profile/64e721f3000000000200c2b9/69d4a1b200000000230214b0",
    );
  });

  it("does not treat xiaohongshu profile pages as safe route fallbacks", () => {
    const hooks = loadDetectorHooks(
      "https://www.xiaohongshu.com/user/profile/5bb2348e1602500001ecb898?channel_type=web_explore_feed",
    );

    expect(
      hooks.shouldAvoidCurrentPageFallback(
        "https://www.xiaohongshu.com/user/profile/5bb2348e1602500001ecb898?channel_type=web_explore_feed",
      ),
    ).toBe(true);

    expect(
      hooks.resolveSelectionPageUrl(
        null,
        "https://sns-video-bd.xhscdn.com/stream/example.mp4",
        "https://www.xiaohongshu.com/user/profile/5bb2348e1602500001ecb898?channel_type=web_explore_feed",
      ),
    ).toBe("https://sns-video-bd.xhscdn.com/stream/example.mp4");
  });

  it("keeps current-page fallback on normal content pages", () => {
    const hooks = loadDetectorHooks("https://www.instagram.com/reel/C9abc123/");

    expect(
      hooks.resolveSelectionPageUrl(
        null,
        "https://cdninstagram.com/v/t50.2886-16/example.mp4",
        "https://www.instagram.com/reel/C9abc123/",
      ),
    ).toBe("https://www.instagram.com/reel/C9abc123/");
  });
});
