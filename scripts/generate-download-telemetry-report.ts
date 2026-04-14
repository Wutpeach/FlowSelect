import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { downloadTelemetryEventSchema } from "../src/download-capabilities/telemetry.js";
import {
  renderDownloadTelemetryReportMarkdown,
  summarizeDownloadTelemetryEvents,
} from "../src/download-capabilities/telemetry-report.js";

type ParsedArgs = Record<string, string>;

const repoRoot = process.cwd();

const parseArgs = (argv: string[]): ParsedArgs => {
  const parsed: ParsedArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
};

const defaultTelemetryInputPath = (): string => {
  switch (process.platform) {
    case "darwin":
      return path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "FlowSelect",
        "telemetry",
        "download-outcomes.jsonl",
      );
    case "win32":
      return path.join(
        process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
        "FlowSelect",
        "telemetry",
        "download-outcomes.jsonl",
      );
    default:
      return path.join(os.homedir(), ".config", "FlowSelect", "telemetry", "download-outcomes.jsonl");
  }
};

const readTelemetryEvents = async (inputPath: string) => {
  const raw = await readFile(inputPath, "utf8").catch(() => "");
  if (!raw.trim()) {
    return [];
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => downloadTelemetryEventSchema.parse(JSON.parse(line) as unknown));
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input
    ? path.resolve(repoRoot, args.input)
    : defaultTelemetryInputPath();
  const outputBase = args.outputDir
    ? path.resolve(repoRoot, args.outputDir)
    : path.join(repoRoot, "build", "download-telemetry-report");
  const outputJsonPath = path.join(outputBase, "report.json");
  const outputMarkdownPath = path.join(outputBase, "report.md");

  const events = await readTelemetryEvents(inputPath);
  const report = summarizeDownloadTelemetryEvents(events);
  const markdown = renderDownloadTelemetryReportMarkdown(report);

  await mkdir(outputBase, { recursive: true });
  await writeFile(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(outputMarkdownPath, markdown, "utf8");

  console.log(JSON.stringify({
    inputPath,
    outputJsonPath,
    outputMarkdownPath,
    total: report.totals.total,
    successRate: report.totals.successRate,
    authHotspots: report.authHotspots.length,
    highRiskEngineCombos: report.highRiskEngineCombos.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
