import path from "node:path";
import { buildYtdlpCommandArgs } from "file:///D:/Ameow/.p2v-release-evidence/installed-nsis/resources/app/dist-electron/src/electron-runtime/ytDlpCommandPlan.js";
import { runCapturedCommand } from "file:///D:/Ameow/.p2v-release-evidence/installed-nsis/resources/app/dist-electron/src/electron-runtime/processRunner.js";

const runtimeRoot = "D:/Ameow/.p2v-release-evidence/installed-profile/user-data/runtimes";
const ytDlp = `${runtimeRoot}/yt-dlp/x86_64-pc-windows-msvc/venv/Scripts/yt-dlp.exe`;
const deno = `${runtimeRoot}/deno/x86_64-pc-windows-msvc/real/deno.exe`;
const ffmpeg = `${runtimeRoot}/ffmpeg/x86_64-pc-windows-msvc/real/ffmpeg.exe`;
const fixtureRoot = "D:/Ameow/.p2v-release-evidence/fixtures";
const plan = {
  sourceUrl: "https://www.youtube.com/watch?v=BaW_jenozKc",
  isYouTube: true,
  clipRange: null,
  reportPath: `${fixtureRoot}/yt-after-move.txt`,
  titleReportPath: `${fixtureRoot}/yt-title.txt`,
  outputTemplate: `${fixtureRoot}/yt.%(ext)s`,
  artifactPrefixes: ["yt"],
  ffmpegDir: path.dirname(ffmpeg),
  formatProfile: { selector: "bestvideo+bestaudio/best", sort: null, mergeOutputFormat: "mp4/mkv" },
};
const args = buildYtdlpCommandArgs(plan, {
  cookiesPath: null,
  hasFfmpeg: true,
  denoPath: deno,
  platform: "win32",
});
const denoArg = `deno:${deno}`;
const authority = {
  executable: ytDlp,
  denoArg,
  usesManagedDeno: args.includes(denoArg),
  usesManagedFfmpeg: args[args.indexOf("--ffmpeg-location") + 1] === path.dirname(ffmpeg),
  ignoresConfig: args.includes("--ignore-config"),
  disablesPlugins: args.includes("--no-plugin-dirs"),
  containsRemoteEjs: args.some((arg) => arg.includes("ejs:github")),
  containsBareNodeOrDeno: args.some((arg) => arg === "node" || arg === "deno" || arg === "deno:"),
};
console.log(`AUTHORITY ${JSON.stringify(authority)}`);
console.log(`PLAN_ARGS ${JSON.stringify(args)}`);

const safeArgs = [...args.slice(0, -1), "--simulate", "--skip-download", "--socket-timeout", "10", "--retries", "0", args.at(-1)];
const result = await runCapturedCommand(ytDlp, safeArgs);
console.log(`EXECUTION ${JSON.stringify({ exitCode: result.exitCode, stdout: result.stdout.slice(0, 2000), stderr: result.stderr.slice(0, 2000) })}`);
