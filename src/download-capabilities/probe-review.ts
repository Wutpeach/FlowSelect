import { z } from "zod";
import type { DownloadFailureClassification } from "../core/index.js";
import type { CapabilityProbeRecord, CapabilityProbeTarget } from "./probe-snapshot.js";
import type {
  CapabilityAuthRequirement,
  CapabilityClaimStatus,
  CapabilityProbeStatus,
  CapabilitySourceEntry,
  DownloadCapabilityEntry,
} from "./types.js";

const capabilitySourceTypeValueSchema = z.enum(["official_supported_sites", "manual"]);
const capabilityClaimStatusValueSchema = z.enum([
  "claimed_supported",
  "manual_supported",
  "manual_blocked",
]);
const capabilityProbeStatusValueSchema = z.enum([
  "unknown",
  "works",
  "works_with_auth",
  "unstable",
  "broken",
  "forbidden",
]);
const capabilityAuthRequirementValueSchema = z.enum([
  "unknown",
  "none",
  "optional",
  "required",
]);
const downloadFailureClassificationValueSchema = z.enum([
  "retry_same_engine",
  "fallback_to_other_engine",
  "terminal_for_site",
  "input_invalid",
  "auth_required",
  "cancelled",
]);

export const capabilityProbeReviewCandidateSchema = z.object({
  target: z.object({
    id: z.string().trim().min(1),
    siteId: z.string().trim().min(1).nullable(),
    engine: z.enum(["yt-dlp", "gallery-dl", "direct"]),
    sourceUrl: z.url(),
    tier: z.enum(["critical", "auth_sensitive", "coverage"]),
    notes: z.array(z.string().trim().min(1)),
  }),
  maintained: z.object({
    present: z.boolean(),
    sourceId: z.string().trim().min(1).nullable(),
    sourceType: capabilitySourceTypeValueSchema.nullable(),
    claimStatus: capabilityClaimStatusValueSchema.nullable(),
    probeStatus: capabilityProbeStatusValueSchema.nullable(),
    authRequirement: capabilityAuthRequirementValueSchema.nullable(),
  }),
  observed: z.object({
    status: capabilityProbeStatusValueSchema,
    authRequirement: capabilityAuthRequirementValueSchema,
    classification: downloadFailureClassificationValueSchema.nullable(),
    executedAt: z.iso.datetime(),
    summary: z.string().trim().min(1),
  }),
  review: z.object({
    kind: z.enum(["update_existing_capability", "add_missing_capability"]),
    requiresManualConfirmation: z.literal(true),
    reasons: z.array(z.string().trim().min(1)).min(1),
  }),
});

export type CapabilityProbeReviewCandidate = z.infer<typeof capabilityProbeReviewCandidateSchema>;

export const capabilityProbeReviewArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.iso.datetime(),
  snapshot: z.object({
    schemaVersion: z.number().int().positive(),
    generatedAt: z.iso.datetime(),
    totalTargets: z.number().int().nonnegative(),
    totalRecords: z.number().int().nonnegative(),
  }),
  summary: z.object({
    totalCandidates: z.number().int().nonnegative(),
    unchangedRecords: z.number().int().nonnegative(),
    updateExistingCapability: z.number().int().nonnegative(),
    addMissingCapability: z.number().int().nonnegative(),
    candidateTiers: z.object({
      critical: z.number().int().nonnegative(),
      authSensitive: z.number().int().nonnegative(),
      coverage: z.number().int().nonnegative(),
    }),
  }),
  candidates: z.array(capabilityProbeReviewCandidateSchema),
});

export type CapabilityProbeReviewArtifact = z.infer<typeof capabilityProbeReviewArtifactSchema>;

export type CapabilityProbeReviewRegistry = {
  seed: {
    sources: readonly CapabilitySourceEntry[];
  };
  listDownloadCapabilities(): readonly DownloadCapabilityEntry[];
};

const resolveMaintainedCapability = (
  registry: CapabilityProbeReviewRegistry,
  siteId: string | null,
  engine: CapabilityProbeTarget["engine"],
): DownloadCapabilityEntry | null => {
  if (!siteId) {
    return null;
  }

  const sourceTypeById = new Map(
    registry.seed.sources.map((source) => [source.id, source.type]),
  );

  const matches = registry.listDownloadCapabilities()
    .filter((entry) => entry.siteId === siteId && entry.engine === engine)
    .sort((left, right) => {
      const leftType = sourceTypeById.get(left.sourceId);
      const rightType = sourceTypeById.get(right.sourceId);

      if (leftType === rightType) {
        return left.sourceId.localeCompare(right.sourceId);
      }
      if (leftType === "manual") {
        return -1;
      }
      if (rightType === "manual") {
        return 1;
      }
      return left.sourceId.localeCompare(right.sourceId);
    });

  return matches[0] ?? null;
};

