type MacTrayAppModeOptions = {
  platform?: NodeJS.Platform;
};

type MacTrayAppLike = {
  setActivationPolicy?: (policy: "regular" | "accessory" | "prohibited") => void;
  dock?: {
    hide?: () => void;
  };
};

export function shouldUseMacTrayAppMode(
  { platform = process.platform }: MacTrayAppModeOptions = {},
) {
  return platform === "darwin";
}

export function applyMacTrayAppMode(
  electronApp: MacTrayAppLike | null | undefined,
  { platform = process.platform }: MacTrayAppModeOptions = {},
) {
  if (!shouldUseMacTrayAppMode({ platform })) {
    return false;
  }

  if (typeof electronApp?.setActivationPolicy === "function") {
    electronApp.setActivationPolicy("accessory");
  }

  if (typeof electronApp?.dock?.hide === "function") {
    electronApp.dock.hide();
  }

  return true;
}
