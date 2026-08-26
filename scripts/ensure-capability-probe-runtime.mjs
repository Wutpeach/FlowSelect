import { chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import { resolveManagedPythonPackageSpec } from "./managed-python-package-manifest.mjs";
import {
  ensureOfficialBundledPythonRuntime,
  parseArgs,
  platformForTarget,
  repoRoot,
  resolveBundledPythonExecutable,
  resolveRuntimeTarget,
} from "./python-runtime.mjs";

const PROBE_RUNTIME_ROOT = path.join(repoRoot, "build", "capability-probe-runtimes");

const runCommand = async (
  command,
  args,
  options = {},
) => {
  const child = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
    });
  });

  return { stdout, stderr };
};

const readCommandVersion = async (command) => {
  const { stdout, stderr } = await runCommand(command, ["--version"]);
  const firstLine = `${stdout}\n${stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ?? "unknown";
};

const shouldRebuildProbeRuntime = async (toolId, target, paths) => {
  const metadataPath = path.join(paths.root, "metadata.json");
  const spec = await resolveManagedPythonPackageSpec(toolId);
  const bundledPythonPath = resolveBundledPythonExecutable(target);
  if (!existsSync(paths.entrypoint)) {
    return true;
  }
  if (!existsSync(metadataPath)) {
    return true;
  }
  try {
    const raw = JSON.parse(await (await import("node:fs/promises")).readFile(metadataPath, "utf8"));
    const bundledPythonVersion = await readCommandVersion(bundledPythonPath);
    return raw.packageVersion !== spec.packageVersion
      || raw.packageSetId !== spec.packageSetId
      || raw.bundledPythonPath !== bundledPythonPath
      || raw.bundledPythonVersion !== bundledPythonVersion;
  } catch {
    return true;
  }
};

const runtimePathsFor = (toolId, target) => {
  const platformName = platformForTarget(target);
  const root = path.join(PROBE_RUNTIME_ROOT, toolId, target);
  const executableDir = path.join(root, "venv", platformName === "win32" ? "Scripts" : "bin");
  const executableName = toolId === "yt-dlp"
    ? platformName === "win32" ? "yt-dlp.exe" : "yt-dlp"
    : platformName === "win32" ? "gallery-dl.exe" : "gallery-dl";
  return {
    root,
    venvDir: path.join(root, "venv"),
    python: path.join(executableDir, platformName === "win32" ? "python.exe" : "python"),
    entrypoint: path.join(executableDir, executableName),
    metadata: path.join(root, "metadata.json"),
    platformName,
  };
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const toolId = typeof args.tool === "string" ? args.tool.trim() : "";
  if (toolId !== "yt-dlp" && toolId !== "gallery-dl") {
    throw new Error("Capability probe runtime only supports yt-dlp or gallery-dl");
  }
  const target = typeof args.target === "string" && args.target.trim()
    ? args.target.trim()
    : resolveRuntimeTarget();
  const force = args.force === "true";
  const spec = await resolveManagedPythonPackageSpec(toolId);
  const paths = runtimePathsFor(toolId, target);
  const bundledPython = await ensureOfficialBundledPythonRuntime(target, { force: false });
  const needsRebuild = force ? true : await shouldRebuildProbeRuntime(toolId, target, paths);

  if (needsRebuild) {
    await (await import("node:fs/promises")).rm(paths.root, { recursive: true, force: true }).catch(() => {});
    await (await import("node:fs/promises")).mkdir(paths.root, { recursive: true });
    const venvArgs = ["-m", "venv", paths.venvDir];
    await runCommand(bundledPython.executable, venvArgs);
    await runCommand(paths.python, [
      "-m",
      "pip",
      "install",
      "--upgrade",
      "--disable-pip-version-check",
      "--no-cache-dir",
      ...spec.installSources,
    ]);
    if (!existsSync(paths.entrypoint)) {
      throw new Error(`Capability probe runtime entrypoint is missing after install: ${paths.entrypoint}`);
    }
    if (paths.platformName !== "win32") {
      await chmod(paths.entrypoint, 0o755).catch(() => {});
      await chmod(paths.python, 0o755).catch(() => {});
    }
    const metadata = {
      packageVersion: spec.packageVersion,
      packageSource: spec.installSource,
      packageSetId: spec.packageSetId,
      bundledPythonPath: bundledPython.executable,
      bundledPythonVersion: await readCommandVersion(bundledPython.executable),
      builtAt: new Date().toISOString(),
    };
    await (await import("node:fs/promises")).writeFile(
      paths.metadata,
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8",
    );
  }

  console.log(JSON.stringify({
    toolId,
    target,
    path: paths.entrypoint,
    pythonPath: paths.python,
    bundledPythonPath: bundledPython.executable,
    packageVersion: spec.packageVersion,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
