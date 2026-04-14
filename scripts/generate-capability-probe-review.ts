import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  capabilityProbeSnapshotSchema,
} from "../src/download-capabilities/probe-snapshot.js";
import {
  createCapabilityProbeReviewArtifact,
} from "../src/download-capabilities/probe-review.js";
import { capabilitySeedSchema } from "../src/download-capabilities/schema.js";
import type {
  CapabilitySeed,
  DownloadCapabilityEntry,
  CapabilitySourceEntry,
} from "../src/download-capabilities/types.js";

type ParsedArgs = Record<string, string>;

const repoRoot = process.cwd();
const defaultInputPath = path.join(repoRoot, "src", "assets", "capabilities-probe.json");
const defaultOutputPath = path.join(repoRoot, "build", "capability-probe-review", "review.json");
const defaultGeneratedSeedPath = path.join(repoRoot, "src", "assets", "capabilities-seed.json");
const defaultManualSeedPath = path.join(repoRoot, "src", "assets", "capabilities-manual.json");

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

const loadSeed = async (inputPath: string): Promise<CapabilitySeed> => {
  const raw = await readFile(inputPath, "utf8");
  return capabilitySeedSchema.parse(JSON.parse(raw) as unknown);
};

const createReviewRegistry = (input: {
  generatedSeed: CapabilitySeed;
  manualSeed: CapabilitySeed;
}): {
  seed: {
    sources: readonly CapabilitySourceEntry[];
  };
  listDownloadCapabilities(): readonly DownloadCapabilityEntry[];
} => {
  const sources = [
    ...input.generatedSeed.sources,
    ...input.manualSeed.sources.filter(
      (source) => !input.generatedSeed.sources.some((entry) => entry.id === source.id),
    ),
  ];
  const downloadCapabilities = [
    ...input.generatedSeed.downloadCapabilities,
    ...input.manualSeed.downloadCapabilities,
  ];

  return {
    seed: { sources },
    listDownloadCapabilities() {
      return downloadCapabilities;
    },
  };
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input
    ? path.resolve(repoRoot, args.input)
    : defaultInputPath;
  const outputPath = args.output
    ? path.resolve(repoRoot, args.output)
    : defaultOutputPath;
  const generatedSeedPath = args.generatedSeed
    ? path.resolve(repoRoot, args.generatedSeed)
    : defaultGeneratedSeedPath;
  const manualSeedPath = args.manualSeed
    ? path.resolve(repoRoot, args.manualSeed)
    : defaultManualSeedPath;

  const raw = await readFile(inputPath, "utf8");
  const snapshot = capabilityProbeSnapshotSchema.parse(
    JSON.parse(raw) as unknown,
  );
  const generatedSeed = await loadSeed(generatedSeedPath);
  const manualSeed = await loadSeed(manualSeedPath);
  const artifact = createCapabilityProbeReviewArtifact({
    snapshot,
    registry: createReviewRegistry({
      generatedSeed,
      manualSeed,
    }),
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    inputPath,
    generatedSeedPath,
    manualSeedPath,
    outputPath,
    totalCandidates: artifact.summary.totalCandidates,
    updateExistingCapability: artifact.summary.updateExistingCapability,
    addMissingCapability: artifact.summary.addMissingCapability,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
