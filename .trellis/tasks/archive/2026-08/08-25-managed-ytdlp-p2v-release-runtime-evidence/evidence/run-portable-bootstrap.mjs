import {
  ensureManagedDenoRuntimeReady,
  ensureManagedFfmpegRuntimeReady,
  ensureManagedYtDlpRuntimeReady,
} from "file:///D:/Ameow/.p2v-release-evidence/portable-extracted/Ameow_portable/resources/app/dist-electron/electron/managedRuntimeBootstrap.mjs";

const configDir = "D:/Ameow/.p2v-release-evidence/portable-profile/user-data";
const bundledPythonPath = "D:/Ameow/.p2v-release-evidence/portable-extracted/Ameow_portable/resources/app/desktop-assets/binaries/python-x86_64-pc-windows-msvc/python.exe";
const options = {
  configDir,
  platform: "win32",
  arch: "x64",
  fetch: globalThis.fetch,
  bundledPythonPath,
  bundledPythonRoot: "D:/Ameow/.p2v-release-evidence/portable-extracted/Ameow_portable/resources/app/desktop-assets/binaries/python-x86_64-pc-windows-msvc",
  log: (line) => console.log(line),
  onActivity: () => undefined,
};
const result = {
  ytDlp: await ensureManagedYtDlpRuntimeReady("portable-release-evidence", options),
  deno: await ensureManagedDenoRuntimeReady("portable-release-evidence", options),
  ffmpeg: await ensureManagedFfmpegRuntimeReady("portable-release-evidence", options),
};
console.log(`RESULT ${JSON.stringify(result)}`);
