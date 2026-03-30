export const resolveRuntimeTarget = (
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
): string => {
  if (platform === "win32" && arch === "x64") {
    return "x86_64-pc-windows-msvc";
  }
  if (platform === "darwin" && arch === "arm64") {
    return "aarch64-apple-darwin";
  }
  if (platform === "darwin" && arch === "x64") {
    return "x86_64-apple-darwin";
  }
  throw new Error(`Unsupported Electron runtime platform: ${platform}-${arch}`);
};

export const executableExtensionFor = (platform: NodeJS.Platform): string =>
  platform === "win32" ? ".exe" : "";

export const ytDlpBinaryNameFor = (
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
): string => `yt-dlp-${resolveRuntimeTarget(platform, arch)}${executableExtensionFor(platform)}`;

export const galleryDlBinaryNameFor = (
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
): string =>
  `gallery-dl-${resolveRuntimeTarget(platform, arch)}${executableExtensionFor(platform)}`;

export const galleryDlSystemBinaryNameFor = (
  platform: NodeJS.Platform,
): string => `gallery-dl${executableExtensionFor(platform)}`;

export const denoBinaryNameFor = (platform: NodeJS.Platform): string =>
  `deno${executableExtensionFor(platform)}`;

export const ffmpegBinaryNameFor = (platform: NodeJS.Platform): string =>
  `ffmpeg${executableExtensionFor(platform)}`;

export const ffprobeBinaryNameFor = (platform: NodeJS.Platform): string =>
  `ffprobe${executableExtensionFor(platform)}`;

