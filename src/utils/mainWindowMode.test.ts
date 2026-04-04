import { describe, expect, it } from "vitest";

import {
  MAIN_WINDOW_IDLE_MINIMIZE_MS,
  resolveMainWindowModeLock,
  shouldCollapseMainWindowOnPointerLeave,
} from "./mainWindowMode";

describe("resolveMainWindowModeLock", () => {
  it("locks main-window mode for active work and visible status flows", () => {
    expect(resolveMainWindowModeLock({
      hasOngoingTask: true,
      runtimeGateIsBusy: false,
      isProcessing: false,
      showRuntimeSuccessIndicator: false,
      isUiLabPreviewActive: false,
      appUpdatePhase: "idle",
    })).toBe(true);

    expect(resolveMainWindowModeLock({
      hasOngoingTask: false,
      runtimeGateIsBusy: true,
      isProcessing: false,
      showRuntimeSuccessIndicator: false,
      isUiLabPreviewActive: false,
      appUpdatePhase: "idle",
    })).toBe(true);

    expect(resolveMainWindowModeLock({
      hasOngoingTask: false,
      runtimeGateIsBusy: false,
      isProcessing: true,
      showRuntimeSuccessIndicator: false,
      isUiLabPreviewActive: false,
      appUpdatePhase: "idle",
    })).toBe(true);

    expect(resolveMainWindowModeLock({
      hasOngoingTask: false,
      runtimeGateIsBusy: false,
      isProcessing: false,
      showRuntimeSuccessIndicator: true,
      isUiLabPreviewActive: false,
      appUpdatePhase: "idle",
    })).toBe(true);

    expect(resolveMainWindowModeLock({
      hasOngoingTask: false,
      runtimeGateIsBusy: false,
      isProcessing: false,
      showRuntimeSuccessIndicator: false,
      isUiLabPreviewActive: false,
      appUpdatePhase: "downloading",
    })).toBe(true);

    expect(resolveMainWindowModeLock({
      hasOngoingTask: false,
      runtimeGateIsBusy: false,
      isProcessing: false,
      showRuntimeSuccessIndicator: false,
      isUiLabPreviewActive: true,
      appUpdatePhase: "idle",
    })).toBe(true);
  });

  it("unlocks main-window mode when no foreground status needs the full panel", () => {
    expect(resolveMainWindowModeLock({
      hasOngoingTask: false,
      runtimeGateIsBusy: false,
      isProcessing: false,
      showRuntimeSuccessIndicator: false,
      isUiLabPreviewActive: false,
      appUpdatePhase: "idle",
    })).toBe(false);

    expect(resolveMainWindowModeLock({
      hasOngoingTask: false,
      runtimeGateIsBusy: false,
      isProcessing: false,
      showRuntimeSuccessIndicator: false,
      isUiLabPreviewActive: false,
      appUpdatePhase: "available",
    })).toBe(false);
  });
});

describe("shouldCollapseMainWindowOnPointerLeave", () => {
  it("collapses immediately when pointer leaves an unlocked full window", () => {
    expect(shouldCollapseMainWindowOnPointerLeave({
      isMinimized: false,
      startupAutoMinimizeUnlocked: true,
      isDragging: false,
      isContextMenuOpen: false,
      isMainWindowModeLocked: false,
      isForegroundTaskOutcomeVisible: false,
    })).toBe(true);
  });

  it("does not collapse when the window is locked or interaction guards are active", () => {
    expect(shouldCollapseMainWindowOnPointerLeave({
      isMinimized: false,
      startupAutoMinimizeUnlocked: true,
      isDragging: false,
      isContextMenuOpen: false,
      isMainWindowModeLocked: true,
      isForegroundTaskOutcomeVisible: false,
    })).toBe(false);

    expect(shouldCollapseMainWindowOnPointerLeave({
      isMinimized: false,
      startupAutoMinimizeUnlocked: false,
      isDragging: false,
      isContextMenuOpen: false,
      isMainWindowModeLocked: false,
      isForegroundTaskOutcomeVisible: false,
    })).toBe(false);

    expect(shouldCollapseMainWindowOnPointerLeave({
      isMinimized: false,
      startupAutoMinimizeUnlocked: true,
      isDragging: true,
      isContextMenuOpen: false,
      isMainWindowModeLocked: false,
      isForegroundTaskOutcomeVisible: false,
    })).toBe(false);

    expect(shouldCollapseMainWindowOnPointerLeave({
      isMinimized: false,
      startupAutoMinimizeUnlocked: true,
      isDragging: false,
      isContextMenuOpen: true,
      isMainWindowModeLocked: false,
      isForegroundTaskOutcomeVisible: false,
    })).toBe(false);

    expect(shouldCollapseMainWindowOnPointerLeave({
      isMinimized: false,
      startupAutoMinimizeUnlocked: true,
      isDragging: false,
      isContextMenuOpen: false,
      isMainWindowModeLocked: false,
      isForegroundTaskOutcomeVisible: true,
    })).toBe(false);
  });

  it("keeps icon mode stable after it is already minimized", () => {
    expect(shouldCollapseMainWindowOnPointerLeave({
      isMinimized: true,
      startupAutoMinimizeUnlocked: true,
      isDragging: false,
      isContextMenuOpen: false,
      isMainWindowModeLocked: false,
      isForegroundTaskOutcomeVisible: false,
    })).toBe(false);
  });
});

describe("MAIN_WINDOW_IDLE_MINIMIZE_MS", () => {
  it("keeps the normal idle minimize delay at three seconds", () => {
    expect(MAIN_WINDOW_IDLE_MINIMIZE_MS).toBe(3000);
  });
});
