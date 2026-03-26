import type {
  FlowSelectContextMenuWindowOptions,
  FlowSelectDisplay,
  FlowSelectEventPayload,
  FlowSelectPoint,
  FlowSelectSecondaryWindowOptions,
  FlowSelectSize,
  FlowSelectWindowLabel,
} from "../types/electronBridge";
import { getFlowSelectBridge } from "./bridge";

type TauriCurrentWindowModule = typeof import("@tauri-apps/api/window");
type TauriWebviewWindowModule = typeof import("@tauri-apps/api/webviewWindow");

type WindowListener<TPayload> = (event: FlowSelectEventPayload<TPayload>) => void;

type WindowOpenOptions = {
  url?: string;
  title: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  center?: boolean;
  alwaysOnTop?: boolean;
  focus?: boolean;
  skipTaskbar?: boolean;
  decorations?: boolean;
  transparent?: boolean;
  resizable?: boolean;
  shadow?: boolean;
  parent?: "main";
};

const getTauriWindowModule = async (): Promise<TauriCurrentWindowModule> =>
  import("@tauri-apps/api/window");

const getTauriWebviewWindowModule = async (): Promise<TauriWebviewWindowModule> =>
  import("@tauri-apps/api/webviewWindow");

type TauriWindowLike = {
  outerPosition(): Promise<FlowSelectPoint>;
  outerSize(): Promise<FlowSelectSize>;
  scaleFactor(): Promise<number>;
  startDragging(): Promise<void>;
  close(): Promise<void>;
  hide(): Promise<void>;
  onFocusChanged(
    listener: WindowListener<boolean>,
  ): Promise<() => void>;
  onBlur?: (listener: () => void) => Promise<() => void>;
  listen<TPayload>(
    event: string,
    listener: (event: FlowSelectEventPayload<TPayload>) => void,
  ): Promise<() => void>;
};

class RuntimeCurrentWindow {
  private async getTauriWindow(): Promise<TauriWindowLike> {
    const mod = await getTauriWindowModule();
    return mod.getCurrentWindow();
  }

  async outerPosition(): Promise<FlowSelectPoint> {
    const bridge = getFlowSelectBridge();
    if (bridge?.currentWindow) {
      return bridge.currentWindow.outerPosition();
    }

    const window = await this.getTauriWindow();
    return window.outerPosition();
  }

  async outerSize(): Promise<FlowSelectSize> {
    const bridge = getFlowSelectBridge();
    if (bridge?.currentWindow) {
      return bridge.currentWindow.outerSize();
    }

    const window = await this.getTauriWindow();
    return window.outerSize();
  }

  async scaleFactor(): Promise<number> {
    const bridge = getFlowSelectBridge();
    if (bridge?.currentWindow) {
      return bridge.currentWindow.scaleFactor();
    }

    const window = await this.getTauriWindow();
    return window.scaleFactor();
  }

  async startDragging(): Promise<void> {
    const bridge = getFlowSelectBridge();
    if (bridge?.currentWindow) {
      return bridge.currentWindow.startDragging();
    }

    const window = await this.getTauriWindow();
    return window.startDragging();
  }

  async close(): Promise<void> {
    const bridge = getFlowSelectBridge();
    if (bridge?.currentWindow) {
      return bridge.currentWindow.close();
    }

    const window = await this.getTauriWindow();
    return window.close();
  }

  async hide(): Promise<void> {
    const bridge = getFlowSelectBridge();
    if (bridge?.currentWindow) {
      return bridge.currentWindow.hide();
    }

    const window = await this.getTauriWindow();
    return window.hide();
  }

  async onFocusChanged(
    listener: WindowListener<boolean>,
  ): Promise<() => void> {
    const bridge = getFlowSelectBridge();
    if (bridge?.currentWindow) {
      return bridge.currentWindow.onFocusChanged(listener);
    }

    const window = await this.getTauriWindow();
    return window.onFocusChanged(listener);
  }

  async onBlur(listener: () => void): Promise<() => void> {
    const bridge = getFlowSelectBridge();
    if (bridge?.currentWindow) {
      return bridge.currentWindow.onBlur(listener);
    }

    const window = await this.getTauriWindow();
    if (window.onBlur) {
      return window.onBlur(listener);
    }

    return window.listen("tauri://blur", () => {
      listener();
    });
  }

