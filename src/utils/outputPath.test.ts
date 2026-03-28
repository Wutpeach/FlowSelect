import { beforeEach, describe, expect, it, vi } from "vitest";

const { emitMock, invokeMock } = vi.hoisted(() => ({
  emitMock: vi.fn(),
  invokeMock: vi.fn(),
}));

vi.mock("../desktop/runtime", () => ({
  desktopCommands: {
    invoke: invokeMock,
  },
  desktopEvents: {
    emit: emitMock,
  },
}));

import { saveOutputPath } from "./outputPath";

describe("saveOutputPath", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    emitMock.mockReset();
    vi.restoreAllMocks();
  });

  it("safely falls back to an empty config object when stored config JSON is invalid", async () => {
    invokeMock
      .mockResolvedValueOnce("{")
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(true);
    emitMock.mockResolvedValueOnce(undefined);

    await expect(saveOutputPath("D:/FlowSelect")).resolves.toBe(true);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_config");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "save_config", {
      json: JSON.stringify({ outputPath: "D:/FlowSelect" }),
    });
    expect(emitMock).toHaveBeenCalledWith("output-path-changed", { path: "D:/FlowSelect" });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "reset_rename_counter");
  });

  it("returns false without writing when the output path is unchanged", async () => {
    invokeMock.mockResolvedValueOnce(JSON.stringify({ outputPath: "D:/FlowSelect" }));

    await expect(saveOutputPath("D:/FlowSelect")).resolves.toBe(false);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("keeps the output path change when rename-counter reset fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    invokeMock
      .mockResolvedValueOnce(JSON.stringify({}))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("reset failed"));
    emitMock.mockResolvedValueOnce(undefined);

    await expect(saveOutputPath("D:/New")).resolves.toBe(true);

    expect(invokeMock).toHaveBeenNthCalledWith(2, "save_config", {
      json: JSON.stringify({ outputPath: "D:/New" }),
    });
    expect(emitMock).toHaveBeenCalledWith("output-path-changed", { path: "D:/New" });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to reset rename counter after output path change:",
      expect.any(Error),
    );
  });
});
