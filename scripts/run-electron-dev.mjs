import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { access } from "node:fs/promises";
import http from "node:http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
const tscBin = path.join(repoRoot, "node_modules", "typescript", "bin", "tsc");
const electronBin = path.join(repoRoot, "node_modules", "electron", "cli.js");

const devServerUrl = "http://127.0.0.1:1420";
const compiledEntries = [
  path.join(repoRoot, "dist-electron", "electron", "main.mjs"),
  path.join(repoRoot, "dist-electron", "electron", "preload.mjs"),
];

const runBlocking = (label, command, args, env = process.env) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`[${label}] exited with code ${result.status ?? 1}`);
  }
};

const spawnChild = (label, command, args, env = process.env) => {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`[${label}] exited with signal ${signal}`);
      return;
    }
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
    }
  });

  return child;
};

const waitForFiles = async (filePaths, timeoutMs = 30000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const existenceChecks = await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          await access(filePath);
          return true;
        } catch {
          return false;
        }
      }),
    );

    if (existenceChecks.every(Boolean)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Timed out waiting for the Electron build output");
};

const waitForHttp = async (targetUrl, timeoutMs = 30000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const isReady = await new Promise((resolve) => {
      const request = http.get(targetUrl, (response) => {
        response.resume();
        resolve((response.statusCode ?? 500) < 500);
      });
      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => {
        request.destroy();
        resolve(false);
      });
    });

    if (isReady) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${targetUrl}`);
};

const children = [];

const shutdown = (exitCode = 0) => {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(exitCode);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const start = async () => {
  runBlocking(
    "tsc-initial",
    process.execPath,
    [tscBin, "-p", "tsconfig.electron.json"],
  );

  const tsc = spawnChild(
    "tsc",
    process.execPath,
    [tscBin, "-p", "tsconfig.electron.json", "--watch", "--preserveWatchOutput"],
  );
  children.push(tsc);

  const vite = spawnChild(
    "vite",
    process.execPath,
    [viteBin, "--host", "127.0.0.1", "--port", "1420", "--strictPort"],
  );
  children.push(vite);

  await Promise.all([
    waitForFiles(compiledEntries),
    waitForHttp(devServerUrl),
  ]);

  const electron = spawnChild(
    "electron",
    process.execPath,
    [electronBin, "."],
    {
      ...process.env,
      FLOWSELECT_ELECTRON_DEV_SERVER_URL: devServerUrl,
    },
  );
  children.push(electron);

  electron.on("exit", (code) => {
    shutdown(code ?? 0);
  });
};

void start().catch((error) => {
  console.error(error);
  shutdown(1);
});
