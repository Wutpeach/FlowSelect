import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const helperPath = path.resolve("browser-extension/video-selection-routing.js");
const helperSource = readFileSync(helperPath, "utf8");

const loadRoutingHelper = () => {
  const context = {
    self: {},
    globalThis: {},
    URL,
  };
  vm.runInNewContext(helperSource, context, { filename: helperPath });
  return context.self.FlowSelectVideoSelectionRouting;
};

describe("video selection routing helper", () => {
  it("prefers the explicit requested url over page context", () => {
    const helper = loadRoutingHelper();

    expect(helper.resolveVideoSelectionRouting({
      requestedUrl: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123&list=PL001",
      senderTabUrl: "https://www.youtube.com/watch?v=abc123&list=PL001",
    })).toEqual({
      routeUrl: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123&list=PL001",
    });
  });

  it("prevents a mismatched page url from overriding the requested route", () => {
    const helper = loadRoutingHelper();

    expect(helper.resolveVideoSelectionRouting({
      requestedUrl: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://x.com/home",
      senderTabUrl: "https://x.com/home",
    })).toEqual({
      routeUrl: "https://www.youtube.com/watch?v=abc123",
      pageUrl: "https://www.youtube.com/watch?v=abc123",
    });
  });
});
