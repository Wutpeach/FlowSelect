import { promises as fs } from "node:fs";
import path from "node:path";
import type { ElectronRuntimeEnvironment, RuntimeLogger } from "./contracts.js";
import {
  createDownloadTelemetryEvent,
  downloadTelemetryEventSchema,
} from "../download-capabilities/telemetry.js";
import type { DownloadTelemetryEvent } from "../download-capabilities/telemetry.js";

const DOWNLOAD_TELEMETRY_RELATIVE_PATH = path.join(
  "telemetry",
  "download-outcomes.jsonl",
);

const NOOP_LOGGER: RuntimeLogger = {
  log() {
    // no-op
  },
};

export interface DownloadTelemetrySink {
  record(event: DownloadTelemetryEvent): Promise<void>;
}

export const resolveDownloadTelemetryPath = (
  environment: ElectronRuntimeEnvironment,
): string => path.join(environment.configDir, DOWNLOAD_TELEMETRY_RELATIVE_PATH);

export const createJsonlDownloadTelemetrySink = (
  filePath: string,
  logger: RuntimeLogger = NOOP_LOGGER,
): DownloadTelemetrySink => {
  let writeChain: Promise<void> = Promise.resolve();

  return {
    async record(event: DownloadTelemetryEvent): Promise<void> {
      const parsed = downloadTelemetryEventSchema.parse(event);
      writeChain = writeChain
        .then(async () => {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.appendFile(filePath, `${JSON.stringify(parsed)}\n`, "utf8");
        })
        .catch((error) => {
          logger.log(`>>> [Telemetry] Failed to write download telemetry: ${String(error)}`);
        });
      await writeChain;
    },
  };
};

export const createDownloadTelemetrySink = (
  environment: ElectronRuntimeEnvironment,
  logger?: RuntimeLogger,
): DownloadTelemetrySink => createJsonlDownloadTelemetrySink(
  resolveDownloadTelemetryPath(environment),
  logger,
);

export { createDownloadTelemetryEvent };
