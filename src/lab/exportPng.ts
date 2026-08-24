/**
 * Browser Lab — one-click 4x PNG export of the center preview.
 *
 * The exported PNG is a HIGH-RESOLUTION, TRANSPARENT raster of the SAME 200x200
 * CSS composition plus the production window's shared shadow gutter. The
 * preview frame's CSS layout is never resized during capture; resolution is
 * raised only at the raster level:
 *   - the ONE production WebGL canvas renders at 4x ABSOLUTE backing
 *     resolution via the surface's `backingScale` prop (CSS stays 200x200),
 *     and its freshly drawn buffer is read by `WebglReadback` in the same
 *     commit (before composite; the surface uses preserveDrawingBuffer:false);
 *   - the DOM overlay layer is rasterized with html2canvas at scale 4 on the
 *     unchanged 200x200 layout (the WebGL canvas is ignored);
 *   - the shadow backdrop is drawn with Canvas2D's native shadow API from the
 *     production `panelShadow` token (the shared recipe), not with html2canvas
 *     (its external box-shadow rendering is broken: shadows are painted at a
 *     10000px offset and clipped away).
 *
 * Output contract (200x200 preview, gutter 14, scale 4):
 *   - 912x912 transparent PNG: 14 CSS px of symmetric bleed per side =
 *     MAIN_WINDOW_FULL_SHADOW_GUTTER, the production main-window shadow gutter;
 *   - the 200x200 content (WebGL + DOM) sits at a 56-backing-px inset and is
 *     clipped to the preview shell's rounded corners (production silhouette);
 *   - the shared panel shadow fills the gutter with nonzero alpha and the
 *     exterior stays transparent — "content, shadow, and padding rasterized at
 *     4 backing px per CSS px".
 *
 * A missing WebGL readback, DOM rasterization, or shadow-resolution failure is
 * an EXPORT FAILURE (the function throws) — a partial layer or a wrong-size
 * PNG is never downloaded.
 *
 * The transaction is Lab-local and bounded: it temporarily raises the backing
 * scale, captures, then restores the scale in `finally`. It never mounts a
 * second renderer/canvas and never changes Lab scenario or Inspector state.
 */
import { MAIN_WINDOW_FULL_SHADOW_GUTTER } from "../constants/windowMetrics";
import type { WebglReadbackResult } from "./LabOverlayStage";

/**
 * Symmetric transparent bleed around the 200x200 content, in CSS px. Derived
 * from the production shared shadow recipe: the main window reserves exactly
 * this gutter for its panel shadow (`MAIN_WINDOW_FULL_SHADOW_GUTTER`), so the
 * export reproduces the production silhouette without clipping the shadow and
 * without inventing an arbitrary frame.
 */
export const LAB_EXPORT_PADDING_CSS = MAIN_WINDOW_FULL_SHADOW_GUTTER;

/**
 * Pure geometry of a scaled export: content (rest CSS size), symmetric padding
 * (CSS), and the deterministic backing sizes (css * scale, rounded) that are
 * independent of devicePixelRatio and of the readback.
 */
export const computeExportLayout = (
  contentCssWidth: number,
  contentCssHeight: number,
  paddingCss: number,
  scale: number,
): {
  outWidth: number;
  outHeight: number;
  contentWidth: number;
  contentHeight: number;
  paddingX: number;
  paddingY: number;
} => {
  const outCssWidth = contentCssWidth + paddingCss * 2;
  const outCssHeight = contentCssHeight + paddingCss * 2;
  return {
    outWidth: Math.round(outCssWidth * scale),
    outHeight: Math.round(outCssHeight * scale),
    contentWidth: Math.round(contentCssWidth * scale),
    contentHeight: Math.round(contentCssHeight * scale),
    paddingX: Math.round(paddingCss * scale),
    paddingY: Math.round(paddingCss * scale),
  };
};

/**
 * Thrown by `capturePreviewPng` when a required capture layer is missing or
 * the shared shadow recipe cannot be resolved, so a partial (DOM-only,
 * WebGL-only, or shadow-less) PNG is never produced or downloaded.
 */
export class ExportLayerFailure extends Error {
  constructor(readonly layer: "webgl" | "dom" | "shadow", message?: string) {
    super(message ?? `Export layer missing: ${layer}`);
    this.name = "ExportLayerFailure";
  }
}

