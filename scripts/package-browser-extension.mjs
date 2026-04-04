import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  applyAppVersionToExtensionManifest,
  assertValidChromiumExtensionVersion,
} from "./browser-extension-versioning.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const sourceDir = join(repoRoot, "browser-extension");
const manifestPath = join(sourceDir, "manifest.json");
const packageJsonPath = join(repoRoot, "package.json");

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

function readAppVersion() {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const version = String(packageJson.version || "").trim();
  if (!version) {
    throw new Error(`Missing package.json version in ${packageJsonPath}`);
  }
  return version;
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function createZip(stagedSourceDir, outputPath, stagingRoot) {
  if (process.platform === "win32") {
    const escapedSourceDir = stagedSourceDir.replaceAll("'", "''");
    const escapedOutputPath = outputPath.replaceAll("'", "''");
    run("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Compress-Archive -LiteralPath '${escapedSourceDir}' -DestinationPath '${escapedOutputPath}' -CompressionLevel Optimal -Force`,
    ]);
    return;
  }

  if (process.platform === "darwin") {
    run("ditto", ["-c", "-k", "--keepParent", stagedSourceDir, outputPath]);
    return;
  }

  run("zip", ["-qr", "-X", outputPath, "browser-extension"], { cwd: stagingRoot });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = String(args.version || readAppVersion()).trim();
  const outputDir = resolve(repoRoot, args["output-dir"] || join("dist", "browser-extension"));

  if (!version) {
    throw new Error("Missing version. Pass --version or ensure package.json has a version.");
  }

  if (!existsSync(sourceDir)) {
    throw new Error(`Browser extension directory not found: ${sourceDir}`);
  }

  if (!existsSync(manifestPath)) {
    throw new Error(`Browser extension manifest not found: ${manifestPath}`);
  }

  const sourceManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const manifest = applyAppVersionToExtensionManifest(sourceManifest, version);
  ensureDir(outputDir);

  const artifactName = `FlowSelect_${version}_browser_extension.zip`;
  const outputPath = join(outputDir, artifactName);
  const stagingRoot = mkdtempSync(join(tmpdir(), "flowselect-browser-extension-"));
  const stagedSourceDir = join(stagingRoot, "browser-extension");

  try {
    cpSync(sourceDir, stagedSourceDir, { recursive: true });
    writeFileSync(join(stagedSourceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    assertValidChromiumExtensionVersion(manifest.version, "Staged extension manifest version");

    if (existsSync(outputPath)) {
      rmSync(outputPath, { force: true });
    }

    createZip(stagedSourceDir, outputPath, stagingRoot);

    if (!existsSync(outputPath)) {
      throw new Error(`Browser extension ZIP was not created: ${outputPath}`);
    }
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }

  console.log(JSON.stringify(
    {
      version,
      manifestVersion: String(manifest.version || "").trim(),
      manifestVersionName: String(manifest.version_name || "").trim(),
      sourceDir,
      outputPath,
    },
    null,
    2,
  ));
}

main();
