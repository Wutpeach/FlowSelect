import { describe, expect, it } from "vitest";

import { buildOutputStem, sanitizeFileStem } from "./runtimeUtils";

describe("buildOutputStem", () => {
  it("decodes percent-escaped path segments before deriving the output stem", () => {
    expect(
      buildOutputStem(
        "trace-1",
        "https://cdn.example.com/videos/My%20Clip%20%281%29.mp4",
        {},
      ),
    ).toBe("My Clip (1)");
  });
});

describe("sanitizeFileStem", () => {
  it("removes unsafe filename characters while preserving readable text", () => {
    expect(sanitizeFileStem("Bad<>:\\Name?.mp4")).toBe("Bad Name .mp4");
  });

  it("avoids reserved Windows device names", () => {
    expect(sanitizeFileStem("CON")).toBe("CON_");
    expect(sanitizeFileStem("lpt1")).toBe("lpt1_");
  });
});
