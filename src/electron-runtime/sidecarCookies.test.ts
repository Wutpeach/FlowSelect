import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { cleanupCookiesFile, writeCookiesFile } from "./sidecarCookies";

describe("writeCookiesFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when no cookies are provided", async () => {
    await expect(writeCookiesFile("trace-id", undefined)).resolves.toBeNull();
  });

  it("writes cookies into the OS temp directory instead of the current working directory", async () => {
    const writeFileMock = vi.spyOn(fs, "writeFile").mockResolvedValue(undefined);

    await expect(writeCookiesFile("video-123", "# Netscape cookies")).resolves.toBe(
      path.join(tmpdir(), "video-123-cookies.txt"),
    );

    expect(writeFileMock).toHaveBeenCalledWith(
      path.join(tmpdir(), "video-123-cookies.txt"),
      "# Netscape cookies",
      "utf8",
    );
  });
});

describe("cleanupCookiesFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ignores empty cleanup paths", async () => {
    const unlinkMock = vi.spyOn(fs, "unlink").mockResolvedValue(undefined);

    await expect(cleanupCookiesFile(null)).resolves.toBeUndefined();

    expect(unlinkMock).not.toHaveBeenCalled();
  });

  it("swallows unlink failures for temp cookie cleanup", async () => {
    vi.spyOn(fs, "unlink").mockRejectedValue(new Error("missing"));

    await expect(cleanupCookiesFile("/tmp/video-123-cookies.txt")).resolves.toBeUndefined();
  });
});
