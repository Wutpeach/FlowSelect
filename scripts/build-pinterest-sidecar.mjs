import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const sidecarDir = join(repoRoot, "desktop-assets", "pinterest-sidecar");
const lockPath = join(sidecarDir, "lock.json");
const binariesDir = join(repoRoot, "desktop-assets", "binaries");
const buildRoot = join(repoRoot, "build", "pinterest-sidecar");

const lock = JSON.parse(readFileSync(lockPath, "utf8"));

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

function localTargetTriple() {
  if (process.platform === "win32" && process.arch === "x64") {
    return "x86_64-pc-windows-msvc";
  }
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "aarch64-apple-darwin";
  }
  if (process.platform === "darwin" && process.arch === "x64") {
    return "x86_64-apple-darwin";
  }
  throw new Error(`Unsupported local sidecar build platform: ${process.platform}-${process.arch}`);
}

function binaryFileName(target) {
  return process.platform === "win32" || target.endsWith("-windows-msvc")
    ? `pinterest-dl-${target}.exe`
    : `pinterest-dl-${target}`;
}

function pythonExecutable(venvDir) {
  return process.platform === "win32"
    ? join(venvDir, "Scripts", "python.exe")
    : join(venvDir, "bin", "python");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ALL_PROXY: "",
      all_proxy: "",
      HTTP_PROXY: "",
      http_proxy: "",
      HTTPS_PROXY: "",
      https_proxy: "",
      NO_PROXY: "",
      no_proxy: "",
      ...options.env,
    },
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = args.target || localTargetTriple();
  const targetBuildRoot = join(buildRoot, target);
  const venvDir = join(targetBuildRoot, "venv");
  const distDir = join(targetBuildRoot, "dist");
  const workDir = join(targetBuildRoot, "work");
  const specDir = join(targetBuildRoot, "spec");
  const outputName = binaryFileName(target);
  const outputPath = join(binariesDir, outputName);
  const entryPoint = join(sidecarDir, "__main__.py");
  const addDataSeparator = process.platform === "win32" ? ";" : ":";

  ensureDir(targetBuildRoot);
  cleanDir(distDir);
  cleanDir(workDir);
  cleanDir(specDir);
  ensureDir(binariesDir);

  if (!existsSync(venvDir)) {
    run(args.python || "python", ["-m", "venv", venvDir]);
  }

  const venvPython = pythonExecutable(venvDir);
  run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"]);
  run(venvPython, [
    "-m",
    "pip",
    "install",
    `${lock.upstream.package}==${lock.upstream.version}`,
    `${lock.freezer.package}==${lock.freezer.version}`,
  ]);

  run(venvPython, [
    "-m",
    "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onefile",
    "--distpath",
    distDir,
    "--workpath",
    workDir,
    "--specpath",
    specDir,
    "--name",
    outputName.replace(/\.exe$/i, ""),
    "--add-data",
    `${join(sidecarDir, "lock.json")}${addDataSeparator}.`,
    "--collect-submodules",
    "pinterest_dl",
    "--collect-data",
    "pinterest_dl",
    entryPoint,
  ]);

  const builtPath = join(distDir, outputName);
  if (!existsSync(builtPath)) {
    throw new Error(`Expected built sidecar at ${builtPath}`);
  }

  cpSync(builtPath, outputPath);
  if (process.platform !== "win32") {
    chmodSync(outputPath, 0o755);
  }
  console.log(JSON.stringify({ outputPath, target, upstream: lock.upstream }, null, 2));
}

main();
