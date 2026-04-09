import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { access } from "node:fs/promises";
import http from "node:http";
import readline from "node:readline";

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

const runToCompletion = (label, command, args, env = process.env) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });

  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal) {
      reject(new Error(`[${label}] exited with signal ${signal}`));
      return;
    }
    if (code !== 0) {
      reject(new Error(`[${label}] exited with code ${code ?? 1}`));
      return;
    }
    resolve();
  });
});

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
let isShuttingDown = false;
let electron = null;
let isRestartingElectron = false;
let pendingElectronRestartReason = null;
let electronRestartTimer = null;

const shutdown = (exitCode = 0) => {
  isShuttingDown = true;
  if (electronRestartTimer) {
    clearTimeout(electronRestartTimer);
    electronRestartTimer = null;
  }
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(exitCode);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const removeChild = (childToRemove) => {
  const childIndex = children.indexOf(childToRemove);
  if (childIndex >= 0) {
    children.splice(childIndex, 1);
  }
};

const isTscWatchSuccessLine = (line) => /Found 0 errors?\. Watching for file changes\./.test(line);

const forwardWatchStream = (stream, writer, onLine) => {
  if (!stream) {
    return;
  }

  stream.setEncoding("utf8");
  const lineReader = readline.createInterface({ input: stream });
  lineReader.on("line", (line) => {
    writer(`${line}\n`);
    onLine?.(line);
  });
};

const spawnTscWatch = (onSuccessfulRebuild) => {
  const child = spawn(process.execPath, [
    tscBin,
    "-p",
    "tsconfig.electron.json",
    "--watch",
    "--preserveWatchOutput",
    "--pretty",
    "false",
  ], {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let hasSeenInitialSuccess = false;
  const handleWatchLine = (line) => {
    if (!isTscWatchSuccessLine(line)) {
      return;
    }

    if (!hasSeenInitialSuccess) {
      hasSeenInitialSuccess = true;
      return;
    }

    onSuccessfulRebuild();
  };

  forwardWatchStream(child.stdout, (message) => process.stdout.write(message), handleWatchLine);
  forwardWatchStream(child.stderr, (message) => process.stderr.write(message), handleWatchLine);

  child.on("exit", (code, signal) => {
    removeChild(child);
    if (isShuttingDown) {
      return;
    }
    if (signal) {
      console.error(`[tsc] exited with signal ${signal}`);
      shutdown(1);
      return;
    }
    if (code && code !== 0) {
      console.error(`[tsc] exited with code ${code}`);
      shutdown(code);
    }
  });

  return child;
};

const startElectron = () => {
  console.log(">>> [Dev] Starting Electron main process");
  const child = spawnChild(
    "electron",
    process.execPath,
    [electronBin, "."],
    {
      ...process.env,
      FLOWSELECT_ELECTRON_DEV_SERVER_URL: devServerUrl,
    },
  );
  electron = child;
  children.push(child);

  child.on("exit", (code) => {
    removeChild(child);
    if (electron === child) {
      electron = null;
    }
    if (isShuttingDown) {
      return;
    }
    if (isRestartingElectron) {
      const restartReason = pendingElectronRestartReason ?? "TypeScript rebuild";
      isRestartingElectron = false;
      pendingElectronRestartReason = null;
      console.log(`>>> [Dev] Restarting Electron after ${restartReason}`);
      startElectron();
      return;
    }
    shutdown(code ?? 0);
  });
};

const scheduleElectronRestart = (reason) => {
  if (isShuttingDown) {
    return;
  }

  if (electronRestartTimer) {
    clearTimeout(electronRestartTimer);
  }

  pendingElectronRestartReason = reason;
  electronRestartTimer = setTimeout(() => {
    electronRestartTimer = null;
    if (isShuttingDown) {
      return;
    }
    if (!electron) {
      console.log(`>>> [Dev] Electron is not running; skip restart after ${reason}`);
      return;
    }
    if (isRestartingElectron) {
      return;
    }
    isRestartingElectron = true;
    console.log(`>>> [Dev] TypeScript rebuild detected; restarting Electron (${reason})`);
    electron.kill();
  }, 150);
};

const start = async () => {
  const vite = spawnChild(
    "vite",
    process.execPath,
    [viteBin, "--host", "127.0.0.1", "--port", "1420", "--strictPort"],
  );
  children.push(vite);

  const initialTsc = runToCompletion(
    "tsc-initial",
    process.execPath,
    [tscBin, "-p", "tsconfig.electron.json"],
  );

  await Promise.all([
    initialTsc,
    waitForFiles(compiledEntries),
    waitForHttp(devServerUrl),
  ]);

  const tsc = spawnTscWatch(() => {
    scheduleElectronRestart("successful TypeScript rebuild");
  });
  children.push(tsc);

  startElectron();
};

void start().catch((error) => {
  console.error(error);
  shutdown(1);
});
