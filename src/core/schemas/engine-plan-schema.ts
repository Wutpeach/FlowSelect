import { z } from "zod";

const downloadFailureClassificationSchema = z.enum([
  "retry_same_engine",
  "fallback_to_other_engine",
  "terminal_for_site",
  "input_invalid",
  "auth_required",
  "cancelled",
]);

export const enginePlanSchema = z.object({
  engine: z.enum(["yt-dlp", "gallery-dl", "direct"]),
  priority: z.number().int(),
  when: z.enum(["primary", "fallback"]),
  reason: z.string().trim().min(1),
  sourceUrl: z.url().optional(),
  fallbackOn: z.union([
    z.literal("any"),
    z.array(z.string().trim().min(1)),
  ]).optional(),
  fallbackOnClassifications: z.array(downloadFailureClassificationSchema).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});
