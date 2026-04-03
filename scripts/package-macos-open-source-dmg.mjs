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
import builderConfig, {
  ELECTRON_BUILDER_OUTPUT_DIR,
  ELECTRON_DMG_SUBDIR,
} from "../electron-builder.config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
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
  const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  return {
    productName: String(builderConfig.productName || "FlowSelect").trim() || "FlowSelect",
    version: String(packageJson.version || "").trim(),
  };
}

function expectedElectronBuilderArchFlag(arch) {
  const normalized = normalizeArchitectureLabel(arch);
  if (normalized === "x64") {
    return "--x64";
  }
  if (normalized === "arm64") {
    return "--arm64";
  }
  throw new Error(`Unsupported macOS architecture: ${arch}`);
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

function candidateAppBundleRoots(outputRoot, arch) {
  const normalized = normalizeArchitectureLabel(arch);
  const roots = [
    normalized === "arm64" ? join(outputRoot, "mac-arm64") : join(outputRoot, "mac"),
    join(outputRoot, "mac"),
    join(outputRoot, "mac-arm64"),
  ];

  return [...new Set(roots)];
}

function findAppBundle(outputRoot, arch) {
  for (const candidateRoot of candidateAppBundleRoots(outputRoot, arch)) {
    if (!existsSync(candidateRoot)) {
      continue;
    }

    const entry = readdirSync(candidateRoot, { withFileTypes: true }).find(
      (candidate) => candidate.isDirectory() && candidate.name.endsWith(".app"),
    );

    if (entry) {
      return join(candidateRoot, entry.name);
    }
  }

  throw new Error(`No .app bundle found in Electron output root: ${outputRoot}`);
}

function main() {
  if (process.platform !== "darwin") {
    throw new Error("package-macos-open-source-dmg.mjs must run on macOS.");
  }

  const args = parseArgs(process.argv.slice(2));
  const { productName, version: configVersion } = readProductMetadata();
  const skipBuild = args["skip-build"] === "true";
  const version = String(args.version || configVersion || "").trim();
  const arch = String(args.arch || "").trim() || "x86_64";

  if (!version) {
    throw new Error("Missing version. Pass --version or ensure package.json has a version.");
  }
  if (!existsSync(readmeSourcePath)) {
    throw new Error(`Missing install guide asset: ${readmeSourcePath}`);
  }

  if (!skipBuild) {
    run("npm", ["run", "package:mac:zip", "--", expectedElectronBuilderArchFlag(arch)]);
  }

  const outputRoot = join(repoRoot, ELECTRON_BUILDER_OUTPUT_DIR);
  const dmgDir = join(outputRoot, ELECTRON_DMG_SUBDIR);
  const appBundlePath = findAppBundle(outputRoot, arch);
  const outputPath = join(dmgDir, outputFileName(productName, version, arch));
  const browserExtensionOutputPath = join(dmgDir, `FlowSelect_${version}_browser_extension.zip`);
  const stagingRoot = mkdtempSync(join(tmpdir(), "flowselect-macos-dmg-"));
  const stagingDir = join(stagingRoot, "staging");
  const readmeOutputPath = join(stagingDir, "Install FlowSelect on macOS.txt");

  ensureDir(dmgDir);
  removeExistingDmgs(dmgDir);
  cleanDir(stagingDir);

  try {
    cpSync(appBundlePath, join(stagingDir, `${productName}.app`), {
      recursive: true,
      verbatimSymlinks: true,
    });
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

  run(process.execPath, [
    join(repoRoot, "scripts", "package-browser-extension.mjs"),
    "--version",
    version,
    "--output-dir",
    dmgDir,
  ]);

  if (!existsSync(browserExtensionOutputPath)) {
    throw new Error(`Missing packaged browser extension ZIP: ${browserExtensionOutputPath}`);
  }

  console.log(JSON.stringify({
    arch,
    appBundlePath,
    outputPath,
    browserExtensionOutputPath,
  }, null, 2));
}

main();
