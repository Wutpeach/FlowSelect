import { describe, expect, it } from "vitest";

import { extractImageUrlFromHtml } from "./imageDrag";

describe("extractImageUrlFromHtml", () => {
  it("prefers the highest-width srcset candidate from dragged HTML", () => {
    const imageUrl = extractImageUrlFromHtml(`
      <img
        src="https://cdn.example.com/thumb.jpg"
        srcset="
          https://cdn.example.com/thumb.jpg 320w,
          https://cdn.example.com/hero.jpg 1600w
        "
      />
    `);

    expect(imageUrl).toBe("https://cdn.example.com/hero.jpg");
  });

  it("resolves relative image sources against the dropped page URL", () => {
    const imageUrl = extractImageUrlFromHtml('<img src="/images/earth-nightmap.webp" />', {
      baseUrl: "https://www.solarsystemscope.com/textures/earth.html",
    });

    expect(imageUrl).toBe("https://www.solarsystemscope.com/images/earth-nightmap.webp");
  });

  it("ignores blob URLs and falls back to a usable absolute image URL", () => {
    const imageUrl = extractImageUrlFromHtml(`
      <div>
        <img src="blob:https://example.com/not-usable" />
        https://images.example.com/fallback.png
      </div>
    `);

    expect(imageUrl).toBe("https://images.example.com/fallback.png");
  });
});
