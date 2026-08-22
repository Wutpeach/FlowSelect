import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright";

const outputDir = resolve(import.meta.dirname);
const url = "http://127.0.0.1:1422/lab.html";

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const crc32 = (buffer) => {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
};

const writeRgbaPng = (filename, width, height, bottomUpPixels) => {
  const stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    scanlines[row] = 0;
    const source = (height - 1 - y) * stride;
    bottomUpPixels.copy(scanlines, row + 1, source, source + stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(resolve(outputDir, filename), png);
};

const fract = (value) => value - Math.floor(value);
const mix = (left, right, amount) => left + (right - left) * amount;
const smoothstep = (left, right, value) => {
  const unit = Math.min(Math.max((value - left) / (right - left), 0), 1);
  return unit * unit * (3 - 2 * unit);
};
const dot = (left, right) => left[0] * right[0] + left[1] * right[1];
const noise = (point) => {
  const i = [Math.floor(point[0]), Math.floor(point[1])];
  const f = [point[0] - i[0], point[1] - i[1]];
  const u = f.map((value) => value * value * (3 - 2 * value));
  const sample = (x, y) => Math.abs(fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123));
  const a = sample(i[0], i[1]);
  const b = sample(i[0] + 1, i[1]);
  const c = sample(i[0], i[1] + 1);
  const d = sample(i[0] + 1, i[1] + 1);
  return mix(mix(a, b, u[0]), mix(c, d, u[0]), u[1]);
};
const bend = (point, time) => {
  const swell = noise([point[0] * 0.8 + time * 0.09, point[1] * 0.8 - time * 0.05]) - 0.5;
  const curl = noise([point[0] * 1.6 - time * 0.04, point[1] * 1.6 + time * 0.07]) - 0.5;
  return swell * 0.13 + curl * 0.05;
};

const boundaryPoint = (side, unit) => {
  const radius = 0.08;
  const half = 0.5 - radius;
  const cross = unit - 0.5;
  const corner = Math.max(Math.abs(cross) - half, 0);
  const extent = half + Math.sqrt(Math.max(radius * radius - corner * corner, 0));
  if (side === "top") return [unit, 0.5 + extent];
  if (side === "right") return [0.5 + extent, unit];
  if (side === "bottom") return [unit, 0.5 - extent];
  return [0.5 - extent, unit];
};

const measureContact = (time, reducedMotion) => {
  const direction = [0.8235, 0.5674];
  const k = reducedMotion ? 0.42 : fract(time * 0.13);
  const front = mix(-0.58, 1.6, k);
  const bendTime = reducedMotion ? 0 : time;
  const energy = smoothstep(0, 0.12, k) * (1 - smoothstep(0.66, 0.99, k));
  const sides = {};
  const all = [];
  for (const side of ["top", "right", "bottom", "left"]) {
    const values = [];
    for (let index = 0; index < 240; index += 1) {
      const uv = boundaryPoint(side, (index + 0.5) / 240);
      const q = [uv[0] - 0.5, uv[1] - 0.5];
      const distance = dot(q, direction) - front + bend(q, bendTime);
      values.push(Math.exp(-Math.abs(distance + 0.018) * 30) * energy);
    }
    sides[side] = values.filter((value) => value > 0.08).length / values.length;
    all.push(...values);
  }
  return {
    k,
    energy,
    litThreshold: 0.08,
    sideFractions: sides,
    perimeterFraction: all.filter((value) => value > 0.08).length / all.length,
    peakContact: Math.max(...all),
  };
};

const alphaMetrics = (width, height, pixels) => {
  const alpha = (x, y) => pixels[(y * width + x) * 4 + 3];
  const outer = [];
  for (let offset = 0; offset < 2; offset += 1) {
    for (let x = 0; x < width; x += 1) {
      outer.push(alpha(x, offset), alpha(x, height - 1 - offset));
    }
    for (let y = 0; y < height; y += 1) {
      outer.push(alpha(offset, y), alpha(width - 1 - offset, y));
    }
  }
  const gutter = [];
  const interior = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = alpha(x, y);
      if (x < 14 || x >= 214 || y < 14 || y >= 214) gutter.push(value);
      else interior.push(value);
    }
  }
  return {
    outer2pxMaxAlpha: Math.max(...outer),
    gutterMaxAlpha: Math.max(...gutter),
    interiorMaxAlpha: Math.max(...interior),
    corners: [alpha(0, 0), alpha(width - 1, 0), alpha(0, height - 1), alpha(width - 1, height - 1)],
  };
};

