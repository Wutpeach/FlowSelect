import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import {
  ensureManagedFfmpegRuntimeReady,
  managedFfmpegPaths,
} from "file:///D:/Ameow/.p2v-release-evidence/portable-repair-extracted/Ameow_portable/resources/app/dist-electron/electron/managedRuntimeBootstrap.mjs";

const archive = "D:/Ameow/.p2v-release-evidence/verified-assets/ffmpeg-windows-x64-8.0.1.zip";
const configDir = "D:/Ameow/.p2v-release-evidence/portable-repair-profile/user-data";
const expectedUrl = "https://github.com/Tyrrrz/FFmpegBin/releases/download/8.0.1/ffmpeg-windows-x64.zip";
const options = {
  configDir,
  platform: "win32",
  arch: "x64",
  bundledPythonPath: "D:/Ameow/.p2v-release-evidence/portable-repair-extracted/Ameow_portable/resources/app/desktop-assets/binaries/python-x86_64-pc-windows-msvc/python.exe",
  fetch: async (url) => {
    if (url !== expectedUrl) throw new Error(`unexpected bootstrap asset URL: ${url}`);
    const details = await stat(archive);
    return new Response(Readable.toWeb(createReadStream(archive)), {
      headers: { "content-length": String(details.size) },
    });
  },
  log: (line) => console.log(line),
  onActivity: (activity) => console.log(`ACTIVITY ${JSON.stringify(activity)}`),
};

const ffmpeg = await ensureManagedFfmpegRuntimeReady("portable-repair-evidence", options);
console.log(`RESULT ${JSON.stringify({ ffmpeg, paths: managedFfmpegPaths(options) })}`);
