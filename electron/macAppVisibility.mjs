export function shouldUseMacTrayAppMode({ platform = process.platform } = {}) {
  return platform === "darwin";
}

export function applyMacTrayAppMode(electronApp, { platform = process.platform } = {}) {
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