const readCanvas = async (page) => page.evaluate(() => {
  const canvas = document.querySelector("[data-lab-preview-frame] canvas");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("real surface canvas missing");
  const gl = canvas.getContext("webgl2");
  if (gl === null) throw new Error("real surface WebGL2 context missing");
  const program = gl.getParameter(gl.CURRENT_PROGRAM);
  if (program === null) throw new Error("real surface linked program missing");
  const captured = window.__mr9GlMetrics.latestFrame;
  if (!captured || captured.width !== canvas.width || captured.height !== canvas.height) {
    throw new Error("same-draw WebGL readback unavailable");
  }
  const scalar = (name) => {
    const location = gl.getUniformLocation(program, name);
    return location === null ? null : gl.getUniform(program, location);
  };
  return {
    width: canvas.width,
    height: canvas.height,
    pixels: captured.pixels,
    time: scalar("uTime"),
    reducedMotion: scalar("uReducedMotion"),
    boundaryHaloMode: scalar("uBoundaryHaloMode"),
    heatmapMode: scalar("uHeatmapMode"),
    refractionMode: scalar("uRefractionMode"),
    linked: gl.getProgramParameter(program, gl.LINK_STATUS) === true,
    programLog: gl.getProgramInfoLog(program) ?? "",
  };
});

const hashPixels = async (pixels) => {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(pixels).digest("hex");
};

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  const metrics = {
    createProgram: 0,
    deleteProgram: 0,
    livePrograms: 0,
    compileShader: 0,
    linkProgram: 0,
    drawArrays: 0,
    createTexture: 0,
    createFramebuffer: 0,
    shaders: [],
    links: [],
    latestFrame: null,
  };
  Object.defineProperty(window, "__mr9GlMetrics", { value: metrics });
  const proto = WebGL2RenderingContext.prototype;
  const wrap = (name, record) => {
    const original = proto[name];
    proto[name] = function (...args) {
      const result = original.apply(this, args);
      record.call(this, args, result, metrics);
      return result;
    };
  };
  wrap("createProgram", (_args, result, state) => {
    state.createProgram += 1;
    if (result !== null) state.livePrograms += 1;
  });
  wrap("deleteProgram", ([program], _result, state) => {
    state.deleteProgram += 1;
    if (program !== null) state.livePrograms = Math.max(state.livePrograms - 1, 0);
  });
  wrap("compileShader", function ([shader], _result, state) {
    state.compileShader += 1;
    state.shaders.push({
      type: this.getShaderParameter(shader, this.SHADER_TYPE),
      ok: this.getShaderParameter(shader, this.COMPILE_STATUS) === true,
      log: this.getShaderInfoLog(shader) ?? "",
    });
  });
  wrap("linkProgram", function ([program], _result, state) {
    state.linkProgram += 1;
    state.links.push({
      ok: this.getProgramParameter(program, this.LINK_STATUS) === true,
      log: this.getProgramInfoLog(program) ?? "",
    });
  });
  wrap("drawArrays", function (_args, _result, state) {
    state.drawArrays += 1;
    const canvas = this.canvas;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    this.readPixels(0, 0, canvas.width, canvas.height, this.RGBA, this.UNSIGNED_BYTE, pixels);
    state.latestFrame = {
      width: canvas.width,
      height: canvas.height,
      pixels: Array.from(pixels),
    };
  });
  wrap("createTexture", (_args, _result, state) => { state.createTexture += 1; });
  wrap("createFramebuffer", (_args, _result, state) => { state.createFramebuffer += 1; });
});

const page = await context.newPage();
const pageErrors = [];
const consoleWarnings = [];
const networkErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") consoleWarnings.push(message.text());
});
page.on("response", (response) => {
  if (response.status() >= 400) networkErrors.push(`HTTP ${response.status()} ${response.url()}`);
});
await page.goto(url, { waitUntil: "networkidle" });
try {
  await page.getByRole("button", { name: "热力图实验", exact: true }).click();
  await page.waitForSelector('[data-lab-preset="heatmap-contact-halo-moving"]', { timeout: 5000 });
} catch (error) {
  writeFileSync(resolve(outputDir, "load-debug.html"), await page.content());
  throw new Error(`Lab failed to mount: ${[...pageErrors, ...consoleWarnings, ...networkErrors].join(" | ") || error.message}`);
}

