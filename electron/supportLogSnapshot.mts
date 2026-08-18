import { sanitizeDiagnosticText } from "../src/core/index.js";
import type {
  RuntimeDependencyStatusEntry,
  RuntimeDependencyStatusSnapshot,
} from "../src/types/runtimeDependencies.js";

/**
 * Allowlist-first safe projections for the Support Log export. Each builder
 * maps owner-authoritative facts into a small, explicitly selected safe
 * shape; unknown open config/context keys are never carried over. Values are
 * further bounded/scrubbed by the shared recursive sanitizer at final egress.
 */

export type SupportLogEnvironment = {
  appVersion: string;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  isPackaged: boolean;
  configPath: string;
  logDir: string;
  runtimeLogPath: string;
};

export type SafeSupportEnvironment = {
  appVersion: string;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  isPackaged: boolean;
  configPathPresent: boolean;
  logDirPresent: boolean;
  runtimeLogPathPresent: boolean;
};

export const projectSafeEnvironment = (
  environment: SupportLogEnvironment,
): SafeSupportEnvironment => ({
  appVersion: environment.appVersion,
  platform: environment.platform,
  arch: environment.arch,
  isPackaged: environment.isPackaged,
  configPathPresent: Boolean(environment.configPath),
  logDirPresent: Boolean(environment.logDir),
  runtimeLogPathPresent: Boolean(environment.runtimeLogPath),
});

const REDACTED_PATH = "[REDACTED_PATH]";
const UNSET = "<unset>";

export const projectRedactedPath = (present: boolean): string => (
  present ? REDACTED_PATH : UNSET
);

export type SafeSupportSettings = {
  language?: string;
  theme?: string;
  shortcut?: string;
  renameMediaOnDownload?: boolean;
  videoKeepOriginalName?: boolean;
  renameRulePreset?: string;
  renamePrefix?: string;
  renameSuffix?: string;
  networkProxyMode?: string;
  defaultVideoDownloadQuality?: string;
  ytdlpQualityPreference?: string;
  aePortalEnabled?: boolean;
  extensionInjectionDebugEnabled?: boolean;
  receivePrereleaseUpdates?: boolean;
  /** Presence facts for sensitive/location values; the values never egress. */
  outputPathConfigured?: boolean;
  networkProxyConfigured?: boolean;
  aeExePathConfigured?: boolean;
};

const stringOrUndefined = (value: unknown): string | undefined => (
  typeof value === "string" && value.trim() ? value.trim() : undefined
);

const booleanOrUndefined = (value: unknown): boolean | undefined => (
  typeof value === "boolean" ? value : undefined
);

const pathConfigured = (value: unknown): boolean | undefined => (
  typeof value === "string" && value.trim() ? true : undefined
);

/**
 * Explicit allowlist of diagnostics-relevant safe settings facts. Sensitive
 * location/endpoint values (output path, proxy endpoint, AE executable path)
 * are reduced to presence booleans; everything else is selected by key.
 */
export const projectSafeSettings = (
  config: Record<string, unknown>,
): SafeSupportSettings => ({
  language: stringOrUndefined(config.language),
  theme: stringOrUndefined(config.theme),
  shortcut: stringOrUndefined(config.shortcut),
  renameMediaOnDownload: booleanOrUndefined(config.renameMediaOnDownload),
  videoKeepOriginalName: booleanOrUndefined(config.videoKeepOriginalName),
  renameRulePreset: stringOrUndefined(config.renameRulePreset),
  renamePrefix: stringOrUndefined(config.renamePrefix),
  renameSuffix: stringOrUndefined(config.renameSuffix),
  networkProxyMode: stringOrUndefined(config.networkProxyMode),
  defaultVideoDownloadQuality: stringOrUndefined(config.defaultVideoDownloadQuality),
  ytdlpQualityPreference: stringOrUndefined(config.ytdlpQualityPreference),
  aePortalEnabled: booleanOrUndefined(config.aePortalEnabled),
  extensionInjectionDebugEnabled: booleanOrUndefined(config.extensionInjectionDebugEnabled),
  receivePrereleaseUpdates: booleanOrUndefined(config.receivePrereleaseUpdates),
  outputPathConfigured: pathConfigured(config.outputPath),
  networkProxyConfigured: pathConfigured(config.networkProxyUrl),
  aeExePathConfigured: pathConfigured(config.aeExePath),
});

export type SafeRuntimeStatusEntry = {
  state: RuntimeDependencyStatusEntry["state"] | null;
  source: RuntimeDependencyStatusEntry["source"];
  expectedSource?: RuntimeDependencyStatusEntry["expectedSource"];
  fallbackSource?: RuntimeDependencyStatusEntry["fallbackSource"];
  pathPresent: boolean;
  fallbackPathPresent?: boolean;
  /** Sanitized bounded error text; executable paths never egress. */
  error: string | null;
};

export type SafeRuntimeStatus = {
  python?: SafeRuntimeStatusEntry;
  ytDlp?: SafeRuntimeStatusEntry;
  galleryDl?: SafeRuntimeStatusEntry;
  ffmpeg?: SafeRuntimeStatusEntry;
  deno?: SafeRuntimeStatusEntry;
};

const RUNTIME_COMPONENTS = [
  "python",
  "ytDlp",
  "galleryDl",
  "ffmpeg",
  "deno",
] as const;

/**
 * Replaces raw runtime-dependency paths/errors with state/source/presence
 * facts plus sanitized bounded error text.
 */
export const projectSafeRuntimeStatus = (
  status: RuntimeDependencyStatusSnapshot,
): SafeRuntimeStatus => {
  const projected: SafeRuntimeStatus = {};
  for (const name of RUNTIME_COMPONENTS) {
    const entry = status?.[name];
    if (!entry) {
      continue;
    }
    projected[name] = {
      state: entry.state,
      source: entry.source,
      expectedSource: entry.expectedSource,
      fallbackSource: entry.fallbackSource,
      pathPresent: Boolean(entry.path),
      fallbackPathPresent: entry.fallbackPath != null ? Boolean(entry.fallbackPath) : undefined,
      error: entry.error ? sanitizeDiagnosticText(entry.error, 480) : null,
    };
  }
  return projected;
};
