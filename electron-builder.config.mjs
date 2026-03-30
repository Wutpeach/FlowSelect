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
    "desktop-assets/binaries/**/*",
    "desktop-assets/icons/icon.ico",
    "app-icon.png",
    "public/favicon.ico",
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
