import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const forwardedArgs = process.argv.slice(2);

function hasExplicitBundleSelection(args) {
  return args.includes("--bundles") || args.includes("--no-bundle");
}

function resolveDefaultBundleArgs(args) {
  if (args[0] !== "build" || hasExplicitBundleSelection(args)) {
    return [];
  }

  if (process.platform === "win32") {
    return ["--bundles", "nsis"];
  }

  if (process.platform === "darwin") {
    return ["--bundles", "app"];
  }

  return [];
}

const defaultBundleArgs = resolveDefaultBundleArgs(forwardedArgs);
if (defaultBundleArgs.length > 0) {
  console.log(`>>> [Node] Applying default Tauri bundle args: ${defaultBundleArgs.join(" ")}`);
}

const tauriArgs = [...forwardedArgs, ...defaultBundleArgs];
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const tauriBinary = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tauri.cmd" : "tauri",
);

if (!existsSync(tauriBinary)) {
  throw new Error(`Tauri CLI binary not found: ${tauriBinary}. Run npm install first.`);
}

const result = spawnSync(tauriBinary, tauriArgs, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

if (result.error) {
  throw result.error;
}

if (typeof result.status === "number") {
  process.exit(result.status);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(1);
