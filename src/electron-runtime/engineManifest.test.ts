import { describe, expect, it } from "vitest";
import { getCliEngineManifest, resolveYtdlpFormatProfile } from "./engineManifest.js";

describe("CLI engine manifests", () => {
  it("keeps yt-dlp invocation defaults isolated from host config", () => {
    const manifest = getCliEngineManifest("yt-dlp");

    expect(manifest.binaryKey).toBe("ytDlp");
    expect(manifest.configIsolationArgs).toEqual(["--ignore-config", "--no-plugin-dirs"]);
    expect(manifest.encodingArgs).toEqual(["--encoding", "utf-8"]);
    expect(manifest.progressArgs).toEqual(["--progress"]);
    expect(manifest.progressReport).toEqual({
      finalPathPrint: "after_move:filepath",
      titlePrint: "after_move:title",
    });
  });

  it("keeps gallery-dl sidecar and output rules declarative", () => {
    const manifest = getCliEngineManifest("gallery-dl");

    expect(manifest.binaryKey).toBe("galleryDl");
    expect(manifest.configIsolationArgs).toEqual(["--config-ignore"]);
    expect(manifest.outputArgs).toEqual({
      directoryFlag: "--directory",
      filenameFlag: "--filename",
      extensionTemplate: "{extension}",
    });
    expect(manifest.sidecarExtensions).toEqual(["json", "txt", "part"]);
  });

  it("resolves youtube-specific yt-dlp format profiles separately from generic profiles", () => {
    const genericBalanced = resolveYtdlpFormatProfile("balanced", true, { siteId: "twitter-x" });
    const youtubeBalanced = resolveYtdlpFormatProfile("balanced", true, { siteId: "youtube" });
    const youtubeUrlBalanced = resolveYtdlpFormatProfile("balanced", true, {
      isYouTube: true,
      siteId: "generic",
    });
    const unknownSiteDataSaver = resolveYtdlpFormatProfile("data_saver", true, {
      siteId: "unknown-site",
    });
    const noFfmpegBalanced = resolveYtdlpFormatProfile("balanced", false, { siteId: "youtube" });

    expect(genericBalanced.selector).toContain("bv*[height=1080]");
    expect(youtubeBalanced.selector).toContain("bv*[height=1080]");
    expect(youtubeBalanced.selector).toContain("best[height<=1080][ext=mp4]");
    expect(youtubeUrlBalanced).toBe(youtubeBalanced);
    expect(unknownSiteDataSaver.selector).toContain("bv*[height=360]");
    expect(noFfmpegBalanced.mergeOutputFormat).toBeNull();
  });
});