const buildReviewReasons = (
  maintained: DownloadCapabilityEntry | null,
  record: CapabilityProbeRecord,
): string[] => {
  if (!maintained) {
    return [
      "No maintained capability entry exists for this site and engine pair.",
    ];
  }

  const reasons: string[] = [];
  if (maintained.probeStatus !== record.status) {
    reasons.push(
      `Maintained probe status is ${maintained.probeStatus}; observed probe status is ${record.status}.`,
    );
  }
  if (maintained.authRequirement !== record.authRequirement) {
    reasons.push(
      `Maintained auth requirement is ${maintained.authRequirement}; observed auth requirement is ${record.authRequirement}.`,
    );
  }

  return reasons;
};

const createCandidateFromRecord = (
  target: CapabilityProbeTarget,
  record: CapabilityProbeRecord,
  registry: CapabilityProbeReviewRegistry,
): CapabilityProbeReviewCandidate | null => {
  const siteId = target.siteId ?? record.siteId ?? null;
  const maintained = resolveMaintainedCapability(registry, siteId, target.engine);
  const reasons = buildReviewReasons(maintained, record);

  if (reasons.length === 0) {
    return null;
  }

  const sourceTypeById = new Map(
    registry.seed.sources.map((source) => [source.id, source.type]),
  );

  return capabilityProbeReviewCandidateSchema.parse({
    target: {
      id: target.id,
      siteId,
      engine: target.engine,
      sourceUrl: target.sourceUrl,
      tier: target.tier,
      notes: target.notes ?? [],
    },
    maintained: {
      present: maintained !== null,
      sourceId: maintained?.sourceId ?? null,
      sourceType: maintained ? sourceTypeById.get(maintained.sourceId) ?? null : null,
      claimStatus: maintained?.claimStatus ?? null,
      probeStatus: maintained?.probeStatus ?? null,
      authRequirement: maintained?.authRequirement ?? null,
    },
    observed: {
      status: record.status,
      authRequirement: record.authRequirement,
      classification: record.classification as DownloadFailureClassification | null,
      executedAt: record.executedAt,
      summary: record.summary,
    },
    review: {
      kind: maintained ? "update_existing_capability" : "add_missing_capability",
      requiresManualConfirmation: true,
      reasons,
    },
  });
};

export const createCapabilityProbeReviewArtifact = (input: {
  snapshot: {
    schemaVersion: number;
    generatedAt: string;
    targets: readonly CapabilityProbeTarget[];
    records: readonly CapabilityProbeRecord[];
  };
  registry: CapabilityProbeReviewRegistry;
  generatedAt?: string;
}): CapabilityProbeReviewArtifact => {
  const registry = input.registry;
  const recordsByTargetId = new Map(
    input.snapshot.records.map((record) => [record.targetId, record]),
  );

  const candidates = input.snapshot.targets
    .flatMap((target) => {
      const record = recordsByTargetId.get(target.id);
      if (!record) {
        return [];
      }

      const candidate = createCandidateFromRecord(target, record, registry);
      return candidate ? [candidate] : [];
    });

  const summary = {
    totalCandidates: candidates.length,
    unchangedRecords: input.snapshot.records.length - candidates.length,
    updateExistingCapability: candidates.filter(
      (candidate) => candidate.review.kind === "update_existing_capability",
    ).length,
    addMissingCapability: candidates.filter(
      (candidate) => candidate.review.kind === "add_missing_capability",
    ).length,
    candidateTiers: {
      critical: candidates.filter((candidate) => candidate.target.tier === "critical").length,
      authSensitive: candidates.filter((candidate) => candidate.target.tier === "auth_sensitive").length,
      coverage: candidates.filter((candidate) => candidate.target.tier === "coverage").length,
    },
  };

  return capabilityProbeReviewArtifactSchema.parse({
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    snapshot: {
      schemaVersion: input.snapshot.schemaVersion,
      generatedAt: input.snapshot.generatedAt,
      totalTargets: input.snapshot.targets.length,
      totalRecords: input.snapshot.records.length,
    },
    summary,
    candidates,
  });
};
