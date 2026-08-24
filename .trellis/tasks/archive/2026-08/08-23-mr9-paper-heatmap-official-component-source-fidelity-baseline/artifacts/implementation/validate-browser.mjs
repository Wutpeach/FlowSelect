import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const worktree = "D:/Ameow/.cindy-worktrees/mr9-paper-heatmap-official-baseline";
const outputDir = resolve(
  "D:/Ameow/.trellis/tasks/08-23-mr9-paper-heatmap-official-component-source-fidelity-baseline/artifacts/implementation",
);
const require = createRequire(`${worktree}/package.json`);
const { chromium } = require("playwright");

const browser = await chromium.launch({ headless: true });
const results = {};

const largestVisibleCanvas = async (page) => {
  const candidates = await page.locator("canvas").evaluateAll((canvases) =>
    canvases.map((canvas, index) => {
      const rect = canvas.getBoundingClientRect();
      const style = getComputedStyle(canvas);
      return {
        index,
        width: rect.width,
        height: rect.height,
        area: rect.width * rect.height,
        visible: rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none",
      };
    }),
  );
  const selected = candidates
    .filter((candidate) => candidate.visible)
    .sort((a, b) => b.area - a.area)[0];
  if (!selected) throw new Error("No visible canvas found");
  return { locator: page.locator("canvas").nth(selected.index), metrics: selected };
};

const labContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const labPage = await labContext.newPage();
await labPage.goto("http://127.0.0.1:1422/lab.html", { waitUntil: "networkidle" });
await labPage.locator('[data-lab-category="paperOfficial"]').click();
await labPage.locator("main [data-paper-shader] canvas").waitFor({ state: "visible" });
await labPage.waitForTimeout(1000);

results.labSettled = await labPage.evaluate(() => {
  const host = document.querySelector("[data-lab-paper-heatmap-host]");
  const mount = document.querySelector("main [data-paper-shader]");
  const mountStyle = mount ? getComputedStyle(mount) : null;
  const hostStyle = host ? getComputedStyle(host) : null;
  return {
    documentCanvasCount: document.querySelectorAll("canvas").length,
    mainPaperMountCount: document.querySelectorAll("main [data-paper-shader]").length,
    mainPaperCanvasCount: document.querySelectorAll("main [data-paper-shader] canvas").length,
    productionPreviewCount: document.querySelectorAll("[data-lab-preview-frame]").length,
    visibleImageElementCount: host?.querySelectorAll("img, svg").length ?? -1,
    hostSize: host ? [host.getBoundingClientRect().width, host.getBoundingClientRect().height] : null,
    hostBackgroundImage: hostStyle?.backgroundImage ?? null,
    hostBorderRadius: hostStyle?.borderRadius ?? null,
    mountSize: mount ? [mount.getBoundingClientRect().width, mount.getBoundingClientRect().height] : null,
    mountBackgroundImage: mountStyle?.backgroundImage ?? null,
    mountHasOfficialRuntime: Boolean(mount?.paperShaderMount),
  };
});

const labHost = labPage.locator("[data-lab-paper-heatmap-host]");
const labFrameSamples = [];
for (let second = 0; second <= 12; second += 3) {
  if (second > 0) await labPage.waitForTimeout(3000);
  const currentFrame = await labPage.evaluate(() =>
    document.querySelector("main [data-paper-shader]")?.paperShaderMount?.getCurrentFrame(),
  );
  labFrameSamples.push({ second, currentFrame });
  await labHost.screenshot({ path: resolve(outputDir, `lab-rounded-${String(second).padStart(2, "0")}s.png`) });
}
results.labFrameSamples = labFrameSamples;
results.labObservedDurationMs = labFrameSamples.at(-1).currentFrame - labFrameSamples[0].currentFrame;

const paperCanvas = await labPage.locator("main [data-paper-shader] canvas").elementHandle();
await labPage.locator('[data-lab-category="activation"]').click();
await labPage.locator("main [data-paper-shader]").waitFor({ state: "detached" });
results.afterSwitchAway = {
  paperCanvasConnected: await paperCanvas.evaluate((canvas) => canvas.isConnected),
  paperMountCount: await labPage.locator("main [data-paper-shader]").count(),
  documentCanvasCount: await labPage.locator("canvas").count(),
  productionPreviewCount: await labPage.locator("[data-lab-preview-frame]").count(),
};

await labPage.locator('[data-lab-category="paperOfficial"]').click();
await labPage.locator("main [data-paper-shader] canvas").waitFor({ state: "visible" });
await labPage.waitForTimeout(750);
results.afterRemount = {
  paperMountCount: await labPage.locator("main [data-paper-shader]").count(),
  documentCanvasCount: await labPage.locator("canvas").count(),
  productionPreviewCount: await labPage.locator("[data-lab-preview-frame]").count(),
};
await labContext.close();

const officialContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const officialPage = await officialContext.newPage();
await officialPage.goto("https://shaders.paper.design/heatmap", { waitUntil: "networkidle", timeout: 60000 });
const defaultButton = officialPage.getByRole("button", { name: "Default", exact: true }).first();
if (await defaultButton.count()) await defaultButton.click();
await officialPage.locator("canvas").first().waitFor({ state: "visible", timeout: 30000 });
await officialPage.waitForTimeout(1000);

const officialFrames = [];
for (const second of [0, 6, 12]) {
  if (second > 0) await officialPage.waitForTimeout(6000);
  const selected = await largestVisibleCanvas(officialPage);
  officialFrames.push({ second, ...selected.metrics });
  await selected.locator.screenshot({
    path: resolve(outputDir, `official-default-${String(second).padStart(2, "0")}s.png`),
  });
}
results.official = {
  url: officialPage.url(),
  title: await officialPage.title(),
  defaultButtonCount: await officialPage.getByRole("button", { name: "Default", exact: true }).count(),
  bodyPaperMountCount: await officialPage.locator("body [data-paper-shader]").count(),
  canvasCount: await officialPage.locator("canvas").count(),
  frames: officialFrames,
};

await officialContext.close();
await browser.close();
writeFileSync(resolve(outputDir, "browser-validation.json"), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
