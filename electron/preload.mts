// @ts-nocheck
import { contextBridge, ipcRenderer, webUtils } from "electron";

import {
  parseLocalPathFromDropText,
  VALIDATE_DROPPED_FOLDER_PATH_CHANNEL,
} from "./folderDrop.mjs";
import { parseStartupWindowModeArgument } from "./startupWindowMode.mjs";

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);
const eventChannel = (event) => `flowselect:event:${event}`;
let pendingFolderDropPromise = null;
const startupWindowMode = parseStartupWindowModeArgument(process.argv);

const hasLocalFileItems = (dataTransfer) => (
  Boolean(dataTransfer)
  && (
    dataTransfer.files.length > 0
    || Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file")
  )
);

const resolvePathFromFile = (file) => {
  try {
    const resolved = webUtils.getPathForFile(file);
    return typeof resolved === "string" && resolved.trim() ? resolved.trim() : null;
  } catch {
    return null;
  }
};

const resolveLocalPathFromDataTransfer = (dataTransfer) => {
  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== "file") {
      continue;
    }

    const file = item.getAsFile?.();
    if (!file) {
      continue;
    }

    const resolvedFromItem = resolvePathFromFile(file);
    if (resolvedFromItem) {
      return resolvedFromItem;
    }
  }

  for (const file of Array.from(dataTransfer.files ?? [])) {
    const resolvedFromFile = resolvePathFromFile(file);
    if (resolvedFromFile) {
      return resolvedFromFile;
    }
  }

  const fallbackFromUriList = parseLocalPathFromDropText(dataTransfer.getData("text/uri-list"));
  if (fallbackFromUriList) {
    return fallbackFromUriList;
  }

  return parseLocalPathFromDropText(dataTransfer.getData("text/plain"));
};

const resolvePendingFolderDrop = async (dataTransfer) => {
  if (!hasLocalFileItems(dataTransfer)) {
    return null;
  }

  const path = resolveLocalPathFromDataTransfer(dataTransfer);
  if (!path) {
    return {
      success: false,
      path: "",
      error: "Could not resolve a path from the dropped item.",
      reason: "UNRESOLVED_DROP",
    };
  }

  try {
    return await invoke(VALIDATE_DROPPED_FOLDER_PATH_CHANNEL, { path });
  } catch {
    return {
      success: false,
      path,
      error: "Failed to validate the dropped folder.",
      reason: "PRELOAD_ERROR",
    };
  }
};

window.addEventListener("drop", (event) => {
  pendingFolderDropPromise = resolvePendingFolderDrop(event.dataTransfer ?? null);
}, true);

contextBridge.exposeInMainWorld("flowselect", {
  commands: {
    invoke(command, payload) {
      return invoke("flowselect:command:invoke", { command, payload });
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
      return invoke("flowselect:event:emit", { event, payload });
    },
  },
  windows: {
    has(label) {
      return invoke("flowselect:window:has", { label });
    },
    focus(label) {
      return invoke("flowselect:window:focus", { label });
    },
    close(label) {
      return invoke("flowselect:window:close", { label });
    },
    openSettings(options) {
      return invoke("flowselect:window:open-settings", { options });
    },
    openContextMenu(options) {
      return invoke("flowselect:window:open-context-menu", { options });
    },
    openUiLab(options) {
      return invoke("flowselect:window:open-ui-lab", { options });
    },
  },
  currentWindow: {
    outerPosition() {
      return invoke("flowselect:current-window:outer-position");
    },
    outerSize() {
      return invoke("flowselect:current-window:outer-size");
    },
    scaleFactor() {
      return invoke("flowselect:current-window:scale-factor");
    },
    startupWindowMode() {
      return startupWindowMode;
    },
    startDragging() {
      return invoke("flowselect:current-window:start-dragging");
    },
    setPosition(position) {
      ipcRenderer.send("flowselect:current-window:set-position", position);
    },
    animateBounds(bounds, options) {
      return invoke("flowselect:current-window:animate-bounds", { bounds, options });
    },
    rendererReady() {
      return invoke("flowselect:current-window:renderer-ready");
    },
    close() {
      return invoke("flowselect:current-window:close");
    },
    hide() {
      return invoke("flowselect:current-window:hide");
    },
    async onFocusChanged(listener) {
      const wrapped = (_ipcEvent, focused) => {
        listener({ payload: Boolean(focused) });
      };
      ipcRenderer.on("flowselect:current-window:focus-changed", wrapped);
      return () => {
        ipcRenderer.removeListener("flowselect:current-window:focus-changed", wrapped);
      };
    },
    async onBlur(listener) {
      const wrapped = () => {
        listener();
      };
      ipcRenderer.on("flowselect:current-window:blur", wrapped);
      return () => {
        ipcRenderer.removeListener("flowselect:current-window:blur", wrapped);
      };
    },
  },
  system: {
    currentMonitor() {
      return invoke("flowselect:system:current-monitor");
    },
    openDialog(options) {
      return invoke("flowselect:system:open-dialog", { options });
    },
    openExternal(url) {
      return invoke("flowselect:system:open-external", { url });
    },
    relaunch() {
      return invoke("flowselect:system:relaunch");
    },
  },
  drop: {
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
      return invoke("flowselect:clipboard:read-image");
    },
  },
  updater: {
    check() {
      return invoke("flowselect:updater:check");
    },
    downloadAndInstall() {
      return invoke("flowselect:updater:download-and-install");
    },
  },
});
