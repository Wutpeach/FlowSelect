import { beforeEach, describe, expect, it, vi } from "vitest";

const maxUrlMock = vi.fn();

vi.mock("image-max-url", () => ({
  default: maxUrlMock,
}));

import { upgradeImageUrl } from "./imageQualityUpgrade";
import { resetMaxUrlModuleForTests } from "./maxurlAdapter";
import { upgradeWeiboImageUrl } from "./weiboImageUpgrade";

describe("upgradeWeiboImageUrl", () => {
  it("upgrades low-resolution sinaimg buckets to mw2000", () => {
    expect(
      upgradeWeiboImageUrl("https://wx3.sinaimg.cn/orj360/7840bc09gy1ic0e1mw1b1j21401hcwum.jpg"),
    ).toBe("https://wx3.sinaimg.cn/mw2000/7840bc09gy1ic0e1mw1b1j21401hcwum.jpg");

    expect(
      upgradeWeiboImageUrl("https://wx3.sinaimg.cn/mw690/7840bc09gy1ic0e1mw1b1j21401hcwum.jpg"),
    ).toBe("https://wx3.sinaimg.cn/mw2000/7840bc09gy1ic0e1mw1b1j21401hcwum.jpg");
  });

  it("does not rewrite already-large or non-sinaimg URLs", () => {
    expect(
      upgradeWeiboImageUrl("https://wx3.sinaimg.cn/mw2000/7840bc09gy1ic0e1mw1b1j21401hcwum.jpg"),
    ).toBeNull();
    expect(upgradeWeiboImageUrl("https://images.example.com/thumb.jpg")).toBeNull();
  });
});

describe("upgradeImageUrl", () => {
  beforeEach(() => {
    maxUrlMock.mockReset();
    resetMaxUrlModuleForTests();
  });

  it("prefers deterministic Weibo upgrades before consulting maxurl", async () => {
    const result = await upgradeImageUrl({
      imageUrl: "https://wx3.sinaimg.cn/orj360/7840bc09gy1ic0e1mw1b1j21401hcwum.jpg",
    });

    expect(result).toEqual({
      originalUrl: "https://wx3.sinaimg.cn/orj360/7840bc09gy1ic0e1mw1b1j21401hcwum.jpg",
      upgradedUrl: "https://wx3.sinaimg.cn/mw2000/7840bc09gy1ic0e1mw1b1j21401hcwum.jpg",
      strategy: "weibo_override",
      confidence: "high",
      notes: ["matched known sinaimg size bucket and upgraded to a larger variant"],
    });
    expect(maxUrlMock).not.toHaveBeenCalled();
  });

  it("uses a safe maxurl candidate when the URL is not a Weibo image", async () => {
    maxUrlMock.mockImplementation((_url: string, options: { cb?: (result: unknown) => void }) => {
      options.cb?.([
        {
          url: "https://images.example.com/original.jpg",
          is_original: true,
          bad: false,
          video: false,
          fake: false,
          headers: {
            Referer: "https://images.example.com/gallery",
          },
          problems: {
            possibly_different: false,
            possibly_broken: false,
          },
        },
      ]);
    });

    const result = await upgradeImageUrl({
      imageUrl: "https://images.example.com/thumb.jpg",
    });

    expect(result).toEqual({
      originalUrl: "https://images.example.com/thumb.jpg",
      upgradedUrl: "https://images.example.com/original.jpg",
      strategy: "maxurl",
      confidence: "high",
      notes: [
        "maxurl returned a safe larger candidate on the same host",
        "candidate is marked as original by maxurl",
      ],
      requestHeaders: {
        Referer: "https://images.example.com/gallery",
      },
    });
  });

  it("falls back when maxurl only returns the original URL", async () => {
    maxUrlMock.mockImplementation((_url: string, options: { cb?: (result: unknown) => void }) => {
      options.cb?.([
        {
          url: "https://images.example.com/thumb.jpg",
          bad: false,
          video: false,
          fake: false,
          problems: {
            possibly_different: false,
            possibly_broken: false,
          },
        },
      ]);
    });

    await expect(upgradeImageUrl({
      imageUrl: "https://images.example.com/thumb.jpg",
    })).resolves.toEqual({
      originalUrl: "https://images.example.com/thumb.jpg",
      upgradedUrl: null,
      strategy: "none",
      confidence: "low",
      notes: ["no safe larger image candidate was found"],
    });
  });

  it("falls back cleanly when maxurl throws", async () => {
    maxUrlMock.mockImplementation(() => {
      throw new Error("mock maxurl failure");
    });

    await expect(upgradeImageUrl({
      imageUrl: "https://images.example.com/thumb.jpg",
    })).resolves.toEqual({
      originalUrl: "https://images.example.com/thumb.jpg",
      upgradedUrl: null,
      strategy: "none",
      confidence: "low",
      notes: [
        "maxurl upgrade failed; falling back to the original image URL",
        "mock maxurl failure",
      ],
    });
  });
});
