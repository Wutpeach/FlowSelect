import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const helperPath = path.resolve("browser-extension/short-link-resolution.js");
const helperSource = readFileSync(helperPath, "utf8");

const loadHelper = (overrides = {}) => {
  const context = {
    self: {
      setTimeout,
      clearTimeout,
      AbortController,
      ...overrides.self,
    },
    globalThis: {},
    URL,
    Promise,
    setTimeout,
    clearTimeout,
    AbortController,
    ...overrides,
  };
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.FlowSelectShortLinkResolution;
};

describe("short-link resolution helper", () => {
  it("detects known short-link hosts", () => {
    const helper = loadHelper();

    expect(helper.isLikelyShortLinkUrl("https://t.cn/example")).toBe(true);
    expect(helper.isLikelyShortLinkUrl("https://b23.tv/abc123")).toBe(true);
    expect(helper.isLikelyShortLinkUrl("https://bit.ly/example")).toBe(true);
    expect(helper.isLikelyShortLinkUrl("https://weibo.com/detail/123")).toBe(false);
  });

  it("resolves short links through redirected fetch responses before using background tabs", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ url: "https://weibo.com/tv/show/1034:5284278758473738" });
    const helper = loadHelper();

    const result = await helper.resolveShortLinkUrl("https://t.cn/AXIrKjka", {
      fetchImpl,
      createTab: vi.fn(),
    });

    expect(result).toEqual({
      initialUrl: "https://t.cn/AXIrKjka",
      resolvedUrl: "https://weibo.com/tv/show/1034:5284278758473738",
      expanded: true,
      via: "fetch_head",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://t.cn/AXIrKjka",
      expect.objectContaining({
        method: "HEAD",
        redirect: "follow",
      }),
    );
  });

  it("falls back to a background tab when fetch cannot reveal the final URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ url: "https://t.cn/AXIrKjka" });
    const createTab = vi.fn(async () => ({ id: 17 }));
    const waitForTabComplete = vi.fn(async () => undefined);
    const getTab = vi.fn(async () => ({ url: "https://weibo.com/tv/show/1034:5284278758473738" }));
    const removeTabQuietly = vi.fn(async () => undefined);
    const helper = loadHelper();

    const result = await helper.resolveShortLinkUrl("https://t.cn/AXIrKjka", {
      fetchImpl,
      createTab,
      waitForTabComplete,
      getTab,
      removeTabQuietly,
      sleep: vi.fn(async () => undefined),
    });

    expect(result).toEqual({
      initialUrl: "https://t.cn/AXIrKjka",
      resolvedUrl: "https://weibo.com/tv/show/1034:5284278758473738",
      expanded: true,
      via: "background_tab",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(createTab).toHaveBeenCalledWith({
      url: "https://t.cn/AXIrKjka",
      active: false,
    });
    expect(waitForTabComplete).toHaveBeenCalledWith(17, { timeoutMs: 12000 });
    expect(removeTabQuietly).toHaveBeenCalledWith(17);
  });

  it("returns passthrough metadata for non-short URLs", async () => {
    const helper = loadHelper();

    const result = await helper.resolveShortLinkUrl("https://weibo.com/detail/123");

    expect(result).toEqual({
      initialUrl: "https://weibo.com/detail/123",
      resolvedUrl: "https://weibo.com/detail/123",
      expanded: false,
      via: "passthrough",
    });
  });

  it("unwraps redirect-wrapper URLs returned during short-link expansion", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        url: "https://passport.weibo.com/visitor/visitor?entry=krvideo&url=https%3A%2F%2Fweibo.com%2Ftv%2Fshow%2F1034%3A5283985857904677",
      });
    const helper = loadHelper();

    const result = await helper.resolveShortLinkUrl("https://t.cn/AXImSMQz", {
      fetchImpl,
    });

    expect(result).toEqual({
      initialUrl: "https://t.cn/AXImSMQz",
      resolvedUrl: "https://weibo.com/tv/show/1034:5283985857904677",
      expanded: true,
      via: "fetch_head",
    });
  });

  it("unwraps redirect-wrapper inputs without treating them as passthrough", async () => {
    const helper = loadHelper();

    const result = await helper.resolveShortLinkUrl(
      "https://passport.weibo.com/visitor/visitor?entry=krvideo&url=https%3A%2F%2Fweibo.com%2Ftv%2Fshow%2F1034%3A5283985857904677",
    );

    expect(result).toEqual({
      initialUrl: "https://passport.weibo.com/visitor/visitor?entry=krvideo&url=https%3A%2F%2Fweibo.com%2Ftv%2Fshow%2F1034%3A5283985857904677",
      resolvedUrl: "https://weibo.com/tv/show/1034:5283985857904677",
      expanded: true,
      via: "unwrap_redirect",
    });
  });
});
