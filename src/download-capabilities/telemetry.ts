import { z } from "zod";
import type {
  DownloadFailureClassification,
  DownloadRuntimeError,
  RawDownloadInput,
  ResolvedDownloadPlan,
} from "../core/index.js";
import { resolveSiteHint } from "../core/index.js";
import { capabilityEngineIdSchema, interactionModeSchema } from "./schema.js";

export const downloadTelemetryInteractionModeSchema = z.union([
  interactionModeSchema,
  z.literal("unknown"),
]);

export const downloadTelemetryEventSchema = z.object({
  schemaVersion: z.literal(1),
  eventType: z.literal("download_outcome"),
  recordedAt: z.iso.datetime(),
  traceId: z.string().trim().min(1),
  siteId: z.string().trim().min(1),
  providerId: z.string().trim().min(1),
  interactionMode: downloadTelemetryInteractionModeSchema,
  engineChain: z.array(capabilityEngineIdSchema),
  chosenEngine: capabilityEngineIdSchema.nullable(),
  outcome: z.enum(["success", "failure"]),
  errorCode: z.string().trim().min(1).nullable(),
  errorClassification: z.enum([
    "retry_same_engine",
    "fallback_to_other_engine",
    "terminal_for_site",
    "input_invalid",
    "auth_required",
    "cancelled",
  ]).nullable(),
  errorMessage: z.string().trim().min(1).nullable(),
});

export type DownloadTelemetryInteractionMode = z.infer<
  typeof downloadTelemetryInteractionModeSchema
>;
export type DownloadTelemetryEvent = z.infer<typeof downloadTelemetryEventSchema>;

const resolveDiagnosticsSource = (request: RawDownloadInput): string | undefined => {
  const diagnostics = request.diagnostics;
  if (!diagnostics || typeof diagnostics !== "object") {
    return undefined;
  }

  const source = diagnostics.source;
  return typeof source === "string" ? source.trim().toLowerCase() : undefined;
};

export const resolveDownloadTelemetryInteractionMode = (
  request: RawDownloadInput,
): DownloadTelemetryInteractionMode => {
  const source = resolveDiagnosticsSource(request);
  if ((request as { dragDiagnostic?: unknown }).dragDiagnostic) {
    return "drag";
  }
  if (source === "context_menu") {
    return "context_menu";
  }
  if (source === "popup" || source === "injected_button" || source === "page_action") {
    return "injected_button";
  }
  if (request.pageUrl || request.url) {
    return "paste";
  }
  return "unknown";
};

const resolveTelemetrySiteId = (
  request: RawDownloadInput,
  plan: ResolvedDownloadPlan | null | undefined,
): string => (
  plan?.intent.siteId
  || resolveSiteHint(
    request.siteHint,
    request.pageUrl,
    request.url,
    request.videoUrl,
  )
  || "unknown"
);

export const createDownloadTelemetryEvent = (input: {
  traceId: string;
  request: RawDownloadInput;
  plan?: ResolvedDownloadPlan | null;
  chosenEngine?: ResolvedDownloadPlan["engines"][number]["engine"] | null;
  error?: Pick<DownloadRuntimeError, "code" | "classification" | "message"> | null;
}): DownloadTelemetryEvent => downloadTelemetryEventSchema.parse({
  schemaVersion: 1,
  eventType: "download_outcome",
  recordedAt: new Date().toISOString(),
  traceId: input.traceId,
  siteId: resolveTelemetrySiteId(input.request, input.plan),
  providerId: input.plan?.providerId ?? "unresolved",
  interactionMode: resolveDownloadTelemetryInteractionMode(input.request),
  engineChain: input.plan?.engines.map((enginePlan) => enginePlan.engine) ?? [],
  chosenEngine: input.chosenEngine ?? null,
  outcome: input.error ? "failure" : "success",
  errorCode: input.error?.code ?? null,
  errorClassification: input.error?.classification ?? null,
  errorMessage: input.error?.message ?? null,
});

export const isFailureTelemetryClassification = (
  value: DownloadFailureClassification | null,
): value is DownloadFailureClassification => value !== null;
