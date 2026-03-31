import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

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
  throw new Error(`Unsupported local gallery-dl ensure platform: ${process.platform}-${process.arch}`);
}

function binaryPath(target) {
  const ext = target.endsWith("-windows-msvc") ? ".exe" : "";
  return join(repoRoot, "desktop-assets", "binaries", `gallery-dl-${target}${ext}`);
}

function runNodeScript(scriptPath, scriptArgs) {
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: node ${scriptPath} ${scriptArgs.join(" ")}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = args.target || localTargetTriple();
  const force = args.force === "true";
  const entryPath = binaryPath(target);

  if (!force && existsSync(entryPath)) {
    console.log(JSON.stringify({
      target,
      path: entryPath,
      state: "present",
    }, null, 2));
    return;
  }

  const buildArgs = ["--target", target];
  if (typeof args.python === "string" && args.python.trim()) {
    buildArgs.push("--python", args.python.trim());
  }

  runNodeScript(join(repoRoot, "scripts", "build-gallery-dl-binary.mjs"), buildArgs);
  runNodeScript(join(repoRoot, "scripts", "smoke-gallery-dl-binary.mjs"), ["--target", target]);

  console.log(JSON.stringify({
    target,
    path: entryPath,
    state: "built",
  }, null, 2));
}

main();
