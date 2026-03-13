import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const proxyManifestPath = join(repoRoot, "src-tauri", "runtime-proxy", "Cargo.toml");
const binariesDir = join(repoRoot, "src-tauri", "binaries");

const profileArgIndex = process.argv.indexOf("--profile");
const requestedProfile =
  profileArgIndex >= 0 ? process.argv[profileArgIndex + 1] : undefined;
const profile = requestedProfile === "release" ? "release" : "debug";

function resolveTargetTriple() {
  if (process.platform === "win32" && process.arch === "x64") {
    return { target: "x86_64-pc-windows-msvc", extension: ".exe" };
  }
  if (process.platform === "darwin" && process.arch === "arm64") {
    return { target: "aarch64-apple-darwin", extension: "" };
  }
  if (process.platform === "darwin" && process.arch === "x64") {
    return { target: "x86_64-apple-darwin", extension: "" };
  }
  throw new Error(
    `Unsupported platform for runtime proxy build: ${process.platform}-${process.arch}`,
  );
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function main() {
  const { target, extension } = resolveTargetTriple();
  const sourceFileName = `flowselect-cli-proxy${extension}`;
  const destinationFileName = `flowselect-cli-proxy-${target}${extension}`;

  const cargoArgs = [
    "build",
    "--manifest-path",
    proxyManifestPath,
  ];
  if (profile === "release") {
    cargoArgs.push("--release");
  }

  run("cargo", cargoArgs);

  const sourcePath = join(
    repoRoot,
    "src-tauri",
    "runtime-proxy",
    "target",
    profile,
    sourceFileName,
  );
  if (!existsSync(sourcePath)) {
    throw new Error(`Runtime proxy binary not found: ${sourcePath}`);
  }

  mkdirSync(binariesDir, { recursive: true });
  const destinationPath = join(binariesDir, destinationFileName);
  copyFileSync(sourcePath, destinationPath);
  console.log(`Copied runtime proxy to ${destinationPath}`);
}

main();
