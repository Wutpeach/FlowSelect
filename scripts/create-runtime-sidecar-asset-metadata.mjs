import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
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

function sha256Hex(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function readLock(lockPath) {
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const flowselectSidecarVersion = String(lock?.flowselectSidecarVersion ?? "").trim();
  const upstreamVersion = String(lock?.upstream?.version ?? "").trim();
  if (!flowselectSidecarVersion) {
    throw new Error("lock.json is missing flowselectSidecarVersion");
  }
  if (!upstreamVersion) {
    throw new Error("lock.json is missing upstream.version");
  }
  return { flowselectSidecarVersion, upstreamVersion };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = String(args.target ?? "").trim();
  const assetArg = String(args.asset ?? "").trim();
  const outputArg = String(args.output ?? "").trim();
  const component = String(args.component ?? "pinterest-dl").trim();
  const lockArg = String(args.lock ?? "").trim();
  const lockPath = lockArg
    ? resolve(repoRoot, lockArg)
    : join(repoRoot, "desktop-assets", "pinterest-sidecar", "lock.json");

  if (!target) {
    throw new Error("Missing required --target");
  }
  if (!assetArg) {
    throw new Error("Missing required --asset");
  }
  if (!outputArg) {
    throw new Error("Missing required --output");
  }
  if (!component) {
    throw new Error("component must not be empty");
  }

  const assetPath = resolve(repoRoot, assetArg);
  const outputPath = resolve(repoRoot, outputArg);
  const { flowselectSidecarVersion, upstreamVersion } = readLock(lockPath);
  const fileStat = statSync(assetPath);
  if (!fileStat.isFile()) {
    throw new Error(`Asset is not a file: ${assetPath}`);
  }

  const metadata = {
    component,
    target,
    assetName: basename(assetPath),
    flowselectSidecarVersion,
    upstreamVersion,
    sha256: sha256Hex(assetPath),
    size: fileStat.size,
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  console.log(`>>> [Node] Wrote runtime sidecar metadata: ${outputPath}`);
  console.log(JSON.stringify(metadata, null, 2));
}

main();
