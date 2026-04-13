import path from "node:path";
import {
  DEFAULT_CAPABILITY_SEED_OUTPUT,
  GALLERY_DL_SUPPORTED_SITES_URL,
  YT_DLP_SUPPORTED_SITES_URL,
  generateCapabilitySeed,
  repoRoot,
  writeCapabilitySeed,
} from "./capabilities-seed-lib.mjs";

function parseArgs(argv) {
  const parsed = {};
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
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = args.output
    ? path.resolve(repoRoot, args.output)
    : DEFAULT_CAPABILITY_SEED_OUTPUT;
  const generatedAt = args.generatedAt || new Date().toISOString();
  const seed = await generateCapabilitySeed({
    ytDlpSource: args.ytDlpSource || YT_DLP_SUPPORTED_SITES_URL,
    galleryDlSource: args.galleryDlSource || GALLERY_DL_SUPPORTED_SITES_URL,
    generatedAt,
  });

  await writeCapabilitySeed(outputPath, seed);

  console.log(
    JSON.stringify(
      {
        outputPath,
        generatedAt: seed.generatedAt,
        sources: seed.sources.map((source) => ({
          id: source.id,
          engine: source.engine,
          entryCount: source.entryCount,
        })),
        downloadCapabilityCount: seed.downloadCapabilities.length,
        interactionCapabilityCount: seed.interactionCapabilities.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
