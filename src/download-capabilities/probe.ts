import { z } from "zod";
import {
  DownloadRuntimeError,
  type DownloadFailureClassification,
} from "../core/index.js";
import {
  capabilityAuthRequirementSchema,
  capabilityEngineIdSchema,
  capabilityProbeStatusSchema,
} from "./schema.js";
import type {
  CapabilityAuthRequirement,
  CapabilityEngineId,
  CapabilityProbeStatus,
} from "./types.js";

const PROBE_OUTPUT_TAIL_LIMIT = 20;

const downloadFailureClassificationSchema = z.enum([
  "retry_same_engine",
  "fallback_to_other_engine",
  "terminal_for_site",
  "input_invalid",
  "auth_required",
  "cancelled",
]);

const capabilityProbeTransportSchema = z.enum([
  "command",
  "head_request",
  "range_request",
]);

export type CapabilityProbeTransport = z.infer<typeof capabilityProbeTransportSchema>;

export const capabilityProbeResultSchema = z.object({
  engine: capabilityEngineIdSchema,
  sourceUrl: z.url(),
  siteId: z.string().trim().min(1).optional(),
  status: capabilityProbeStatusSchema,
  authRequirement: capabilityAuthRequirementSchema,
  classification: downloadFailureClassificationSchema.nullable(),
  transport: capabilityProbeTransportSchema,
  executedAt: z.iso.datetime(),
  summary: z.string().trim().min(1),
  exitCode: z.number().int().nullable().optional(),
  command: z.array(z.string().trim().min(1)).optional(),
  extractorId: z.string().trim().min(1).optional(),
  httpStatus: z.number().int().positive().optional(),
  stdoutTail: z.array(z.string().trim().min(1)).optional(),
  stderrTail: z.array(z.string().trim().min(1)).optional(),
  notes: z.array(z.string().trim().min(1)).optional(),
});

export type CapabilityProbeResult = z.infer<typeof capabilityProbeResultSchema>;

export type CapabilityProbeInput = {
  sourceUrl: string;
  siteId?: string;
  signal?: AbortSignal;
};

export type CapabilityCommandProbeInput = CapabilityProbeInput & {
  binaryPath: string;
};

export type CommandProbeExecutor = (
  binaryPath: string,
  args: string[],
  options?: { signal?: AbortSignal },
) => Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}>;

export type FetchProbeExecutor = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

const appendTail = (value: string): string[] => value
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .slice(-PROBE_OUTPUT_TAIL_LIMIT);

const summarizeCommandFailure = (
  engine: CapabilityEngineId,
  exitCode: number | null,
  stdoutTail: string[],
  stderrTail: string[],
): string => {
  const detail = stderrTail[stderrTail.length - 1] ?? stdoutTail[stdoutTail.length - 1];
  const prefix = `${engine} probe exited with code ${exitCode ?? "unknown"}`;
  return detail ? `${prefix}: ${detail}` : prefix;
};

const summarizeHttpProbeFailure = (
  status: number,
  contentType: string | null,
): string => {
  const contentSuffix = contentType ? ` (${contentType})` : "";
  return `Direct probe returned HTTP ${status}${contentSuffix}`;
};

