import { describe, expect, it } from "vitest";

import { parseLocalFileUrl } from "./localFileUrl";

describe("parseLocalFileUrl", () => {
  it("parses Windows file URLs into drive paths", () => {
    expect(parseLocalFileUrl("file:///C:/Users/Test/Export%20Folder/image.png"))
      .toBe("C:\\Users\\Test\\Export Folder\\image.png");
  });

  it("preserves the leading slash for macOS file URLs", () => {
    expect(parseLocalFileUrl("file:///Users/test/Pictures/Flow%20Select.png"))
      .toBe("/Users/test/Pictures/Flow Select.png");
  });

  it("treats localhost file URLs as local paths", () => {
    expect(parseLocalFileUrl("file://localhost/Users/test/Desktop/demo.mp4"))
      .toBe("/Users/test/Desktop/demo.mp4");
  });

  it("returns null for non-file URLs or malformed values", () => {
    expect(parseLocalFileUrl("https://example.com/image.png")).toBeNull();
    expect(parseLocalFileUrl("file://")).toBeNull();
  });
});
