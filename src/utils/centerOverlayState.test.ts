import { describe, expect, it } from "vitest";

import {
  createCenterOverlayState,
  isCenterOverlayLockActive,
  isCenterOverlayTaskOutcomeVisible,
  reduceCenterOverlayState,
  selectCenterOverlayVisual,
} from "./centerOverlayState";

describe("centerOverlayState", () => {
  it("keeps progress as the selected visual over stale transient outcomes", () => {
    const state = reduceCenterOverlayState(createCenterOverlayState(), {
      type: "showFolderOutcome",
      status: "success",
      durationMs: 1400,
    });

    expect(selectCenterOverlayVisual({
      primaryTask: { kind: "download", traceId: "next-download" },
      centerOverlayState: state,
    })).toEqual({
      kind: "task-progress",
      key: "progress:download:next-download",
    });
  });

  it("uses request ids to ignore stale task outcome timer completions", () => {
    const loading = reduceCenterOverlayState(createCenterOverlayState(), {
      type: "beginTaskOutcomeLoading",
      status: "success",
      durationMs: 1500,
    });
    const visible = reduceCenterOverlayState(loading, {
      type: "showTaskOutcome",
      requestId: loading.requestId,
    });
    const interrupted = reduceCenterOverlayState(visible, {
      type: "beginTaskProcessing",
      source: "image",
    });

    expect(reduceCenterOverlayState(interrupted, {
      type: "finishTaskOutcome",
      requestId: loading.requestId,
    })).toBe(interrupted);
  });

  it("uses request ids to ignore stale folder timers", () => {
    const first = reduceCenterOverlayState(createCenterOverlayState(), {
      type: "showFolderOutcome",
      status: "success",
      durationMs: 1400,
    });
    const second = reduceCenterOverlayState(first, {
      type: "showFolderOutcome",
      status: "success",
      durationMs: 1400,
    });

    expect(reduceCenterOverlayState(second, {
      type: "finishFolderOutcome",
      requestId: first.requestId,
    })).toBe(second);
  });

  it("locks the center overlay through processing, loading, visible outcome, and folder states", () => {
    const idle = createCenterOverlayState();
    const processing = reduceCenterOverlayState(idle, {
      type: "beginTaskProcessing",
      source: "image",
    });
    const loading = reduceCenterOverlayState(processing, {
      type: "beginTaskOutcomeLoading",
      status: "success",
      durationMs: 1500,
    });
    const visible = reduceCenterOverlayState(loading, {
      type: "showTaskOutcome",
      requestId: loading.requestId,
    });
    const folder = reduceCenterOverlayState(idle, {
      type: "showFolderOutcome",
      status: "success",
      durationMs: 1400,
    });

    expect(isCenterOverlayLockActive(idle)).toBe(false);
    expect(isCenterOverlayLockActive(processing)).toBe(true);
    expect(isCenterOverlayLockActive(loading)).toBe(true);
    expect(isCenterOverlayLockActive(visible)).toBe(true);
    expect(isCenterOverlayLockActive(folder)).toBe(true);
  });

  it("reports only the visible task outcome phase as task outcome visible", () => {
    const loading = reduceCenterOverlayState(createCenterOverlayState(), {
      type: "beginTaskOutcomeLoading",
      status: "success",
      durationMs: 1500,
    });
    const visible = reduceCenterOverlayState(loading, {
      type: "showTaskOutcome",
      requestId: loading.requestId,
    });

    expect(isCenterOverlayTaskOutcomeVisible(loading)).toBe(false);
    expect(isCenterOverlayTaskOutcomeVisible(visible)).toBe(true);
  });

  it("carries diagnostic copy data only through the task outcome visual", () => {
    const diagnostic = {
      surface: "download" as const,
      traceId: "download-1",
      userMessage: "网络连接异常，请检查代理",
      category: "network_proxy" as const,
      failure: {
        rawMessage: "HTTP Error 429",
        userUrl: "https://example.com/watch",
      },
    };
    const loading = reduceCenterOverlayState(createCenterOverlayState(), {
      type: "beginTaskOutcomeLoading",
      status: "failure",
      message: diagnostic.userMessage,
      durationMs: 5000,
      diagnostic,
    });
    const visible = reduceCenterOverlayState(loading, {
      type: "showTaskOutcome",
      requestId: loading.requestId,
    });

    expect(selectCenterOverlayVisual({
      primaryTask: null,
      centerOverlayState: visible,
    })).toEqual({
      kind: "task-outcome",
      key: `task-outcome:${loading.requestId}`,
      requestId: loading.requestId,
      status: "failure",
      message: diagnostic.userMessage,
      outcomeVisible: true,
      source: "download",
      diagnostic,
    });

    expect(reduceCenterOverlayState(visible, { type: "dismissTransient" }))
      .toEqual({
        kind: "idle",
        requestId: loading.requestId + 1,
      });
  });

  it("keeps Folder Confirmation status semantics (success | error) unchanged", () => {
    const success = reduceCenterOverlayState(createCenterOverlayState(), {
      type: "showFolderOutcome",
      status: "success",
      durationMs: 1400,
    });
    expect(selectCenterOverlayVisual({
      primaryTask: null,
      centerOverlayState: success,
    })).toEqual({
      kind: "folder-outcome",
      key: `folder-outcome:${success.requestId}`,
      requestId: success.requestId,
      status: "success",
      message: null,
    });

    const error = reduceCenterOverlayState(createCenterOverlayState(), {
      type: "showFolderOutcome",
      status: "error",
      message: "无法读取文件夹",
      durationMs: 1800,
    });
    expect(selectCenterOverlayVisual({
      primaryTask: null,
      centerOverlayState: error,
    })).toEqual({
      kind: "folder-outcome",
      key: `folder-outcome:${error.requestId}`,
      requestId: error.requestId,
      status: "error",
      message: "无法读取文件夹",
    });
  });

  it("defaults task outcome origin to foreground; only typed terminals opt in", () => {
    const generic = reduceCenterOverlayState(createCenterOverlayState(), {
      type: "beginTaskOutcomeLoading",
      status: "failure",
      durationMs: 5000,
    });
    expect(generic).toMatchObject({
      kind: "task-outcome-loading",
      origin: "foreground",
    });

    const typed = reduceCenterOverlayState(createCenterOverlayState(), {
      type: "beginTaskOutcomeLoading",
      status: "failure",
      origin: "terminal",
      durationMs: 5000,
    });
    expect(typed).toMatchObject({
      kind: "task-outcome-loading",
      origin: "terminal",
    });

    // The visible phase preserves the origin discriminator.
    expect(reduceCenterOverlayState(typed, {
      type: "showTaskOutcome",
      requestId: typed.requestId,
    })).toMatchObject({
      kind: "task-outcome-visible",
      origin: "terminal",
    });
  });

  it("keeps requestId generation guards across invalidation dismissals", () => {
    const first = reduceCenterOverlayState(createCenterOverlayState(), {
      type: "beginTaskOutcomeLoading",
      status: "success",
      durationMs: 1500,
    });
    // MR4 invalidation: dismissTransient clears the old Reveal and bumps the
    // generation; the old retention timer is now a stale no-op.
    const dismissed = reduceCenterOverlayState(first, { type: "dismissTransient" });
    expect(reduceCenterOverlayState(dismissed, {
      type: "finishTaskOutcome",
      requestId: first.requestId,
    })).toBe(dismissed);

    // A newer outcome is equally protected from the stale timer.
    const newer = reduceCenterOverlayState(dismissed, {
      type: "beginTaskOutcomeLoading",
      status: "cancelled",
      durationMs: 1500,
    });
    expect(reduceCenterOverlayState(newer, {
      type: "finishTaskOutcome",
      requestId: first.requestId,
    })).toBe(newer);
  });

  it("keeps progress and transient outcomes ahead of the idle fallback", () => {
    const state = reduceCenterOverlayState(createCenterOverlayState(), {
      type: "showFolderOutcome",
      status: "success",
      durationMs: 1400,
    });

    expect(selectCenterOverlayVisual({
      primaryTask: null,
      centerOverlayState: state,
    }).kind).toBe("folder-outcome");

    expect(selectCenterOverlayVisual({
      primaryTask: null,
      centerOverlayState: createCenterOverlayState(),
    })).toEqual({
      kind: "none",
      key: "none",
    });
  });
});
