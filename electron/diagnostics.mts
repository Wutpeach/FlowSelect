import { constants, existsSync } from "node:fs";
import { access } from "node:fs/promises";

import { sanitizeDiagnosticText } from "../src/core/index.js";
import type { RuntimeBinaryPaths } from "../src/electron-runtime/contracts.js";
import type { VideoQueueStatePayload } from "../src/protocol/download/ipcTypes.js";
import type {
  DiagnosticsRuntimeId,
  DiagnosticsRuntimeSnapshot,
  DiagnosticsSnapshot,
  DiagnosticConclusion,
  DiagnosticEvidenceOrigin,
  DiagnosticFact,
} from "../src/types/diagnostics.js";
import type {
  RuntimeDependencyGateStatePayload,
  RuntimeDependencyStatusEntry,
  RuntimeDependencyStatusSnapshot,
} from "../src/types/runtimeDependencies.js";

type OutputDirectoryInspection = {
  configured: boolean;
  exists: boolean;
  accessible: boolean;
  writable: boolean;
};

type BrowserBridgeInspection = {
  listenerActive: boolean;
  connectedClientCount: number;
  pendingRequestCount: number;
};

type DownloadInspection = Pick<VideoQueueStatePayload, "activeCount" | "pendingCount">;

export type DiagnosticsSnapshotOptions = {
  appVersion: string;
  platform: string;
  arch: string;
  isPackaged: boolean;
  runtimeTarget: string;
  runtimeStatus: RuntimeDependencyStatusSnapshot;
  runtimePaths: RuntimeBinaryPaths;
  runtimeGate: RuntimeDependencyGateStatePayload;
  inspectOutputDirectory(): Promise<OutputDirectoryInspection>;
  inspectBrowserBridge(): BrowserBridgeInspection;
  inspectDownloads(): DownloadInspection;
  readRecentRuntimeLogLines(limit: number): Promise<string[]>;
  isPathPresent(path: string): boolean;
  probeVersion(runtimeId: DiagnosticsRuntimeId, path: string): Promise<string>;
  now?(): Date;
};

const RECENT_DIAGNOSTIC_LIMIT = 8;

const fact = <T,>(
  origin: DiagnosticEvidenceOrigin,
  conclusion: DiagnosticConclusion,
  value: T | null,
  summary: string | null = null,
): DiagnosticFact<T> => ({ origin, conclusion, value, summary });

const runtimeDefinitions: Array<{
  id: DiagnosticsRuntimeId;
  statusKey: keyof RuntimeDependencyStatusSnapshot;
  pathKey: keyof RuntimeBinaryPaths;
  expectedSource: "bundled" | "managed";
}> = [
  { id: "python", statusKey: "python", pathKey: "ytDlp", expectedSource: "bundled" },
  { id: "ytDlp", statusKey: "ytDlp", pathKey: "ytDlp", expectedSource: "managed" },
  { id: "galleryDl", statusKey: "galleryDl", pathKey: "galleryDl", expectedSource: "managed" },
  { id: "ffmpeg", statusKey: "ffmpeg", pathKey: "ffmpeg", expectedSource: "managed" },
  { id: "ffprobe", statusKey: "ffmpeg", pathKey: "ffprobe", expectedSource: "managed" },
  { id: "deno", statusKey: "deno", pathKey: "deno", expectedSource: "managed" },
];

const runtimeEntry = (
  snapshot: RuntimeDependencyStatusSnapshot,
  key: keyof RuntimeDependencyStatusSnapshot,
): RuntimeDependencyStatusEntry => snapshot[key];

const expectedSourceFact = (
  entry: RuntimeDependencyStatusEntry,
  defaultSource: "bundled" | "managed",
): DiagnosticFact<"bundled" | "managed"> => fact(
  "configured",
  "available",
  entry.expectedSource ?? entry.source ?? defaultSource,
);