const parseYtDlpJsonPayload = (stdout: string): Record<string, unknown> | null => {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const resolveProbeStatusFromClassification = (
  classification: DownloadFailureClassification | null,
): CapabilityProbeStatus => {
  switch (classification) {
    case "auth_required":
      return "works_with_auth";
    case "retry_same_engine":
      return "unstable";
    case "fallback_to_other_engine":
    case "terminal_for_site":
    case "input_invalid":
    case "cancelled":
    default:
      return "broken";
  }
};

const resolveAuthRequirementFromStatus = (
  status: CapabilityProbeStatus,
): CapabilityAuthRequirement => (
  status === "works_with_auth" ? "required" : "unknown"
);

const createCommandFailureProbeResult = (
  engine: CapabilityEngineId,
  input: CapabilityCommandProbeInput,
  transport: CapabilityProbeTransport,
  exitCode: number | null,
  stdoutTail: string[],
  stderrTail: string[],
): CapabilityProbeResult => {
  const summary = summarizeCommandFailure(engine, exitCode, stdoutTail, stderrTail);
  const error = new DownloadRuntimeError("E_EXECUTION_FAILED", summary, {
    context: {
      stdoutTail,
      stderrTail,
    },
  });
  const status = resolveProbeStatusFromClassification(error.classification);

  return capabilityProbeResultSchema.parse({
    engine,
    sourceUrl: input.sourceUrl,
    siteId: input.siteId,
    status,
    authRequirement: resolveAuthRequirementFromStatus(status),
    classification: error.classification,
    transport,
    executedAt: new Date().toISOString(),
    summary,
    exitCode,
    command: [],
    stdoutTail,
    stderrTail,
  });
};

export const buildYtDlpProbeArgs = (sourceUrl: string): string[] => [
  "--simulate",
  "--skip-download",
  "--dump-single-json",
  "--no-warnings",
  "--ignore-config",
  sourceUrl,
];

export const buildGalleryDlProbeArgs = (sourceUrl: string): string[] => [
  "--simulate",
  "--verbose",
  sourceUrl,
];

export const runYtDlpProbe = async (
  input: CapabilityCommandProbeInput,
  execute: CommandProbeExecutor,
): Promise<CapabilityProbeResult> => {
  const command = buildYtDlpProbeArgs(input.sourceUrl);
  const result = await execute(input.binaryPath, command, {
    signal: input.signal,
  });
  const stdoutTail = appendTail(result.stdout);
  const stderrTail = appendTail(result.stderr);

  if (result.exitCode === 0) {
    const payload = parseYtDlpJsonPayload(result.stdout);
    const extractorId = typeof payload?.extractor_key === "string"
      ? payload.extractor_key
      : undefined;

    return capabilityProbeResultSchema.parse({
      engine: "yt-dlp",
      sourceUrl: input.sourceUrl,
      siteId: input.siteId,
      status: "works",
      authRequirement: "optional",
      classification: null,
      transport: "command",
      executedAt: new Date().toISOString(),
      summary: extractorId
        ? `yt-dlp probe resolved metadata with extractor ${extractorId}`
        : "yt-dlp probe resolved metadata",
      exitCode: 0,
      command,
      extractorId,
      stdoutTail,
      stderrTail,
    });
  }

  const failure = createCommandFailureProbeResult(
    "yt-dlp",
    input,
    "command",
    result.exitCode,
    stdoutTail,
    stderrTail,
  );

  return {
    ...failure,
    command,
  };
};

export const runGalleryDlProbe = async (
  input: CapabilityCommandProbeInput,
  execute: CommandProbeExecutor,
): Promise<CapabilityProbeResult> => {
  const command = buildGalleryDlProbeArgs(input.sourceUrl);
  const result = await execute(input.binaryPath, command, {
    signal: input.signal,
  });
  const stdoutTail = appendTail(result.stdout);
  const stderrTail = appendTail(result.stderr);

  if (result.exitCode === 0) {
    const extractorLine = stderrTail
      .find((line) => /\bextractor\b/i.test(line))
      ?? stdoutTail.find((line) => /\bextractor\b/i.test(line));
    const extractorId = extractorLine?.match(/\bextractor\b[:=]?\s*([A-Za-z0-9_.-]+)/i)?.[1];

    return capabilityProbeResultSchema.parse({
      engine: "gallery-dl",
      sourceUrl: input.sourceUrl,
      siteId: input.siteId,
      status: "works",
      authRequirement: "optional",
      classification: null,
      transport: "command",
      executedAt: new Date().toISOString(),
      summary: extractorId
        ? `gallery-dl probe resolved extractor ${extractorId}`
        : "gallery-dl probe completed without downloading media",
      exitCode: 0,
      command,
      extractorId,
      stdoutTail,
      stderrTail,
    });
  }

  const failure = createCommandFailureProbeResult(
    "gallery-dl",
    input,
    "command",
    result.exitCode,
    stdoutTail,
    stderrTail,
  );

  return {
    ...failure,
    command,
  };
};

const isDirectProbeTextishContentType = (value: string | null): boolean => {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();
  return normalized.includes("application/json")
    || normalized.includes("application/vnd.apple.mpegurl")
    || normalized.includes("application/x-mpegurl")
    || normalized.startsWith("text/");
};

const createDirectProbeResult = (
  input: CapabilityProbeInput,
  transport: CapabilityProbeTransport,
  response: Response,
): CapabilityProbeResult => {
  const contentType = response.headers.get("content-type");
  if (response.ok && !isDirectProbeTextishContentType(contentType)) {
    return capabilityProbeResultSchema.parse({
      engine: "direct",
      sourceUrl: input.sourceUrl,
      siteId: input.siteId,
      status: "works",
      authRequirement: "none",
      classification: null,
      transport,
      executedAt: new Date().toISOString(),
      summary: "Direct probe confirmed a readable media response",
      httpStatus: response.status,
      notes: contentType ? [`content-type=${contentType}`] : undefined,
    });
  }

  const summary = summarizeHttpProbeFailure(response.status, contentType);
  const classification = (() => {
    if (response.status === 401 || response.status === 403) {
      return "auth_required" as const;
    }
    if (response.status === 429 || response.status >= 500) {
      return "retry_same_engine" as const;
    }
    return "terminal_for_site" as const;
  })();
  const status = resolveProbeStatusFromClassification(classification);

  return capabilityProbeResultSchema.parse({
    engine: "direct",
    sourceUrl: input.sourceUrl,
    siteId: input.siteId,
    status,
    authRequirement: resolveAuthRequirementFromStatus(status),
    classification,
    transport,
    executedAt: new Date().toISOString(),
    summary,
    httpStatus: response.status,
    notes: contentType ? [`content-type=${contentType}`] : undefined,
  });
};

export const runDirectProbe = async (
  input: CapabilityProbeInput,
  fetchImpl: FetchProbeExecutor,
): Promise<CapabilityProbeResult> => {
  const headResponse = await fetchImpl(input.sourceUrl, {
    method: "HEAD",
    signal: input.signal,
  });

  if (headResponse.status !== 405 && headResponse.status !== 501) {
    return createDirectProbeResult(input, "head_request", headResponse);
  }

  const rangeResponse = await fetchImpl(input.sourceUrl, {
    method: "GET",
    headers: {
      Range: "bytes=0-0",
    },
    signal: input.signal,
  });

  return createDirectProbeResult(input, "range_request", rangeResponse);
};

export const runCapabilityProbe = async (
  engine: CapabilityEngineId,
  input: CapabilityCommandProbeInput | CapabilityProbeInput,
  options: {
    execute?: CommandProbeExecutor;
    fetch?: FetchProbeExecutor;
  },
): Promise<CapabilityProbeResult> => {
  switch (engine) {
    case "yt-dlp":
      if (!("binaryPath" in input) || !options.execute) {
        throw new Error("yt-dlp probe requires a binaryPath and execute() implementation");
      }
      return runYtDlpProbe(input, options.execute);
    case "gallery-dl":
      if (!("binaryPath" in input) || !options.execute) {
        throw new Error("gallery-dl probe requires a binaryPath and execute() implementation");
      }
      return runGalleryDlProbe(input, options.execute);
    case "direct":
      if (!options.fetch) {
        throw new Error("Direct probe requires a fetch() implementation");
      }
      return runDirectProbe(input, options.fetch);
    default:
      throw new Error(`Unsupported probe engine: ${engine satisfies never}`);
  }
};
