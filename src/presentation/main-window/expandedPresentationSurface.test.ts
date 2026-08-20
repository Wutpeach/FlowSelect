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

  it("keeps the Heatmap spike on the one shader with a lab-only gated uniform", () => {
    // The spike stays inside the single fragment program: one canvas, one
    // draw call, one `uHeatmapMode` gate that production never sets.
    expect(hostSource.match(/<canvas\b/g)).toHaveLength(1);
    expect(hostSource.match(/gl\.drawArrays\(/g)).toHaveLength(1);
    expect(hostSource).toContain("uniform int uHeatmapMode;");
    expect(hostSource).toContain("heatmapOutput(vUv, uTime, uReducedMotion, outColor)");
    expect(hostSource).toContain("heatmap?: boolean;");
    // The restored analytic baseline needs NO texture/preprocessing: no
    // sampler, rasterizer, blur helpers, framebuffer, or second pass.
    expect(hostSource).not.toContain("u_heatmapBoundary");
    expect(hostSource).not.toContain("sampler2D");
    expect(hostSource).not.toContain("blurGray");
    expect(hostSource).not.toContain("multiPassBlurGray");
    expect(hostSource).not.toContain("rasterizeHeatmap");
    expect(hostSource).not.toContain("HEATMAP_CORE_SCALE");
    expect(hostSource).not.toContain("coreMask");
    expect(hostSource).not.toMatch(/createTexture|createFramebuffer|framebufferTexture2D/);
    expect(paletteSource).toContain('thermalVoid: "#201E25"');
  });

  it("restores the Checkpoint C travelling diagonal band with exact constants", () => {
    // Selected baseline motion grammar (research/paper-shaders-heatmap-
    // checkpoint-b.md / checkpoint-c.md): one continuous phase, the
    // lower-left -> upper-right front, and the exact body/warm/core/energy
    // constants, over the centered field coordinate q = uv - 0.5.
    expect(hostSource).toContain("const vec2 DIR = vec2(0.8235, 0.5674);");
    expect(hostSource).toContain("float k = reducedMotion ? 0.42 : fract(t * 0.13);");
    expect(hostSource).toContain("float front = mix(-0.58, 1.6, k);");
    expect(hostSource).toContain("vec2 q = uv - 0.5;");
    expect(hostSource).toContain("float d = p - front + bend;");
    expect(hostSource).toContain("float body = exp(-behind * 1.1) * (1.0 - smoothstep(0.0, 0.05, d));");
    expect(hostSource).toContain("float warm = exp(-abs(d + 0.018) * 30.0);");
    expect(hostSource).toContain("float core = exp(-alongFront * alongFront * 200.0 - d * d * 200.0);");
    expect(hostSource).toContain("float energy = smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.66, 0.99, k));");
    // Reduced Motion pins the mid-sweep snapshot and freezes the deformation.
    expect(hostSource).toContain("float bendTime = reducedMotion ? 0.0 : t;");
    expect(hostSource).toContain("heatmapBend(q, bendTime)");
  });

  it("restores the Rounded Boundary Edge Capture contact gate", () => {
    // Selected baseline contact grammar (research/mr9-rounded-boundary-edge-
    // capture-spike.md): real 200x200/16px rounded-rect SDF, inward-thick
    // boundary band, contact-gated localized capture, and the exact heat sum.
    expect(hostSource).toContain("float boundaryBand = smoothstep(-0.05, 0.0, bd) * step(bd, 0.0);");
    expect(hostSource).toContain("float capture = boundaryBand * warm * 0.6;");
    expect(hostSource).toContain("float heat = (body * 0.44 + warm * 0.22 + core * 0.55 + capture) * energy;");
    expect(hostSource).toContain("float bd = roundedBoundary(uv);");
    expect(hostSource).toContain("vec2 halfSize = vec2(0.5) - uCornerRadius;");
  });

  it("adds the palette/material/edge repair as a separate color-only layer", () => {
    const heatmapBlock = hostSource.slice(
      hostSource.indexOf("void heatmapOutput("),
      hostSource.lastIndexOf("void main()"),
    );
    // Repaired 7-stop ramp: dark/deep blue -> vivid blue -> light blue/cyan ->
    // yellow -> orange -> red-orange (grey/green/teal reduced, no white core).
    expect(heatmapBlock).toContain("const vec3 HEAT_STOP[7]");
    expect(heatmapBlock).toContain("vec3(0.090, 0.400, 0.940)");
    expect(heatmapBlock).toContain("vec3(1.000, 0.800, 0.200)");
    expect(heatmapBlock).toContain("vec3(1.000, 0.340, 0.090)");
    // Material layering consumes the baseline scalars; it never changes the
    // motion/contact formulas or constants above.
    expect(heatmapBlock).toContain("float coolLift = body * (1.0 - smoothstep(0.20, 0.85, warm)) * 0.18 * energy;");
    expect(heatmapBlock).toContain("float hotLift = warm * 0.20 * energy;");
    expect(heatmapBlock).toContain("float material = clamp(heat + coolLift + hotLift, 0.0, 1.0);");
    // Clearer yellow transition (green-cast neutralization in the cyan->yellow
    // zone) and the contact-gated edge halo.
    expect(heatmapBlock).toContain("float yellowZone");
    expect(heatmapBlock).toContain("float inwardCool = contact * smoothstep(-0.16, -0.05, bd);");
    // No perimeter coordinate / Chase / Closure inside the heatmap slice.
    expect(heatmapBlock).not.toMatch(
      /perimeterCoordinate|chaseDistance|dualFront|oppositeClosure/i,
    );
  });

  it("excludes all rejected candidate grammar and internal geometry", () => {
    const heatmapBlock = hostSource.slice(
      hostSource.indexOf("// ---- Heatmap spike (lab-gated)"),
      hostSource.lastIndexOf("void main()"),
    );
    // Rejected literal-fidelity / core-removal / latent-carrier path is gone.
    expect(hostSource).not.toContain("latentCarrier");
    expect(hostSource).not.toContain("rimEdgeFade");
    expect(hostSource).not.toContain("u_heatmapBoundary");
    expect(hostSource).not.toContain("HEAT_COLOR");
    expect(hostSource).not.toContain("HEAT_ALPHA");
    expect(hostSource).not.toContain("MODIFIED DERIVATIVE of Paper Shaders");
    // No internal object / fixed geometry / inset thermal rectangle.
    expect(heatmapBlock).not.toMatch(
      /coreMask|insetRect|diamond|logo|capsule|synthetic core/i,
    );
    expect(heatmapBlock).not.toMatch(
      /coolMask|boundaryArc|nearestBoundaryPoint|capFill|shellDepth|fullCoverage|interiorFade|cavR|windowed|halfW|flow =/i,
    );
    // One canvas / one draw / one program / one runtime authority remains.
    expect(hostSource.match(/<canvas\b/g)).toHaveLength(1);
    expect(hostSource.match(/gl\.drawArrays\(/g)).toHaveLength(1);
    expect(hostSource).toContain("uniform int uHeatmapMode;");
    // Production activation grammar (Chase etc.) untouched elsewhere.
    expect(hostSource).toContain("float perimeterCoordinate");
    expect(hostSource).toContain("float dualFrontDistance");
  });

  it("keeps the reduced-motion static snapshot and the lab runtime gate", () => {
    // Reduced Motion: k pinned to 0.42 and bendTime to 0 -> fully static
    // (zero-frame scheduling is covered by expandedPresentationRuntime.test).
    expect(hostSource).toContain("reducedMotion ? 0.42 : fract(t * 0.13)");
    expect(hostSource).toContain("reducedMotion ? 0.0 : t");
    expect(hostSource).toContain("heatmap?: boolean;");
  });

  it("documents the license state honestly (no active Paper derivative)", () => {
    // All Paper-derived shader/preprocessing source was removed with the
    // rejected literal/latent-carrier path; the notices must distinguish
    // historical research from shipped/active adapted source and must not
    // claim active reuse.
    const notices = readFileSync(resolve(here, "../../../THIRD_PARTY_NOTICES.md"), "utf8");
    expect(notices).toContain("Paper Shaders");
    expect(notices).toContain("no active Paper-derived source shipped");
    expect(notices).toContain("clean-room");
    expect(notices).not.toMatch(/Modified Derivative Notice/);
    expect(notices).not.toMatch(/adapted source: `src\/presentation\/main-window\/ExpandedPresentationSurface/);
    // Historical research evidence is documented as non-shipped.
    expect(notices).toContain("research evidence");
    // Root project license remains MIT (not overwritten).
    const rootLicense = readFileSync(resolve(here, "../../../LICENSE"), "utf8");
    expect(rootLicense).toContain("MIT License");
  });
});
