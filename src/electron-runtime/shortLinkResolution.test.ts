import { describe, expect, it, vi } from "vitest";

import { resolveShortLinkDownloadInput } from "./shortLinkResolution";

const createRedirectResponse = (url: string): Response => {
  const response = new Response(null, { status: 200 });
  Object.defineProperty(response, "url", {
    configurable: true,
    value: url,
  });
  return response;
};

describe("resolveShortLinkDownloadInput", () => {
  it("expands a short request url and derives a stable page url/site hint", async () => {
    const fetchImpl = vi.fn(async () => createRedirectResponse("https://weibo.com/tv/show/1034:5284278758473738"));

    const resolved = await resolveShortLinkDownloadInput(
      { url: "https://t.cn/AXIDyEZb" },
      fetchImpl as unknown as typeof fetch,
    );

    expect(resolved).toMatchObject({
      url: "https://weibo.com/tv/show/1034:5284278758473738",
      pageUrl: "https://weibo.com/tv/show/1034:5284278758473738",
      siteHint: "weibo",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://t.cn/AXIDyEZb",
      expect.objectContaining({
        method: "HEAD",
        redirect: "follow",
      }),
    );
  });

  it("falls back to GET when HEAD cannot reveal the final url", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(createRedirectResponse("https://t.cn/AXIDyEZb"))
      .mockResolvedValueOnce(createRedirectResponse("https://www.xiaohongshu.com/explore/123"));

    const resolved = await resolveShortLinkDownloadInput(
      { url: "https://t.cn/AXIDyEZb" },
      fetchImpl as unknown as typeof fetch,
    );

    expect(resolved).toMatchObject({
      url: "https://www.xiaohongshu.com/explore/123",
      pageUrl: "https://www.xiaohongshu.com/explore/123",
      siteHint: "xiaohongshu",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({
      method: "GET",
      redirect: "follow",
    });
  });

  it("falls back to navigation resolution when fetch cannot reveal the final url", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(createRedirectResponse("https://t.cn/AXIDyEZb"))
      .mockResolvedValueOnce(createRedirectResponse("https://t.cn/AXIDyEZb"));
    const resolveViaNavigation = vi.fn(async () => (
      "https://passport.weibo.com/visitor/visitor?entry=krvideo&url=https%3A%2F%2Fweibo.com%2Ftv%2Fshow%2F1034%3A5283985857904677%3Ffrom%3Dold_pc_videoshow"
    ));

    const resolved = await resolveShortLinkDownloadInput(
      { url: "https://t.cn/AXIDyEZb" },
      fetchImpl as unknown as typeof fetch,
      resolveViaNavigation,
    );

    expect(resolved).toMatchObject({
      url: "https://weibo.com/tv/show/1034:5283985857904677?from=old_pc_videoshow",
      pageUrl: "https://weibo.com/tv/show/1034:5283985857904677?from=old_pc_videoshow",
      siteHint: "weibo",
    });
    expect(resolveViaNavigation).toHaveBeenCalledWith("https://t.cn/AXIDyEZb");
  });

  it("unwraps redirect-wrapper responses returned by short-link expansion", async () => {
    const fetchImpl = vi.fn(async () => createRedirectResponse(
      "https://passport.weibo.com/visitor/visitor?entry=krvideo&url=https%3A%2F%2Fweibo.com%2Ftv%2Fshow%2F1034%3A5283985857904677",
    ));

    const resolved = await resolveShortLinkDownloadInput(
      { url: "https://t.cn/AXImSMQz" },
      fetchImpl as unknown as typeof fetch,
    );

    expect(resolved).toMatchObject({
      url: "https://weibo.com/tv/show/1034:5283985857904677",
      pageUrl: "https://weibo.com/tv/show/1034:5283985857904677",
      siteHint: "weibo",
    });
  });

  it("unwraps redirect-wrapper inputs even when no short-link fetch is needed", async () => {
    const fetchImpl = vi.fn();

    const resolved = await resolveShortLinkDownloadInput(
      {
        url: "https://passport.weibo.com/visitor/visitor?entry=krvideo&url=https%3A%2F%2Fweibo.com%2Ftv%2Fshow%2F1034%3A5283985857904677",
      },
      fetchImpl as unknown as typeof fetch,
    );

    expect(resolved).toMatchObject({
      url: "https://weibo.com/tv/show/1034:5283985857904677",
      pageUrl: "https://weibo.com/tv/show/1034:5283985857904677",
      siteHint: "weibo",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("passes stable urls through unchanged", async () => {
    const fetchImpl = vi.fn();
    const input = { url: "https://weibo.com/detail/123", siteHint: "weibo" as const };

    await expect(
      resolveShortLinkDownloadInput(input, fetchImpl as unknown as typeof fetch),
    ).resolves.toBe(input);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
