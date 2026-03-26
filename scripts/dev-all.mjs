import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const forwardedArgs = process.argv.slice(2);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const child = spawn(
  process.execPath,
  [path.join(repoRoot, "scripts", "run-electron-dev.mjs"), ...forwardedArgs],
  {
    cwd: repoRoot,
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error(`[error] Failed to start Electron dev wrapper: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
