import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { runStreamingCommand } from "file:///D:/Ameow/.p2v-release-evidence/installed-nsis/resources/app/dist-electron/src/electron-runtime/processRunner.js";
import {
  RuntimeSetBusyError,
  createRuntimeSetLifecycleCoordinator,
} from "file:///D:/Ameow/.p2v-release-evidence/installed-nsis/resources/app/dist-electron/electron/runtimeSetLifecycle.mjs";

const ffmpeg = "D:/Ameow/.p2v-release-evidence/installed-profile/user-data/runtimes/ffmpeg/x86_64-pc-windows-msvc/real/ffmpeg.exe";
const coordinator = createRuntimeSetLifecycleCoordinator();
const lease = await coordinator.acquireLease(["ffmpeg"], async (missing) => {
  console.log(`PREPARE ${JSON.stringify(missing)}`);
});
const controller = new AbortController();
const running = runStreamingCommand(ffmpeg, [
  "-hide_banner", "-loglevel", "error", "-re", "-f", "lavfi", "-i", "testsrc2=size=128x72:rate=10", "-t", "20", "-f", "null", "NUL",
], { signal: controller.signal });

await sleep(750);
const canonicalFfmpeg = ffmpeg.replace(/\//g, "\\");
const escaped = canonicalFfmpeg.replace(/'/g, "''");
const observed = execFileSync("powershell.exe", [
  "-NoProfile", "-NonInteractive", "-Command",
  `$path='${escaped}'; Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $path } | ForEach-Object { [PSCustomObject]@{ ProcessId=$_.ProcessId; ParentProcessId=$_.ParentProcessId; ExecutablePath=$_.ExecutablePath; CommandLine=$_.CommandLine; MainWindowHandle=(Get-Process -Id $_.ProcessId).MainWindowHandle } } | ConvertTo-Json -Compress`,
], { encoding: "utf8", windowsHide: true }).trim();
console.log(`RUNNER_ACTIVE_LEASES ${coordinator.activeLeaseCount()}`);
console.log(`RUNNER_WINDOWS_HIDE true`);
console.log(`RUNNER_PROCESS ${observed || "none"}`);
let mutationBlocked = false;
try {
  await coordinator.runMutation(async () => undefined);
} catch (error) {
  mutationBlocked = error instanceof RuntimeSetBusyError;
  console.log(`MUTATION_WHILE_ACTIVE ${error.name}`);
}
controller.abort();
const exitCode = await running;
console.log(`RUNNER_EXIT_CODE ${exitCode}`);
console.log(`RUNNER_ACTIVE_AFTER_SETTLEMENT ${coordinator.activeLeaseCount()}`);
lease.release();
console.log(`RUNNER_ACTIVE_AFTER_RELEASE ${coordinator.activeLeaseCount()}`);
await coordinator.runMutation(async () => console.log("MUTATION_AFTER_RELEASE allowed"));
console.log(`RESULT ${JSON.stringify({ mutationBlocked })}`);
