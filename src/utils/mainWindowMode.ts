import type { AppUpdatePhase } from "../types/appUpdate";

export const MAIN_WINDOW_IDLE_MINIMIZE_MS = 3000;

type ResolveMainWindowModeLockInput = {
  hasOngoingTask: boolean;
  runtimeGateIsBusy: boolean;
  isProcessing: boolean;
  showRuntimeSuccessIndicator: boolean;
  appUpdatePhase: AppUpdatePhase;
};

export const resolveMainWindowModeLock = ({
  hasOngoingTask,
  runtimeGateIsBusy,
  isProcessing,
  showRuntimeSuccessIndicator,
  appUpdatePhase,
}: ResolveMainWindowModeLockInput): boolean => (
  hasOngoingTask
  || runtimeGateIsBusy
  || isProcessing
  || showRuntimeSuccessIndicator
  || appUpdatePhase === "downloading"
  || appUpdatePhase === "installing"
);

type ShouldCollapseMainWindowOnPointerLeaveInput = {
  isMinimized: boolean;
  startupAutoMinimizeUnlocked: boolean;
  isDragging: boolean;
  isContextMenuOpen: boolean;
  isMainWindowModeLocked: boolean;
};

export const shouldCollapseMainWindowOnPointerLeave = ({
  isMinimized,
  startupAutoMinimizeUnlocked,
  isDragging,
  isContextMenuOpen,
  isMainWindowModeLocked,
}: ShouldCollapseMainWindowOnPointerLeaveInput): boolean => (
  !isMinimized
  && startupAutoMinimizeUnlocked
  && !isDragging
  && !isContextMenuOpen
  && !isMainWindowModeLocked
);
