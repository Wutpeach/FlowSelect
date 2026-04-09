import { describe, expect, it } from "vitest";

import {
  canonicalizeTwitterXPageUrl,
  isTwitterXStatusUrl,
  shouldPreferTwitterXImageDrop,
  upgradeTwitterXImageUrl,
} from "./twitterX";

describe("isTwitterXStatusUrl", () => {
  it("matches twitter and x status permalinks", () => {
    expect(isTwitterXStatusUrl("https://x.com/flowselect/status/1234567890")).toBe(true);
    expect(isTwitterXStatusUrl("https://twitter.com/flowselect/status/1234567890")).toBe(true);
  });

  it("rejects non-status X urls", () => {
    expect(isTwitterXStatusUrl("https://x.com/home")).toBe(false);
    expect(isTwitterXStatusUrl("https://example.com/flowselect/status/1234567890")).toBe(false);
  });
});

describe("canonicalizeTwitterXPageUrl", () => {
  it("collapses X photo overlay urls back to the status permalink", () => {
    expect(
      canonicalizeTwitterXPageUrl("https://x.com/Jackywine/status/2042131360048128059/photo/1"),
    ).toBe("https://x.com/Jackywine/status/2042131360048128059");
  });

  it("drops query and hash fragments from status urls", () => {
    expect(
      canonicalizeTwitterXPageUrl("https://twitter.com/flowselect/status/1234567890?foo=1#bar"),
    ).toBe("https://twitter.com/flowselect/status/1234567890");
  });
});

describe("upgradeTwitterXImageUrl", () => {
  it("upgrades pbs.twimg.com image variants to orig", () => {
    expect(
      upgradeTwitterXImageUrl("https://pbs.twimg.com/media/HFcbbVTa8AItONk?format=jpg&name=small"),
    ).toBe("https://pbs.twimg.com/media/HFcbbVTa8AItONk?format=jpg&name=orig");
  });

  it("ignores already-original or non-twitter image urls", () => {
    expect(
      upgradeTwitterXImageUrl("https://pbs.twimg.com/media/HFcbbVTa8AItONk?format=jpg&name=orig"),
    ).toBeNull();
    expect(upgradeTwitterXImageUrl("https://images.example.com/thumb.jpg")).toBeNull();
  });
});

describe("shouldPreferTwitterXImageDrop", () => {
  it("prefers the image branch for X status drags that expose an image but no video hints", () => {
    expect(shouldPreferTwitterXImageDrop({
      dropUrl: "https://x.com/flowselect/status/1234567890",
      html: `
        <a href="https://x.com/flowselect/status/1234567890">
          <img src="https://pbs.twimg.com/media/ExampleImage?format=jpg&name=small" />
        </a>
      `,
      htmlImageUrl: "https://pbs.twimg.com/media/ExampleImage?format=jpg&name=small",
    })).toBe(true);
  });

  it("keeps the video branch when X drag html exposes video markers", () => {
    expect(shouldPreferTwitterXImageDrop({
      dropUrl: "https://x.com/flowselect/status/1234567890",
      html: `
        <video src="https://video.twimg.com/ext_tw_video/example.mp4"></video>
        <img src="https://pbs.twimg.com/media/ExampleImage?format=jpg&name=small" />
      `,
      htmlImageUrl: "https://pbs.twimg.com/media/ExampleImage?format=jpg&name=small",
    })).toBe(false);
  });

  it("does not prefer images when no extracted image url exists", () => {
    expect(shouldPreferTwitterXImageDrop({
      dropUrl: "https://x.com/flowselect/status/1234567890",
      html: `<a href="https://x.com/flowselect/status/1234567890">link</a>`,
      htmlImageUrl: null,
    })).toBe(false);
  });
});
