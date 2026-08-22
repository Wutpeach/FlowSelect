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
    expect(hostSource).toContain("heatmapOutput(heatmapUv, uTime, uReducedMotion, outColor)");
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
    expect(hostSource).toContain("float d = heatmapFrontierDistance(q, DIR, front, bendTime);");
    expect(hostSource).toContain("return dot(q, direction) - front + heatmapBend(q, bendTime);");
    expect(hostSource).toContain("float body = exp(-behind * 1.1) * (1.0 - smoothstep(0.0, 0.05, d));");
    expect(hostSource).toContain("float warm = heatmapFrontierWarm(d);");
    expect(hostSource).toContain("return exp(-abs(distanceToFrontier + 0.018) * 30.0);");
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
    expect(hostSource).toContain("return smoothstep(-0.05, 0.0, boundaryDistance)");
    expect(hostSource).toContain("* step(boundaryDistance, 0.0);");
    expect(hostSource).toContain("float contact = heatmapBoundaryContact(bd, warm);");
    expect(hostSource).toContain("float capture = contact * 0.6;");
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

  it("keeps the Thermal Refraction spike on the one shader with a lab-only gated uniform", () => {
    // The derived Refraction mode stays inside the single fragment program:
    // one canvas, one draw, one `uRefractionMode` gate that production never
    // sets, and no texture/sampler/framebuffer/second pass.
    expect(hostSource.match(/<canvas\b/g)).toHaveLength(1);
    expect(hostSource.match(/gl\.drawArrays\(/g)).toHaveLength(1);
    expect(hostSource).toContain("uniform int uRefractionMode;");
    expect(hostSource).toContain("refraction?: boolean;");
    expect(hostSource).toContain("refractionModeRef.current");
    expect(hostSource).not.toContain("sampler2D");
    expect(hostSource).not.toMatch(/createTexture|createFramebuffer|framebufferTexture2D/);
  });

  it("derives the Refraction displacement from the low-frequency heatmapBend finite difference", () => {
    // Displacement direction comes from the finite difference of the existing
    // LOW-frequency heatmapBend (no high-frequency noise), and the local
    // intensity envelope is warm/frontier strong, cool body weak, and exactly
    // zero where energy is zero (energy=0 -> refraction off).
    expect(hostSource).toContain("if (uRefractionMode != 0) {");
    expect(hostSource).toContain("heatmapBend(q + vec2(REFRACTION_EPS, 0.0), bendTime)");
    expect(hostSource).toContain("heatmapBend(q + vec2(0.0, REFRACTION_EPS), bendTime)");
    expect(hostSource).toContain("float covered = 1.0 - smoothstep(0.0, 0.05, d);");
    expect(hostSource).toContain("float bodyFloor = covered * (1.0 - smoothstep(0.20, 0.85, warm));");
    expect(hostSource).toContain("float env = clamp(contact + warm * 0.60 + bodyFloor * 0.30, 0.0, 1.0) * energy;");
    expect(hostSource).toContain("float dShift = s * (dot(grad, DIR) + dot(grad, grad));");
    expect(hostSource).toContain("float alongShift = s * dot(grad, vec2(-DIR.y, DIR.x));");
    // Displacement keeps the locked env-weighted amplitude; material
    // visibility is decoupled onto the covered x energy gate.
    expect(hostSource).toContain("float s = REFRACTION_STRENGTH * env;");
    expect(hostSource).toContain("rgb = mix(rgb, rgb2, materialMix);");
    expect(hostSource).toContain("alpha = mix(alpha, alpha2, materialMix);");
    // Reduced Motion pins bendTime to 0, so the refraction freezes into a
    // static local snapshot (zero-frame scheduling covered by the runtime).
    expect(hostSource).toContain("reducedMotion ? 0.0 : t");
  });

  it("expands the Refraction envelope: contact strongest, front strong, covered body present, energy zero none", () => {
    const gate = hostSource.slice(
      hostSource.indexOf("if (uRefractionMode != 0) {"),
      hostSource.indexOf("// Subtle sine-free grain"),
    );
    // Hierarchy: localized boundary contact (boundaryBand*warm) is the
    // strongest envelope term, the warm frontier is strong, and the cool
    // covered body has a weaker but clearly present depth-independent floor.
    expect(gate).toContain("float covered = 1.0 - smoothstep(0.0, 0.05, d);");
    expect(gate).toContain("float bodyFloor = covered * (1.0 - smoothstep(0.20, 0.85, warm));");
    expect(gate).toContain("float env = clamp(contact + warm * 0.60 + bodyFloor * 0.30, 0.0, 1.0) * energy;");
    // The floor is gated away from the warm frontier and the whole envelope
    // is energy-gated, so energy=0 -> exactly zero; no full-screen wobble and
    // no perimeter/boundary ring grammar inside the gate.
    expect(gate).toContain("(1.0 - smoothstep(0.20, 0.85, warm))");
    expect(gate).toContain("* energy;");
    expect(gate).not.toMatch(/perimeterCoordinate|chaseDistance|dualFront|oppositeClosure/i);
  });

  it("builds a broad 2D heatmapBend temperature topology with covered gating", () => {
    const gate = hostSource.slice(
      hostSource.indexOf("if (uRefractionMode != 0) {"),
      hostSource.indexOf("// Subtle sine-free grain"),
    );
    // The base temperature topology is 2D: three genuinely distinct
    // coordinate frames (rotation, shear/axis-mix, anisotropic scale) feeding
    // heatmapBend at shared bendTime; no behind/depth primary axis remains.
    expect(gate).toContain("vec2 pa = vec2(0.8 * q.x - 0.6 * q.y, 0.6 * q.x + 0.8 * q.y) * 2.2 + vec2(0.30, -0.20);");
    expect(gate).toContain("vec2 pb = vec2(q.x + 0.45 * q.y, q.y - 0.35 * q.x) * 2.8 + vec2(-0.25, 0.35);");
    expect(gate).toContain("vec2 pc = vec2(q.x * 1.7, q.y * 0.9) * 1.6 + vec2(0.10, 0.40);");
    expect(gate).toContain("float baseA = heatmapBend(pa, bendTime) * 16.0;");
    expect(gate).toContain("float baseB = heatmapBend(pb, bendTime) * 16.0;");
    expect(gate).toContain("float baseC = heatmapBend(pc, bendTime) * 16.0;");
    expect(gate).toContain("float baseT = clamp(baseA * 0.45 + baseB * 0.35 + baseC * 0.20, -1.0, 1.0);");
    // The negative-biased heatmapBend window is re-centered so the broad
    // lobes span deep/vivid blue, cyan, yellow and a yellow/orange gradient
    // with localized red-orange instead of a broad hot board.
    expect(gate).toContain("float baseTemperature = clamp(0.5 + 0.5 * baseT + 0.24, 0.0, 1.0);");
    expect(gate).not.toContain("float baseTemperature = 0.5 + 0.5 * baseT;");
    expect(gate).toContain("mix(0.08, 0.93, baseTemperature)");
    expect(gate).toContain("float covered2 = 1.0 - smoothstep(0.0, 0.05, d2);");
    // Material visibility is decoupled from the (weaker) distortion envelope:
    // a covered x energy gate, not env.
    expect(gate).toContain("float materialMix = covered2 * energy;");
    expect(gate).toContain("rgb = mix(rgb, rgb2, materialMix);");
    expect(gate).toContain("alpha = mix(alpha, alpha2, materialMix);");
    expect(gate).not.toContain("rgb = mix(rgb, rgb2, env);");
    expect(gate).not.toContain("alpha = mix(alpha, alpha2, env);");
    // The rejected behind/depth axis and the sweep-aligned linear nudge are
    // gone and no longer authoritative.
    expect(gate).not.toContain("behind2");
    expect(gate).not.toContain("depthT");
    expect(gate).not.toContain("along2 * ");
    expect(gate).not.toContain("trailing");
    // Frontier/contact are bounded additive biases, not the topology.
    expect(gate).toContain("warm2 * 0.18");
    expect(gate).toContain("contact2 * 0.22");
    expect(gate).toContain("* covered2;");
    // Locked envelope + strength + displacement stay byte-identical.
    expect(gate).toContain("const float REFRACTION_EPS = 0.02;");
    expect(gate).toContain("const float REFRACTION_STRENGTH = 0.16;");
    expect(gate).toContain("float env = clamp(contact + warm * 0.60 + bodyFloor * 0.30, 0.0, 1.0) * energy;");
    expect(gate).toContain("float dShift = s * (dot(grad, DIR) + dot(grad, grad));");
    expect(gate).toContain("float alongShift = s * dot(grad, vec2(-DIR.y, DIR.x));");
    // Prohibited paths absent: no new ramp, no noise/hash, no second
    // canvas/draw, no forbidden motion/geometry grammar inside the gate.
    expect(gate).not.toContain("HEAT_STOP2");
    expect(gate).not.toContain("heatmapNoise(");
    expect(gate).not.toContain("heatmapGrainHash(");
    expect(gate).not.toMatch(/perimeterCoordinate|chaseDistance|dualFront|oppositeClosure/i);
    expect(hostSource.match(/<canvas\b/g)).toHaveLength(1);
    expect(hostSource.match(/gl\.drawArrays\(/g)).toHaveLength(1);
  });

  it("keeps the accepted baseline constants untouched by the Refraction gate", () => {
    // The refraction block is additive and gated: the accepted motion/contact/
    // palette/material/edge lines below stay byte-identical (covered by the
    // dedicated baseline tests above), and Refraction off adds nothing.
    expect(hostSource).toContain("return dot(q, direction) - front + heatmapBend(q, bendTime);");
    expect(hostSource).toContain("float heat = (body * 0.44 + warm * 0.22 + core * 0.55 + capture) * energy;");
    expect(hostSource).toContain("float material = clamp(heat + coolLift + hotLift, 0.0, 1.0);");
    // No high-frequency noise lattice or haze primitive is introduced.
    expect(hostSource).not.toContain("vec2(26.0");
    expect(hostSource).not.toContain("vec2(34.0");
    expect(hostSource).not.toContain("haze");
  });

  it("projects the accepted localized contact into a fixed exterior halo", () => {
    const halo = hostSource.slice(
      hostSource.indexOf("// Fixed production exterior response"),
      hostSource.indexOf("// Clearer yellow transition"),
    );
    expect(hostSource).toContain("uniform int uBoundaryHaloMode;");
    expect(hostSource).toContain("boundaryHalo?: boolean;");
    expect(hostSource).toContain("? (vUv - uPanelOrigin) / uPanelSize");
    expect(halo).toContain("roundedBoundaryNormal(uv)");
    expect(halo).toContain("heatmapFrontierDistance(footQ, DIR, front, bendTime)");
    expect(halo).toContain("heatmapFrontierWarm(footDistance)");
    expect(halo).toContain("heatmapBoundaryContact(0.0, footWarm) * energy");
    expect(halo).toContain("1.0 - smoothstep(0.0, 0.06, bd)");
    expect(halo).toContain("haloResponse * 0.28");
    expect(halo).toContain("HEAT_STOP[i]");
    expect(halo).not.toMatch(/heatmapNoise|uTime|phase|clock|HALO_STOP|alphaFloor/i);
    expect(hostSource.match(/gl\.drawArrays\(/g)).toHaveLength(1);
    expect(hostSource).not.toMatch(/createTexture|createFramebuffer|framebufferTexture2D/);
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

  // ---------------------------------------------------------------------
  // MR9 production composition: 228 outer FX host + 200/r16 interaction clip
  // ---------------------------------------------------------------------

  it("derives the 14px gutter and 228 outer FX host from existing geometry only", () => {
    // The outer FX host is sized to the existing full viewport and offset by
    // the existing panel origin; no duplicate size constant is introduced.
    expect(surfaceSource).toContain("left: -geometry.visualShell.x");
    expect(surfaceSource).toContain("top: -geometry.visualShell.y");
    expect(surfaceSource).toContain("width: geometry.viewportSize");
    expect(surfaceSource).toContain("height: geometry.viewportSize");
    expect(surfaceSource).not.toMatch(/MAIN_WINDOW_FULL_SHADOW_GUTTER|MAIN_WINDOW_PANEL_SIZE/);
    // The capability gate is read-only geometry, not a new prop or state.
    expect(surfaceSource).toContain("const boundaryHaloCapable = geometry.visualShell.x > 0 && geometry.visualShell.y > 0");
    expect(surfaceSource).not.toContain("boundaryHaloCapable?:");
  });

  it("hosts the sole canvas in one non-stacking, pointer-transparent 228 wrapper", () => {
    const fxHost = surfaceSource.slice(
      surfaceSource.indexOf("Outer FX layout host"),
      surfaceSource.indexOf("Inner panel clip"),
    );
    expect(surfaceSource.match(/<ExpandedPresentationSurface\b/g)).toHaveLength(1);
    expect(fxHost).toContain('aria-hidden="true"');
    expect(fxHost).toContain('pointerEvents: "none"');
    expect(fxHost).toContain("width: geometry.viewportSize");
    expect(fxHost).not.toMatch(/zIndex|transform:|isolation|willChange|filter:|clipPath|mixBlendMode|backdropFilter|boxShadow/);
    expect(fxHost).not.toContain("opacity: 0");
  });

  it("enables the accepted Interior/Refraction/boundary capabilities as fixed production gates", () => {
    const mountStart = surfaceSource.indexOf("<ExpandedPresentationSurface");
    const mount = surfaceSource.slice(
      mountStart,
      surfaceSource.indexOf("/>", mountStart),
    );
    expect(mount).toContain("heatmap");
    expect(mount).toContain("refraction");
    expect(mount).toContain("boundaryHalo={boundaryHaloCapable}");
    // No Product/Application/lifecycle authority gains a boundary lane.
    expect(appSource).not.toContain("boundaryHalo");
    expect(targetSource).not.toContain("boundary");
    expect(policySource).not.toContain("boundary");
    expect(runtimeSource).not.toContain("boundary");
  });

  it("keeps the 200/r16 panel clip transparent, shadowless, and non-stacking", () => {
    const clip = surfaceSource.slice(
      surfaceSource.indexOf("Inner panel clip"),
      surfaceSource.indexOf("Drag glow layer"),
    );
    expect(clip).toContain("position: \"absolute\"");
    expect(clip).toContain("inset: 0");
    expect(clip).toContain("borderRadius: panelRadius");
    expect(clip).toContain('overflow: "hidden"');
    expect(clip).toContain('background: "none"');
    expect(clip).toContain('boxShadow: "none"');
    expect(clip).toContain('pointerEvents: "auto"');
    expect(clip).not.toMatch(/zIndex|transform:|isolation|willChange|filter:|clipPath|mixBlendMode|backdropFilter/);
    expect(clip).not.toContain("opacity: 0");
  });

  it("keeps all panel gestures and the containerRef on the 200px shell only", () => {
    // Exactly one event-owning shell: every drag/drop/pointer/context handler
    // stays on the element carrying containerRef, and the FX host mounts only
    // the canvas (pointer-events:none), so the gutter cannot start a drag or
    // accept a drop.
    expect(surfaceSource.match(/ref=\{containerRef\}/g)).toHaveLength(1);
    expect(surfaceSource.match(/onDrop=/g)).toHaveLength(1);
    expect(surfaceSource.match(/onPointerDown=/g)).toHaveLength(1);
    expect(surfaceSource.match(/onDragEnter=/g)).toHaveLength(1);
    const fxHost = surfaceSource.slice(
      surfaceSource.indexOf("Outer FX layout host"),
      surfaceSource.indexOf("Inner panel clip"),
    );
    expect(fxHost).not.toMatch(/onDrop|onPointerDown|onDragEnter|onContextMenu|onDoubleClick|onMouseEnter|onMouseLeave/);
    expect(fxHost).toContain('pointerEvents: "none"');
    // The inner clip owns no handlers either; events bubble to the shell.
    const clip = surfaceSource.slice(
      surfaceSource.indexOf("Inner panel clip"),
      surfaceSource.indexOf("Drag glow layer"),
    );
    expect(clip).not.toMatch(/onDrop|onPointerDown|onDragEnter|onContextMenu|onDoubleClick|onMouseEnter|onMouseLeave|ref=\{containerRef\}/);
  });

  it("keeps the existing shadow backdrop as the sole exterior CSS shadow owner", () => {
    expect(surfaceSource.match(/getShadowBackdropStyle\(/g)).toHaveLength(1);
    expect(surfaceSource).toContain("getShadowBackdropStyle(colors, {");
    const clip = surfaceSource.slice(
      surfaceSource.indexOf("Inner panel clip"),
      surfaceSource.indexOf("Drag glow layer"),
    );
    expect(clip).toContain('boxShadow: "none"');
    const fxHost = surfaceSource.slice(
      surfaceSource.indexOf("Outer FX layout host"),
      surfaceSource.indexOf("Inner panel clip"),
    );
    expect(fxHost).not.toContain("boxShadow");
  });

  it("keeps protected z-order: activation canvas z=2 below z=3 controls, wrappers non-stacking", () => {
    // The canvas z-index contract is unchanged; the FX host and inner clip
    // create no stacking context, so z=0/z=2 and protected z=3 still resolve
    // inside the existing shell stacking context.
    expect(hostSource).toContain('zIndex: target.kind === "activation" && !reducedMotion ? 2 : 0');
    expect(centerOverlaySource).toContain("style={{ ...CENTER_OVERLAY_CONTENT_STYLE, zIndex: 3 }}");
    const wrappers = surfaceSource.slice(
      surfaceSource.indexOf("Outer FX layout host"),
      surfaceSource.indexOf("Drag glow layer"),
    );
    expect(wrappers).not.toMatch(/zIndex|transform:|isolation|willChange|filter:|clipPath|mixBlendMode|backdropFilter/);
    expect(wrappers).not.toContain("opacity: 0");
  });

  it("keeps the one-canvas/program/draw/resource and runtime scheduling authority unchanged", () => {
    expect(hostSource.match(/<canvas\b/g)).toHaveLength(1);
    expect(hostSource.match(/gl\.drawArrays\(/g)).toHaveLength(1);
    expect(hostSource).not.toMatch(/createTexture|createFramebuffer|framebufferTexture2D/);
    expect(surfaceSource).not.toContain("createExpandedPresentationRuntime(");
    expect(runtimeSource).toContain("scheduleNextFrame");
    expect(runtimeSource).toContain("needsFrames");
    expect(runtimeSource).not.toMatch(/onComplete|onExpire|dispatchLifecycle|requestFull/);
  });
});