export type CapturePngOptions = {
  /** The preview frame element (200x200 at rest; CSS is never changed here). */
  frameElement: HTMLElement;
  /** Element(s) to hide during capture (Lab chrome, e.g. the origin marker). */
  chromeElements?: HTMLElement[];
  /** Scale factor; 4 produces an exactly-912x912 PNG from a 200x200 preview. */
  scale?: number;
  /**
   * The production shared shadow recipe (ThemeColors.panelShadow). It is the
   * single source of truth for the export gutter: drawn into the transparent
   * bleed with Canvas2D's native shadow API. Required — an export without the
   * production shadow is a failure.
   */
  shadowCss: string;
  /**
   * Symmetric bleed around the 200x200 content, in CSS px. Defaults to the
   * production main-window shadow gutter (14). Content, shadow, and padding
   * are all rasterized at `scale` backing px per CSS px.
   */
  paddingCss?: number;
  /**
   * Promise resolving to the WebGL layer readback captured in the same commit
   * as the production redraw. Resolves null only when the readback is
   * unavailable or timed out — which is treated as an export failure.
   */
  webglReadback: Promise<WebglReadbackResult | null>;
};

export type CapturePngResult = {
  width: number;
  height: number;
  dataUrl: string;
};

const countNonBlankPixels = (pixels: Uint8Array): number => {
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] > 8 || pixels[i] > 8 || pixels[i + 1] > 8 || pixels[i + 2] > 8) {
      count += 1;
    }
  }
  return count;
};

const flipVertical = (
  source: Uint8Array,
  width: number,
  height: number,
): Uint8Array => {
  const flipped = new Uint8Array(source.length);
  const rowBytes = width * 4;
  for (let y = 0; y < height; y += 1) {
    const sourceRow = (height - 1 - y) * rowBytes;
    const targetRow = y * rowBytes;
    flipped.set(source.subarray(sourceRow, sourceRow + rowBytes), targetRow);
  }
  return flipped;
};

/**
 * Rasterizes the DOM overlay layer (production shared components + Lab chrome
 * hidden) at the export size with the WebGL canvas ignored. The frame element
 * keeps its 200x200 CSS layout; `scale` raises only the raster resolution.
 * Returns null on failure.
 */