const currentSourceFact = (
  entry: RuntimeDependencyStatusEntry,
): DiagnosticFact<"bundled" | "managed"> => (
  entry.source
    ? fact("observed", "unknown", entry.source, "Source observation does not prove executable health.")
    : fact<"bundled" | "managed">(
      "observed",
      "unavailable",
      null,
      sanitizeDiagnosticText(entry.error ?? "No current runtime source was observed.", 240),
    )
);

const buildRuntimeSnapshot = async (
  definition: (typeof runtimeDefinitions)[number],
  options: DiagnosticsSnapshotOptions,
): Promise<DiagnosticsRuntimeSnapshot> => {
  const entry = runtimeEntry(options.runtimeStatus, definition.statusKey);
  const path = definition.id === "python"
    ? entry.path
    : options.runtimePaths[definition.pathKey];
  const present = Boolean(path && options.isPathPresent(path));
  const presenceSummary = present
    ? "Executable presence is observed only; it does not prove health."
    : sanitizeDiagnosticText(entry.error ?? "Expected executable was not observed.", 240);

  if (!path || !present) {
    return {
      id: definition.id,
      expectedSource: expectedSourceFact(entry, definition.expectedSource),
      currentSource: currentSourceFact(entry),
      executablePresent: fact("observed", "unavailable", false, presenceSummary),
      version: fact<string>("probed", "unavailable", null, "Version probe was not run because the executable was not observed."),
    };
  }

  try {
    const version = sanitizeDiagnosticText(await options.probeVersion(definition.id, path), 160);
    return {
      id: definition.id,
      expectedSource: expectedSourceFact(entry, definition.expectedSource),
      currentSource: currentSourceFact(entry),
      executablePresent: fact("observed", "unknown", true, presenceSummary),
      version: fact("probed", "available", version),
    };
  } catch (error) {
    return {
      id: definition.id,
      expectedSource: expectedSourceFact(entry, definition.expectedSource),
      currentSource: currentSourceFact(entry),
      executablePresent: fact("observed", "unknown", true, presenceSummary),
      version: fact<string>(
        "probed",
        "degraded",
        null,
        sanitizeDiagnosticText(error instanceof Error ? error.message : String(error), 240),
      ),
    };
  }
};

const gateConclusion = (state: RuntimeDependencyGateStatePayload): DiagnosticConclusion => {
  if (state.phase === "ready") return "available";
  if (state.phase === "failed") return "unavailable";
  if (state.phase === "downloading" || state.phase === "checking") return "unknown";
  return state.missingComponents.length > 0 ? "degraded" : "unknown";
};

/** A no-create output check; permission access never creates a probe file. */
export const inspectOutputDirectoryReadOnly = async (
  path: string,
  configured: boolean,
  fsApi: {
    existsSync(path: string): boolean;
    access(path: string, mode: number): Promise<void>;
  } = { existsSync, access },
): Promise<OutputDirectoryInspection> => {
  const exists = fsApi.existsSync(path);
  if (!exists) {
    return { configured, exists: false, accessible: false, writable: false };
  }

  const [accessible, writable] = await Promise.all([
    fsApi.access(path, constants.R_OK).then(() => true, () => false),
    fsApi.access(path, constants.W_OK).then(() => true, () => false),
  ]);
  return { configured, exists: true, accessible, writable };
};

