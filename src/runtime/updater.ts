import type { AppUpdateInfo } from "../types/appUpdate";
import { getFlowSelectBridge } from "./bridge";

type TauriUpdateEvent =
  | {
      event: "Started";
    }
  | {
      event: "Progress";
      data: {
        chunkLength: number;
        contentLength?: number | null;
      };
    }
  | {
      event: "Finished";
    };

export type Update = {
  currentVersion?: string | null;
  version: string;
  body?: string | null;
  date?: string | null;
  downloadAndInstall(
    onEvent?: (event: TauriUpdateEvent) => void,
  ): Promise<void>;
  close(): Promise<void>;
};

class ElectronUpdateHandle implements Update {
  currentVersion: string | null;
  version: string;
  body: string | null;
  date: string | null;

  constructor(info: AppUpdateInfo) {
    this.currentVersion = info.current;
    this.version = info.latest;
    this.body = info.notes;
    this.date = info.publishedAt;
  }

  async downloadAndInstall(
    onEvent?: (event: TauriUpdateEvent) => void,
  ): Promise<void> {
    onEvent?.({ event: "Started" });
    await window.flowselect?.updater.downloadAndInstall();
    onEvent?.({ event: "Finished" });
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

export async function check(): Promise<Update | null> {
  const bridge = getFlowSelectBridge();
  if (bridge?.updater) {
    const info = await bridge.updater.check();
    return info ? new ElectronUpdateHandle(info) : null;
  }

  const mod = await import("@tauri-apps/plugin-updater");
  return mod.check();
}
