import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  allocateRenameStem,
  buildRenameStem,
  normalizeRenameRulePreset,
  resetRenameSequenceState,
  sanitizeRenameAffix,
} from "./renameRules";

describe("renameRules", () => {
  afterEach(() => {
    resetRenameSequenceState();
  });

  it("falls back to desc_number for invalid presets", () => {
    expect(normalizeRenameRulePreset("invalid")).toBe("desc_number");
  });

  it("sanitizes rename affixes for filesystem-safe stems", () => {
    expect(sanitizeRenameAffix("  bad:/name?  ")).toBe("bad__name");
  });

  it("builds prefix and suffix stems without empty segments", () => {
    expect(buildRenameStem(42, {
      renameRulePreset: "prefix_number",
      renamePrefix: "shot",
      renameSuffix: "done",
    })).toBe("shot_42_done");
  });

  it("allocates descending stems by default and skips occupied names", async () => {
    const outputDir = mkdtempSync(path.join(os.tmpdir(), "flowselect-rename-rules-"));
    try {
      writeFileSync(path.join(outputDir, "99.mp4"), "video");
      await expect(allocateRenameStem(outputDir, {})).resolves.toBe("98");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("allocates ascending stems when configured", async () => {
    const outputDir = mkdtempSync(path.join(os.tmpdir(), "flowselect-rename-rules-"));
    try {
      await expect(allocateRenameStem(outputDir, { renameRulePreset: "asc_number" })).resolves.toBe("1");
      await expect(allocateRenameStem(outputDir, { renameRulePreset: "asc_number" })).resolves.toBe("2");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("resets in-memory rename allocation state", async () => {
    const outputDir = mkdtempSync(path.join(os.tmpdir(), "flowselect-rename-rules-"));
    try {
      await expect(allocateRenameStem(outputDir, {})).resolves.toBe("99");
      resetRenameSequenceState();
      await expect(allocateRenameStem(outputDir, {})).resolves.toBe("99");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
