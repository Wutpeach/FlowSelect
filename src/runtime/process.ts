import { getFlowSelectBridge } from "./bridge";

export async function relaunch(): Promise<void> {
  const bridge = getFlowSelectBridge();
  if (bridge?.system) {
    return bridge.system.relaunch();
  }

  const mod = await import("@tauri-apps/plugin-process");
  return mod.relaunch();
}
