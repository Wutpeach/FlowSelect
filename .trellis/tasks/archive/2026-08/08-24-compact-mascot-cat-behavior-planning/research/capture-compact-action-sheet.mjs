import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const evidence = fileURLToPath(new URL("./evidence/", import.meta.url));
mkdirSync(evidence, { recursive: true });
const random = 0.45;
const quietDeadlineMs = 18_000 + random * 14_000;
const frames = [
  { label: "00 hold", targetAfterClickMs: 25_100, phase: "hold", expression: "expression-00", head: [7.3, 27.8, -16.1] },
  { label: "00 → 15 midpoint", targetAfterClickMs: 27_350, phase: "transition", expression: "expression-15", head: "interpolated; exact target tuple is in the direct-core source matrix" },
  { label: "15 hold", targetAfterClickMs: 28_000, phase: "hold", expression: "expression-15", head: [0.319140625, 35.307421875, -10.904296875] },
];
const pathStats = (path) => {
  const values = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  const points = Array.from({ length: Math.floor(values.length / 2) }, (_, index) => [values[index * 2], values[index * 2 + 1]]);
  return {
    hash: createHash("sha256").update(path).digest("hex").slice(0, 12),
    bounds: {
      minX: Number(Math.min(...points.map(([x]) => x)).toFixed(2)), maxX: Number(Math.max(...points.map(([x]) => x)).toFixed(2)),
      minY: Number(Math.min(...points.map(([, y]) => y)).toFixed(2)), maxY: Number(Math.max(...points.map(([, y]) => y)).toFixed(2)),
    },
    centroid: {
      x: Number((points.reduce((total, [x]) => total + x, 0) / points.length).toFixed(2)),
      y: Number((points.reduce((total, [, y]) => total + y, 0) / points.length).toFixed(2)),
    },
  };
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await page.addInitScript((value) => { Math.random = () => value; }, random);
await page.goto("http://127.0.0.1:1421/lab.html", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "紧凑" }).click();
const clickedAt = await page.evaluate(() => performance.now());
const captures = [];
for (const frame of frames) {
  const elapsed = await page.evaluate((start) => performance.now() - start, clickedAt);
  await page.waitForTimeout(Math.max(0, frame.targetAfterClickMs - elapsed));
  const [png, actualAfterClickMs, earPaths] = await Promise.all([
    page.locator("[data-lab-compact-stage]").screenshot({ scale: "css" }),
    page.evaluate((start) => performance.now() - start, clickedAt),
    page.locator("[data-compact-mascot-ear]").evaluateAll((elements) => elements.map((element) => ({ layer: element.getAttribute("data-compact-mascot-ear"), path: element.getAttribute("d") ?? "" }))),
  ]);
  captures.push({
    ...frame,
    actualAfterClickMs: Math.round(actualAfterClickMs),
    actionElapsedMs: Math.round(actualAfterClickMs - quietDeadlineMs),
    png,
    ears: {
      back: earPaths.filter(({ layer, path }) => layer?.startsWith("back") && path).map(({ path }) => pathStats(path)),
      front: earPaths.filter(({ layer, path }) => layer?.startsWith("front") && path).map(({ path }) => pathStats(path)),
    },
  });
}
const panel = (index, { label, actionElapsedMs, png }) => {
  const x = 18 + index * 172;
  return `<g transform="translate(${x} 78)"><rect width="160" height="164" rx="14" fill="#19171c"/><text x="80" y="21" fill="#f4edf4" font-family="system-ui" font-size="12" font-weight="700" text-anchor="middle">curious-short</text><text x="80" y="37" fill="#c9bcc8" font-family="system-ui" font-size="10" text-anchor="middle">${label} · action t≈${actionElapsedMs}ms</text><image x="20" y="45" width="120" height="120" href="data:image/png;base64,${png.toString("base64")}"/></g>`;
};
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="260" viewBox="0 0 540 260"><rect width="540" height="260" fill="#0e0d10"/><text x="18" y="27" fill="#fff" font-family="system-ui" font-size="17" font-weight="700">Browser Lab production Compact — curious-short timing</text><text x="18" y="47" fill="#c9bcc8" font-family="system-ui" font-size="10">Math.random = 0.45 → 24.3s quiet deadline; 1× stage crops expose the observed action timing below.</text>${captures.map((frame, index) => panel(index, frame)).join("")}</svg>`;
writeFileSync(`${evidence}/kirby-cat-production-actions.svg`, svg);
const sheet = await browser.newPage({ viewport: { width: 540, height: 260 }, deviceScaleFactor: 1 });
await sheet.setContent(svg);
await sheet.locator("svg").screenshot({ path: `${evidence}/kirby-cat-production-actions.png`, scale: "css" });
await browser.close();

const existingMatrix = JSON.parse(readFileSync(`${evidence}/curious-evidence-frame-matrix.json`, "utf8"));
writeFileSync(`${evidence}/curious-evidence-frame-matrix.json`, JSON.stringify({
  ...existingMatrix,
  production: {
    pipeline: "existing browser Lab production Compact leaf; DOM ear-path stats only",
    action: "curious-short",
    random,
    quietDeadlineMs,
    bodyNodes: existingMatrix.source.bodyNodes,
    frames: captures.map(({ png: _png, ...frame }) => frame),
  },
}, null, 2));
