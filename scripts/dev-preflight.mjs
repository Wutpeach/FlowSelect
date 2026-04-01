import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  DOWNLOADER_TOOL_IDS,
  ensureOfficialDownloaderBinary,
  getManifestEntry,
  readDownloaderManifest,
  resolveBinaryPath,
  resolveRuntimeTarget,
} from "./downloader-binaries.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const localesContractPath = path.join(repoRoot, "locales", "contract.json");
const truthyFlags = new Set(["1", "true", "yes", "on"]);

const fileExists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const runNodeScript = (label, relativeScriptPath) => new Promise((resolve, reject) => {
  const scriptPath = path.join(repoRoot, relativeScriptPath);
  const child = spawn(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });

  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal) {
      reject(new Error(`[${label}] exited with signal ${signal}`));
      return;
    }
    if (code !== 0) {
      reject(new Error(`[${label}] exited with code ${code ?? 1}`));
      return;
    }
    resolve();
  });
});

const readLocalesContract = async () => JSON.parse(await readFile(localesContractPath, "utf8"));

const targetNeedsSync = async (sourcePath, targetPath) => {
  if (!(await fileExists(targetPath))) {
    return true;
  }

  const [sourceStats, targetStats] = await Promise.all([
    stat(sourcePath),
    stat(targetPath),
  ]);

  return targetStats.mtimeMs < sourceStats.mtimeMs;
};

const ensureLocalesForDev = async () => {
  const contract = await readLocalesContract();
  const sourceRoot = path.join(repoRoot, contract.paths.source);
  const extensionTargetRoot = path.join(repoRoot, contract.paths.extensionResources);
  const contractTargetPath = path.join(extensionTargetRoot, "contract.json");

  if (await targetNeedsSync(localesContractPath, contractTargetPath)) {
    console.log(">>> [DevPreflight] Syncing locales");
    await runNodeScript("locales:sync", path.join("scripts", "sync-locales.mjs"));
    return;
  }

  for (const locale of contract.supportedLanguages) {
    for (const namespace of contract.namespaces) {
      const sourcePath = path.join(sourceRoot, locale, `${namespace}.json`);
      const targetPath = path.join(extensionTargetRoot, locale, `${namespace}.json`);
      if (await targetNeedsSync(sourcePath, targetPath)) {
        console.log(">>> [DevPreflight] Syncing locales");
        await runNodeScript("locales:sync", path.join("scripts", "sync-locales.mjs"));
        return;
      }
    }
  }

  console.log(">>> [DevPreflight] Locales already in sync");
};

const shouldForceDownloaderEnsure = () => (
  process.argv.includes("--force")
  || truthyFlags.has((process.env.FLOWSELECT_FORCE_DEV_PREFLIGHT ?? "").trim().toLowerCase())
);

const ensureDownloadersForDev = async () => {
  const target = resolveRuntimeTarget();
  const force = shouldForceDownloaderEnsure();

  if (force) {
    console.log(">>> [DevPreflight] Forcing downloader runtime verification");
  }

  const manifest = await readDownloaderManifest();
  const toolIdsToEnsure = [];

  for (const toolId of DOWNLOADER_TOOL_IDS) {
    const binaryPath = resolveBinaryPath(toolId, target);
    const manifestEntry = getManifestEntry(manifest, toolId, target);
    const binaryExists = await fileExists(binaryPath);
    if (force || !manifestEntry || !binaryExists) {
      toolIdsToEnsure.push(toolId);
    }
  }

  if (toolIdsToEnsure.length === 0) {
    console.log(">>> [DevPreflight] Downloader runtimes already cached");
    return;
  }

  const results = [];
  for (const toolId of toolIdsToEnsure) {
    results.push(await ensureOfficialDownloaderBinary(toolId, target, { force }));
  }

  console.log(JSON.stringify({ target, results }, null, 2));
};

async function main() {
  await ensureLocalesForDev();
  await ensureDownloadersForDev();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
