import { z } from "zod";
import { mediaCandidateSchema } from "./raw-download-input-schema.js";

const baseIntentSchema = z.object({
  siteId: z.string().trim().min(1),
  originalUrl: z.url(),
  pageUrl: z.url().optional(),
  title: z.string().trim().optional(),
  cookies: z.string().trim().optional(),
  userAgent: z.string().trim().optional(),
  referer: z.string().trim().optional(),
  priority: z.number().int(),
  candidates: z.array(mediaCandidateSchema),
  selectionScope: z.enum(["current_item", "playlist"]).optional(),
  ytdlpQuality: z.enum(["best", "balanced", "data_saver"]).optional(),
  extensionData: z.record(z.string(), z.unknown()).optional(),
});

export const videoDownloadIntentSchema = baseIntentSchema.extend({
  type: z.literal("video"),
  preferredFormat: z.enum(["mp4", "webm", "best"]),
  clipStartSec: z.number().finite().nonnegative().optional(),
  clipEndSec: z.number().finite().nonnegative().optional(),
});

export const imageDownloadIntentSchema = baseIntentSchema.extend({
  type: z.literal("image"),
  saveAsAlbum: z.boolean().optional(),
});

export const segmentDownloadIntentSchema = baseIntentSchema.extend({
  type: z.literal("segment"),
  startTime: z.number().finite().nonnegative(),
  endTime: z.number().finite().nonnegative(),
});

export const batchDownloadIntentSchema = baseIntentSchema.extend({
  type: z.literal("batch"),
  itemCountHint: z.number().int().nonnegative().optional(),
});

export const directDownloadIntentSchema = baseIntentSchema.extend({
  type: z.literal("direct"),
  directUrl: z.url(),
});

export const downloadIntentSchema = z.discriminatedUnion("type", [
  videoDownloadIntentSchema,
  imageDownloadIntentSchema,
  segmentDownloadIntentSchema,
  batchDownloadIntentSchema,
  directDownloadIntentSchema,
]);
