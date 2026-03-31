import {
  DOWNLOADER_TOOL_IDS,
  ensureOfficialDownloaderBinary,
  parseArgs,
  resolveRuntimeTarget,
} from "./downloader-binaries.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = args.target || resolveRuntimeTarget();
  const force = args.force === "true";
  const requestedTool = typeof args.tool === "string" ? args.tool.trim() : "";
  const toolIds = requestedTool ? [requestedTool] : DOWNLOADER_TOOL_IDS;

  const results = [];
  for (const toolId of toolIds) {
    results.push(await ensureOfficialDownloaderBinary(toolId, target, { force }));
  }

  console.log(JSON.stringify({ target, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
