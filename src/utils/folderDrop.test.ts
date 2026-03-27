import { describe, expect, it } from "vitest";

import {
  getDroppedFolderErrorTranslationKey,
  shouldHandleDroppedFolderResult,
} from "./folderDrop";

describe("shouldHandleDroppedFolderResult", () => {
  it("handles successful folder drops", () => {
    expect(shouldHandleDroppedFolderResult({
      success: true,
      path: "C:\\Export",
      name: "Export",
    })).toBe(true);
  });

  it("ignores non-directory validation results so file drops can continue", () => {
    expect(shouldHandleDroppedFolderResult({
      success: false,
      path: "C:\\Export\\image.png",
      error: "Dropped item is not a folder.",
      reason: "NOT_DIRECTORY",
    })).toBe(false);
  });

  it("keeps actionable folder-drop failures consumable", () => {
    expect(shouldHandleDroppedFolderResult({
      success: false,
      path: "",
      error: "Could not resolve a path from the dropped item.",
      reason: "UNRESOLVED_DROP",
    })).toBe(true);
  });
});

describe("getDroppedFolderErrorTranslationKey", () => {
  it("maps each actionable reason to a renderer translation key", () => {
    expect(getDroppedFolderErrorTranslationKey("EMPTY_PATH")).toBe("app.drop.errors.unresolved");
    expect(getDroppedFolderErrorTranslationKey("UNRESOLVED_DROP")).toBe("app.drop.errors.unresolved");
    expect(getDroppedFolderErrorTranslationKey("PRELOAD_ERROR")).toBe("app.drop.errors.preloadFailed");
    expect(getDroppedFolderErrorTranslationKey("NOT_DIRECTORY")).toBe("app.drop.errors.notDirectory");
    expect(getDroppedFolderErrorTranslationKey("NOT_FOUND")).toBe("app.drop.errors.notFound");
    expect(getDroppedFolderErrorTranslationKey("STAT_FAILED")).toBe("app.drop.errors.statFailed");
  });
});
