import { describe, expect, it } from "vitest";

import { extractEmbeddedProtectedImageDragPayload } from "./protectedImageDrag";

function encodePayload(payload: object): string {
  const json = JSON.stringify(payload);
  return `FLOWSELECT_PROTECTED_IMAGE_DRAG:${btoa(
    encodeURIComponent(json).replace(/%([0-9A-F]{2})/gi, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    ),
  )}`;
}

describe("extractEmbeddedProtectedImageDragPayload", () => {
  it("extracts a valid protected image drag payload from plain text", () => {
    const value = `https://cdn.example.com/protected.png\n${encodePayload({
      token: "token-123",
      pageUrl: "https://www.example.com/gallery",
      imageUrl: "https://cdn.example.com/protected.png",
    })}`;

    expect(extractEmbeddedProtectedImageDragPayload(value)).toEqual({
      token: "token-123",
      pageUrl: "https://www.example.com/gallery",
      imageUrl: "https://cdn.example.com/protected.png",
    });
  });

  it("rejects payloads without a non-empty token", () => {
    const value = encodePayload({
      token: "   ",
      pageUrl: "https://www.example.com/gallery",
      imageUrl: "https://cdn.example.com/protected.png",
    });

    expect(extractEmbeddedProtectedImageDragPayload(value)).toBeNull();
  });

  it("normalizes invalid URLs to null instead of trusting them", () => {
    const value = encodePayload({
      token: "token-123",
      pageUrl: "javascript:alert(1)",
      imageUrl: "blob:https://example.com/123",
    });

    expect(extractEmbeddedProtectedImageDragPayload(value)).toEqual({
      token: "token-123",
      pageUrl: null,
      imageUrl: null,
    });
  });
});
