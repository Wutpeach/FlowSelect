import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  createExpandedPresentationRuntime,
  ACTIVATION_DURATION_MS,
  type ExpandedPresentationFrame,
  type ExpandedPresentationInputs,
  type ExpandedPresentationRuntime,
} from "./expandedPresentationRuntime";
import type { ExpandedPresentationTarget } from "./expandedPresentationTargets";
import type { ThermalPalette } from "./thermalPalette";

const MAX_DPR = 2;

const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;
const vec2 POSITIONS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);
out vec2 vUv;
void main() {
  vec2 position = POSITIONS[gl_VertexID];
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uProgress;
uniform int uProgressMode;
uniform bool uReducedMotion;
uniform float uActivationAge;
uniform int uActivationKind;
uniform vec2 uActivationOrigin;
uniform vec3 uThermalVoid;
uniform vec3 uThermalDeep;
uniform vec3 uThermalEmber;
uniform vec3 uThermalFlare;
uniform vec3 uThermalGold;
uniform vec3 uThermalCore;

float arcMask(float angle, float amount) {
  return step(angle, clamp(amount, 0.0, 1.0));
}

float ring(vec2 point, float radius, float width) {
  return 1.0 - smoothstep(width, width * 1.8, abs(length(point) - radius));
}

float angularDistance(float left, float right) {
  return abs(fract(left - right + 0.5) - 0.5);
}

float edgeMask(vec2 uv, float width) {
  float edgeDistance = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  return 1.0 - smoothstep(width, width * 1.8, edgeDistance);
}

float perimeterCoordinate(vec2 uv) {
  float left = uv.x;
  float right = 1.0 - uv.x;
  float bottom = uv.y;
  float top = 1.0 - uv.y;
  float nearest = min(min(left, right), min(bottom, top));
  if (nearest == bottom) return uv.x * 0.25;
  if (nearest == right) return 0.25 + uv.y * 0.25;
  if (nearest == top) return 0.5 + (1.0 - uv.x) * 0.25;
  return 0.75 + (1.0 - uv.y) * 0.25;
}

float phasePulse(float phase, float start, float peak, float end) {
  return smoothstep(start, peak, phase) * (1.0 - smoothstep(peak, end, phase));
}

void main() {
  vec2 centered = vUv - 0.5;
  centered.x *= uResolution.x / max(uResolution.y, 1.0);
  float angle = fract(atan(centered.x, centered.y) / 6.28318530718);
  float track = ring(centered, 0.26, 0.011);
  float arc = 0.0;
  float frontier = 0.0;
  if (uProgressMode == 1) {
    arc = track * arcMask(angle, uProgress);
    // Keep the material strictly behind the authoritative angular frontier.
    frontier = track * exp(-abs(angle - uProgress) * 72.0)
      * arcMask(angle, uProgress) * step(0.002, uProgress);
  } else if (uProgressMode == 2) {
    // Honest indeterminate: one fixed non-percent segment, never a travelling frontier.
    arc = track * step(0.16, angle) * step(angle, 0.42);
  }
  float visibleTrack = uProgressMode == 0 ? 0.0 : track;
  vec3 color = mix(uThermalVoid, uThermalDeep, visibleTrack);
  color = mix(color, uThermalEmber, arc);
  color = mix(color, uThermalGold, frontier);
  float alpha = visibleTrack * 0.14 + arc * 0.34 + frontier * 0.24;

  if (uActivationKind != 0) {
    float phase = clamp(uActivationAge, 0.0, 1.0);
    // DOM client coordinates are top-down; WebGL UV coordinates are bottom-up.
    vec2 interactionUv = vec2(uActivationOrigin.x, 1.0 - uActivationOrigin.y);
    vec2 origin = interactionUv - 0.5;
    origin.x *= uResolution.x / max(uResolution.y, 1.0);
    float distanceFromOrigin = length(centered - origin);
    float intake = uActivationKind == 1 ? 1.0 : 0.0;
    float turbulence = intake * 0.018 * sin((centered.y + uTime) * 42.0);
    float ignition = (1.0 - smoothstep(
      0.015,
      mix(0.12, 0.2, smoothstep(0.0, 0.28, phase)),
      distanceFromOrigin + turbulence
    )) * (1.0 - smoothstep(0.18, 0.46, phase));
    float sweepLimit = mix(0.76, 0.9, intake);
    float sweep = exp(-abs(
      distanceFromOrigin - mix(0.03, sweepLimit, smoothstep(0.08, 0.52, phase))
    ) * mix(24.0, 19.0, intake));
    float perimeter = edgeMask(vUv, mix(0.04, 0.032, intake));
    float perimeterPosition = perimeterCoordinate(vUv);
    float originPosition = perimeterCoordinate(interactionUv);
    float chaseDistance = mix(0.0, 0.5, smoothstep(0.34, 0.72, phase));
    float dualFrontDistance = min(
      angularDistance(perimeterPosition, originPosition + chaseDistance),
      angularDistance(perimeterPosition, originPosition - chaseDistance)
    );
    float capturedDistance = angularDistance(perimeterPosition, originPosition);
    float capturedEdge = perimeter
      * (1.0 - smoothstep(max(chaseDistance - 0.035, 0.0), chaseDistance + 0.02, capturedDistance))
      * smoothstep(0.24, 0.42, phase);
    float edgeFronts = perimeter * (1.0 - smoothstep(0.025, 0.075, dualFrontDistance));
    float oppositeDistance = angularDistance(perimeterPosition, originPosition + 0.5);
    float oppositeClosure = perimeter
      * (1.0 - smoothstep(0.02, 0.1, oppositeDistance))
      * phasePulse(phase, 0.62, 0.74, 0.86);
    float convergence = exp(-length(centered) * 17.0)
      * phasePulse(phase, 0.7, 0.79, 0.89);
    float dissipate = 1.0 - smoothstep(0.78, 1.0, phase);
    float travellingThermal = max(
      ignition,
      max(
        sweep * mix(0.64, 0.78, intake),
        max(
          capturedEdge * mix(0.86, 0.68, intake),
          max(edgeFronts * 0.74, max(oppositeClosure * 0.82, convergence * 0.52))
        )
      )
    ) * dissipate;
    float reducedIntake = max(
      1.0 - smoothstep(0.035, 0.17, distanceFromOrigin),
      ring(centered - origin, 0.18, 0.022) * 0.5
    );
    float reducedFolderLock = perimeter
      * (1.0 - smoothstep(0.025, 0.12, oppositeDistance));
    float reducedFolder = max(perimeter * 0.55, reducedFolderLock * 0.82);
    float thermal = uReducedMotion
      ? mix(reducedFolder, reducedIntake, intake)
      : travellingThermal;
    vec3 activationColor = mix(uThermalDeep, uThermalEmber, smoothstep(0.08, 0.42, thermal));
    activationColor = mix(activationColor, uThermalFlare, smoothstep(0.35, 0.68, thermal));
    activationColor = mix(activationColor, uThermalGold, smoothstep(0.66, 0.86, thermal));
    color = mix(activationColor, uThermalCore, smoothstep(0.86, 0.98, thermal));
    alpha = max(alpha * 0.35, thermal * (uReducedMotion ? 0.24 : 0.72));
  }
  outColor = vec4(color, alpha);
}`;

export type ExpandedPresentationSurfaceProps = {
  eligible: boolean;
  reducedMotion: boolean;
  target: ExpandedPresentationTarget;
  palette: ThermalPalette;
  /**
   * Optional ABSOLUTE backing pixels-per-CSS-pixel value (dev-only, default
   * undefined = normal clamped devicePixelRatio). The Browser Lab passes 4
   * during a PNG export so the single production canvas backing store is
   * exactly 800x800 for the 200x200 layout, independent of devicePixelRatio
   * (4 works at DPR 1, 1.25, 1.5, 2, ...). Production never sets it.
   */
  backingScale?: number;
  /**
   * Optional dev-only redraw epoch (default 0): when it changes the surface
   * re-resizes and re-draws synchronously even if backingScale is unchanged, so
   * a same-commit Lab readback always sees a freshly drawn buffer. Production
   * never sets it.
   */
  redrawEpoch?: number;
};

type GraphicsColors = ThermalPalette;

type GraphicsRenderer = {
  render: (frame: ExpandedPresentationFrame, colors: GraphicsColors) => void;
  resize: (backingScale?: number) => void;
  redraw: (colors: GraphicsColors) => void;
  clear: () => void;
  dispose: () => void;
};

const parseHexColor = (value: string): [number, number, number] => {
  const normalized = value.trim();
  const match = /^#([0-9a-f]{6})$/i.exec(normalized);
  if (match === null) {
    return [1, 1, 1];
  }
  const packed = Number.parseInt(match[1], 16);
  return [
    ((packed >> 16) & 255) / 255,
    ((packed >> 8) & 255) / 255,
    (packed & 255) / 255,
  ];
};

const compileShader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader => {
  const shader = gl.createShader(type);
  if (shader === null) {
    throw new Error("Unable to allocate Expanded Presentation shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader compile failure";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
};

const createGraphicsRenderer = (canvas: HTMLCanvasElement): GraphicsRenderer | null => {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    powerPreference: "low-power",
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    stencil: false,
  });
  if (gl === null) {
    return null;
  }

  let vertexShader: WebGLShader | null = null;
  let fragmentShader: WebGLShader | null = null;
  let program: WebGLProgram | null = null;
  let disposed = false;
  let lastFrame: ExpandedPresentationFrame | null = null;

  try {
    vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    program = gl.createProgram();
    if (program === null) {
      throw new Error("Unable to allocate Expanded Presentation program");
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "Unknown shader link failure");
    }
  } catch {
    if (program !== null) gl.deleteProgram(program);
    if (fragmentShader !== null) gl.deleteShader(fragmentShader);
    if (vertexShader !== null) gl.deleteShader(vertexShader);
    return null;
  }

  const linkedProgram = program;
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  gl.useProgram(linkedProgram);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const resolutionLocation = gl.getUniformLocation(linkedProgram, "uResolution");
  const timeLocation = gl.getUniformLocation(linkedProgram, "uTime");
  const progressLocation = gl.getUniformLocation(linkedProgram, "uProgress");
  const progressModeLocation = gl.getUniformLocation(linkedProgram, "uProgressMode");
  const reducedMotionLocation = gl.getUniformLocation(linkedProgram, "uReducedMotion");
  const activationAgeLocation = gl.getUniformLocation(linkedProgram, "uActivationAge");
  const activationKindLocation = gl.getUniformLocation(linkedProgram, "uActivationKind");
  const activationOriginLocation = gl.getUniformLocation(linkedProgram, "uActivationOrigin");
  const voidLocation = gl.getUniformLocation(linkedProgram, "uThermalVoid");
  const deepLocation = gl.getUniformLocation(linkedProgram, "uThermalDeep");
  const emberLocation = gl.getUniformLocation(linkedProgram, "uThermalEmber");
  const flareLocation = gl.getUniformLocation(linkedProgram, "uThermalFlare");
  const goldLocation = gl.getUniformLocation(linkedProgram, "uThermalGold");
  const coreLocation = gl.getUniformLocation(linkedProgram, "uThermalCore");

  const resize = (backingScale?: number): void => {
    if (disposed) return;
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), MAX_DPR);
    // clientWidth/clientHeight are layout pixels and therefore do not inherit
    // the shell's temporary Motion transform. The rect is only a zero-layout
    // fallback; using its transformed size would freeze an undersized backing
    // store after the expand transition settles.
    const cssWidth = canvas.clientWidth || bounds.width;
    const cssHeight = canvas.clientHeight || bounds.height;
    // The capture override is an ABSOLUTE backing pixels-per-CSS-pixel value:
    // it REPLACES (never multiplies) the clamped devicePixelRatio, so a 4x
    // export is exactly 800x800 for 200x200 CSS at any devicePixelRatio
    // (1, 1.25, 1.5, 2, ...). Production passes nothing and keeps the clamped
    // DPR exactly as before.
    const scale = backingScale ?? dpr;
    const width = Math.max(Math.round(cssWidth * scale), 1);
    const height = Math.max(Math.round(cssHeight * scale), 1);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
  };

  const draw = (frame: ExpandedPresentationFrame, colors: GraphicsColors): void => {
    if (disposed || gl.isContextLost()) return;
    lastFrame = frame;
    let progressMode = 0;
    if (frame.target.kind === "progress") {
      progressMode = frame.target.progress.kind === "determinate" ? 1 : 2;
    } else if (frame.target.kind === "activation") {
      progressMode = frame.target.progress.kind === "determinate"
        ? 1
        : frame.target.progress.kind === "indeterminate" ? 2 : 0;
    }
    gl.useProgram(linkedProgram);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform1f(timeLocation, frame.timeSeconds);
    gl.uniform1f(progressLocation, frame.progressLevel);
    gl.uniform1i(progressModeLocation, progressMode);
    gl.uniform1i(reducedMotionLocation, frame.reducedMotion ? 1 : 0);
    const activation = frame.target.kind === "activation" ? frame.target : null;
    const activationAge = activation === null
      ? 1
      : Math.min(Math.max((frame.timeSeconds * 1000 - activation.startedAt) / ACTIVATION_DURATION_MS, 0), 1);
    gl.uniform1f(activationAgeLocation, activationAge);
    gl.uniform1i(
      activationKindLocation,
      activation === null ? 0 : activation.source === "intake" ? 1 : 2,
    );
    gl.uniform2f(activationOriginLocation, activation?.origin.x ?? 0.5, activation?.origin.y ?? 0.5);
    gl.uniform3fv(voidLocation, parseHexColor(colors.thermalVoid));
    gl.uniform3fv(deepLocation, parseHexColor(colors.thermalDeep));
    gl.uniform3fv(emberLocation, parseHexColor(colors.thermalEmber));
    gl.uniform3fv(flareLocation, parseHexColor(colors.thermalFlare));
    gl.uniform3fv(goldLocation, parseHexColor(colors.thermalGold));
    gl.uniform3fv(coreLocation, parseHexColor(colors.thermalCore));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const clear = (): void => {
    if (disposed || gl.isContextLost()) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };

  return {
    render: draw,
    resize,
    redraw: (colors) => {
      if (lastFrame !== null) draw(lastFrame, colors);
    },
    clear,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      gl.deleteProgram(linkedProgram);
    },
  };
};

/**
 * The sole production Expanded graphics host. WebGL2 is deliberately concrete
 * and decorative: context/resource failure leaves the authoritative DOM and
 * all Product, lifecycle, progress, terminal, and retention state untouched.
 */
export function ExpandedPresentationSurface({
  eligible,
  reducedMotion,
  target,
  palette,
  backingScale,
  redrawEpoch = 0,
}: ExpandedPresentationSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<GraphicsRenderer | null>(null);
  const runtimeRef = useRef<ExpandedPresentationRuntime | null>(null);
  const eligibleRef = useRef(eligible);
  const inputsRef = useRef<ExpandedPresentationInputs>({
    target,
    reducedMotion,
  });
  const colorsRef = useRef<GraphicsColors>(palette);
  const backingScaleRef = useRef<number | undefined>(backingScale);
  const [dprEpoch, setDprEpoch] = useState(0);

  useEffect(() => {
    eligibleRef.current = eligible;
    inputsRef.current = { target, reducedMotion };
    colorsRef.current = palette;
    backingScaleRef.current = backingScale;
  }, [
    eligible,
    palette,
    backingScale,
    reducedMotion,
    target,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    const installRenderer = (): void => {
      const renderer = createGraphicsRenderer(canvas);
      rendererRef.current = renderer;
      if (renderer === null) return;
      const runtime = createExpandedPresentationRuntime({
        now: () => performance.now(),
        scheduleFrame: (callback) => requestAnimationFrame(callback),
        cancelFrame: (handle) => cancelAnimationFrame(handle),
        render: (frame) => rendererRef.current?.render(frame, colorsRef.current),
      });
      runtimeRef.current = runtime;
      renderer.resize();
      if (eligibleRef.current) runtime.wake(inputsRef.current);
    };

    const handleContextLost = (event: Event): void => {
      event.preventDefault();
      runtimeRef.current?.sleep();
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
      rendererRef.current = null;
    };
    const handleContextRestored = (): void => installRenderer();

    installRenderer();
    const resizeObserver = new ResizeObserver(() => {
      rendererRef.current?.resize(backingScaleRef.current);
      if (eligibleRef.current) rendererRef.current?.redraw(colorsRef.current);
      else rendererRef.current?.clear();
    });
    resizeObserver.observe(canvas);
    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);
    return () => {
      resizeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      runtimeRef.current?.dispose();
      rendererRef.current?.dispose();
      runtimeRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime === null) return;
    if (eligible) runtime.wake(inputsRef.current);
    else {
      runtime.sleep();
      rendererRef.current?.clear();
    }
  }, [eligible, reducedMotion, target]);

  // Backing-store changes (dev-only backingScale capture) must resize and
  // redraw synchronously BEFORE paint so a Lab readback in the same commit
  // can read the freshly drawn buffer (preserveDrawingBuffer is false).
  useLayoutEffect(() => {
    backingScaleRef.current = backingScale;
    const renderer = rendererRef.current;
    if (renderer === null) return;
    renderer.resize(backingScaleRef.current);
    if (eligibleRef.current) renderer.redraw(colorsRef.current);
    else renderer.clear();
  }, [backingScale, redrawEpoch]);

  useEffect(() => {
    if (eligible) rendererRef.current?.redraw(colorsRef.current);
  }, [eligible, palette]);

  useEffect(() => {
    rendererRef.current?.resize(backingScaleRef.current);
    if (eligibleRef.current) rendererRef.current?.redraw(colorsRef.current);
    else rendererRef.current?.clear();
    // Observe the raw scale even though the backing store is capped. A query
    // for the capped value would stay false when moving between (for example)
    // 3x and 1.5x monitors and miss the resize entirely.
    const observedDpr = Number.isFinite(window.devicePixelRatio)
      && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;
    const media = window.matchMedia(`(resolution: ${observedDpr}dppx)`);
    const handleChange = () => setDprEpoch((epoch) => epoch + 1);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [dprEpoch]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: target.kind === "activation" && !reducedMotion ? 2 : 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}
