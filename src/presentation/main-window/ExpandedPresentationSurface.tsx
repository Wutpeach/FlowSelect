import { useEffect, useRef, useState } from "react";
import {
  createExpandedPresentationRuntime,
  type ExpandedPresentationFrame,
  type ExpandedPresentationInputs,
  type ExpandedPresentationRuntime,
} from "./expandedPresentationRuntime";
import type { ExpandedPresentationTarget } from "./expandedPresentationTargets";

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
uniform int uMode;
uniform bool uReducedMotion;
uniform vec3 uAccent;
uniform vec3 uWarning;
uniform vec3 uDanger;
uniform vec3 uMuted;

void main() {
  vec2 centered = vUv - 0.5;
  centered.x *= uResolution.x / max(uResolution.y, 1.0);
  float radius = length(centered);
  float halo = 1.0 - smoothstep(0.08, 0.72, radius);
  float energy = 0.0;
  float alpha = 0.0;
  vec3 color = uMuted;

  if (uMode == 1) {
    float fill = 1.0 - smoothstep(uProgress - 0.025, uProgress + 0.025, vUv.x);
    float frontier = exp(-abs(vUv.x - uProgress) * 42.0);
    energy = halo * (0.2 + 0.8 * fill) + frontier * 0.42;
    alpha = 0.08 + 0.22 * energy;
    color = uAccent;
  } else if (uMode == 2) {
    float phase = uReducedMotion ? 0.5 : fract(uTime * 0.18);
    float band = exp(-abs(vUv.x - phase) * 10.0);
    energy = halo * (0.28 + 0.72 * band);
    alpha = 0.08 + 0.2 * energy;
    color = uAccent;
  } else if (uMode == 3) {
    float ring = exp(-abs(radius - 0.26) * 24.0);
    energy = max(halo * 0.72, ring);
    alpha = 0.1 + 0.24 * energy;
    color = uAccent;
  } else if (uMode == 4) {
    float crossA = exp(-abs(centered.x - centered.y) * 18.0);
    float crossB = exp(-abs(centered.x + centered.y) * 18.0);
    energy = halo * max(crossA, crossB);
    alpha = 0.1 + 0.24 * energy;
    color = uDanger;
  } else if (uMode == 5) {
    float band = exp(-abs(centered.y) * 18.0);
    energy = halo * band;
    alpha = 0.1 + 0.22 * energy;
    color = uWarning;
  } else if (uMode == 6) {
    float phase = uReducedMotion ? 0.58 : fract(uTime * 0.42);
    float intakeRadius = mix(0.68, 0.12, phase);
    float arrival = exp(-abs(radius - intakeRadius) * 28.0);
    float focus = 1.0 - smoothstep(0.04, 0.2, radius);
    energy = max(halo * 0.24, arrival * 0.78 + focus * 0.36);
    alpha = 0.08 + 0.24 * energy;
    color = uAccent;
  } else {
    energy = halo * 0.18;
    alpha = 0.035 + 0.055 * energy;
  }

  outColor = vec4(color, alpha);
}`;

export type ExpandedPresentationSurfaceProps = {
  eligible: boolean;
  reducedMotion: boolean;
  target: ExpandedPresentationTarget;
  accentColor: string;
  warningColor: string;
  dangerColor: string;
  mutedColor: string;
};

type GraphicsColors = Readonly<{
  accent: string;
  warning: string;
  danger: string;
  muted: string;
}>;

type GraphicsRenderer = {
  render: (frame: ExpandedPresentationFrame, colors: GraphicsColors) => void;
  resize: () => void;
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
  const modeLocation = gl.getUniformLocation(linkedProgram, "uMode");
  const reducedMotionLocation = gl.getUniformLocation(linkedProgram, "uReducedMotion");
  const accentLocation = gl.getUniformLocation(linkedProgram, "uAccent");
  const warningLocation = gl.getUniformLocation(linkedProgram, "uWarning");
  const dangerLocation = gl.getUniformLocation(linkedProgram, "uDanger");
  const mutedLocation = gl.getUniformLocation(linkedProgram, "uMuted");

  const resize = (): void => {
    if (disposed) return;
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), MAX_DPR);
    // clientWidth/clientHeight are layout pixels and therefore do not inherit
    // the shell's temporary Motion transform. The rect is only a zero-layout
    // fallback; using its transformed size would freeze an undersized backing
    // store after the expand transition settles.
    const cssWidth = canvas.clientWidth || bounds.width;
    const cssHeight = canvas.clientHeight || bounds.height;
    const width = Math.max(Math.round(cssWidth * dpr), 1);
    const height = Math.max(Math.round(cssHeight * dpr), 1);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
  };

  const draw = (frame: ExpandedPresentationFrame, colors: GraphicsColors): void => {
    if (disposed || gl.isContextLost()) return;
    lastFrame = frame;
    let mode = 0;
    if (frame.target.kind === "progress") {
      mode = frame.target.progress.kind === "determinate" ? 1 : 2;
    } else if (frame.target.kind === "terminal") {
      mode = frame.target.status === "success"
        ? 3
        : frame.target.status === "failure"
          ? 4
          : 5;
    } else if (frame.target.kind === "intake") {
      mode = 6;
    }
    gl.useProgram(linkedProgram);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform1f(timeLocation, frame.timeSeconds);
    gl.uniform1f(progressLocation, frame.progressLevel);
    gl.uniform1i(modeLocation, mode);
    gl.uniform1i(reducedMotionLocation, frame.reducedMotion ? 1 : 0);
    gl.uniform3fv(accentLocation, parseHexColor(colors.accent));
    gl.uniform3fv(warningLocation, parseHexColor(colors.warning));
    gl.uniform3fv(dangerLocation, parseHexColor(colors.danger));
    gl.uniform3fv(mutedLocation, parseHexColor(colors.muted));
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
  accentColor,
  warningColor,
  dangerColor,
  mutedColor,
}: ExpandedPresentationSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<GraphicsRenderer | null>(null);
  const runtimeRef = useRef<ExpandedPresentationRuntime | null>(null);
  const eligibleRef = useRef(eligible);
  const inputsRef = useRef<ExpandedPresentationInputs>({
    target,
    reducedMotion,
  });
  const colorsRef = useRef<GraphicsColors>({
    accent: accentColor,
    warning: warningColor,
    danger: dangerColor,
    muted: mutedColor,
  });
  const [dprEpoch, setDprEpoch] = useState(0);

  useEffect(() => {
    eligibleRef.current = eligible;
    inputsRef.current = { target, reducedMotion };
    colorsRef.current = {
      accent: accentColor,
      warning: warningColor,
      danger: dangerColor,
      muted: mutedColor,
    };
  }, [
    accentColor,
    dangerColor,
    eligible,
    mutedColor,
    reducedMotion,
    target,
    warningColor,
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
      rendererRef.current?.resize();
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

  useEffect(() => {
    if (eligible) rendererRef.current?.redraw(colorsRef.current);
  }, [accentColor, dangerColor, eligible, mutedColor, warningColor]);

  useEffect(() => {
    rendererRef.current?.resize();
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
        zIndex: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}
