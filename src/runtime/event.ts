import type {
  FlowSelectAppEvent,
  FlowSelectEventPayload,
  FlowSelectRendererEvent,
} from "../types/electronBridge";
import { getFlowSelectBridge } from "./bridge";

export async function listen<TPayload>(
  event: FlowSelectAppEvent | string,
  listener: (event: FlowSelectEventPayload<TPayload>) => void,
): Promise<() => void> {
  const bridge = getFlowSelectBridge();
  if (bridge?.events) {
    return bridge.events.on<TPayload>(event as FlowSelectAppEvent, listener);
  }

  const mod = await import("@tauri-apps/api/event");
  return mod.listen<TPayload>(event, listener);
}

export async function emit<TPayload>(
  event: FlowSelectRendererEvent | string,
  payload?: TPayload,
): Promise<void> {
  const bridge = getFlowSelectBridge();
  if (bridge?.events) {
    return bridge.events.emit<TPayload>(event as FlowSelectRendererEvent, payload as TPayload);
  }

  const mod = await import("@tauri-apps/api/event");
  return mod.emit(event, payload);
}
