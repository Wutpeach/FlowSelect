import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import builderConfig, {
  ELECTRON_BUILDER_OUTPUT_DIR,
  ELECTRON_DMG_SUBDIR,
} from "../electron-builder.config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const installGuideSourcePath = join(repoRoot, "distribution", "macos", "install-guide.txt");
const dmgBackgroundPath = join(repoRoot, "background.png");
const dmgVolumeIconPngPath = join(repoRoot, "app-icon.png");
const dmgLayout = {
  volumeName: "FlowSelect Installer",
  windowSize: { width: 638, height: 360 },
  iconSize: 100,
  textSize: 14,
  appPosition: { x: 439, y: 157 },
  applicationsPosition: { x: 97, y: 157 },
  installGuidePosition: { x: 198, y: 22 },
  browserExtensionPosition: { x: 340, y: 22 },
};
const iconsetEntries = [
  { name: "icon_16x16.png", size: 16 },
  { name: "icon_16x16@2x.png", size: 32 },
  { name: "icon_32x32.png", size: 32 },
  { name: "icon_32x32@2x.png", size: 64 },
  { name: "icon_128x128.png", size: 128 },
  { name: "icon_128x128@2x.png", size: 256 },
  { name: "icon_256x256.png", size: 256 },
  { name: "icon_256x256@2x.png", size: 512 },
  { name: "icon_512x512.png", size: 512 },
  { name: "icon_512x512@2x.png", size: 1024 },
];

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

function assertPathExists(path, label) {
  if (!existsSync(path)) {
    throw new Error(`Missing ${label}: ${path}`);
  }
}

function cleanDir(path) {
  rmSync(path, { recursive: true, force: true });
  ensureDir(path);
}

function ensureCommandAvailable(command) {
  const result = spawnSync("which", [command], {
    cwd: repoRoot,
    stdio: "ignore",
  });

  if (result.status !== 0) {
    throw new Error(`Required command not found on PATH: ${command}`);
  }
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

function defaultMacPackagingArch() {
  if (process.arch === "arm64") {
    return "aarch64";
  }
  return "x86_64";
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

function generateVolumeIconIcns(pngPath, outputPath, scratchRoot) {
  assertPathExists(pngPath, "DMG volume icon PNG");

  const iconsetDir = join(scratchRoot, "volume-icon.iconset");
  cleanDir(iconsetDir);

  for (const entry of iconsetEntries) {
    run("sips", [
      "-s",
      "format",
      "png",
      "-z",
      String(entry.size),
      String(entry.size),
      pngPath,
      "--out",
      join(iconsetDir, entry.name),
    ]);
  }

  run("iconutil", ["-c", "icns", iconsetDir, "-o", outputPath]);
  assertPathExists(outputPath, "generated DMG volume icon");
}

function main() {
  if (process.platform !== "darwin") {
    throw new Error("package-macos-open-source-dmg.mjs must run on macOS.");
  }

  ensureCommandAvailable("create-dmg");
  ensureCommandAvailable("sips");
  ensureCommandAvailable("iconutil");

  const args = parseArgs(process.argv.slice(2));
  const { productName, version: configVersion } = readProductMetadata();
  const skipBuild = args["skip-build"] === "true";
  const version = String(args.version || configVersion || "").trim();
  const arch = String(args.arch || "").trim() || defaultMacPackagingArch();

  if (!version) {
    throw new Error("Missing version. Pass --version or ensure package.json has a version.");
  }

  assertPathExists(installGuideSourcePath, "install guide asset");
  assertPathExists(dmgBackgroundPath, "DMG background image");
  assertPathExists(dmgVolumeIconPngPath, "DMG volume icon PNG");

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
  const volumeIconOutputPath = join(stagingRoot, "FlowSelect-Installer.icns");

  ensureDir(dmgDir);
  removeExistingDmgs(dmgDir);
  cleanDir(stagingDir);

  try {
    run(process.execPath, [
      join(repoRoot, "scripts", "package-browser-extension.mjs"),
      "--version",
      version,
      "--output-dir",
      dmgDir,
    ]);

    assertPathExists(browserExtensionOutputPath, "packaged browser extension ZIP");
    generateVolumeIconIcns(dmgVolumeIconPngPath, volumeIconOutputPath, stagingRoot);

    cpSync(appBundlePath, join(stagingDir, `${productName}.app`), {
      recursive: true,
      verbatimSymlinks: true,
    });

    run("create-dmg", [
      "--volname",
      dmgLayout.volumeName,
      "--volicon",
      volumeIconOutputPath,
      "--background",
      dmgBackgroundPath,
      "--window-size",
      String(dmgLayout.windowSize.width),
      String(dmgLayout.windowSize.height),
      "--text-size",
      String(dmgLayout.textSize),
      "--icon-size",
      String(dmgLayout.iconSize),
      "--icon",
      `${productName}.app`,
      String(dmgLayout.appPosition.x),
      String(dmgLayout.appPosition.y),
      "--hide-extension",
      `${productName}.app`,
      "--app-drop-link",
      String(dmgLayout.applicationsPosition.x),
      String(dmgLayout.applicationsPosition.y),
      "--add-file",
      "Install FlowSelect on macOS.txt",
      installGuideSourcePath,
      String(dmgLayout.installGuidePosition.x),
      String(dmgLayout.installGuidePosition.y),
      "--add-file",
      basename(browserExtensionOutputPath),
      browserExtensionOutputPath,
      String(dmgLayout.browserExtensionPosition.x),
      String(dmgLayout.browserExtensionPosition.y),
      "--format",
      "UDZO",
      outputPath,
      stagingDir,
    ]);
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }

  console.log(JSON.stringify({
    arch,
    appBundlePath,
    outputPath,
    browserExtensionOutputPath,
  }, null, 2));
}

main();
