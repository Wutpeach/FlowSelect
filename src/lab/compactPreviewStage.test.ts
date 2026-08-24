import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = import.meta.dirname;
const source = readFileSync(resolve(here, "./CompactPreviewStage.tsx"), "utf8");

describe("Lab Compact Preview Stage", () => {
  it("is a browser-safe SVG-only preview host (no canvas, shader, runtime)", () => {
    expect(source).not.toContain("<canvas");
    expect(source).not.toContain("#version");
    expect(source).not.toContain("gl.drawArrays");
    expect(source).not.toContain("createExpandedPresentationRuntime(");
  });

  it("reuses the production CompactMascot renderer leaf, never the native surface", () => {
    expect(source).toContain('from "../presentation/main-window/CompactMascot"');
    expect(source).not.toContain("MainWindowPresentationSurface");
    expect(source).not.toContain("ExpandedPresentationSurface");
  });

  it("mounts the production character at production geometry with theme colors", () => {
    expect(source).toContain("<CompactMascot");
    expect(source).toContain("size={COMPACT_MASCOT_VISUAL_SIZE}");
    expect(source).toContain("bodyColor={colors.characterBody}");
    expect(source).toContain("eyeColor={colors.characterEye}");
    expect(source).toContain("pointerField={pointerField}");
    expect(source).toContain("attentionCenterX={LAB_COMPACT_ATTENTION_CENTER.x}");
    expect(source).toContain("attentionCenterY={LAB_COMPACT_ATTENTION_CENTER.y}");
  });

  it("derives the 80/60 geometry from production window-metrics constants", () => {
    expect(source).toContain("MAIN_WINDOW_DEFAULT_COMPACT_OUTER_SIZE");
    expect(source).toContain("MAIN_WINDOW_COMPACT_SHELL_SIZE");
    expect(source).toContain("MAIN_WINDOW_MINIMIZED_PANEL_RADIUS");
    expect(source).toContain("getPanelShellStyle");
    expect(source).toContain("panelShadowCompact");
  });

  it("uses the Lab-local pointer field, never the production pointer authority", () => {
    expect(source).toContain('from "./compactPointerField"');
    expect(source).toContain("useLabCompactPointerField");
    expect(source).not.toContain('from "../presentation/main-window/pointerField"');
    expect(source).not.toContain("updatePointerFieldFromClientPoint(");
    expect(source).not.toContain("resetPointerFieldToCenter(");
  });

  it("annotates the stage for Lab selection", () => {
    expect(source).toContain('data-lab-compact-stage=""');
    expect(source).toContain('data-lab-compact-shell=""');
  });
});
