import type { FlowSelectDialogOpenOptions } from "../types/electronBridge";
import { getFlowSelectBridge } from "./bridge";

export async function open(
  options: FlowSelectDialogOpenOptions,
): Promise<string | string[] | null> {
  const bridge = getFlowSelectBridge();
  if (bridge?.system) {
    return bridge.system.openDialog(options);
  }

  const mod = await import("@tauri-apps/plugin-dialog");
  return mod.open(options);
}