export const buildDiagnosticsSnapshot = async (
  options: DiagnosticsSnapshotOptions,
): Promise<DiagnosticsSnapshot> => {
  const [runtimes, outputResult, recentResult] = await Promise.all([
    Promise.all(runtimeDefinitions.map((definition) => buildRuntimeSnapshot(definition, options))),
    options.inspectOutputDirectory()
      .then((inspection) => ({ inspection, error: null as string | null }))
      .catch((error) => ({
        inspection: null,
        error: sanitizeDiagnosticText(error instanceof Error ? error.message : String(error), 240),
      })),
    options.readRecentRuntimeLogLines(RECENT_DIAGNOSTIC_LIMIT)
      .then((lines) => ({ lines, error: null as string | null }))
      .catch((error) => ({
        lines: [] as string[],
        error: sanitizeDiagnosticText(error instanceof Error ? error.message : String(error), 240),
      })),
  ]);
  let bridge: BrowserBridgeInspection | null = null;
  let bridgeError: string | null = null;
  let downloads: DownloadInspection | null = null;
  let downloadsError: string | null = null;
  try {
    bridge = options.inspectBrowserBridge();
  } catch (error) {
    bridgeError = sanitizeDiagnosticText(error instanceof Error ? error.message : String(error), 240);
  }
  try {
    downloads = options.inspectDownloads();
  } catch (error) {
    downloadsError = sanitizeDiagnosticText(error instanceof Error ? error.message : String(error), 240);
  }
  const outputSummary = outputResult.inspection?.exists
    ? null
    : "The output directory is not present. Diagnostics did not create it.";

  return {
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    environment: {
      appVersion: fact("observed", "available", options.appVersion),
      platform: fact("observed", "available", options.platform),
      architecture: fact("observed", "available", options.arch),
      packaged: fact("observed", "available", options.isPackaged),
      runtimeTarget: fact("configured", "available", options.runtimeTarget),
    },
    runtimes,
    runtimeGate: fact("observed", gateConclusion(options.runtimeGate), options.runtimeGate),
    outputDirectory: {
      configured: outputResult.error
        ? fact<boolean>("configured", "unknown", null, outputResult.error)
        : fact("configured", "available", outputResult.inspection?.configured ?? false),
      exists: outputResult.error
        ? fact<boolean>("observed", "unknown", null, outputResult.error)
        : fact(
          "observed",
          outputResult.inspection?.exists ? "available" : "unavailable",
          outputResult.inspection?.exists ?? false,
          outputSummary,
        ),
      accessible: fact(
        "probed",
        outputResult.error
          ? "unknown"
          : outputResult.inspection?.accessible
            ? "available"
            : outputResult.inspection?.exists
              ? "degraded"
              : "unavailable",
        outputResult.error ? null : outputResult.inspection?.accessible ?? false,
        outputResult.error
          ?? (outputResult.inspection?.accessible
            ? null
            : outputSummary ?? "The existing output directory could not be read."),
      ),
      writable: outputResult.error
        ? fact<boolean>("probed", "unknown", null, outputResult.error)
        : fact(
          "probed",
          outputResult.inspection?.writable
            ? "available"
            : outputResult.inspection?.exists
              ? "degraded"
              : "unavailable",
          outputResult.inspection?.writable ?? false,
          outputResult.inspection?.writable
            ? "Write permission access is granted; this does not prove a real write."
            : outputSummary ?? "Write permission access was denied; Diagnostics did not create a file.",
        ),
    },
    browserBridge: {
      listener: bridgeError
        ? fact<boolean>("observed", "unknown", null, bridgeError)
        : fact("observed", bridge?.listenerActive ? "available" : "unavailable", bridge?.listenerActive ?? false),
      connectedClients: bridgeError
        ? fact<number>("observed", "unknown", null, bridgeError)
        : fact(
        "observed",
        (bridge?.connectedClientCount ?? 0) > 0 ? "available" : "unavailable",
        bridge?.connectedClientCount ?? 0,
        (bridge?.connectedClientCount ?? 0) > 0 ? null : "No Browser Bridge client is connected.",
      ),
      pendingRequests: bridgeError
        ? fact<number>("observed", "unknown", null, bridgeError)
        : fact("observed", "available", bridge?.pendingRequestCount ?? 0),
    },
    downloads: {
      active: downloadsError
        ? fact<number>("observed", "unknown", null, downloadsError)
        : fact("observed", "available", downloads?.activeCount ?? 0),
      pending: downloadsError
        ? fact<number>("observed", "unknown", null, downloadsError)
        : fact("observed", "available", downloads?.pendingCount ?? 0),
      recentDiagnostics: recentResult.error
        ? fact("observed", "degraded", [], recentResult.error)
        : fact(
          "observed",
          "available",
          recentResult.lines.slice(-RECENT_DIAGNOSTIC_LIMIT).map((line) => sanitizeDiagnosticText(line, 240)),
        ),
    },
  };
};
