import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// MR9 Paper Heatmap Panel Mapping Comparison — real-browser A/B validation.
//
// Run from the accepted baseline worktree after starting its dev Lab, e.g.:
//   node .trellis/tasks/08-23-mr9-paper-heatmap-panel-mapping-comparison/artifacts/implementation/validate-browser-ab.mjs
// The Lab port can be overridden with LAB_PORT (defaults to 1422, mirroring the
// baseline validation which used 1422 because 1421 was occupied).
//
// This script is dev-only evidence tooling, never a Production runtime
// dependency. It uses Playwright from the worktree's node_modules.

const worktree = "D:/Ameow/.cindy-worktrees/mr9-paper-heatmap-official-baseline";
const port = process.env.LAB_PORT ?? "1422";
const outputDir = resolve(
  "D:/Ameow/.trellis/tasks/08-23-mr9-paper-heatmap-panel-mapping-comparison/artifacts/implementation",
);
const require = createRequire(`${worktree}/package.json`);
const { chromium } = require("playwright");

const browser = await chromium.launch({ headless: true });
const results = {};

const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
await page.goto(`http://127.0.0.1:${port}/lab.html`, { waitUntil: "networkidle" });

// Enter the mutually exclusive A/B category.
await page.locator('[data-lab-category="paperAB"]').click();
await page.locator("[data-lab-paper-ab]").waitFor({ state: "visible" });
// Both mounts settle under the one shared Suspense boundary.
await page.waitForFunction(
  () => document.querySelectorAll("[data-paper-shader]:not(style) canvas").length === 2,
  undefined,
  { timeout: 30000 },
);
// Brief settle buffer so both official mounts have started their own RAF.
await page.waitForTimeout(500);

const snapshot = () => page.evaluate(() => {
  const count = (selector) => document.querySelectorAll(selector).length;
  const cell = (sel) => {
    const el = document.querySelector(sel);
    return el
      ? {
          size: [el.getBoundingClientRect().width, el.getBoundingClientRect().height],
          imgOrSvg: el.querySelectorAll("img, svg").length,
          canvases: el.querySelectorAll("canvas").length,
        }
      : null;
  };
  return {
    documentCanvasCount: count("canvas"),
    paperMountCount: count("[data-paper-shader]:not(style)"),
    paperCanvasCount: count("[data-paper-shader]:not(style) canvas"),
    productionPreviewCount: count("[data-lab-preview-frame]"),
    cellACount: count('[data-lab-cell="a"]'),
    cellBCount: count('[data-lab-cell="b"]'),
    cellA: cell('[data-lab-cell="a"]'),
    cellAViewport: cell("[data-lab-cell-a-viewport]"),
    cellBPanel: cell("[data-lab-cell-b-panel]"),
    cellBViewport: cell("[data-lab-cell-b-viewport]"),
    aPanelShellCount: count("[data-lab-cell-a-panel]"),
    bPanelShellCount: count("[data-lab-cell-b-panel]"),
    paperAbCount: count("[data-lab-paper-ab]"),
    abInspectorCount: count("[data-lab-paper-ab-inspector]"),
  };
});

results.settled = await snapshot();
assert.equal(results.settled.documentCanvasCount, 2);
assert.equal(results.settled.paperMountCount, 2);
assert.equal(results.settled.paperCanvasCount, 2);
assert.equal(results.settled.productionPreviewCount, 0);
assert.deepEqual(results.settled.cellAViewport?.size, [200, 200]);
assert.deepEqual(results.settled.cellBPanel?.size, [200, 200]);
assert.equal(results.settled.cellAViewport?.imgOrSvg, 0);
assert.equal(results.settled.cellBPanel?.imgOrSvg, 0);
assert.equal(results.settled.aPanelShellCount, 0);
assert.equal(results.settled.bPanelShellCount, 1);

// Tight element crops at the shared start. B targets the composed panel,
// never only its transparent Paper canvas.
await page.locator("[data-lab-cell-a-viewport]").screenshot({ path: resolve(outputDir, "ab-a-00s.png") });
await page.locator("[data-lab-cell-b-panel]").screenshot({ path: resolve(outputDir, "ab-b-00s.png") });

// Frame advancement is read independently per mount via Paper's public
// `paperShaderMount.getCurrentFrame()`; neither mount is manipulated.
const readFrames = () => page.evaluate(() => {
  const mounts = Array.from(document.querySelectorAll("[data-paper-shader]:not(style)"));
  return mounts.map((mount) => mount.paperShaderMount?.getCurrentFrame() ?? null);
});

const frameSamples = [];
for (let second = 0; second <= 12; second += 3) {
  if (second > 0) await page.waitForTimeout(3000);
  frameSamples.push({ second, frames: await readFrames() });
}
results.frameSamples = frameSamples;
results.labObservedDurationMs = (() => {
  const first = frameSamples[0].frames;
  const last = frameSamples.at(-1).frames;
  return { a: last[0] - first[0], b: last[1] - first[1] };
})();
assert.equal(frameSamples.every(({ frames }) => frames.length === 2 && frames.every(Number.isFinite)), true);
assert.ok(results.labObservedDurationMs.a >= 10000);
assert.ok(results.labObservedDurationMs.b >= 10000);

await page.locator("[data-lab-cell-a-viewport]").screenshot({ path: resolve(outputDir, "ab-a-12s.png") });
await page.locator("[data-lab-cell-b-panel]").screenshot({ path: resolve(outputDir, "ab-b-12s.png") });
results.captures = ["ab-a-00s.png", "ab-b-00s.png", "ab-a-12s.png", "ab-b-12s.png"];

// Leaving the category must dispose both official mounts; the Production
// preview returns exactly as in the ordinary categories.
const aCanvas = await page.locator('[data-lab-cell="a"] [data-paper-shader] canvas').elementHandle();
const bCanvas = await page.locator('[data-lab-cell="b"] [data-paper-shader] canvas').elementHandle();
await page.locator('[data-lab-category="activation"]').click();
await page.locator("[data-lab-paper-ab]").waitFor({ state: "detached" });
results.afterSwitchAway = {
  aCanvasConnected: await aCanvas.evaluate((canvas) => canvas.isConnected),
  bCanvasConnected: await bCanvas.evaluate((canvas) => canvas.isConnected),
  paperMountCount: await page.locator("[data-paper-shader]:not(style)").count(),
  documentCanvasCount: await page.locator("canvas").count(),
  productionPreviewCount: await page.locator("[data-lab-preview-frame]").count(),
};
assert.equal(results.afterSwitchAway.aCanvasConnected, false);
assert.equal(results.afterSwitchAway.bCanvasConnected, false);
assert.equal(results.afterSwitchAway.paperMountCount, 0);
assert.equal(results.afterSwitchAway.documentCanvasCount, 1);
assert.equal(results.afterSwitchAway.productionPreviewCount, 1);

// Switching back remounts exactly two official mounts.
await page.locator('[data-lab-category="paperAB"]').click();
await page.waitForFunction(
  () => document.querySelectorAll("[data-paper-shader]:not(style) canvas").length === 2,
  undefined,
  { timeout: 30000 },
);
await page.waitForTimeout(500);
results.afterRemount = await snapshot();
assert.equal(results.afterRemount.paperMountCount, 2);
assert.equal(results.afterRemount.paperCanvasCount, 2);
assert.equal(results.afterRemount.productionPreviewCount, 0);

await context.close();
await browser.close();
writeFileSync(resolve(outputDir, "browser-validation-ab.json"), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
