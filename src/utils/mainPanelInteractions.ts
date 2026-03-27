export const PANEL_DOUBLE_CLICK_IGNORE_SELECTOR = "button, [data-panel-double-click='ignore']";
export const WINDOW_DRAG_START_THRESHOLD = 6;

export const shouldIgnorePanelDoubleClickTarget = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(PANEL_DOUBLE_CLICK_IGNORE_SELECTOR) !== null;

type ResolvePanelPointerCaptureIdInput = {
  eventPointerId?: number | null;
  activePointerId?: number | null;
  pendingPointerId?: number | null;
};

export const resolvePanelPointerCaptureId = ({
  eventPointerId,
  activePointerId,
  pendingPointerId,
}: ResolvePanelPointerCaptureIdInput): number | null => {
  if (typeof eventPointerId === "number") {
    return eventPointerId;
  }
  if (typeof activePointerId === "number") {
    return activePointerId;
  }
  if (typeof pendingPointerId === "number") {
    return pendingPointerId;
  }
  return null;
};

type PanelMouseDownDoubleClickShortcutInput = {
  isMacOS: boolean;
  button: number;
  detail: number;
  canDoubleClickOpenOutputFolder: boolean;
  targetIgnored: boolean;
};

export const shouldOpenOutputFolderFromPanelMouseDownDoubleClick = ({
  isMacOS,
  button,
  detail,
  canDoubleClickOpenOutputFolder,
  targetIgnored,
}: PanelMouseDownDoubleClickShortcutInput): boolean => (
  isMacOS
  && button === 0
  && detail >= 2
  && canDoubleClickOpenOutputFolder
  && !targetIgnored
);
