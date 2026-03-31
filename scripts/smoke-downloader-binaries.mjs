import {
  DOWNLOADER_TOOL_IDS,
  parseArgs,
  resolveBinaryPath,
  resolveRuntimeTarget,
  smokeDownloaderBinary,
} from "./downloader-binaries.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = args.target || resolveRuntimeTarget();
  const requestedTool = typeof args.tool === "string" ? args.tool.trim() : "";
  const toolIds = requestedTool ? [requestedTool] : DOWNLOADER_TOOL_IDS;

  const results = toolIds.map((toolId) => {
    const entryPath = resolveBinaryPath(toolId, target);
    const version = smokeDownloaderBinary(entryPath);
    return {
      toolId,
      target,
      path: entryPath,
      version,
    };
  });

  console.log(JSON.stringify({ target, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
