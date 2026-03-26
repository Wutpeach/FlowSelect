export const ELECTRON_BUILDER_OUTPUT_DIR = "dist-release";
export const ELECTRON_PORTABLE_SUBDIR = "portable";
export const ELECTRON_DMG_SUBDIR = "dmg";

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
    "src-tauri/binaries/**/*",
    "src-tauri/pinterest-sidecar/lock.json",
    "app-icon.png",
    "public/favicon.ico",
  ],
  win: {
    icon: "src-tauri/icons/icon.ico",
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
    icon: "src-tauri/icons/icon.icns",
    target: ["zip"],
    artifactName: "FlowSelect_${version}_macos_${arch}.${ext}",
    category: "public.app-category.utilities",
    identity: null,
    hardenedRuntime: false,
    gatekeeperAssess: false,
  },
};