const captureFrame = async (label, includeComposite = true) => {
  const raw = await readCanvas(page);
  const pixels = Buffer.from(raw.pixels);
  const rawName = `${label}-canvas.png`;
  writeRgbaPng(rawName, raw.width, raw.height, pixels);
  if (includeComposite) {
    await page.locator("[data-lab-preview-frame]").screenshot({
      path: resolve(outputDir, `${label}-composite.png`),
      omitBackground: true,
    });
  }
  return {
    label,
    width: raw.width,
    height: raw.height,
    time: raw.time,
    reducedMotion: raw.reducedMotion,
    linked: raw.linked,
    programLog: raw.programLog,
    hash: await hashPixels(pixels),
    alpha: alphaMetrics(raw.width, raw.height, pixels),
    contact: measureContact(raw.time, raw.reducedMotion),
  };
};

await page.locator('[data-lab-preset="heatmap-refraction-reduced"]').click();
await page.waitForTimeout(150);
const accepted = await readCanvas(page);
const acceptedPixels = Buffer.from(accepted.pixels);
writeRgbaPng("accepted-reduced-200.png", accepted.width, accepted.height, acceptedPixels);

await page.locator('[data-lab-preset="heatmap-contact-halo-reduced"]').click();
await page.waitForTimeout(150);
const reduced = await captureFrame("reduced-contact");
const reducedRaw = await readCanvas(page);
const reducedPixels = Buffer.from(reducedRaw.pixels);

// Auxiliary scalar views use the exact accepted analytic equations at the
// actual Reduced Motion phase. They do not compile a copied shader or create a
// renderer; the real-component compile/link/readback above remains primary.
const debugChannels = {
  warm: Buffer.alloc(228 * 228 * 4),
  boundaryBand: Buffer.alloc(228 * 228 * 4),
  contact: Buffer.alloc(228 * 228 * 4),
  halo: Buffer.alloc(228 * 228 * 4),
};
for (let y = 0; y < 228; y += 1) {
  for (let x = 0; x < 228; x += 1) {
    const uv = [(x + 0.5) / 228, (y + 0.5) / 228];
    const panelUv = [(uv[0] - 14 / 228) / (200 / 228), (uv[1] - 14 / 228) / (200 / 228)];
    const centered = [panelUv[0] - 0.5, panelUv[1] - 0.5];
    const qb = [Math.abs(centered[0]) - 0.42, Math.abs(centered[1]) - 0.42];
    const outside = [Math.max(qb[0], 0), Math.max(qb[1], 0)];
    const outsideLength = Math.hypot(...outside);
    const bd = outsideLength + Math.min(Math.max(qb[0], qb[1]), 0) - 0.08;
    const front = mix(-0.58, 1.6, 0.42);
    const distance = dot(centered, [0.8235, 0.5674]) - front + bend(centered, 0);
    const warm = Math.exp(-Math.abs(distance + 0.018) * 30);
    const band = smoothstep(-0.05, 0, bd) * (bd <= 0 ? 1 : 0);
    const contact = band * warm;
    let halo = 0;
    if (bd > 0 && outsideLength > 0) {
      const normal = [
        Math.sign(centered[0]) * outside[0] / outsideLength,
        Math.sign(centered[1]) * outside[1] / outsideLength,
      ];
      const foot = [panelUv[0] - normal[0] * bd, panelUv[1] - normal[1] * bd];
      const footQ = [foot[0] - 0.5, foot[1] - 0.5];
      const footDistance = dot(footQ, [0.8235, 0.5674]) - front + bend(footQ, 0);
      const footWarm = Math.exp(-Math.abs(footDistance + 0.018) * 30);
      halo = footWarm * (1 - smoothstep(0, 0.06, bd));
    }
    const values = { warm: bd <= 0 ? warm : 0, boundaryBand: band, contact, halo };
    for (const [name, value] of Object.entries(values)) {
      const offset = (y * 228 + x) * 4;
      const byte = Math.round(Math.min(Math.max(value, 0), 1) * 255);
      debugChannels[name][offset] = byte;
      debugChannels[name][offset + 1] = byte;
      debugChannels[name][offset + 2] = byte;
      debugChannels[name][offset + 3] = 255;
    }
  }
}
for (const [name, pixels] of Object.entries(debugChannels)) {
  writeRgbaPng(`debug-${name}.png`, 228, 228, pixels);
}
let interiorDifferentBytes = 0;
let interiorMaxDelta = 0;
let visibleInteriorDifferentBytes = 0;
let visibleInteriorMaxDelta = 0;
const visibleInteriorMaxDeltaByChannel = [0, 0, 0, 0];
for (let y = 0; y < 200; y += 1) {
  for (let x = 0; x < 200; x += 1) {
    const uv = [(x + 0.5) / 200, (y + 0.5) / 200];
    const qb = [Math.abs(uv[0] - 0.5) - 0.42, Math.abs(uv[1] - 0.5) - 0.42];
    const outsideLength = Math.hypot(Math.max(qb[0], 0), Math.max(qb[1], 0));
    const boundaryDistance = outsideLength + Math.min(Math.max(qb[0], qb[1]), 0) - 0.08;
    for (let channel = 0; channel < 4; channel += 1) {
      const baseline = acceptedPixels[(y * 200 + x) * 4 + channel];
      const outer = reducedPixels[((y + 14) * 228 + x + 14) * 4 + channel];
      const delta = Math.abs(baseline - outer);
      if (delta !== 0) interiorDifferentBytes += 1;
      interiorMaxDelta = Math.max(interiorMaxDelta, delta);
      if (boundaryDistance <= 0) {
        if (delta !== 0) visibleInteriorDifferentBytes += 1;
        visibleInteriorMaxDelta = Math.max(visibleInteriorMaxDelta, delta);
        visibleInteriorMaxDeltaByChannel[channel] = Math.max(
          visibleInteriorMaxDeltaByChannel[channel],
          delta,
        );
      }
    }
  }
}

