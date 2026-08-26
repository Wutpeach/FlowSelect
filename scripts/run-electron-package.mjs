import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertBundledPythonRuntimeReady,
  resolveTargetFromBuilderArgs,
} from "./python-runtime.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const electronBuilderCli = path.join(repoRoot, "node_modules", "electron-builder", "cli.js");
const npmCli = process.env.npm_execpath ?? null;

const runCommand = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });

  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal) {
      reject(new Error(`${command} exited with signal ${signal}`));
      return;
    }
    if (code !== 0) {
      reject(new Error(`${command} exited with code ${code ?? 1}`));
      return;
    }
    resolve();
  });
});

async function main() {
  const builderArgs = process.argv.slice(2);
  await runCommand(process.execPath, [path.join(repoRoot, "scripts", "ensure-python-runtime.mjs"), ...builderArgs]);
  await assertBundledPythonRuntimeReady(resolveTargetFromBuilderArgs(builderArgs));
  await runCommand(process.execPath, [path.join(repoRoot, "scripts", "prepare-ytdlp-baseline.mjs"), "--verify"]);
  if (!npmCli) {
    throw new Error("npm_execpath is required to run the build from the package script");
  }
  await runCommand(process.execPath, [npmCli, "run", "build"]);
  await runCommand(process.execPath, [
    electronBuilderCli,
    "--config",
    "./electron-builder.config.mjs",
    ...builderArgs,
    "--publish",
    "never",
  ]);
  await runCommand(process.execPath, [
    path.join(repoRoot, "scripts", "verify-ytdlp-baseline-package.mjs"),
    ...builderArgs,
  ]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
