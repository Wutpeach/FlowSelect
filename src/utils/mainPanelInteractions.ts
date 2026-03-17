export const PANEL_DOUBLE_CLICK_IGNORE_SELECTOR = "button, [data-panel-double-click='ignore']";
export const WINDOW_DRAG_START_THRESHOLD = 6;

export const shouldIgnorePanelDoubleClickTarget = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(PANEL_DOUBLE_CLICK_IGNORE_SELECTOR) !== null;

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
