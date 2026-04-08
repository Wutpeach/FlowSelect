import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const manifestPath = path.resolve("browser-extension/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function findContentScript(match) {
  return manifest.content_scripts.find((entry) => Array.isArray(entry.matches) && entry.matches.includes(match));
}

describe("browser extension manifest", () => {
  it("keeps the global context menu permission enabled", () => {
    expect(manifest.permissions).toContain("contextMenus");
  });

  it("registers the Twitter/X injected detector", () => {
    expect(findContentScript("https://x.com/*")).toMatchObject({
      js: ["twitter-detector.js"],
      css: ["flowselect-shared.css", "twitter-button.css"],
      run_at: "document_idle",
    });
  });

  it("keeps the Bilibili injected detector registered", () => {
    expect(findContentScript("https://www.bilibili.com/*")).toMatchObject({
      js: ["locale-utils.js", "control-style-utils.js", "bilibili-detector.js"],
      css: ["flowselect-shared.css", "bilibili-button.css"],
      run_at: "document_idle",
    });
  });
});