const captureDomLayer = async (
  frameElement: HTMLElement,
  scale: number,
): Promise<HTMLCanvasElement | null> => {
  let html2canvas: (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
  try {
    const module = await import("html2canvas");
    html2canvas = module.default;
  } catch {
    return null;
  }
  const originalBackground = frameElement.style.background;
  try {
    // The composite owns the frame backdrop; the DOM layer must stay
    // transparent where the WebGL layer shows through.
    frameElement.style.background = "transparent";
    const domCanvas = await html2canvas(frameElement, {
      scale,
      useCORS: true,
      backgroundColor: null,
      logging: false,
      ignoreElements: (element: HTMLElement) => element.tagName === "CANVAS",
    });
    return domCanvas;
  } finally {
    frameElement.style.background = originalBackground;
  }
};

/**
 * A single resolved layer of the production shared shadow recipe, in CSS px.
 * Only the exact layer shape used by the current tokens is supported:
 * `color offsetX offsetY [blur] [spread]` (e.g. `rgba(0,0,0,0.34) 0 6px 16px -8px`).
 */
type ResolvedShadowLayer = {
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
};

/**
 * Matches one normalized shadow layer: `rgba(0, 0, 0, 0.34) 6px 16px -8px`
 * (Chrome serializes colors first and keeps `px` units).
 */
const SHADOW_LAYER_PATTERN =
  /^(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\s+(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?(?:\s+(-?\d+(?:\.\d+)?)px)?$/;

/**
 * Explicit, narrow adapter for the production shared shadow recipe. The token
 * is normalized by the browser (colors resolved, units canonicalized), then
 * split into layers on top-level commas (colors contain commas of their own)
 * and matched against the single supported layer shape. Anything else — `inset`,
 * `calc()`, `var()`, an unknown token, or no shadow at all — throws
 * `ExportLayerFailure("shadow")` instead of silently approximating.
 */
const resolveShadowLayers = (shadowCss: string): ResolvedShadowLayer[] => {
  const probe = document.createElement("div");
  probe.style.cssText = `position:fixed;left:-9999px;top:0;width:10px;height:10px;box-shadow:${shadowCss}`;
  document.body.appendChild(probe);
  let normalized: string;
  try {
    normalized = getComputedStyle(probe).boxShadow;
  } finally {
    probe.remove();
  }
  if (normalized === "" || normalized === "none") {
    throw new ExportLayerFailure("shadow", `no box-shadow resolved from "${shadowCss}"`);
  }
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
    } else if (ch === "," && depth === 0) {
      parts.push(normalized.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(normalized.slice(start));
  return parts.map((part) => {
    const trimmed = part.trim();
    if (trimmed === "") {
      throw new ExportLayerFailure("shadow", `empty shadow layer in "${normalized}"`);
    }
    if (/inset/i.test(trimmed) || /(?:calc|var|env|min|max|clamp)\(/i.test(trimmed)) {
      throw new ExportLayerFailure("shadow", `unsupported shadow layer: ${trimmed}`);
    }
    const match = SHADOW_LAYER_PATTERN.exec(trimmed);
    if (match === null) {
      throw new ExportLayerFailure("shadow", `unsupported shadow layer: ${trimmed}`);
    }
    return {
      color: match[1],
      offsetX: parseFloat(match[2]),
      offsetY: parseFloat(match[3]),
      blur: parseFloat(match[4] ?? "0"),
      spread: parseFloat(match[5] ?? "0"),
    };
  });
};

/**
 * Traces a rounded-rect path, falling back to arcTo on engines without
 * `roundRect`. Radius is clamped to the rect half-extents.
 */
const drawRoundedRectPath = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, r);
    return;
  }
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
};

/**
 * Draws the shared production shadow into the transparent gutter using
 * Canvas2D's native shadow API. For each layer, the shell is filled (casting
 * the offset/blurred shadow), then the fill itself is erased with
 * `destination-out`, leaving only the projected shadow on transparent.
 */
const drawShadowBackdrop = (
  context: CanvasRenderingContext2D,
  layers: ResolvedShadowLayer[],
  contentX: number,
  contentY: number,
  contentWidth: number,
  contentHeight: number,
  radius: number,
  scale: number,
): void => {
  for (const layer of layers) {
    // CSS box-shadow: the shadow shape is the shell expanded by `spread`.
    const shadowX = contentX - layer.spread * scale;
    const shadowY = contentY - layer.spread * scale;
    const shadowWidth = contentWidth + layer.spread * 2 * scale;
    const shadowHeight = contentHeight + layer.spread * 2 * scale;
    context.save();
    context.shadowColor = layer.color;
    context.shadowBlur = layer.blur * scale;
    context.shadowOffsetX = layer.offsetX * scale;
    context.shadowOffsetY = layer.offsetY * scale;
    context.fillStyle = "rgba(0,0,0,1)";
    drawRoundedRectPath(context, shadowX, shadowY, shadowWidth, shadowHeight, radius);
    context.fill();
    // Erase the fill, keeping only the projected shadow on transparent.
    context.globalCompositeOperation = "destination-out";
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    drawRoundedRectPath(context, shadowX, shadowY, shadowWidth, shadowHeight, radius);
    context.fill();
    context.restore();
  }
};

const createBlobFromCanvas = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolvePromise, rejectPromise) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        rejectPromise(new Error("Canvas toBlob produced no data"));
        return;
      }
      resolvePromise(blob);
    }, "image/png");
  });

/**
 * One-click 4x PNG export of the center preview. The frame's CSS layout stays
 * at its rest size (200x200); only the WebGL backing store, the DOM raster
 * resolution, and the shadow/padding raster are raised to `scale`. Returns a
 * transparent PNG data URL (912x912 for a 200x200 preview with the production
 * 14px shadow gutter at scale 4, independent of devicePixelRatio). Throws on
 * capture failure or on any unsupported shadow-layer syntax.
 */
