import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  createCapabilityProbeRecord,
  createCapabilityProbeSnapshot,
  capabilityProbeTargetSchema,
  type CapabilityProbeTarget,
} from "../src/download-capabilities/probe-snapshot.js";
import { runCapabilityProbe } from "../src/download-capabilities/probe.js";
import type { CapabilityProbeRecord } from "../src/download-capabilities/probe-snapshot.js";

type ParsedArgs = Record<string, string>;

const repoRoot = process.cwd();
const defaultTargetsPath = path.join(repoRoot, "src", "assets", "capabilities-probe-targets.json");
const defaultOutputPath = path.join(repoRoot, "src", "assets", "capabilities-probe.json");
const DEFAULT_TIMEOUT_MS = 45_000;

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

const resolveRuntimeTarget = (
  platformName: NodeJS.Platform = process.platform,
  archName: NodeJS.Architecture = process.arch,
): string => {
  if (platformName === "win32" && archName === "x64") {
    return "x86_64-pc-windows-msvc";
  }
  if (platformName === "darwin" && archName === "arm64") {
    return "aarch64-apple-darwin";
  }
  if (platformName === "darwin" && archName === "x64") {
    return "x86_64-apple-darwin";
  }
  throw new Error(`Unsupported probe runtime target: ${platformName}-${archName}`);
};

const executableExtensionFor = (platformName: NodeJS.Platform = process.platform): string => (
  platformName === "win32" ? ".exe" : ""
);

const resolveBinaryPath = (engine: "yt-dlp" | "gallery-dl"): string => {
  const target = resolveRuntimeTarget();
  return path.join(
    repoRoot,
    "desktop-assets",
    "binaries",
    `${engine}-${target}${executableExtensionFor()}`,
  );
};

const executeCommandProbe = async (
  binaryPath: string,
  args: string[],
  options?: { signal?: AbortSignal },
): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> => await new Promise((resolve, reject) => {
  const child = spawn(binaryPath, args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    signal: options?.signal,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer | string) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });
  child.on("error", reject);
  child.on("close", (exitCode) => {
    resolve({
      exitCode,
      stdout,
      stderr,
    });
  });
});

const loadTargets = async (inputPath: string): Promise<CapabilityProbeTarget[]> => {
  const raw = await readFile(inputPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Probe targets file must contain a JSON array");
  }
  return parsed.map((entry) => capabilityProbeTargetSchema.parse(entry));
};

const createErroredRecord = (
  target: CapabilityProbeTarget,
  error: unknown,
  timedOut: boolean,
): CapabilityProbeRecord => createCapabilityProbeRecord(target, {
  engine: target.engine,
  sourceUrl: target.sourceUrl,
  siteId: target.siteId,
  status: timedOut ? "unstable" : "broken",
  authRequirement: "unknown",
  classification: timedOut ? "retry_same_engine" : "terminal_for_site",
  transport: target.engine === "direct" ? "head_request" : "command",
  executedAt: new Date().toISOString(),
  summary: error instanceof Error ? error.message : String(error),
});

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input
    ? path.resolve(repoRoot, args.input)
    : defaultTargetsPath;
  const outputPath = args.output
    ? path.resolve(repoRoot, args.output)
    : defaultOutputPath;
  const timeoutMs = (() => {
    const value = Number(args.timeoutMs ?? args.timeout_ms ?? DEFAULT_TIMEOUT_MS);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
  })();
  const targets = await loadTargets(inputPath);

  const records: CapabilityProbeRecord[] = [];
  for (const target of targets) {
    console.log(`>>> [CapabilityProbe] probing ${target.id} (${target.engine})`);
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort(new Error(`Probe timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      const result = await runCapabilityProbe(
        target.engine,
        target.engine === "direct"
          ? {
              sourceUrl: target.sourceUrl,
              siteId: target.siteId,
              signal: controller.signal,
            }
          : {
              sourceUrl: target.sourceUrl,
              siteId: target.siteId,
              binaryPath: resolveBinaryPath(target.engine),
              signal: controller.signal,
            },
        {
          execute: executeCommandProbe,
          fetch: globalThis.fetch,
        },
      );
      records.push(createCapabilityProbeRecord(target, result));
    } catch (error) {
      const timedOut = controller.signal.aborted;
      records.push(createErroredRecord(target, error, timedOut));
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  const snapshot = createCapabilityProbeSnapshot({
    targets,
    records,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    outputPath,
    total: snapshot.summary.total,
    works: snapshot.summary.works,
    worksWithAuth: snapshot.summary.worksWithAuth,
    unstable: snapshot.summary.unstable,
    broken: snapshot.summary.broken,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
