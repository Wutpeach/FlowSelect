import { describe, expect, it } from "vitest";

type DownloadCapabilityEntry = {
  siteId: string;
  displayName: string;
  engine: "yt-dlp" | "gallery-dl" | "direct";
  authRequirement: "unknown" | "none" | "optional" | "required";
  upstreamState: "reported_supported" | "reported_broken";
  referenceUrl?: string;
  capabilityHints?: string[];
  matchHints?: {
    hosts?: string[];
    upstreamId?: string;
  };
};

type CapabilitySeed = {
  schemaVersion: 1;
  sources: Array<{ id: string }>;
  downloadCapabilities: DownloadCapabilityEntry[];
  interactionCapabilities: unknown[];
};

type GeneratorLib = {
  parseYtDlpSupportedSitesDocument(
    document: string,
    fetchedAt: string,
  ): DownloadCapabilityEntry[];
  parseGalleryDlSupportedSitesDocument(
    document: string,
    fetchedAt: string,
  ): DownloadCapabilityEntry[];
  buildCapabilitySeed(input: {
    generatedAt?: string;
    ytDlpDocument: string;
    galleryDlDocument: string;
  }): CapabilitySeed;
};

const loadGeneratorLib = async (): Promise<GeneratorLib> => {
  const modulePath = "../../scripts/capabilities-seed-lib.mjs";
  return await import(modulePath) as GeneratorLib;
};

describe("capabilities seed generator", () => {
  it("parses yt-dlp supported-site markdown entries", async () => {
    const { parseYtDlpSupportedSitesDocument } = await loadGeneratorLib();
    const entries = parseYtDlpSupportedSitesDocument(
      [
        "# Supported sites",
        "",
        " - **10play**: [*10play*](## \"netrc machine\")",
        " - **20min**: (**Currently broken**)",
      ].join("\n"),
      "2026-04-13T00:00:00.000Z",
    );

    expect(entries).toEqual([
      expect.objectContaining({
        siteId: "10play",
        displayName: "10play",
        engine: "yt-dlp",
        authRequirement: "required",
        upstreamState: "reported_supported",
      }),
      expect.objectContaining({
        siteId: "20min",
        displayName: "20min",
        engine: "yt-dlp",
        upstreamState: "reported_broken",
      }),
    ]);
  });

  it("parses gallery-dl supported-site HTML table rows", async () => {
    const { parseGalleryDlSupportedSitesDocument } = await loadGeneratorLib();
    const entries = parseGalleryDlSupportedSitesDocument(
      [
        "<table>",
        "<tbody>",
        "<tr id=\"ao3\" title=\"ao3\">",
        "  <td>Archive of Our Own</td>",
        "  <td>https://archiveofourown.org/</td>",
        "  <td>Works, Series</td>",
        "  <td>Supported</td>",
        "</tr>",
        "</tbody>",
        "</table>",
      ].join("\n"),
      "2026-04-13T00:00:00.000Z",
    );

    expect(entries).toEqual([
      expect.objectContaining({
        siteId: "ao3",
        displayName: "Archive of Our Own",
        engine: "gallery-dl",
        authRequirement: "optional",
        referenceUrl: "https://archiveofourown.org/",
        capabilityHints: ["Works", "Series"],
        matchHints: expect.objectContaining({
          hosts: ["archiveofourown.org"],
          upstreamId: "ao3",
        }),
      }),
    ]);
  });

  it("builds a versioned seed that distinguishes download and interaction capabilities", async () => {
    const { buildCapabilitySeed } = await loadGeneratorLib();
    const seed = buildCapabilitySeed({
      generatedAt: "2026-04-13T00:00:00.000Z",
      ytDlpDocument: " - **ExampleSite**\n",
      galleryDlDocument: [
        "<table>",
        "<tbody>",
        "<tr id=\"example\" title=\"example\">",
        "<td>Example</td>",
        "<td>https://example.com/</td>",
        "<td>Galleries</td>",
        "<td></td>",
        "</tr>",
        "</tbody>",
        "</table>",
      ].join("\n"),
    });

    expect(seed.schemaVersion).toBe(1);
    expect(seed.sources.map((source) => source.id)).toEqual([
      "yt-dlp-supportedsites",
      "gallery-dl-supportedsites",
    ]);
    expect(seed.downloadCapabilities).toHaveLength(2);
    expect(seed.interactionCapabilities).toEqual([]);
  });
});