export const capturePreviewPng = async (
  options: CapturePngOptions,
): Promise<CapturePngResult> => {
  const {
    frameElement,
    chromeElements = [],
    scale = 4,
    shadowCss,
    paddingCss = LAB_EXPORT_PADDING_CSS,
    webglReadback,
  } = options;
  const originalChromeVisibility = chromeElements.map(
    (element) => element.style.visibility,
  );
  const restWidth = frameElement.offsetWidth;
  const restHeight = frameElement.offsetHeight;
  // The panel backdrop behind the (partly transparent) WebGL layer. Read up
  // front so the DOM capture's temporary `transparent` background never leaks
  // into the export.
  const panelBackgroundCss = getComputedStyle(frameElement).backgroundColor;

  chromeElements.forEach((element) => {
    element.style.visibility = "hidden";
  });

  try {
    // The DOM layer rasterizes the UNCHANGED 200x200 layout at `scale`
    // (independent of devicePixelRatio — html2canvas multiplies only by the
    // explicit scale), producing an exactly-800x800 layer for a 200x200 frame.
    const domPromise = captureDomLayer(frameElement, scale);

    // The WebGL layer was read by WebglReadback in the same commit as the
    // production redraw at 4x backing resolution. A null readback (canvas
    // unavailable or timed out) is an export failure, never a silent DOM-only
    // download.
    const webglResult = await webglReadback;
    if (webglResult === null) {
      throw new ExportLayerFailure("webgl");
    }

    const domCanvas = await domPromise;
    if (domCanvas === null) {
      throw new ExportLayerFailure("dom");
    }

    // Deterministic output geometry: exactly cssSize * scale (912x912 for
    // 200x200 + 14px gutter at scale 4), independent of devicePixelRatio and
    // of the readback.
    const layout = computeExportLayout(restWidth, restHeight, paddingCss, scale);
    const { outWidth, outHeight, contentWidth, contentHeight, paddingX, paddingY } = layout;
    if (webglResult.width !== contentWidth || webglResult.height !== contentHeight) {
      // Defensive guard: the readback must match the requested absolute
      // backing scale (e.g. exactly 800 at DPR 1/1.25/1.5/2 with scale 4).
      throw new Error(
        `WebGL readback size ${webglResult.width}x${webglResult.height} does not match export content size ${contentWidth}x${contentHeight}`,
      );
    }

    // The production shared shadow recipe is the source of truth for the
    // gutter; unsupported syntax fails the export instead of approximating.
    const shadowLayers = resolveShadowLayers(shadowCss);

    // The content shell keeps the preview frame's actual rounded corners, so
    // the export silhouette matches the production window's.
    const radiusCss = Number.parseFloat(getComputedStyle(frameElement).borderRadius);
    const radius = Number.isFinite(radiusCss) && radiusCss > 0 ? Math.round(radiusCss * scale) : 0;

    const output = document.createElement("canvas");
    output.width = outWidth;
    output.height = outHeight;
    const context = output.getContext("2d");
    if (context === null) {
      throw new Error("Unable to allocate 2d export context");
    }

    // 1) Shared production shadow in the transparent bleed (behind content).
    drawShadowBackdrop(
      context,
      shadowLayers,
      paddingX,
      paddingY,
      contentWidth,
      contentHeight,
      radius,
      scale,
    );

    // 2) The content shell, clipped to the rounded production silhouette:
    // the panel backdrop always fills the shell (the shader is partly
    // transparent where idle, and the production panel bg shows through), then
    // the WebGL layer composites over it when it has content.
    context.save();
    drawRoundedRectPath(context, paddingX, paddingY, contentWidth, contentHeight, radius);
    context.clip();
    context.fillStyle = panelBackgroundCss;
    context.fillRect(paddingX, paddingY, contentWidth, contentHeight);
    if (countNonBlankPixels(webglResult.pixels) > 0) {
      const webglCanvas = document.createElement("canvas");
      webglCanvas.width = webglResult.width;
      webglCanvas.height = webglResult.height;
      const webglContext = webglCanvas.getContext("2d");
      if (webglContext !== null) {
        const imageData = webglContext.createImageData(
          webglResult.width,
          webglResult.height,
        );
        // readPixels is bottom-up; the shader output must be flipped.
        imageData.data.set(
          flipVertical(
            webglResult.pixels,
            webglResult.width,
            webglResult.height,
          ),
        );
        webglContext.putImageData(imageData, 0, 0);
        context.drawImage(webglCanvas, paddingX, paddingY, contentWidth, contentHeight);
      }
    }
    context.restore();

    // 3) DOM layer is guaranteed non-null here; always composited on top. Its
    // own rounded corners align with the shell clip above.
    context.drawImage(domCanvas, paddingX, paddingY, contentWidth, contentHeight);

    const blob = await createBlobFromCanvas(output);
    return {
      width: outWidth,
      height: outHeight,
      dataUrl: URL.createObjectURL(blob),
    };
  } finally {
    chromeElements.forEach((element, index) => {
      element.style.visibility = originalChromeVisibility[index];
    });
  }
};

/**
 * Downloads a captured PNG blob URL with a scenario-derived filename, then
 * revokes the URL after the browser has had a chance to start the download
 * (revoking synchronously can abort the transfer).
 */
export const downloadCapturedPng = (
  dataUrl: string,
  filename: string,
): void => {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(dataUrl), 1500);
};
