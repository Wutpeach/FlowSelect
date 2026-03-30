import { z } from "zod";

export const mediaCandidateSchema = z.object({
  url: z.url(),
  type: z.string().trim().optional(),
  source: z.string().trim().optional(),
  confidence: z.string().trim().optional(),
  mediaType: z.enum(["video", "image"]).optional(),
});

export const rawDownloadInputSchema = z.object({
  url: z.url(),
  pageUrl: z.url().optional(),
  videoUrl: z.url().optional(),
  videoCandidates: z.array(mediaCandidateSchema).optional(),
  title: z.string().trim().optional(),
  cookies: z.string().trim().optional(),
  selectionScope: z.enum(["current_item", "playlist"]).optional(),
  clipStartSec: z.number().finite().nonnegative().optional(),
  clipEndSec: z.number().finite().nonnegative().optional(),
  ytdlpQuality: z.enum(["best", "balanced", "data_saver"]).optional(),
  siteHint: z.string().trim().optional(),
  diagnostics: z.record(z.string(), z.unknown()).optional(),
});
