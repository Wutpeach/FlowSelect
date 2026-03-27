import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import {
  parseLocalPathFromDropText,
  validateDroppedFolderPath,
} from "./folderDrop.mjs";

const tempPaths = [];

describe("parseLocalPathFromDropText", () => {
  it("extracts the first local file URI from a uri-list payload", () => {
    expect(parseLocalPathFromDropText("# comment\nfile:///C:/Users/Test/Export%20Folder"))
      .toBe("C:\\Users\\Test\\Export Folder");
  });

  it("accepts raw Windows absolute paths", () => {
    expect(parseLocalPathFromDropText("C:\\Users\\Test\\Export Folder"))
      .toBe("C:\\Users\\Test\\Export Folder");
  });

  it("ignores non-local URLs", () => {
    expect(parseLocalPathFromDropText("https://example.com/image.png")).toBeNull();
  });
});

describe("validateDroppedFolderPath", () => {
  afterEach(async () => {
    await Promise.all(tempPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it("accepts existing directories", async () => {
    const folderPath = await mkdtemp(join(tmpdir(), "flowselect-folder-drop-"));
    tempPaths.push(folderPath);

    await expect(validateDroppedFolderPath({ path: folderPath })).resolves.toEqual({
      success: true,
      path: folderPath,
      name: folderPath.split(/[\\/]/).pop(),
    });
  });

  it("rejects regular files", async () => {
    const folderPath = await mkdtemp(join(tmpdir(), "flowselect-folder-drop-file-"));
    tempPaths.push(folderPath);

    const filePath = join(folderPath, "example.txt");
    await writeFile(filePath, "hello");

    await expect(validateDroppedFolderPath({ path: filePath })).resolves.toEqual({
      success: false,
      path: filePath,
      error: "Dropped item is not a folder.",
      reason: "NOT_DIRECTORY",
    });
  });

  it("rejects missing paths", async () => {
    await expect(validateDroppedFolderPath({ path: "C:\\missing\\flowselect-folder" })).resolves.toEqual({
      success: false,
      path: "C:\\missing\\flowselect-folder",
      error: "Dropped folder was not found.",
      reason: "NOT_FOUND",
    });
  });
});
