export const ELECTRON_BUILDER_OUTPUT_DIR = "dist-release";
export const ELECTRON_PORTABLE_SUBDIR = "portable";
export const ELECTRON_DMG_SUBDIR = "dmg";

const BUILDER_ARGS = new Set(process.argv.slice(2));

function resolveBuilderPlatform() {
  if (BUILDER_ARGS.has("--win")) {
    return "win32";
  }
  if (BUILDER_ARGS.has("--mac")) {
    return "darwin";
  }
  return process.platform;
}

function resolveBuilderArch() {
  if (BUILDER_ARGS.has("--x64")) {
    return "x64";
  }
  if (BUILDER_ARGS.has("--arm64")) {
    return "arm64";
  }
  return process.arch;
}

function resolveDownloaderTarget(platform, arch) {
  if (platform === "win32" && arch === "x64") {
    return "x86_64-pc-windows-msvc";
  }
  if (platform === "darwin" && arch === "arm64") {
    return "aarch64-apple-darwin";
  }
  if (platform === "darwin" && arch === "x64") {
    return "x86_64-apple-darwin";
  }
  return null;
}

function packagedBinaryPatterns() {
  const target = resolveDownloaderTarget(resolveBuilderPlatform(), resolveBuilderArch());
  const patterns = [
    "desktop-assets/binaries/.official-downloader-binaries.json",
    "desktop-assets/binaries/deno",
  ];
  if (!target) {
    return patterns;
  }
  return [
    ...patterns,
    `desktop-assets/binaries/yt-dlp-${target}*`,
    `desktop-assets/binaries/gallery-dl-${target}*`,
  ];
}

const PACKAGED_BINARY_PATTERNS = packagedBinaryPatterns();
const NODE_MODULES_JUNK_EXCLUDES = [
  "!**/node_modules/**/*.map",
  "!**/node_modules/**/src/**",
  "!**/node_modules/**/{README,README.*,readme,readme.*,CHANGELOG,CHANGELOG.*,changelog,changelog.*,LICENSE,LICENSE.*,license,license.*,AUTHORS,AUTHORS.*,authors,authors.*}",
  "!**/node_modules/**/{test,tests,__tests__,example,examples,docs,doc,coverage,.github}/**",
];

export default {
  appId: "com.flowselect.desktop",
  productName: "FlowSelect",
  executableName: "FlowSelect",
  asar: false,
  directories: {
    output: ELECTRON_BUILDER_OUTPUT_DIR,
  },
  files: [
    "dist/**/*",
    "dist-electron/**/*",
    "locales/**/*",
    ...PACKAGED_BINARY_PATTERNS,
    "desktop-assets/icons/icon.ico",
    "app-icon.png",
    "public/favicon.ico",
    ...NODE_MODULES_JUNK_EXCLUDES,
  ],
  win: {
    icon: "desktop-assets/icons/icon.ico",
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
    artifactName: "FlowSelect_${version}_windows_${arch}_installer.${ext}",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
  },
  mac: {
    icon: "desktop-assets/icons/icon.icns",
    target: ["zip"],
    artifactName: "FlowSelect_${version}_macos_${arch}.${ext}",
    category: "public.app-category.utilities",
    identity: null,
    hardenedRuntime: false,
    gatekeeperAssess: false,
  },
};
