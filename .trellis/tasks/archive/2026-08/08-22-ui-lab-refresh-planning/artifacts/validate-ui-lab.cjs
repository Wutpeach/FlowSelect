const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const LAB_URL = "http://127.0.0.1:1422/lab.html";
const ARTIFACTS = __dirname;

const pngSize = (file) => {
  const buffer = fs.readFileSync(file);
  if (buffer.toString("ascii", 1, 4) !== "PNG") {
    throw new Error("Downloaded export is not a PNG");
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true,
    reducedMotion: "no-preference",
  });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (
      message.type() === "error"
      && !message.text().startsWith("Failed to load resource")
    ) {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await page.goto(LAB_URL, { waitUntil: "networkidle" });

  const fullInitial = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    const frame = document.querySelector("[data-lab-preview-frame]");
    return {
      nav: rect("nav"),
      workspace: rect("[data-lab-workspace]"),
      devtools: rect("[data-lab-devtools]"),
      frameRect: rect("[data-lab-preview-frame]"),
      frameCss: frame ? getComputedStyle(frame).width : null,
      viewportRect: rect("[data-lab-stage-viewport]"),
      canvasCount: document.querySelectorAll("canvas").length,
      compactCount: document.querySelectorAll("[data-lab-compact-stage]").length,
      advancedOpen: document.querySelector("[data-lab-advanced]")?.hasAttribute("open"),
    };
  });
  assert(fullInitial.canvasCount === 1, "Full must mount exactly one canvas");
  assert(fullInitial.compactCount === 0, "Full must not mount Compact stage");
  assert(fullInitial.frameCss === "200px", "Full logical CSS geometry must remain 200px");
  assert(Math.round(fullInitial.frameRect.width) === 200, "Full 1x frame must display at 200px");
  assert(
    fullInitial.workspace.width > fullInitial.nav.width
      && fullInitial.workspace.width > fullInitial.devtools.width,
    "Preview workspace must dominate both side regions",
  );
  assert(fullInitial.advancedOpen === false, "Advanced diagnostics must start collapsed");
  await page.screenshot({ path: path.join(ARTIFACTS, "ui-lab-full-1x.png"), fullPage: true });

  await page.getByRole("button", { name: "3×", exact: true }).click();
  const full3x = await page.evaluate(() => {
    const frame = document.querySelector("[data-lab-preview-frame]");
    const viewport = document.querySelector("[data-lab-stage-viewport]");
    return {
      frameRect: frame.getBoundingClientRect().toJSON(),
      frameCss: getComputedStyle(frame).width,
      viewportRect: viewport.getBoundingClientRect().toJSON(),
    };
  });
  assert(full3x.frameCss === "200px", "Full logical geometry changed under display scale");
  assert(Math.round(full3x.frameRect.width) === 600, "Full 3x display size must be 600px");
  assert(Math.round(full3x.viewportRect.width) === 600, "Full workspace must reserve scaled width");

  const frameBox = await page.locator("[data-lab-preview-frame]").boundingBox();
  await page.mouse.click(
    frameBox.x + frameBox.width * 0.75,
    frameBox.y + frameBox.height * 0.25,
  );
  await page.getByRole("button", { name: /Intake · 本地源点/ }).click();
  await page.locator("[data-lab-advanced] summary").click();
  const composedInput = JSON.parse(
    await page.locator("[data-lab-advanced] pre").nth(1).textContent(),
  );
  assert(
    Math.abs(composedInput.target.origin.x - 0.75) < 0.01
      && Math.abs(composedInput.target.origin.y - 0.25) < 0.01,
    "Full pointer normalization did not preserve normalized origin at 3x",
  );

  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-lab-export]").click();
  const download = await downloadPromise;
  const exportFile = path.join(ARTIFACTS, "ui-lab-full-export-3x.png");
  await download.saveAs(exportFile);
  const exportSize = pngSize(exportFile);
  assert(
    exportSize.width === 912 && exportSize.height === 912,
    `Full export contract changed under display scale: ${JSON.stringify(exportSize)}`,
  );
  await page.screenshot({ path: path.join(ARTIFACTS, "ui-lab-full-3x.png"), fullPage: true });

  await page.getByRole("button", { name: "紧凑", exact: true }).click();
  await page.waitForTimeout(250);
  const compact3x = await page.evaluate(() => {
    const stage = document.querySelector("[data-lab-compact-stage]");
    const shell = document.querySelector("[data-lab-compact-shell]");
    const advanced = document.querySelector("[data-lab-advanced]");
    return {
      stageRect: stage?.getBoundingClientRect().toJSON(),
      stageCss: stage ? getComputedStyle(stage).width : null,
      shellCss: shell ? getComputedStyle(shell).width : null,
      canvasCount: document.querySelectorAll("canvas").length,
      compactCount: document.querySelectorAll("[data-lab-compact-stage]").length,
      advancedText: advanced?.textContent || "",
      exportVisible: Boolean(document.querySelector("[data-lab-export]")),
    };
  });
  assert(compact3x.canvasCount === 0, "Compact introduced or retained a canvas");
  assert(compact3x.compactCount === 1, "Compact stage did not mount exactly once");
  assert(
    compact3x.stageCss === "80px" && compact3x.shellCss === "60px",
    "Compact logical geometry is not 80/60",
  );
  assert(Math.round(compact3x.stageRect.width) === 240, "Compact 3x display size must be 240px");
  assert(
    compact3x.advancedText.includes("仅限全屏目标"),
    "Compact diagnostics did not mark Full-only readout",
  );
  assert(compact3x.exportVisible === false, "Compact must not expose the Full-only export action");

  const compactBox = await page.locator("[data-lab-compact-stage]").boundingBox();
  await page.mouse.move(
    compactBox.x + compactBox.width * 0.8,
    compactBox.y + compactBox.height * 0.2,
  );
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(ARTIFACTS, "ui-lab-compact-3x.png"), fullPage: true });

  await page.getByRole("button", { name: "紧凑角色", exact: true }).click();
  await page.locator('[data-lab-compact-preset="compact-reduced"]').click();
  const reduced = await page.evaluate(() => ({
    summary: [...document.querySelectorAll("[data-lab-devtools] span")]
      .find((element) => element.textContent?.trim() === "预览减弱动态")
      ?.parentElement?.textContent?.replace(/\s/g, "") || null,
    checkbox: document.querySelector('[data-lab-devtools] input[type="checkbox"]')?.checked,
    compactPresetCount: document.querySelectorAll("[data-lab-compact-preset]").length,
  }));
  assert(
    reduced.compactPresetCount === 3,
    "Compact scenario catalog must expose exactly three current-renderer scenarios",
  );
  assert(
    reduced.summary === "预览减弱动态开",
    "Compact RM preset did not resolve preview value",
  );
  assert(reduced.checkbox === false, "Scenario preset silently rewrote the explicit Dev Tools toggle");

  await page.setViewportSize({ width: 1000, height: 900 });
  await page.waitForTimeout(100);
  const narrow = await page.evaluate(() => ({
    devtoolsDisplay: getComputedStyle(document.querySelector("[data-lab-devtools]")).display,
    workspace: document.querySelector("[data-lab-workspace]").getBoundingClientRect().toJSON(),
    nav: document.querySelector("nav").getBoundingClientRect().toJSON(),
  }));
  assert(narrow.devtoolsDisplay === "none", "Dev Tools must collapse at narrow breakpoint");
  assert(narrow.workspace.width > narrow.nav.width, "Preview must remain dominant at narrow width");
  await page.screenshot({
    path: path.join(ARTIFACTS, "ui-lab-narrow-compact.png"),
    fullPage: true,
  });

  assert(consoleErrors.length === 0, `Browser errors: ${JSON.stringify(consoleErrors)}`);
  console.log(JSON.stringify({
    status: "PASS",
    fullInitial,
    full3x,
    exportSize,
    compact3x,
    reduced,
    narrow,
    consoleErrors,
  }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
