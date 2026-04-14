export type ProviderPlanningMode =
  | "registry_engine_order"
  | "registry_engine_order_after_provider_normalization"
  | "dynamic_capability_resolution";

export type ProviderMigrationStatus = "migrated" | "planned";

export type ProviderMigrationTarget = {
  providerId: string;
  strategySiteId: string | null;
  planningMode: ProviderPlanningMode;
  status: ProviderMigrationStatus;
  matchingOwner: "provider";
  sourceUrlOwner: "provider";
  candidateSelectionOwner: "provider" | "none";
  notes: readonly string[];
};

export const providerMigrationTargets = [
  {
    providerId: "youtube",
    strategySiteId: "youtube",
    planningMode: "registry_engine_order",
    status: "migrated",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "none",
    notes: [
      "Provider continues to own YouTube URL matching and metadata shaping.",
      "Registry can fully own engine ordering because the current route is single-engine yt-dlp.",
    ],
  },
  {
    providerId: "douyin",
    strategySiteId: "douyin",
    planningMode: "registry_engine_order_after_provider_normalization",
    status: "migrated",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "provider",
    notes: [
      "Provider must continue direct-media detection before registry engine ordering is applied.",
      "Registry can own the direct -> yt-dlp chain once the provider resolves the correct source URL.",
    ],
  },
  {
    providerId: "xiaohongshu",
    strategySiteId: "xiaohongshu",
    planningMode: "registry_engine_order_after_provider_normalization",
    status: "migrated",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "provider",
    notes: [
      "Provider must keep note URL canonicalization and candidate filtering.",
      "Registry should only take over engine ordering after provider-owned normalization chooses the source URL.",
    ],
  },
  {
    providerId: "bilibili",
    strategySiteId: "bilibili",
    planningMode: "registry_engine_order",
    status: "migrated",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "none",
    notes: [
      "Provider continues to own current-item metadata and clip-range intent fields.",
      "Registry can own engine ordering because the route remains single-engine yt-dlp.",
    ],
  },
  {
    providerId: "twitter-x",
    strategySiteId: "twitter-x",
    planningMode: "registry_engine_order",
    status: "migrated",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "none",
    notes: [
      "Provider continues to own status matching and intent shaping.",
      "Registry can own engine ordering because the route remains single-engine yt-dlp.",
    ],
  },
  {
    providerId: "pinterest",
    strategySiteId: "pinterest",
    planningMode: "registry_engine_order_after_provider_normalization",
    status: "migrated",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "provider",
    notes: [
      "Provider must keep direct-asset verification and candidate filtering.",
      "Registry can own direct -> gallery-dl ordering after the provider chooses whether a direct asset exists.",
    ],
  },
  {
    providerId: "weibo",
    strategySiteId: "weibo",
    planningMode: "registry_engine_order_after_provider_normalization",
    status: "migrated",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "none",
    notes: [
      "Provider must keep visitor-wrapper unwrapping and tv/show normalization.",
      "Registry can own gallery-dl -> yt-dlp ordering for canonical detail/status URLs after provider normalization.",
    ],
  },
  {
    providerId: "gallery-dl-supported",
    strategySiteId: null,
    planningMode: "dynamic_capability_resolution",
    status: "planned",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "none",
    notes: [
      "This provider spans many upstream gallery-dl sites and cannot map to one manual strategy entry.",
      "Migration depends on dynamic capability lookup seeded from upstream data and later probe outcomes.",
    ],
  },
  {
    providerId: "generic",
    strategySiteId: "generic",
    planningMode: "registry_engine_order",
    status: "migrated",
    matchingOwner: "provider",
    sourceUrlOwner: "provider",
    candidateSelectionOwner: "none",
    notes: [
      "Generic matching remains the final catch-all provider responsibility.",
      "Registry can own engine ordering immediately because the route is single-engine yt-dlp.",
    ],
  },
] satisfies readonly ProviderMigrationTarget[];
