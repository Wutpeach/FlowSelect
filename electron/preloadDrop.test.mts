import { describe, expect, it, vi } from "vitest";

import {
  hasLocalFileItems,
  resolveLocalPathFromDataTransfer,
  resolvePendingFolderDrop,
} from "./preloadDrop.mjs";

const createDataTransfer = (overrides: {
  files?: unknown[];
  items?: Array<{ kind?: string; getAsFile?: () => unknown | null }>;
  data?: Record<string, string>;
} = {}) => ({
  files: overrides.files ?? [],
  items: overrides.items ?? [],
  getData(type: string) {
    return overrides.data?.[type] ?? "";
  },
});

describe("hasLocalFileItems", () => {
  it("detects file items exposed through DataTransfer.items", () => {
    expect(hasLocalFileItems(createDataTransfer({
      items: [{ kind: "file" }],
    }))).toBe(true);
  });

  it("returns false when the drop does not expose any file-like items", () => {
    expect(hasLocalFileItems(createDataTransfer({
      items: [{ kind: "string" }],
      data: { "text/plain": "https://weibo.com/detail/123" },
    }))).toBe(false);
  });
});

describe("resolveLocalPathFromDataTransfer", () => {
  it("prefers resolved native file-system paths from file-like items", () => {
    const file = { id: "native-file" };

    expect(resolveLocalPathFromDataTransfer(createDataTransfer({
      items: [{ kind: "file", getAsFile: () => file }],
    }), (candidate) => candidate === file ? "C:\\Users\\Test\\Export" : null))
      .toBe("C:\\Users\\Test\\Export");
  });

  it("falls back to local file URIs exposed through drag text payloads", () => {
    expect(resolveLocalPathFromDataTransfer(createDataTransfer({
      items: [{ kind: "file", getAsFile: () => ({}) }],
      data: { "text/uri-list": "file:///C:/Users/Test/Export%20Folder" },
    }), () => null)).toBe("C:\\Users\\Test\\Export Folder");
  });
});

describe("resolvePendingFolderDrop", () => {
  it("returns null for browser file-like drags without a resolvable local path", async () => {
    const validateDroppedFolderPath = vi.fn();

    await expect(resolvePendingFolderDrop(createDataTransfer({
      items: [{ kind: "file", getAsFile: () => ({}) }],
      files: [{}],
      data: {
        "text/plain": "https://weibo.com/detail/4913212871149937",
        "text/uri-list": "about:blank#blocked",
      },
    }), {
      resolvePathFromFile: () => null,
      validateDroppedFolderPath,
    })).resolves.toBeNull();

    expect(validateDroppedFolderPath).not.toHaveBeenCalled();
  });

  it("validates true local folder drops once a native path is available", async () => {
    const validateDroppedFolderPath = vi.fn(async (path: string) => ({
      success: true as const,
      path,
      name: "Export",
    }));

    await expect(resolvePendingFolderDrop(createDataTransfer({
      items: [{ kind: "file", getAsFile: () => ({ id: "folder" }) }],
    }), {
      resolvePathFromFile: () => "C:\\Users\\Test\\Export",
      validateDroppedFolderPath,
    })).resolves.toEqual({
      success: true,
      path: "C:\\Users\\Test\\Export",
      name: "Export",
    });

    expect(validateDroppedFolderPath).toHaveBeenCalledWith("C:\\Users\\Test\\Export");
  });

  it("surfaces preload validation failures once a local path has been resolved", async () => {
    await expect(resolvePendingFolderDrop(createDataTransfer({
      files: [{ id: "folder" }],
    }), {
      resolvePathFromFile: () => "C:\\Users\\Test\\Export",
      validateDroppedFolderPath: async () => {
        throw new Error("IPC unavailable");
      },
    })).resolves.toEqual({
      success: false,
      path: "C:\\Users\\Test\\Export",
      error: "Failed to validate the dropped folder.",
      reason: "PRELOAD_ERROR",
    });
  });
});
