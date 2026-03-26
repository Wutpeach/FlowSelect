import type { FlowSelectClipboardImage } from "../types/electronBridge";
import { getFlowSelectBridge } from "./bridge";

type ClipboardImageSize = {
  width: number;
  height: number;
};

type ClipboardImageLike = {
  size(): Promise<ClipboardImageSize>;
  rgba(): Promise<Uint8Array>;
};

class ElectronClipboardImage implements ClipboardImageLike {
  constructor(private readonly image: FlowSelectClipboardImage) {}

  async size(): Promise<ClipboardImageSize> {
    return {
      width: this.image.width,
      height: this.image.height,
    };
  }

  async rgba(): Promise<Uint8Array> {
    return Uint8Array.from(this.image.rgba);
  }
}

export async function readImage(): Promise<ClipboardImageLike | null> {
  const bridge = getFlowSelectBridge();
  if (bridge?.clipboard) {
    const image = await bridge.clipboard.readImage();
    return image ? new ElectronClipboardImage(image) : null;
  }

  const mod = await import("@tauri-apps/plugin-clipboard-manager");
  return mod.readImage();
}
