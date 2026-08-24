// @ts-nocheck
import { contextBridge, ipcRenderer, webUtils } from "electron";

import { VALIDATE_DROPPED_FOLDER_PATH_CHANNEL } from "./folderDrop.mjs";
import {
  resolveLocalFilePathsFromDataTransfer,
  resolvePendingFolderDrop,
} from "./preloadDrop.mjs";

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);
const eventChannel = (event) => `ameow:event:${event}`;
let pendingFolderDropPromise = null;
let pendingFileDropPaths = [];

const resolvePathFromFile = (file) => {
  try {
    const resolved = webUtils.getPathForFile(file);
    return typeof resolved === "string" && resolved.trim() ? resolved.trim() : null;
  } catch {
    return null;
  }
};

window.addEventListener("drop", (event) => {
  pendingFileDropPaths = resolveLocalFilePathsFromDataTransfer(
    event.dataTransfer ?? null,
    resolvePathFromFile,
  );
  pendingFolderDropPromise = resolvePendingFolderDrop(event.dataTransfer ?? null, {
    resolvePathFromFile,
    validateDroppedFolderPath: async (path) => (
      invoke(VALIDATE_DROPPED_FOLDER_PATH_CHANNEL, { path })
    ),
  });
}, true);

contextBridge.exposeInMainWorld("ameow", {
  commands: {
    invoke(command, payload) {
      return invoke("ameow:command:invoke", { command, payload });
    },
  },
  events: {
    async on(event, listener) {
      const channel = eventChannel(event);
      const wrapped = (_ipcEvent, payload) => {
        listener(payload);
      };

      ipcRenderer.on(channel, wrapped);
      return () => {
        ipcRenderer.removeListener(channel, wrapped);
      };
    },
    emit(event, payload) {
      return invoke("ameow:event:emit", { event, payload });
    },
  },
  windows: {
    has(label) {
      return invoke("ameow:window:has", { label });
    },
    focus(label) {
      return invoke("ameow:window:focus", { label });
    },
    close(label) {
      return invoke("ameow:window:close", { label });
    },
    openSettings(options) {
      return invoke("ameow:window:open-settings", { options });
    },
    openContextMenu(options) {
      return invoke("ameow:window:open-context-menu", { options });
    },
  },
  currentWindow: {
    outerPosition() {
      return invoke("ameow:current-window:outer-position");
    },
    outerSize() {
      return invoke("ameow:current-window:outer-size");
    },
    scaleFactor() {
      return invoke("ameow:current-window:scale-factor");
    },
    startDragging() {
      return invoke("ameow:current-window:start-dragging");
    },
    setPosition(position) {
      ipcRenderer.send("ameow:current-window:set-position", position);
    },
    setInteractionMode(mode) {
      ipcRenderer.send("ameow:current-window:set-interaction-mode", { mode });
    },
    ensureMainWindowCompactReachable(options) {
      return invoke("ameow:current-window:ensure-compact-reachable", options);
    },
    cancelCompactReachability() {
      ipcRenderer.send("ameow:current-window:cancel-compact-reachability");
    },
    rendererReady() {
      return invoke("ameow:current-window:renderer-ready");
    },
    close() {
      return invoke("ameow:current-window:close");
    },
    hide() {
      return invoke("ameow:current-window:hide");
    },
    async onFocusChanged(listener) {
      const wrapped = (_ipcEvent, focused) => {
        listener({ payload: Boolean(focused) });
      };
      ipcRenderer.on("ameow:current-window:focus-changed", wrapped);
      return () => {
        ipcRenderer.removeListener("ameow:current-window:focus-changed", wrapped);
      };
    },
    async onBlur(listener) {
      const wrapped = () => {
        listener();
      };
      ipcRenderer.on("ameow:current-window:blur", wrapped);
      return () => {
        ipcRenderer.removeListener("ameow:current-window:blur", wrapped);
      };
    },
    async onPointerBoundaryChanged(listener) {
      const wrapped = (_ipcEvent, payload) => {
        listener({ payload: { inside: Boolean(payload?.inside) } });
      };
      ipcRenderer.on("ameow:current-window:pointer-boundary", wrapped);
      return () => {
        ipcRenderer.removeListener("ameow:current-window:pointer-boundary", wrapped);
      };
    },
  },
  system: {
    currentMonitor() {
      return invoke("ameow:system:current-monitor");
    },
    openDialog(options) {
      return invoke("ameow:system:open-dialog", { options });
    },
    openExternal(url) {
      return invoke("ameow:system:open-external", { url });
    },
    relaunch() {
      return invoke("ameow:system:relaunch");
    },
  },
  drop: {
    async consumePendingFileDropPaths() {
      const paths = pendingFileDropPaths;
      pendingFileDropPaths = [];
      return paths;
    },
    async consumePendingFolderDrop() {
      const pending = pendingFolderDropPromise;
      pendingFolderDropPromise = null;
      if (!pending) {
        return null;
      }
      return pending;
    },
  },
  clipboard: {
    readImage() {
      return invoke("ameow:clipboard:read-image");
    },
  },
  updater: {
    check() {
      return invoke("ameow:updater:check");
    },
    getState() {
      return invoke("ameow:updater:get-state");
    },
    notifyPreferenceChanged() {
      return invoke("ameow:updater:preference-changed");
    },
    downloadAndInstall() {
      return invoke("ameow:updater:download-and-install");
    },
  },
});
