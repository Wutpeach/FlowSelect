import { contextBridge, ipcRenderer } from "electron";

const BRIDGE_CHANNEL = "flowselect:bridge";
const EVENT_CHANNEL_PREFIX = "flowselect:event:";
const WINDOW_FOCUS_CHANNEL = "flowselect:window:focus-changed";
const WINDOW_BLUR_CHANNEL = "flowselect:window:blur";

const bridge = {
  commands: {
    invoke(command: string, payload?: Record<string, unknown>) {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "command.invoke",
        command,
        payload,
      });
    },
  },
  events: {
    on(event: string, listener: (payload: { payload: unknown }) => void) {
      const channel = `${EVENT_CHANNEL_PREFIX}${event}`;
      const wrapped = (_event: Electron.IpcRendererEvent, payload: { payload: unknown }) => {
        listener(payload);
      };

      ipcRenderer.on(channel, wrapped);
      return Promise.resolve(() => {
        ipcRenderer.off(channel, wrapped);
      });
    },
    emit(event: string, payload: unknown) {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "event.emit",
        event,
        payload,
      });
    },
  },
  windows: {
    has(label: string) {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "window.has",
        label,
      });
    },
    focus(label: string) {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "window.focus",
        label,
      });
    },
    close(label: string) {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "window.close",
        label,
      });
    },
    openSettings(options: Record<string, unknown>) {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "window.openSettings",
        options,
      });
    },
    openContextMenu(options: Record<string, unknown>) {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "window.openContextMenu",
        options,
      });
    },
  },
  currentWindow: {
    outerPosition() {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "currentWindow.outerPosition",
      });
    },
    outerSize() {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "currentWindow.outerSize",
      });
    },
    scaleFactor() {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "currentWindow.scaleFactor",
      });
    },
    startDragging() {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "currentWindow.startDragging",
      });
    },
    close() {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "currentWindow.close",
      });
    },
    hide() {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "currentWindow.hide",
      });
    },
    onFocusChanged(listener: (payload: { payload: boolean }) => void) {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: { payload: boolean }) => {
        listener(payload);
      };

      ipcRenderer.on(WINDOW_FOCUS_CHANNEL, wrapped);
      return Promise.resolve(() => {
        ipcRenderer.off(WINDOW_FOCUS_CHANNEL, wrapped);
      });
    },
    onBlur(listener: () => void) {
      const wrapped = () => {
        listener();
      };

      ipcRenderer.on(WINDOW_BLUR_CHANNEL, wrapped);
      return Promise.resolve(() => {
        ipcRenderer.off(WINDOW_BLUR_CHANNEL, wrapped);
      });
    },
  },
  system: {
    currentMonitor() {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "system.currentMonitor",
      });
    },
    openDialog(options: Record<string, unknown>) {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "system.openDialog",
        options,
      });
    },
    openExternal(url: string) {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "system.openExternal",
        payload: { url },
      });
    },
    relaunch() {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "system.relaunch",
      });
    },
  },
  clipboard: {
    readImage() {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "clipboard.readImage",
      });
    },
  },
  updater: {
    check() {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "updater.check",
      });
    },
    downloadAndInstall() {
      return ipcRenderer.invoke(BRIDGE_CHANNEL, {
        method: "updater.downloadAndInstall",
      });
    },
  },
};

contextBridge.exposeInMainWorld("flowselect", bridge);