  async listen<TPayload>(
    event: string,
    listener: (event: FlowSelectEventPayload<TPayload>) => void,
  ): Promise<() => void> {
    if (event === "tauri://blur") {
      return this.onBlur(() => {
        listener({ payload: undefined as TPayload });
      });
    }

    const window = await this.getTauriWindow();
    return window.listen<TPayload>(event, listener);
  }
}

const currentWindow = new RuntimeCurrentWindow();

export const getCurrentWindow = () => currentWindow;

export class PhysicalPosition {
  x: number;
  y: number;

  constructor(position: FlowSelectPoint);
  constructor(x: number, y: number);
  constructor(positionOrX: FlowSelectPoint | number, y?: number) {
    if (typeof positionOrX === "number") {
      this.x = positionOrX;
      this.y = y ?? 0;
      return;
    }

    this.x = positionOrX.x;
    this.y = positionOrX.y;
  }

  toLogical(scaleFactor: number): FlowSelectPoint {
    return {
      x: this.x / scaleFactor,
      y: this.y / scaleFactor,
    };
  }
}

class RuntimeWebviewWindowRef {
  constructor(private readonly label: FlowSelectWindowLabel) {}

  async setFocus(): Promise<void> {
    const bridge = getFlowSelectBridge();
    if (bridge?.windows) {
      return bridge.windows.focus(this.label);
    }

    const mod = await getTauriWebviewWindowModule();
    const existing = await mod.WebviewWindow.getByLabel(this.label);
    if (existing) {
      await existing.setFocus();
    }
  }

  async close(): Promise<void> {
    const bridge = getFlowSelectBridge();
    if (bridge?.windows && this.label !== "main") {
      return bridge.windows.close(this.label);
    }

    const mod = await getTauriWebviewWindowModule();
    const existing = await mod.WebviewWindow.getByLabel(this.label);
    if (existing) {
      await existing.close();
    }
  }
}

const toBridgeWindowOptions = (
  options: WindowOpenOptions,
): FlowSelectSecondaryWindowOptions => ({
  title: options.title,
  width: options.width,
  height: options.height,
  x: options.x,
  y: options.y,
  center: options.center,
  alwaysOnTop: options.alwaysOnTop,
  focus: options.focus,
  skipTaskbar: options.skipTaskbar,
});

const toBridgeContextMenuOptions = (
  options: WindowOpenOptions,
): FlowSelectContextMenuWindowOptions => ({
  ...toBridgeWindowOptions(options),
  parent: "main",
});

export class WebviewWindow {
  private readonly ref: RuntimeWebviewWindowRef;

  constructor(
    label: "settings" | "context-menu",
    options: WindowOpenOptions,
  ) {
    this.ref = new RuntimeWebviewWindowRef(label);
    const bridge = getFlowSelectBridge();
    if (bridge?.windows) {
      if (label === "settings") {
        void bridge.windows.openSettings(toBridgeWindowOptions(options));
      } else {
        void bridge.windows.openContextMenu(toBridgeContextMenuOptions(options));
      }
      return;
    }

    void (async () => {
      const mod = await getTauriWebviewWindowModule();
      new mod.WebviewWindow(label, options);
    })();
  }

  async setFocus(): Promise<void> {
    return this.ref.setFocus();
  }

  async close(): Promise<void> {
    return this.ref.close();
  }

  static async getByLabel(
    label: FlowSelectWindowLabel,
  ): Promise<RuntimeWebviewWindowRef | null> {
    const bridge = getFlowSelectBridge();
    if (bridge?.windows) {
      return (await bridge.windows.has(label))
        ? new RuntimeWebviewWindowRef(label)
        : null;
    }

    const mod = await getTauriWebviewWindowModule();
    const existing = await mod.WebviewWindow.getByLabel(label);
    return existing ? new RuntimeWebviewWindowRef(label) : null;
  }
}

export async function currentMonitor(): Promise<FlowSelectDisplay | null> {
  const bridge = getFlowSelectBridge();
  if (bridge?.system) {
    return bridge.system.currentMonitor();
  }

  const mod = await getTauriWindowModule();
  return mod.currentMonitor();
}
