import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const evidence = fileURLToPath(new URL("./evidence/", import.meta.url));
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:1421/lab.html", { waitUntil: "commit", timeout: 60_000 });
await page.getByRole("button", { name: /紧凑|Compact/i }).waitFor();
await page.getByRole("button", { name: /紧凑|Compact/i }).click();
const compact = page.locator("[data-lab-compact-stage]");
for (const scale of [1, 2, 3]) {
  await compact.screenshot({ path: `${evidence}/kirby-cat-${scale}x.png`, scale: "css" });
}
const neutralMetrics = await page.evaluate(async ({ png }) => {
  const image = new Image();
  image.src = `data:image/png;base64,${png}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const bodyIndex = (Math.floor(image.height * 0.72) * image.width + Math.floor(image.width / 2)) * 4;
  const body = [pixels[bodyIndex], pixels[bodyIndex + 1], pixels[bodyIndex + 2]];
  const isBody = (x, y) => {
    const index = (y * image.width + x) * 4;
    return Math.hypot(pixels[index] - body[0], pixels[index + 1] - body[1], pixels[index + 2] - body[2]) < 28;
  };
  const bodyPixels = Array.from({ length: image.height }, (_, y) => Array.from({ length: image.width }, (_, x) => isBody(x, y)));
  const xs = bodyPixels.flatMap((row) => row.flatMap((value, x) => value ? [x] : []));
  const ys = bodyPixels.flatMap((row, y) => row.some(Boolean) ? [y] : []);
  const headWidth = Math.max(...xs) - Math.min(...xs) + 1;
  const foreheadTop = Math.min(...bodyPixels.flatMap((row, y) => row.slice(Math.floor(image.width * .45), Math.ceil(image.width * .55)).some(Boolean) ? [y] : []));
  const top = bodyPixels.flatMap((row, y) => y < foreheadTop ? row.flatMap((value, x) => value ? [{ x, y }] : []) : []);
  const groups = [top.filter((point) => point.x < image.width / 2), top.filter((point) => point.x >= image.width / 2)].map((points) => ({ minX: Math.min(...points.map((point) => point.x)), maxX: Math.max(...points.map((point) => point.x)), minY: Math.min(...points.map((point) => point.y)) }));
  const left = groups[0];
  const right = groups[1];
  return {
    method: "production 1x Lab screenshot mask; RGB distance < 28 from lower-head body sample",
    headWidthPx: headWidth,
    tipSpacingRatio: ((right.minX + right.maxX - left.minX - left.maxX) / 2) / headWidth,
    earWidthRatio: [(left.maxX - left.minX + 1) / headWidth, (right.maxX - right.minX + 1) / headWidth],
    notchWidthRatio: (right.minX - left.maxX - 1) / headWidth,
    notchDepthRatio: (foreheadTop - Math.min(left.minY, right.minY)) / headWidth,
    reference: { tipSpacingRatio: .675, earWidthRatio: .264, notchWidthRatio: .046, notchDepthRatio: .151 },
  };
}, { png: (await compact.screenshot({ scale: "css" })).toString("base64") });
writeFileSync(`${evidence}/neutral-ear-spacing-metrics.json`, JSON.stringify(neutralMetrics, null, 2));
await page.locator("[data-lab-compact-approach]").hover({ position: { x: 80, y: 34 } });
await compact.screenshot({ path: `${evidence}/kirby-cat-pointer.png`, scale: "css" });
const captureBackground = async (label) => {
  await page.locator("[data-lab-env-trigger]").click();
  await page.getByRole("option", { name: label }).click();
  // Re-mount the same production Compact leaf so the background crops record
  // the neutral source baseline before its ordinary idle playback advances.
  await page.getByRole("button", { name: "全屏" }).click();
  await page.getByRole("button", { name: "紧凑" }).click();
  const stage = page.locator("[data-lab-compact-stage]");
  const box = await stage.boundingBox();
  if (box === null) throw new Error("Compact stage is not visible");
  await page.screenshot({
    path: `${evidence}/kirby-cat-${label}.png`,
    clip: { x: box.x - 34, y: box.y - 34, width: box.width + 68, height: box.height + 68 },
    scale: "css",
  });
};
await captureBackground("浅色");
await captureBackground("棋盘格");
const reduce = page.getByRole("button", { name: /减少动态效果|Reduced Motion/i });
if (await reduce.count()) { await reduce.click(); await compact.screenshot({ path: `${evidence}/kirby-cat-reduced-motion.png`, scale: "css" }); }
await page.getByRole("button", { name: /全屏|Full/i }).click();
await page.getByText("热力图 · 移动场").click();
await page.waitForTimeout(800);
await page.locator("[data-lab-preview-frame]").screenshot({ path: `${evidence}/full-mr9-regression.png`, scale: "css" });
await browser.close();
