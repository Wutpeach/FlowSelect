import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const tauriConfigPath = join(repoRoot, "src-tauri", "tauri.conf.json");
const readmeSourcePath = join(repoRoot, "distribution", "macos", "install-guide.txt");

function parseArgs(argv) {
  const parsed = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
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
  if (!parsed.target && positional[0]) {
    parsed.target = positional[0];
  }
  return parsed;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function cleanDir(path) {
  rmSync(path, { recursive: true, force: true });
  ensureDir(path);
}

function readProductMetadata() {
  const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
  return {
    productName: String(tauriConfig.productName || "FlowSelect").trim() || "FlowSelect",
    version: String(tauriConfig.version || "").trim(),
  };
}

function findAppBundle(macosBundleDir) {
  if (!existsSync(macosBundleDir)) {
    throw new Error(`macOS bundle directory not found: ${macosBundleDir}`);
  }

  const entry = readdirSync(macosBundleDir, { withFileTypes: true }).find(
    (candidate) => candidate.isDirectory() && candidate.name.endsWith(".app"),
  );

  if (!entry) {
    throw new Error(`No .app bundle found in: ${macosBundleDir}`);
  }

  return join(macosBundleDir, entry.name);
}

function removeExistingDmgs(dmgDir) {
  if (!existsSync(dmgDir)) {
    return;
  }

  for (const entry of readdirSync(dmgDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".dmg")) {
      rmSync(join(dmgDir, entry.name), { force: true });
    }
  }
}

function outputFileName(productName, version, arch) {
  const safeName = productName.replace(/\s+/g, "");
  const archLabel = normalizeArchitectureLabel(arch);
  return `${safeName}_${version}_macos_${archLabel}_installer.dmg`;
}

function normalizeArchitectureLabel(arch) {
  if (arch === "x86_64") {
    return "x64";
  }
  if (arch === "aarch64") {
    return "arm64";
  }
  return arch;
}

function main() {
  if (process.platform !== "darwin") {
    throw new Error("package-macos-open-source-dmg.mjs must run on macOS.");
  }

  const args = parseArgs(process.argv.slice(2));
  const { productName, version: configVersion } = readProductMetadata();
  const target = String(args.target || "").trim();
  const version = String(args.version || configVersion || "").trim();
  const arch = String(args.arch || "").trim() || (target.includes("aarch64") ? "aarch64" : "x86_64");

  if (!target) {
    throw new Error("Missing required --target argument.");
  }
  if (!version) {
    throw new Error("Missing version. Pass --version or set src-tauri/tauri.conf.json version.");
  }
  if (!existsSync(readmeSourcePath)) {
    throw new Error(`Missing install guide asset: ${readmeSourcePath}`);
  }

  const bundleRoot = join(repoRoot, "src-tauri", "target", target, "release", "bundle");
  const macosBundleDir = join(bundleRoot, "macos");
  const dmgDir = join(bundleRoot, "dmg");
  const appBundlePath = findAppBundle(macosBundleDir);
  const outputPath = join(dmgDir, outputFileName(productName, version, arch));
  const stagingRoot = mkdtempSync(join(tmpdir(), "flowselect-macos-dmg-"));
  const stagingDir = join(stagingRoot, "staging");
  const readmeOutputPath = join(stagingDir, "Install FlowSelect on macOS.txt");

  ensureDir(dmgDir);
  removeExistingDmgs(dmgDir);
  cleanDir(stagingDir);

  try {
    cpSync(appBundlePath, join(stagingDir, `${productName}.app`), { recursive: true });
    symlinkSync("/Applications", join(stagingDir, "Applications"), "dir");
    cpSync(readmeSourcePath, readmeOutputPath);

    run("hdiutil", [
      "create",
      "-volname",
      productName,
      "-srcfolder",
      stagingDir,
      "-ov",
      "-format",
      "UDZO",
      outputPath,
    ]);
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }

  console.log(JSON.stringify({ target, arch, appBundlePath, outputPath }, null, 2));
}

main();
