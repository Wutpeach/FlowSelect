import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  sanitizeDiagnosticText,
  sanitizeDiagnosticValue,
} from "../src/core/index.js";
import type { RuntimeDependencyStatusSnapshot } from "../src/types/runtimeDependencies.js";
import {
  projectRedactedPath,
  projectSafeEnvironment,
  projectSafeRuntimeStatus,
  projectSafeSettings,
  type SafeSupportEnvironment,
  type SupportLogEnvironment,
} from "./supportLogSnapshot.mjs";

export type ExportSupportLogOptions = {
  environment: SupportLogEnvironment;
  readConfigObject(): Promise<Record<string, unknown>>;
  getRuntimeDependencyStatus(): Promise<RuntimeDependencyStatusSnapshot>;
  readRecentRuntimeLogLines(): Promise<string[]>;
  now?(): Date;
};

const RUNTIME_LOG_LINE_LIMIT = 800;

export const buildSupportLogText = async (
  options: ExportSupportLogOptions,
): Promise<string> => {
  const [config, runtimeStatus, recentRuntimeLogLines] = await Promise.all([
    options.readConfigObject(),
    options.getRuntimeDependencyStatus(),
    options.readRecentRuntimeLogLines(),
  ]);

  const environment = sanitizeDiagnosticValue(
    projectSafeEnvironment(options.environment),
  ) as SafeSupportEnvironment;
  const safeSettings = sanitizeDiagnosticValue(projectSafeSettings(config));
  const safeRuntime = sanitizeDiagnosticValue(projectSafeRuntimeStatus(runtimeStatus));
  const boundedEvidence = recentRuntimeLogLines
    .slice(-RUNTIME_LOG_LINE_LIMIT)
    .map((line) => sanitizeDiagnosticText(line, 4_000));

  const lines = [
    "Ameow Support Log",
    "formatVersion=2",
    `generatedAt=${(options.now?.() ?? new Date()).toISOString()}`,
    "privacy=allowlist projection with recursive sanitization at egress",
    "",
    "[environment]",
    `appVersion=${environment.appVersion}`,
    `platform=${environment.platform}`,
    `arch=${environment.arch}`,
    `isPackaged=${environment.isPackaged}`,
    `configPath=${projectRedactedPath(environment.configPathPresent)}`,
    `logDir=${projectRedactedPath(environment.logDirPresent)}`,
    `runtimeLogPath=${projectRedactedPath(environment.runtimeLogPathPresent)}`,
    "",
    "[settings]",
    JSON.stringify(safeSettings, null, 2),
    "",
    "[runtime]",
    JSON.stringify(safeRuntime, null, 2),
    "",
    "[recent-runtime-log]",
    ...(boundedEvidence.length > 0
      ? boundedEvidence
      : ["<no runtime log lines captured>"]),
    "",
  ];
  return `${lines.join("\n")}\n`;
};

export const exportSupportLogFile = async (
  options: ExportSupportLogOptions,
): Promise<string> => {
  const timestamp = (options.now?.() ?? new Date()).toISOString().replace(/[:.]/g, "-");
  const outputPath = join(options.environment.logDir, `support-${timestamp}.txt`);
  await writeFile(outputPath, await buildSupportLogText(options), "utf8");
  return outputPath;
};
