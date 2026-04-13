import { z } from "zod";

export const capabilityEngineIdSchema = z.enum(["yt-dlp", "gallery-dl", "direct"]);
export const capabilitySourceTypeSchema = z.enum(["official_supported_sites", "manual"]);
export const capabilityClaimStatusSchema = z.enum([
  "claimed_supported",
  "manual_supported",
  "manual_blocked",
]);
export const capabilityProbeStatusSchema = z.enum([
  "unknown",
  "works",
  "works_with_auth",
  "unstable",
  "broken",
  "forbidden",
]);
export const capabilityAuthRequirementSchema = z.enum([
  "unknown",
  "none",
  "optional",
  "required",
]);
export const capabilityUpstreamStateSchema = z.enum([
  "reported_supported",
  "reported_broken",
]);
export const interactionModeSchema = z.enum([
  "paste",
  "drag",
  "context_menu",
  "injected_button",
  "page_bridge",
]);
export const interactionStatusSchema = z.enum([
  "unknown",
  "native_ok",
  "needs_special_adapter",
  "not_supported",
]);

export const capabilitySourceEntrySchema = z.object({
  id: z.string().trim().min(1),
  type: capabilitySourceTypeSchema,
  engine: capabilityEngineIdSchema.nullable(),
  label: z.string().trim().min(1),
  url: z.url().optional(),
  fetchedAt: z.iso.datetime(),
  entryCount: z.number().int().nonnegative(),
  notes: z.array(z.string().trim().min(1)).optional(),
});

export const capabilityMatchHintsSchema = z.object({
  hosts: z.array(z.string().trim().min(1)).optional(),
  extractorId: z.string().trim().min(1).optional(),
  upstreamId: z.string().trim().min(1).optional(),
});

export const downloadCapabilityEntrySchema = z.object({
  siteId: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  engine: capabilityEngineIdSchema,
  sourceId: z.string().trim().min(1),
  claimStatus: capabilityClaimStatusSchema,
  probeStatus: capabilityProbeStatusSchema,
  authRequirement: capabilityAuthRequirementSchema,
  upstreamState: capabilityUpstreamStateSchema,
  referenceUrl: z.url().optional(),
  matchHints: capabilityMatchHintsSchema.optional(),
  capabilityHints: z.array(z.string().trim().min(1)).optional(),
  notes: z.array(z.string().trim().min(1)).optional(),
});

export const interactionCapabilityEntrySchema = z.object({
  siteId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  interactionStatus: interactionStatusSchema,
  supportedModes: z.array(interactionModeSchema),
  notes: z.array(z.string().trim().min(1)).optional(),
});

export const capabilitySeedSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.iso.datetime(),
  sources: z.array(capabilitySourceEntrySchema),
  downloadCapabilities: z.array(downloadCapabilityEntrySchema),
  interactionCapabilities: z.array(interactionCapabilityEntrySchema),
});
