import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = import.meta.dirname;
const hostSource = readFileSync(resolve(here, "ExpandedPresentationSurface.tsx"), "utf8");
const surfaceSource = readFileSync(resolve(here, "MainWindowPresentationSurface.tsx"), "utf8");
const runtimeSource = readFileSync(resolve(here, "expandedPresentationRuntime.ts"), "utf8");

describe("Expanded Presentation graphics host contract", () => {
  it("owns one noninteractive decorative canvas", () => {
    expect(hostSource.match(/<canvas\b/g)).toHaveLength(1);
    expect(hostSource).toContain('aria-hidden="true"');
    expect(hostSource).toContain('pointerEvents: "none"');
    const props = hostSource.slice(
      hostSource.indexOf("export type ExpandedPresentationSurfaceProps"),
      hostSource.indexOf("type GraphicsColors"),
    );
    expect(props).not.toContain("=>");
    expect(props).toContain("target: ExpandedPresentationTarget");
    expect(props).not.toContain("progress:");
    expect(props).not.toContain("terminal:");
  });

  it("uses one concrete WebGL2 backend with no fallback", () => {
    expect(hostSource).toContain('canvas.getContext("webgl2"');
    expect(hostSource).not.toContain('getContext("webgl"');
    expect(hostSource).not.toContain('getContext("2d"');
    expect(hostSource).not.toContain("experimental-webgl");
    expect(hostSource).not.toMatch(/from\s+["'][^"']*backend/i);
  });

  it("handles DPR, resize, context loss/restoration, and permanent cleanup", () => {
    expect(hostSource).toContain("MAX_DPR");
    expect(hostSource).toContain("canvas.clientWidth");
    expect(hostSource).toContain("canvas.clientHeight");
    expect(hostSource).toContain("ResizeObserver");
    expect(hostSource).toContain("window.matchMedia");
    expect(hostSource).toContain("observedDpr");
    expect(hostSource).toContain('addEventListener("webglcontextlost"');
    expect(hostSource).toContain('addEventListener("webglcontextrestored"');
    expect(hostSource).toContain("runtimeRef.current?.dispose()");
    expect(hostSource).toContain("rendererRef.current?.dispose()");
    expect(hostSource).toContain("gl.deleteProgram(linkedProgram)");
  });

  it("is the sole host mounted by the production Surface", () => {
    expect(surfaceSource.match(/<ExpandedPresentationSurface\b/g)).toHaveLength(1);
    expect(surfaceSource).not.toMatch(/DotField|dotField/);
    expect(surfaceSource).toContain("{children}");
  });

  it("receives one resolved Intake-capable target without semantic callbacks", () => {
    expect(hostSource).toContain('frame.target.kind === "intake"');
    expect(hostSource).toContain("uMode == 6");
    expect(runtimeSource).toContain("target: ExpandedPresentationTarget");
    expect(runtimeSource).not.toMatch(/onComplete|onExpire|dispatchLifecycle|requestFull/);
  });
});
