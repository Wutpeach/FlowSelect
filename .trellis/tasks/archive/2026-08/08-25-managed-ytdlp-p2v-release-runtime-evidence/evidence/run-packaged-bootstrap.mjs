import {
  ensureManagedDenoRuntimeReady,
  ensureManagedFfmpegRuntimeReady,
  ensureManagedYtDlpRuntimeReady,
  managedDenoPath,
  managedFfmpegPaths,
  managedYtDlpPaths,
} from "file:///D:/Ameow/.p2v-release-evidence/installed-nsis/resources/app/dist-electron/electron/managedRuntimeBootstrap.mjs";

const configDir = "D:/Ameow/.p2v-release-evidence/installed-profile/user-data";
const bundledPythonPath = "D:/Ameow/.p2v-release-evidence/installed-nsis/resources/app/desktop-assets/binaries/python-x86_64-pc-windows-msvc/python.exe";
const options = {
  configDir,
  platform: "win32",
  arch: "x64",
  fetch: globalThis.fetch,
  bundledPythonPath,
  bundledPythonRoot: "D:/Ameow/.p2v-release-evidence/installed-nsis/resources/app/desktop-assets/binaries/python-x86_64-pc-windows-msvc",
  log: (line) => console.log(line),
  onActivity: (activity) => console.log(`ACTIVITY ${JSON.stringify(activity)}`),
};

const result = {
  bundledPythonPath,
  ytDlp: await ensureManagedYtDlpRuntimeReady("release-evidence", options),
  deno: await ensureManagedDenoRuntimeReady("release-evidence", options),
  ffmpeg: await ensureManagedFfmpegRuntimeReady("release-evidence", options),
  resolved: {
    ytDlp: managedYtDlpPaths(options),
    deno: managedDenoPath(options),
    ffmpeg: managedFfmpegPaths(options),
  },
};
console.log(`RESULT ${JSON.stringify(result, null, 2)}`);
