import { describe, expect, it, vi } from "vitest";

import { openPathOrThrow } from "./openPath.mjs";

describe("openPathOrThrow", () => {
  it("opens a path when Electron reports success", async () => {
    const openPath = vi.fn().mockResolvedValue("");

    await expect(openPathOrThrow("/tmp/FlowSelect", {
      shellLike: { openPath },
    })).resolves.toBeUndefined();

    expect(openPath).toHaveBeenCalledWith("/tmp/FlowSelect");
  });

  it("creates the directory first when requested", async () => {
    const openPath = vi.fn().mockResolvedValue("");
    const mkdirLike = vi.fn().mockResolvedValue(undefined);

    await expect(openPathOrThrow("/tmp/FlowSelect", {
      ensureDirectory: true,
      mkdirLike,
      shellLike: { openPath },
    })).resolves.toBeUndefined();

    expect(mkdirLike).toHaveBeenCalledWith("/tmp/FlowSelect", { recursive: true });
    expect(openPath).toHaveBeenCalledWith("/tmp/FlowSelect");
  });

  it("throws when Electron returns an openPath error string", async () => {
    const openPath = vi.fn().mockResolvedValue("The file doesn’t exist.");

    await expect(openPathOrThrow("/tmp/missing", {
      shellLike: { openPath },
    })).rejects.toThrow("Failed to open path: The file doesn’t exist.");
  });

  it("rejects blank paths before calling Electron", async () => {
    const openPath = vi.fn();

    await expect(openPathOrThrow("   ", {
      shellLike: { openPath },
    })).rejects.toThrow("Path is required");

    expect(openPath).not.toHaveBeenCalled();
  });
});
