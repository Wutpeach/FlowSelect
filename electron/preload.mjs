import { contextBridge, ipcRenderer } from "electron";

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld("flowselect", {
  commands: {
    invoke(command, payload) {
      return invoke("flowselect:command:invoke", { command, payload });
    },
  },
  events: {
    async on(event, listener) {
      const wrapped = (_ipcEvent, payload) => {
        if (payload?.event !== event) {
          return;
        }
        listener({ payload: payload.payload });
      };

      ipcRenderer.on("flowselect:event", wrapped);
      return () => {
        ipcRenderer.removeListener("flowselect:event", wrapped);
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
    startDragging() {
      return invoke("flowselect:current-window:start-dragging");
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
