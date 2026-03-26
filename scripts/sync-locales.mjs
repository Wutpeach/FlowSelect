import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const contractPath = path.join(repoRoot, "locales", "contract.json");

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function ensureSourceLocales(contract, sourceRoot) {
  for (const locale of contract.supportedLanguages) {
    for (const namespace of contract.namespaces) {
      const sourceFile = path.join(sourceRoot, locale, `${namespace}.json`);
      const parsed = await readJson(sourceFile);
      await writeJson(sourceFile, parsed);
    }
  }
}

async function syncTarget(contract, targetRoot) {
  await fs.rm(targetRoot, { recursive: true, force: true });
  await fs.mkdir(targetRoot, { recursive: true });
  await fs.copyFile(contractPath, path.join(targetRoot, "contract.json"));

  const sourceRoot = path.join(repoRoot, contract.paths.source);
  for (const locale of contract.supportedLanguages) {
    for (const namespace of contract.namespaces) {
      const sourceFile = path.join(sourceRoot, locale, `${namespace}.json`);
      const targetFile = path.join(targetRoot, locale, `${namespace}.json`);
      const parsed = await readJson(sourceFile);
      await writeJson(targetFile, parsed);
    }
  }
}

async function main() {
  const contract = await readJson(contractPath);
  const sourceRoot = path.join(repoRoot, contract.paths.source);
  const extensionTargetRoot = path.join(repoRoot, contract.paths.extensionResources);

  await ensureSourceLocales(contract, sourceRoot);
  await syncTarget(contract, extensionTargetRoot);

  console.log(
    `Synced locales for ${contract.supportedLanguages.length} languages and ${contract.namespaces.length} namespaces.`,
  );
  console.log(`Extension resources: ${path.relative(repoRoot, extensionTargetRoot)}`);
}

main().catch((error) => {
  console.error("Failed to sync locales:", error);
  process.exitCode = 1;
});
