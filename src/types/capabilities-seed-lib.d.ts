declare module "../../scripts/capabilities-seed-lib.mjs" {
  export type GeneratedDownloadCapabilityEntry = {
    siteId: string;
    displayName: string;
    engine: "yt-dlp" | "gallery-dl" | "direct";
    sourceId: string;
    claimStatus: "claimed_supported" | "manual_supported" | "manual_blocked";
    probeStatus: "unknown" | "works" | "works_with_auth" | "unstable" | "broken" | "forbidden";
    authRequirement: "unknown" | "none" | "optional" | "required";
    upstreamState: "reported_supported" | "reported_broken";
    referenceUrl?: string;
    matchHints?: {
      hosts?: string[];
      extractorId?: string;
      upstreamId?: string;
    };
    capabilityHints?: string[];
    notes?: string[];
    importedAt?: string;
  };

  export type GeneratedCapabilitySeedSource = {
    id: string;
    type: "official_supported_sites" | "manual";
    engine: "yt-dlp" | "gallery-dl" | "direct" | null;
    label: string;
    url?: string;
    fetchedAt: string;
    entryCount: number;
    notes?: string[];
  };

  export type GeneratedCapabilitySeed = {
    schemaVersion: 1;
    generatedAt: string;
    sources: GeneratedCapabilitySeedSource[];
    downloadCapabilities: GeneratedDownloadCapabilityEntry[];
    interactionCapabilities: Array<{
      siteId: string;
      sourceId: string;
      interactionStatus: "unknown" | "native_ok" | "needs_special_adapter" | "not_supported";
      supportedModes: Array<"paste" | "drag" | "context_menu" | "injected_button" | "page_bridge">;
      notes?: string[];
    }>;
  };

  export const YT_DLP_SUPPORTED_SITES_URL: string;
  export const GALLERY_DL_SUPPORTED_SITES_URL: string;
  export const DEFAULT_CAPABILITY_SEED_OUTPUT: string;
  export const repoRoot: string;

  export function parseYtDlpSupportedSitesDocument(
    document: string,
    fetchedAt: string,
  ): GeneratedDownloadCapabilityEntry[];

  export function parseGalleryDlSupportedSitesDocument(
    document: string,
    fetchedAt: string,
  ): GeneratedDownloadCapabilityEntry[];

  export function buildCapabilitySeed(input: {
    generatedAt?: string;
    ytDlpDocument: string;
    galleryDlDocument: string;
    ytDlpFetchedAt?: string;
    galleryDlFetchedAt?: string;
  }): GeneratedCapabilitySeed;

  export function readTextFromSource(source: string): Promise<string>;

  export function generateCapabilitySeed(input?: {
    ytDlpSource?: string;
    galleryDlSource?: string;
    generatedAt?: string;
  }): Promise<GeneratedCapabilitySeed>;

  export function writeCapabilitySeed(
    outputPath: string,
    seed: GeneratedCapabilitySeed,
  ): Promise<void>;
}
