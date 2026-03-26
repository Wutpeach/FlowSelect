import type { FlowSelectRendererCommand } from "../types/electronBridge";
import { getFlowSelectBridge } from "./bridge";

export async function invoke<TResult>(
  command: FlowSelectRendererCommand | string,
  payload?: Record<string, unknown>,
): Promise<TResult> {
  const bridge = getFlowSelectBridge();
  if (bridge?.commands) {
    return bridge.commands.invoke<TResult>(
      command as FlowSelectRendererCommand,
      payload,
    );
  }

  const mod = await import("@tauri-apps/api/core");
  return mod.invoke<TResult>(command, payload);
}