const drawsBeforeStaticWait = await page.evaluate(() => window.__mr9GlMetrics.drawArrays);
await page.waitForTimeout(500);
const drawsAfterStaticWait = await page.evaluate(() => window.__mr9GlMetrics.drawArrays);

const frame = page.locator("[data-lab-preview-frame]");
await frame.screenshot({ path: resolve(outputDir, "fx-on-shadow.png"), omitBackground: true });
await page.locator("[data-lab-preview-frame] canvas").evaluate((canvas) => { canvas.style.visibility = "hidden"; });
await frame.screenshot({ path: resolve(outputDir, "fx-off-shadow.png"), omitBackground: true });
await page.locator("[data-lab-preview-frame] canvas").evaluate((canvas) => { canvas.style.visibility = "visible"; });

const interaction = await page.evaluate(() => {
  const frameElement = document.querySelector("[data-lab-preview-frame]");
  const shell = document.querySelector("[data-lab-panel-shell]");
  const clip = document.querySelector("[data-lab-panel-clip]");
  const canvas = frameElement?.querySelector("canvas");
  if (!(frameElement instanceof HTMLElement) || !(shell instanceof HTMLElement)
    || !(clip instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error("outer-domain layer split missing");
  }
  const frameRect = frameElement.getBoundingClientRect();
  const clipRect = clip.getBoundingClientRect();
  const identity = (element) => {
    if (!(element instanceof HTMLElement)) return element?.tagName ?? null;
    if (element.dataset.labPanelClip !== undefined) return "panel-clip";
    if (element.dataset.labPanelShell !== undefined) return "panel-shell";
    if (element.dataset.labPreviewFrame !== undefined) return "frame";
    return element.tagName.toLowerCase();
  };
  const styles = [frameElement, shell, clip, canvas].map((element) => getComputedStyle(element));
  return {
    frame: { width: frameRect.width, height: frameRect.height },
    panel: { x: clipRect.left - frameRect.left, y: clipRect.top - frameRect.top, width: clipRect.width, height: clipRect.height },
    centerHit: identity(document.elementFromPoint(clipRect.left + 100, clipRect.top + 100)),
    gutterHit: identity(document.elementFromPoint(frameRect.left + 5, frameRect.top + 114)),
    clipPointerEvents: styles[2].pointerEvents,
    canvasPointerEvents: styles[3].pointerEvents,
    clipOverflow: styles[2].overflow,
    clipRadius: styles[2].borderRadius,
    clipBackground: styles[2].backgroundImage,
    clipShadow: styles[2].boxShadow,
    shellShadow: styles[1].boxShadow,
    shadowOwnerCount: styles.filter((style) => style.boxShadow !== "none").length,
    canvasCount: document.querySelectorAll("canvas").length,
  };
});

await page.locator("[data-lab-panel-clip]").click({ position: { x: 40, y: 70 } });
const clickMapping = await page.locator("[data-lab-chrome]").evaluate((marker) => ({
  left: getComputedStyle(marker).left,
  top: getComputedStyle(marker).top,
}));

await page.locator('[data-lab-preset="heatmap-contact-halo-moving"]').click();
const targets = [0.02, 0.12, 0.25, 0.42, 0.60, 0.78, 0.98];
const moving = [];
let targetIndex = 0;
const resetStarted = Date.now();
while (Date.now() - resetStarted < 9000) {
  const time = await page.evaluate(() => {
    const canvas = document.querySelector("[data-lab-preview-frame] canvas");
    const gl = canvas?.getContext("webgl2");
    const program = gl?.getParameter(gl.CURRENT_PROGRAM);
    if (!gl || !program) return null;
    const location = gl.getUniformLocation(program, "uTime");
    return location === null ? null : gl.getUniform(program, location);
  });
  if (typeof time === "number" && fract(time * 0.13) < 0.035) break;
  await page.waitForTimeout(25);
}
const started = Date.now();
while (targetIndex < targets.length && Date.now() - started < 11000) {
  const time = await page.evaluate(() => {
    const canvas = document.querySelector("[data-lab-preview-frame] canvas");
    const gl = canvas?.getContext("webgl2");
    const program = gl?.getParameter(gl.CURRENT_PROGRAM);
    if (!gl || !program) return null;
    const location = gl.getUniformLocation(program, "uTime");
    return location === null ? null : gl.getUniform(program, location);
  });
  if (typeof time === "number") {
    const k = fract(time * 0.13);
    if (k >= targets[targetIndex]) {
      const label = `phase-${String(targetIndex + 1).padStart(2, "0")}-k${targets[targetIndex].toFixed(2).replace(".", "-")}`;
      moving.push(await captureFrame(label));
      targetIndex += 1;
    }
  }
  await page.waitForTimeout(25);
}

const resources = await page.evaluate(() => {
  const { latestFrame: _latestFrame, ...metrics } = window.__mr9GlMetrics;
  return metrics;
});
const layerCanvasCount = await page.locator("canvas").count();
const finalFrame = await readCanvas(page);

const cards = [
  ["Accepted 200 RM", "accepted-reduced-200.png"],
  ["Localized RM / 228", "reduced-contact-composite.png"],
  ["FX on + CSS shadow", "fx-on-shadow.png"],
  ["FX off + CSS shadow", "fx-off-shadow.png"],
  ...moving.map((item) => [item.label, `${item.label}-composite.png`]),
];
const images = cards.map(([label, filename]) => {
  const data = readFileSync(resolve(outputDir, filename)).toString("base64");
  return `<figure><img src="data:image/png;base64,${data}"><figcaption>${label}</figcaption></figure>`;
}).join("");
const reviewHtml = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;background:#0d0c12;color:#eee;font:12px system-ui}
#sheet{width:1040px;padding:16px;display:grid;grid-template-columns:repeat(4,228px);gap:20px 24px;background:#0d0c12}
figure{margin:0;width:228px}img{display:block;width:228px;height:228px;object-fit:contain;background:repeating-conic-gradient(#17141d 0 25%,#211d29 0 50%) 0/16px 16px;border:1px solid #393341}figcaption{padding-top:6px;color:#d9d2e2}
</style><div id="sheet">${images}</div>`;
writeFileSync(resolve(outputDir, "review-sheet.html"), reviewHtml);
const reviewPage = await context.newPage();
await reviewPage.setContent(reviewHtml, { waitUntil: "load" });
await reviewPage.locator("#sheet").screenshot({ path: resolve(outputDir, "review-sheet.png") });

const channelCards = ["warm", "boundaryBand", "contact", "halo"].map((name) => {
  const data = readFileSync(resolve(outputDir, `debug-${name}.png`)).toString("base64");
  return `<figure><img src="data:image/png;base64,${data}"><figcaption>${name}</figcaption></figure>`;
}).join("");
const channelHtml = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;background:#0d0c12;color:#eee;font:12px system-ui}
#sheet{width:1040px;padding:16px;display:grid;grid-template-columns:repeat(4,228px);gap:24px;background:#0d0c12}
figure{margin:0;width:228px}img{display:block;width:228px;height:228px;border:1px solid #393341}figcaption{padding-top:6px;color:#d9d2e2}
</style><div id="sheet">${channelCards}</div>`;
writeFileSync(resolve(outputDir, "channel-sheet.html"), channelHtml);
await reviewPage.setContent(channelHtml, { waitUntil: "load" });
await reviewPage.locator("#sheet").screenshot({ path: resolve(outputDir, "channel-sheet.png") });

const report = {
  url,
  platform: "Windows / Microsoft Edge / WebGL2",
  macOS: "NOT VERIFIED — no macOS runtime host",
  actualComponent: {
    linked: finalFrame.linked,
    programLog: finalFrame.programLog,
    pageErrors,
    consoleWarnings,
    networkErrors,
    instrumentation: resources,
    canvasCount: layerCanvasCount,
  },
  baselineEquivalence: {
    acceptedSize: [accepted.width, accepted.height],
    outerSize: [reducedRaw.width, reducedRaw.height],
    interiorDifferentBytes,
    interiorMaxDelta,
    visibleInteriorDifferentBytes,
    visibleInteriorMaxDelta,
    visibleInteriorMaxDeltaByChannel,
    acceptedHash: await hashPixels(acceptedPixels),
  },
  reducedMotion: {
    drawCountBefore500ms: drawsBeforeStaticWait,
    drawCountAfter500ms: drawsAfterStaticWait,
    continuingDraws: drawsAfterStaticWait - drawsBeforeStaticWait,
  },
  interaction: { ...interaction, clickMapping },
  reduced,
  moving,
  finalUniforms: {
    time: finalFrame.time,
    reducedMotion: finalFrame.reducedMotion,
    boundaryHaloMode: finalFrame.boundaryHaloMode,
    heatmapMode: finalFrame.heatmapMode,
    refractionMode: finalFrame.refractionMode,
  },
};
writeFileSync(resolve(outputDir, "measurements.json"), `${JSON.stringify(report, null, 2)}\n`);

await browser.close();

const failures = [];
if (!report.actualComponent.linked || resources.shaders.some((shader) => !shader.ok) || resources.links.some((link) => !link.ok)) failures.push("actual shader compile/link");
if (resources.livePrograms !== 1 || resources.createTexture !== 0 || resources.createFramebuffer !== 0 || layerCanvasCount !== 1) failures.push("renderer resource authority");
if (visibleInteriorMaxDeltaByChannel[3] !== 0
  || Math.max(...visibleInteriorMaxDeltaByChannel.slice(0, 3)) > 6) {
  failures.push("accepted interior/refraction equivalence");
}
if (reduced.alpha.outer2pxMaxAlpha !== 0 || moving.some((item) => item.alpha.outer2pxMaxAlpha !== 0)) failures.push("outer 2px alpha");
if (moving.some((item) => item.contact.perimeterFraction >= 0.35)) failures.push("near-complete perimeter");
if (drawsAfterStaticWait !== drawsBeforeStaticWait) failures.push("Reduced Motion continuing frames");
if (interaction.canvasCount !== 1 || interaction.canvasPointerEvents !== "none" || interaction.clipPointerEvents !== "auto" || interaction.shadowOwnerCount !== 1) failures.push("layer/interaction/shadow");
if (pageErrors.length > 0) failures.push("page error");

console.log(JSON.stringify({ ok: failures.length === 0, failures, report: resolve(outputDir, "measurements.json") }, null, 2));
if (failures.length > 0) process.exitCode = 1;
