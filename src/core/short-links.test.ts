import { describe, expect, it } from "vitest";

import {
  isRedirectWrapperUrl,
  isKnownShortLinkHost,
  isLikelyShortLinkUrl,
  normalizeHttpUrl,
  resolveUrlHostname,
  unwrapRedirectTargetUrl,
} from "./short-links";

describe("short-link helpers", () => {
  it("normalizes valid HTTP(S) urls", () => {
    expect(normalizeHttpUrl(" https://t.cn/example ")).toBe("https://t.cn/example");
    expect(normalizeHttpUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("recognizes known short-link hosts", () => {
    expect(isKnownShortLinkHost("t.cn")).toBe(true);
    expect(isKnownShortLinkHost("b23.tv")).toBe(true);
    expect(isKnownShortLinkHost("weibo.com")).toBe(false);
  });

  it("detects short-link urls", () => {
    expect(resolveUrlHostname("https://t.cn/example")).toBe("t.cn");
    expect(isLikelyShortLinkUrl("https://t.cn/example")).toBe(true);
    expect(isLikelyShortLinkUrl("https://weibo.com/detail/123")).toBe(false);
  });

  it("unwraps redirect wrapper urls to their real targets", () => {
    expect(
      isRedirectWrapperUrl(
        "https://passport.weibo.com/visitor/visitor?entry=krvideo&url=https%3A%2F%2Fweibo.com%2Ftv%2Fshow%2F1034%3A5283985857904677",
      ),
    ).toBe(true);
    expect(
      unwrapRedirectTargetUrl(
        "https://passport.weibo.com/visitor/visitor?entry=krvideo&url=https%3A%2F%2Fweibo.com%2Ftv%2Fshow%2F1034%3A5283985857904677",
      ),
    ).toBe("https://weibo.com/tv/show/1034:5283985857904677");
  });
});
