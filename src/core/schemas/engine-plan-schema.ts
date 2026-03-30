import { z } from "zod";

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
  options: z.record(z.string(), z.unknown()).optional(),
});
