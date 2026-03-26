import type { FlowSelectElectronBridge } from "./types/electronBridge";

declare global {
  interface Window {
    flowselect?: FlowSelectElectronBridge;
  }
}

export {};
