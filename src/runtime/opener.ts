import { getFlowSelectBridge } from "./bridge";

export async function openUrl(url: string): Promise<void> {
  const bridge = getFlowSelectBridge();
  if (bridge?.system) {
    return bridge.system.openExternal(url);
  }

  const mod = await import("@tauri-apps/plugin-opener");
  return mod.openUrl(url);
}
