import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { computeExportLayout, LAB_EXPORT_PADDING_CSS } from "./exportPng";

const here = import.meta.dirname;
const source = readFileSync(resolve(here, "exportPng.ts"), "utf8");

describe("Lab 4x export geometry (transparent bleed contract)", () => {
  it("derives the padding from the production main-window shadow gutter (14)", () => {
    // Source of truth: MAIN_WINDOW_FULL_SHADOW_GUTTER in windowMetrics.ts.
    expect(LAB_EXPORT_PADDING_CSS).toBe(14);
    expect(source).toContain(
      'import { MAIN_WINDOW_FULL_SHADOW_GUTTER } from "../constants/windowMetrics";',
    );
  });

  it("computes deterministic backing sizes as css * scale (912x912 at 4x)", () => {
    // 200 content + 2*14 gutter = 228 CSS; 228*4 = 912; content 200*4 = 800;
    // padding 14*4 = 56 — independent of devicePixelRatio.
    const layout = computeExportLayout(200, 200, 14, 4);
    expect(layout.outWidth).toBe(912);
    expect(layout.outHeight).toBe(912);
    expect(layout.contentWidth).toBe(800);
    expect(layout.contentHeight).toBe(800);
    expect(layout.paddingX).toBe(56);
    expect(layout.paddingY).toBe(56);
  });

  it("stays exact at fractional scales and non-square shells", () => {
    const layout = computeExportLayout(200, 200, 14, 1.25);
    expect(layout.outWidth).toBe(285); // round(228*1.25)
    expect(layout.outHeight).toBe(285);
    expect(layout.contentWidth).toBe(250);
    expect(layout.paddingX).toBe(18);
    const nonSquare = computeExportLayout(160, 90, 14, 4);
    expect(nonSquare.outWidth).toBe(752);
    expect(nonSquare.outHeight).toBe(472);
  });

  it("never paints an opaque full-canvas backdrop (output stays transparent)", () => {
    // The old export filled the whole canvas with the frame background. The
    // transparent contract fills only within the rounded shell clip.
    const compositeBlock = source.slice(
      source.indexOf("const output = document.createElement(\"canvas\");"),
      source.indexOf("const blob = await createBlobFromCanvas(output)"),
    );
    expect(compositeBlock).not.toContain("context.fillRect(0, 0, outWidth, outHeight)");
    expect(compositeBlock).not.toContain("context.fillRect(0, 0, backing, backing)");
    expect(compositeBlock).toContain("drawShadowBackdrop(");
  });

  it("composites shadow -> WebGL (rounded-clipped) -> DOM at the padding inset", () => {
    const compositeBlock = source.slice(
      source.indexOf("// 1) Shared production shadow"),
      source.indexOf("const blob = await createBlobFromCanvas(output)"),
    );
    // Shadow backdrop first (behind content).
    expect(compositeBlock.indexOf("drawShadowBackdrop(")).toBeGreaterThan(-1);
    const webglAt = compositeBlock.indexOf("context.drawImage(webglCanvas");
    const domAt = compositeBlock.indexOf("context.drawImage(domCanvas");
    expect(webglAt).toBeGreaterThan(-1);
    expect(domAt).toBeGreaterThan(-1);
    expect(domAt).toBeGreaterThan(webglAt); // DOM content on top of WebGL
    // WebGL square corners must never show through the transparent export.
    expect(compositeBlock).toContain("context.clip();");
    expect(compositeBlock).toContain("drawRoundedRectPath(");
    // DOM layer is drawn at the padding inset, not at the origin.
    expect(compositeBlock).toContain(
      "context.drawImage(domCanvas, paddingX, paddingY, contentWidth, contentHeight);",
    );
  });
});

describe("Lab 4x export failure contract (no partial PNG)", () => {
  it("exports an ExportLayerFailure class tagged with the missing layer", () => {
    expect(source).toContain("export class ExportLayerFailure extends Error");
    expect(source).toContain('constructor(readonly layer: "webgl" | "dom" | "shadow", message?: string)');
  });

  it("rejects on a null/timed-out WebGL readback before any download", () => {
    expect(source).toContain('if (webglResult === null) {');
    expect(source).toContain('throw new ExportLayerFailure("webgl");');
  });

  it("rejects on a failed DOM rasterization instead of downloading a WebGL-only PNG", () => {
    expect(source).toContain('if (domCanvas === null) {');
    expect(source).toContain('throw new ExportLayerFailure("dom");');
  });

  it("rejects when the shared shadow recipe cannot be resolved", () => {
    // Unsupported layer shapes (inset, calc/var, unknown tokens) must fail the
    // export loudly instead of silently approximating the production shadow.
    expect(source).toContain('throw new ExportLayerFailure("shadow"');
    expect(source).toContain("unsupported shadow layer");
    expect(source).toContain("inset");
  });

  it("composites the DOM layer unconditionally once both layers are present", () => {
    // Both layers are guaranteed non-null by this point, so the DOM layer must
    // be drawn unconditionally — never behind an `if (domCanvas !== null)`.
    const compositeBlock = source.slice(
      source.indexOf("DOM layer is guaranteed non-null here"),
      source.indexOf("const blob = await createBlobFromCanvas(output)"),
    );
    expect(compositeBlock).toContain("context.drawImage(domCanvas, paddingX, paddingY, contentWidth, contentHeight);");
    expect(compositeBlock).not.toContain("if (domCanvas !== null)");
  });

  it("guards readback size against the absolute export content size (800x800)", () => {
    // Independent of devicePixelRatio: a DPR-multiplied readback (e.g.
    // 1600x1600 at DPR 2) is rejected — never downloaded at the wrong size.
    expect(source).toContain("const layout = computeExportLayout(restWidth, restHeight, paddingCss, scale);");
    expect(source).toContain(
      "does not match export content size",
    );
  });
});
