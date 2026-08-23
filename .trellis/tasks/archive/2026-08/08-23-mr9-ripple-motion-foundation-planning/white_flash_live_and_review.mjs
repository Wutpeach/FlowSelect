import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const worktree = process.argv[2] ?? "D:/Ameow/.cindy-worktrees/mr9-ripple-source-fidelity";
const outputDir = process.argv[3] ?? "D:/Ameow/.trellis/tasks/08-23-mr9-ripple-motion-foundation-planning/white-flash-verification";
const baseUrl = process.argv[4] ?? "http://127.0.0.1:4173";
const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const mkdir = (p) => fs.mkdir(p, { recursive: true });
const writeJson = async (p, value) => fs.writeFile(p, JSON.stringify(value, null, 2), "utf8");
const writePngDataUrl = async (p, dataUrl) => {
  if (!dataUrl?.startsWith("data:image/png;base64,")) return;
  await fs.writeFile(p, Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64"));
};

const METRICS_SCRIPT = () => {
  const histogramQuantile = (hist, count, q) => {
    const target = Math.max(0, Math.min(count - 1, Math.floor(q * (count - 1))));
    let seen = 0;
    for (let i = 0; i < hist.length; i += 1) {
      seen += hist[i];
      if (seen > target) return i / 255;
    }
    return 1;
  };
  const metrics = (pixels, width, height, previous) => {
    const count = width * height;
    const hist = new Uint32Array(256);
    const luma = new Float32Array(count);
    let sum = 0;
    let max = 0;
    let bright90 = 0;
    let bright98 = 0;
    for (let i = 0; i < count; i += 1) {
      const j = i * 4;
      const y = (0.2126 * pixels[j] + 0.7152 * pixels[j + 1] + 0.0722 * pixels[j + 2]) / 255;
      luma[i] = y;
      sum += y;
      max = Math.max(max, y);
      if (y >= 0.9) bright90 += 1;
      if (y >= 0.98) bright98 += 1;
      hist[Math.max(0, Math.min(255, Math.round(y * 255)))] += 1;
    }
    let deltaMean = null;
    let deltaMaxTile = null;
    let deltaTileX = null;
    let deltaTileY = null;
    if (previous) {
      let deltaSum = 0;
      const tileSize = 40;
      for (let i = 0; i < count; i += 1) deltaSum += Math.abs(luma[i] - previous[i]);
      deltaMean = deltaSum / count;
      let best = -1;
      for (let ty = 0; ty < height; ty += tileSize) {
        for (let tx = 0; tx < width; tx += tileSize) {
          let tileSum = 0;
          let tileCount = 0;
          for (let y = ty; y < Math.min(height, ty + tileSize); y += 1) {
            for (let x = tx; x < Math.min(width, tx + tileSize); x += 1) {
              const index = y * width + x;
              tileSum += Math.abs(luma[index] - previous[index]);
              tileCount += 1;
            }
          }
          const tileMean = tileSum / Math.max(1, tileCount);
          if (tileMean > best) {
            best = tileMean;
            deltaTileX = tx;
            deltaTileY = ty;
          }
        }
      }
      deltaMaxTile = best;
    }
    return {
      meanY: sum / count,
      p50Y: histogramQuantile(hist, count, 0.5),
      p95Y: histogramQuantile(hist, count, 0.95),
      p99Y: histogramQuantile(hist, count, 0.99),
      maxY: max,
      bright90Fraction: bright90 / count,
      bright98Fraction: bright98 / count,
      deltaMean,
      deltaMaxTile,
      deltaTileX,
      deltaTileY,
    };
  };
  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const power3Out = (phase) => 1 - (1 - clamp01(phase)) ** 3;
  const pinchAt = (rawPhase, enabled) => {
    if (!enabled) return 0;
    const elapsed = clamp01(rawPhase) * 1400;
    if (elapsed <= 100) return 0.14 * power3Out(elapsed / 100);
    if (elapsed <= 500) {
      const t = (elapsed - 100) / 400;
      return 0.14 * (1 - t ** 2);
    }
    return 0;
  };
  return { metrics, clamp01, power3Out, pinchAt };
};

async function captureLive(page, lane, origin) {
  const result = await page.evaluate(async ({ lane, origin, metricsSource }) => {
    const { metrics, clamp01, power3Out, pinchAt } = (0, eval)(`(${metricsSource})`)();
    const host = document.querySelector("[data-ripple-canvas-host]");
    const canvas = host?.querySelector("canvas");
    if (!host || !canvas) throw new Error("Ripple canvas host/canvas unavailable");
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const rect = host.getBoundingClientRect();
    const gl = canvas.getContext("webgl");
    if (!gl) throw new Error("WebGL context unavailable");
    const width = canvas.width;
    const height = canvas.height;
    const pixels = new Uint8Array(width * height * 4);
    const captureStream = canvas.captureStream(60);
    const recorder = new MediaRecorder(captureStream, { mimeType: "video/webm;codecs=vp8" });
    const chunks = [];
    recorder.addEventListener("dataavailable", (event) => { if (event.data.size > 0) chunks.push(event.data); });
    const recorderStopped = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
    recorder.start();
    const frames = [];
    const captureImages = [];
    let previous = null;
    let triggeredAt = null;
    let frameIndex = 0;
    const started = performance.now();
    const triggerAfter = 250;
    const stopAfter = 2400;
    let resolveCapture;
    const done = new Promise((resolve) => { resolveCapture = resolve; });
    const step = (now) => {
      const elapsed = now - started;
      if (triggeredAt === null && elapsed >= triggerAfter) {
        const event = new MouseEvent("click", {
          bubbles: true,
          clientX: rect.left + origin.x * rect.width,
          clientY: rect.top + origin.y * rect.height,
        });
        host.dispatchEvent(event);
        triggeredAt = performance.now();
      }
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const item = metrics(pixels, width, height, previous);
      const phaseElapsed = triggeredAt === null ? null : Math.max(0, now - triggeredAt);
      const rawPhase = phaseElapsed === null ? null : clamp01(phaseElapsed / 1400);
      frames.push({
        index: frameIndex,
        tMs: elapsed,
        phaseElapsedMs: phaseElapsed,
        rawPhase,
        easedProgress: rawPhase === null ? null : power3Out(rawPhase),
        pinch: rawPhase === null ? 0 : pinchAt(rawPhase, true),
        ...item,
      });
      if (frameIndex < 20 || frameIndex % 5 === 0) {
        captureImages.push({ index: frameIndex, tMs: elapsed, dataUrl: canvas.toDataURL("image/png") });
      }
      previous = new Float32Array(width * height);
      for (let i = 0; i < width * height; i += 1) {
        const j = i * 4;
        previous[i] = (0.2126 * pixels[j] + 0.7152 * pixels[j + 1] + 0.0722 * pixels[j + 2]) / 255;
      }
      frameIndex += 1;
      if (elapsed >= stopAfter) {
        recorder.stop();
        resolveCapture();
      }
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    await done;
    await recorderStopped;
    const recording = new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer());
    return {
      lane,
      origin,
      canvas: { cssWidth: rect.width, cssHeight: rect.height, backingWidth: width, backingHeight: height },
      frames,
      images: captureImages,
      recording: Array.from(recording),
      userAgent: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio,
    };
  }, { lane, origin, metricsSource: `(${METRICS_SCRIPT.toString()})` });
  return result;
}

async function captureReviewVideo(page, videoIndex, mode) {
  return page.evaluate(async ({ videoIndex, mode, metricsSource }) => {
    const { metrics } = (0, eval)(`(${metricsSource})`)();
    const videos = [...document.querySelectorAll("video")];
    const video = videos[videoIndex];
    if (!video) throw new Error(`video ${videoIndex} missing`);
    video.muted = true;
    video.playsInline = true;
    await new Promise((resolve) => {
      if (video.readyState >= 1) resolve();
      else video.addEventListener("loadedmetadata", resolve, { once: true });
    });
    video.pause();
    video.currentTime = 0;
    await new Promise((resolve) => {
      if (video.currentTime === 0) resolve();
      else video.addEventListener("seeked", resolve, { once: true });
    });
    const width = video.videoWidth || 200;
    const height = video.videoHeight || 200;
    const scratch = document.createElement("canvas");
    scratch.width = width;
    scratch.height = height;
    const context = scratch.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("video scratch context unavailable");
    const frames = [];
    const images = [];
    let previous = null;
    let index = 0;
    let start = null;
    const playbackDurationMs = Math.max(1000, (Number.isFinite(video.duration) ? video.duration : 3.5) * 1000 + 450);
    let resolveCapture;
    const done = new Promise((resolve) => { resolveCapture = resolve; });
    const step = (now) => {
      if (start === null) start = now;
      context.drawImage(video, 0, 0, width, height);
      const image = context.getImageData(0, 0, width, height);
      const item = metrics(image.data, width, height, previous);
      frames.push({ index, tMs: now - start, currentTime: video.currentTime, ...item });
      if (index < 20 || index % 5 === 0) images.push({ index, tMs: now - start, currentTime: video.currentTime, dataUrl: scratch.toDataURL("image/png") });
      previous = new Float32Array(width * height);
      for (let i = 0; i < width * height; i += 1) {
        const j = i * 4;
        previous[i] = (0.2126 * image.data[j] + 0.7152 * image.data[j + 1] + 0.0722 * image.data[j + 2]) / 255;
      }
      index += 1;
      if ((now - start) >= playbackDurationMs || video.ended) resolveCapture();
      else requestAnimationFrame(step);
    };
    if (mode === "loop") video.loop = true;
    await video.play();
    requestAnimationFrame(step);
    await done;
    return {
      videoIndex,
      mode,
      attributes: {
        autoplay: video.autoplay,
        controls: video.controls,
        loop: video.loop,
        muted: video.muted,
        poster: video.poster,
        preload: video.preload,
        playsInline: video.playsInline,
      },
      video: {
        duration: video.duration,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState,
        networkState: video.networkState,
        ended: video.ended,
      },
      css: (() => { const r = video.getBoundingClientRect(); const s = getComputedStyle(video); return { width: r.width, height: r.height, backgroundColor: s.backgroundColor, opacity: s.opacity, visibility: s.visibility }; })(),
      frames,
      images,
    };
  }, { videoIndex, mode, metricsSource: `(${METRICS_SCRIPT.toString()})` });
}

async function captureCompositorPath(page, lane, origin) {
  await page.goto(`${baseUrl}/lab.html?ripple=scene`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-ripple-canvas-host] canvas");
  await page.waitForFunction(() => {
    const c = document.querySelector("[data-ripple-canvas-host] canvas");
    return c && c.width > 0 && c.height > 0;
  });
  const host = page.locator("[data-ripple-canvas-host]");
  const rect = await host.boundingBox();
  if (!rect) throw new Error("Ripple host bounding box unavailable");
  const laneDir = path.join(outputDir, "live-compositor");
  await mkdir(laneDir);
  const captures = [];
  const save = async (label, phaseMs) => {
    const filename = `${lane}-${label}.png`;
    await page.screenshot({ path: path.join(laneDir, filename), clip: rect });
    captures.push({ lane, label, phaseMs, path: path.join(laneDir, filename) });
  };
  await page.waitForTimeout(100);
  await save("pre-start", null);
  await page.mouse.click(rect.x + origin.x * rect.width, rect.y + origin.y * rect.height);
  const phases = [0, 30, 120, 300, 600, 1000, 1300, 1450, 1700];
  let elapsed = 0;
  for (const phaseMs of phases) {
    await page.waitForTimeout(Math.max(0, phaseMs - elapsed));
    await save(`phase-${String(phaseMs).padStart(4, "0")}ms`, phaseMs);
    elapsed = phaseMs;
  }
  return captures;
}

const browser = await chromium.launch({ headless: true, executablePath: edgePath, args: ["--disable-gpu-sandbox"] });
const context = await browser.newContext({ viewport: { width: 960, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
await mkdir(outputDir);
await mkdir(path.join(outputDir, "live"));
await mkdir(path.join(outputDir, "review"));
const environment = {
  node: process.version,
  playwright: process.env.npm_package_devDependencies_playwright ?? "package-local",
  browser: await browser.version(),
  executablePath: edgePath,
  baseUrl,
  userAgent: await page.evaluate(() => navigator.userAgent).catch(() => null),
  viewport: { width: 960, height: 900, deviceScaleFactor: 1 },
};

const live = {};
const compositor = {};
await page.goto(`${baseUrl}/lab.html?ripple=scene`, { waitUntil: "networkidle" });
await page.waitForSelector("[data-ripple-canvas-host] canvas");
await page.waitForFunction(() => {
  const c = document.querySelector("[data-ripple-canvas-host] canvas");
  return c && c.width > 0 && c.height > 0;
});
for (const [lane, origin] of [["center", { x: 0.5, y: 0.5 }], ["off-center", { x: 0.31, y: 0.63 }]]) {
  if (lane !== "center") {
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("[data-ripple-canvas-host] canvas");
    await page.waitForFunction(() => {
      const c = document.querySelector("[data-ripple-canvas-host] canvas");
      return c && c.width > 0 && c.height > 0;
    });
  }
  const result = await captureLive(page, lane, origin);
  live[lane] = { ...result, images: undefined };
  await fs.writeFile(path.join(outputDir, "live", `${lane.replace(/[^a-z0-9]+/gi, "-")}-canvas-capture.webm`), Buffer.from(result.recording));
  live[lane].recording = undefined;
  for (const image of result.images) await writePngDataUrl(path.join(outputDir, "live", `${lane.replace(/[^a-z0-9]+/gi, "-")}-${String(image.index).padStart(3, "0")}.png`), image.dataUrl);
  compositor[lane] = await captureCompositorPath(page, lane, origin);
}

const review = {};
await page.goto(`${baseUrl}/evidence/mr9-ripple/single-scene-review.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.querySelectorAll("video").length > 0);
const videoCount = await page.locator("video").count();
for (let i = 0; i < videoCount; i += 1) {
  const result = await captureReviewVideo(page, i, "normal");
  review[`video-${i}`] = { ...result, images: undefined };
  for (const image of result.images) await writePngDataUrl(path.join(outputDir, "review", `video-${i}-${String(image.index).padStart(3, "0")}.png`), image.dataUrl);
  const loopResult = await captureReviewVideo(page, i, "loop");
  review[`video-${i}-loop`] = { ...loopResult, images: undefined };
  for (const image of loopResult.images) await writePngDataUrl(path.join(outputDir, "review", `video-${i}-loop-${String(image.index).padStart(3, "0")}.png`), image.dataUrl);
}

await writeJson(path.join(outputDir, "live-metrics.json"), { environment, lanes: live });
await writeJson(path.join(outputDir, "live-compositor-captures.json"), { environment, captures: compositor });
await writeJson(path.join(outputDir, "review-playback-metrics.json"), { environment, videos: review });
await browser.close();
console.log(JSON.stringify({ environment, liveLanes: Object.keys(live), reviewVideos: Object.keys(review), outputDir }, null, 2));
