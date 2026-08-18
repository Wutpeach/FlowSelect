import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = import.meta.dirname;
const hostSource = readFileSync(resolve(here, "ExpandedPresentationSurface.tsx"), "utf8");
const surfaceSource = readFileSync(resolve(here, "MainWindowPresentationSurface.tsx"), "utf8");
const runtimeSource = readFileSync(resolve(here, "expandedPresentationRuntime.ts"), "utf8");
const appSource = readFileSync(resolve(here, "../../App.tsx"), "utf8");
const centerOverlaySource = readFileSync(resolve(here, "MainWindowCenterOverlay.tsx"), "utf8");
const targetSource = readFileSync(resolve(here, "expandedPresentationTargets.ts"), "utf8");
const policySource = readFileSync(resolve(here, "expandedPresentationPolicy.ts"), "utf8");
const paletteSource = readFileSync(resolve(here, "thermalPalette.ts"), "utf8");
const controllerSource = readFileSync(resolve(here, "../../features/download/useDownloadQueue.ts"), "utf8");

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
    expect(hostSource.match(/gl\.drawArrays\(/g)).toHaveLength(1);
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

  it("treats the capture backingScale as an absolute value, not a DPR multiplier", () => {
    // The capture override must mean backing pixels-per-CSS-pixel: it replaces
    // (never multiplies) the clamped devicePixelRatio so a 4x export is exactly
    // 800x800 for 200x200 CSS at DPR 1, 1.25, 1.5, 2, ... Production with no
    // override keeps the normal clamped devicePixelRatio.
    expect(hostSource).toContain("backingScale?: number");
    expect(hostSource).not.toContain("pixelScale");
    const resizeBlock = hostSource.slice(
      hostSource.indexOf("const resize = (backingScale?: number)"),
      hostSource.indexOf("if (canvas.width !== width"),
    );
    expect(resizeBlock).toMatch(/backingScale \?\? dpr/);
    expect(resizeBlock).toMatch(/cssWidth \* scale/);
    expect(resizeBlock).not.toMatch(/dpr \* |\* dpr/);
    // Production path stays the clamped DPR when no override is passed.
    expect(hostSource).toContain("resize()");
    expect(hostSource).toContain("resize(backingScaleRef.current)");
  });

  it("is the sole host mounted by the production Surface", () => {
    expect(surfaceSource.match(/<ExpandedPresentationSurface\b/g)).toHaveLength(1);
    expect(surfaceSource).not.toMatch(/DotField|dotField/);
    expect(surfaceSource).toContain("{children}");
  });

  it("receives one bounded Activation target and circular Download arc without semantic callbacks", () => {
    expect(hostSource).toContain('frame.target.kind === "activation"');
    expect(hostSource).toContain("uActivationOrigin");
    expect(hostSource).toContain("uProgressMode");
    expect(hostSource).toContain("float arcMask");
    expect(hostSource).toContain("* arcMask(angle, uProgress)");
    expect(hostSource).toContain("float dualFrontDistance");
    expect(hostSource).toContain("float perimeterCoordinate");
    expect(hostSource).toContain("1.0 - uActivationOrigin.y");
    expect(hostSource).toContain("uThermalVoid");
    expect(hostSource).toContain("uThermalDeep");
    expect(hostSource).toContain("uThermalGold");
    expect(hostSource).toContain("uThermalCore");
    expect(hostSource).not.toContain('frame.target.kind === "terminal"');
    expect(targetSource).not.toContain("Terminal");
    expect(policySource).not.toContain("terminal");
    expect(runtimeSource).toContain("target: ExpandedPresentationTarget");
    expect(runtimeSource).not.toMatch(/onComplete|onExpire|dispatchLifecycle|requestFull/);
  });

  it("occludes coverable center material while keeping controls and diagnostics protected", () => {
    // The center overlay is a shared browser-safe component used by both App
    // and the Browser Lab; the coverable-material contract is enforced on the
    // one shared implementation, and App must mount that component.
    const progressBlock = centerOverlaySource.slice(
      centerOverlaySource.indexOf('centerOverlayVisual.kind === "task-progress"'),
      centerOverlaySource.indexOf('centerOverlayVisual.kind === "task-processing"'),
    );
    expect(progressBlock).toContain("style={CENTER_OVERLAY_CONTENT_STYLE}");
    expect(progressBlock).toContain('primaryTask.kind === "transcode"');
    expect(progressBlock).not.toContain("zIndex: 3");
    expect(centerOverlaySource).toContain("-protected-cancel");
    expect(centerOverlaySource).toContain("style={{ ...CENTER_OVERLAY_CONTENT_STYLE, zIndex: 3 }}");
    expect(centerOverlaySource).toContain("data-mr9-protected-control=\"primary-cancel\"");
    expect(appSource).toContain("<MainWindowCenterOverlay");
    expect(appSource).toContain("onCancelPrimaryTask={");
    expect(hostSource).toContain('zIndex: target.kind === "activation" && !reducedMotion ? 2 : 0');
  });

  it("snapshots paste origin before submission and never reads pointer state at acceptance", () => {
    const pasteEffect = surfaceSource.slice(
      surfaceSource.indexOf("const handleWindowPaste"),
      surfaceSource.indexOf('window.addEventListener("paste"'),
    );
    expect(pasteEffect.indexOf("snapshotPointerFieldOrigin")).toBeLessThan(
      pasteEffect.indexOf("onPaste(event.clipboardData, origin)"),
    );
    expect(pasteEffect).toContain("isPointerInsidePanelRef.current");
    expect(pasteEffect).toContain("expandedGraphicsEligible");
    expect(controllerSource).not.toContain("pointerField");
  });

  it("captures a fullscreen URL/Folder drop point before asynchronous work", () => {
    const dropHandler = appSource.slice(
      appSource.indexOf("const handleDrop = async"),
      appSource.indexOf("const openSettings"),
    );
    expect(dropHandler).toContain("mainWindowFullContentVisible");
    expect(dropHandler.indexOf("snapshotClientPointOrigin")).toBeLessThan(
      dropHandler.indexOf("await desktopDrop.consumePendingFolderDrop()"),
    );
  });

  it("uses the reviewed six-role canonical Thermal Palette", () => {
    for (const [role, color] of [
      ["thermalVoid", "#201E25"],
      ["thermalDeep", "#5A2330"],
      ["thermalEmber", "#C9443A"],
      ["thermalFlare", "#FF7447"],
      ["thermalGold", "#FFC45C"],
      ["thermalCore", "#FFE8C8"],
    ]) {
      expect(paletteSource).toContain(`${role}: "${color}"`);
    }
  });
});
