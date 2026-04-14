import { z } from "zod";
import {
  capabilityProbeResultSchema,
  type CapabilityProbeResult,
} from "./probe.js";
import { capabilityEngineIdSchema } from "./schema.js";

export const capabilityProbeTargetSchema = z.object({
  id: z.string().trim().min(1),
  engine: capabilityEngineIdSchema,
  sourceUrl: z.url(),
  siteId: z.string().trim().min(1).optional(),
  notes: z.array(z.string().trim().min(1)).optional(),
});

export type CapabilityProbeTarget = z.infer<typeof capabilityProbeTargetSchema>;

export const capabilityProbeRecordSchema = capabilityProbeResultSchema.extend({
  targetId: z.string().trim().min(1),
});

export type CapabilityProbeRecord = z.infer<typeof capabilityProbeRecordSchema>;

export const capabilityProbeSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.iso.datetime(),
  targets: z.array(capabilityProbeTargetSchema),
  records: z.array(capabilityProbeRecordSchema),
  summary: z.object({
    total: z.number().int().nonnegative(),
    works: z.number().int().nonnegative(),
    worksWithAuth: z.number().int().nonnegative(),
    unstable: z.number().int().nonnegative(),
    broken: z.number().int().nonnegative(),
  }),
});

export type CapabilityProbeSnapshot = z.infer<typeof capabilityProbeSnapshotSchema>;

export const createCapabilityProbeRecord = (
  target: CapabilityProbeTarget,
  result: CapabilityProbeResult,
): CapabilityProbeRecord => capabilityProbeRecordSchema.parse({
  ...result,
  targetId: target.id,
});

export const summarizeCapabilityProbeRecords = (
  records: readonly CapabilityProbeRecord[],
): CapabilityProbeSnapshot["summary"] => {
  const summary = {
    total: records.length,
    works: 0,
    worksWithAuth: 0,
    unstable: 0,
    broken: 0,
  };

  for (const record of records) {
    switch (record.status) {
      case "works":
        summary.works += 1;
        break;
      case "works_with_auth":
        summary.worksWithAuth += 1;
        break;
      case "unstable":
        summary.unstable += 1;
        break;
      case "broken":
      case "forbidden":
      case "unknown":
      default:
        summary.broken += 1;
        break;
    }
  }

  return summary;
};

export const createCapabilityProbeSnapshot = (input: {
  generatedAt?: string;
  targets: readonly CapabilityProbeTarget[];
  records: readonly CapabilityProbeRecord[];
}): CapabilityProbeSnapshot => capabilityProbeSnapshotSchema.parse({
  schemaVersion: 1,
  generatedAt: input.generatedAt ?? new Date().toISOString(),
  targets: input.targets,
  records: input.records,
  summary: summarizeCapabilityProbeRecords(input.records),
});
