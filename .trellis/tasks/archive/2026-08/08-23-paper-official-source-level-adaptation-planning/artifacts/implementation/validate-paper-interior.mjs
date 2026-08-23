import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const worktree = "D:/Ameow/.cindy-worktrees/mr9-paper-heatmap-official-baseline";
const outputDir = resolve(
  "D:/Ameow/.trellis/tasks/08-23-paper-official-source-level-adaptation-planning/artifacts/implementation",
);
const labUrl = process.env.AMEOW_PAPER_LAB_URL ?? "http://127.0.0.1:1433/lab.html";
const require = createRequire(`${worktree}/package.json`);
const { chromium } = require("playwright");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

const results = {
  url: labUrl,
  selectorChange: "float outerBlur = 1. - mix(1., img[1], 1. - shape);",
  sampleSeconds: [0, 3, 6, 9, 12],
  settledBeforeSamplingMs: 6500,
  samples: [],
};

const canvasMetrics = async (cell) => cell.locator("canvas").evaluate((canvas) => {
  const rect = canvas.getBoundingClientRect();
  const mount = canvas.closest("[data-paper-shader]");
  return {
    cssSize: [rect.width, rect.height],
    backingSize: [canvas.width, canvas.height],
    currentFrame: mount?.paperShaderMount?.getCurrentFrame?.() ?? null,
  };
});

const screenshotMetrics = async (png) => page.evaluate(async (base64) => {
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const sample = document.createElement("canvas");
  sample.width = image.naturalWidth;
  sample.height = image.naturalHeight;
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D screenshot sampling context unavailable");
  ctx.drawImage(image, 0, 0);
  const x = Math.floor(sample.width * 0.3);
  const y = Math.floor(sample.height * 0.3);
  const width = Math.max(1, Math.floor(sample.width * 0.4));
  const height = Math.max(1, Math.floor(sample.height * 0.4));
  const pixels = ctx.getImageData(x, y, width, height).data;
  let rgbTotal = 0;
  let lumaTotal = 0;
  let hash = 2166136261;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    rgbTotal += red + green + blue;
    lumaTotal += 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    hash ^= red;
    hash = Math.imul(hash, 16777619);
    hash ^= green;
    hash = Math.imul(hash, 16777619);
    hash ^= blue;
    hash = Math.imul(hash, 16777619);
  }
  const pixelCount = width * height;
  return {
    centralRgbMean: Number((rgbTotal / (pixelCount * 3)).toFixed(2)),
    centralLumaMean: Number((lumaTotal / pixelCount).toFixed(2)),
    centralHash: (hash >>> 0).toString(16).padStart(8, "0"),
  };
}, png.toString("base64"));

const screenshotPanel200 = async (locator, path) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Panel viewport has no bounding box");
  return page.screenshot({
    path,
    clip: {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: 200,
      height: 200,
    },
  });
};

try {
  await page.goto(labUrl, { waitUntil: "networkidle" });
  await page.locator('[data-lab-category="paperInterior"]').click();
  const comparison = page.locator("[data-lab-paper-interior-comparison]");
  const official = page.locator('[data-lab-paper-interior-viewport="official"]');
  const derivative = page.locator('[data-lab-paper-interior-viewport="interior"]');
  await comparison.waitFor({ state: "visible" });
  await page.waitForFunction(() =>
    document.querySelectorAll("[data-lab-paper-interior-comparison] canvas").length === 2,
  );
  await official.locator("canvas").waitFor({ state: "visible" });
  await derivative.locator("canvas").waitFor({ state: "visible" });
  await page.waitForTimeout(results.settledBeforeSamplingMs);

  results.settled = await page.evaluate(() => {
    const comparisonRoot = document.querySelector("[data-lab-paper-interior-comparison]");
    const viewports = [...document.querySelectorAll("[data-lab-paper-interior-viewport]")];
    return {
      paperCellCount: document.querySelectorAll("[data-lab-paper-interior-cell]").length,
      paperPanelCount: document.querySelectorAll("[data-lab-paper-interior-panel]").length,
      paperMountCount: comparisonRoot?.querySelectorAll("[data-paper-shader]").length ?? 0,
      paperCanvasCount: comparisonRoot?.querySelectorAll("canvas").length ?? 0,
      productionPreviewCount: document.querySelectorAll("[data-lab-preview-frame]").length,
      visibleSourceImageCount: comparisonRoot?.querySelectorAll("img, svg").length ?? 0,
      viewportSizes: viewports.map((viewport) => {
        const rect = viewport.getBoundingClientRect();
        return [rect.width, rect.height];
      }),
      viewportStyles: viewports.map((viewport) => {
        const style = getComputedStyle(viewport);
        return {
          borderRadius: style.borderRadius,
          overflow: style.overflow,
          filter: style.filter,
          mixBlendMode: style.mixBlendMode,
          maskImage: style.maskImage,
        };
      }),
    };
  });

  const samplingStartedAt = Date.now();
  for (const second of results.sampleSeconds) {
    const remainingMs = samplingStartedAt + second * 1000 - Date.now();
    if (remainingMs > 0) await page.waitForTimeout(remainingMs);
    const stamp = `${String(second).padStart(2, "0")}s`;
    const observedMs = Date.now() - samplingStartedAt;
    const [officialRuntime, derivativeRuntime] = await Promise.all([
      canvasMetrics(official),
      canvasMetrics(derivative),
    ]);
    const officialPng = await screenshotPanel200(
      official,
      resolve(outputDir, `official-${stamp}.png`),
    );
    const derivativePng = await screenshotPanel200(
      derivative,
      resolve(outputDir, `derivative-${stamp}.png`),
    );
    const [officialPixels, derivativePixels] = await Promise.all([
      screenshotMetrics(officialPng),
      screenshotMetrics(derivativePng),
    ]);
    results.samples.push({
      second,
      observedMs,
      official: { ...officialRuntime, ...officialPixels },
      derivative: { ...derivativeRuntime, ...derivativePixels },
    });
    await comparison.screenshot({ path: resolve(outputDir, `comparison-${stamp}.png`) });
  }

  const officialCanvas = await official.locator("canvas").elementHandle();
  const derivativeCanvas = await derivative.locator("canvas").elementHandle();
  await page.locator('[data-lab-category="activation"]').click();
  await comparison.waitFor({ state: "detached" });
  results.afterSwitchAway = {
    officialCanvasConnected: await officialCanvas.evaluate((canvas) => canvas.isConnected),
    derivativeCanvasConnected: await derivativeCanvas.evaluate((canvas) => canvas.isConnected),
    paperMountCount: await page.locator("main [data-paper-shader]").count(),
    documentCanvasCount: await page.locator("canvas").count(),
    productionPreviewCount: await page.locator("[data-lab-preview-frame]").count(),
  };

  await page.locator('[data-lab-category="paperInterior"]').click();
  await page.waitForFunction(() =>
    document.querySelectorAll("[data-lab-paper-interior-comparison] canvas").length === 2,
  );
  results.afterRemount = {
    paperMountCount: await page.locator("[data-lab-paper-interior-comparison] [data-paper-shader]").count(),
    paperCanvasCount: await page.locator("[data-lab-paper-interior-comparison] canvas").count(),
    documentCanvasCount: await page.locator("canvas").count(),
    productionPreviewCount: await page.locator("[data-lab-preview-frame]").count(),
  };
} finally {
  await context.close();
  await browser.close();
}

writeFileSync(
  resolve(outputDir, "browser-validation.json"),
  `${JSON.stringify(results, null, 2)}\n`,
);
console.log(JSON.stringify(results, null, 2));
