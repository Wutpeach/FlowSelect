const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const URL = "http://127.0.0.1:1423/lab.html";
const ARTIFACTS = __dirname;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const pngSize = (file) => {
  const buffer = fs.readFileSync(file);
  assert(buffer.toString("ascii", 1, 4) === "PNG", "Export is not a PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("console", (message) => {
    if (
      message.type() === "error"
      && !message.text().startsWith("Failed to load resource")
      && !message.text().includes("-electron-corner-smoothing")
    ) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto(URL, { waitUntil: "networkidle" });
  const initial = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    const workspace = document.querySelector("[data-lab-workspace]");
    const devtools = document.querySelector("[data-lab-devtools]");
    const frame = document.querySelector("[data-lab-preview-frame]");
    const fit = [...document.querySelectorAll('[role="group"]')]
      .find((group) => group.getAttribute("aria-label") === "显示缩放")
      ?.querySelector('[aria-pressed="true"]');
    return {
      bodyText: document.body.textContent,
      headingCount: document.querySelectorAll("h1").length,
      navCount: document.querySelectorAll("nav").length,
      scenarioFirst: workspace?.firstElementChild?.hasAttribute("data-lab-scenario-strip"),
      workspace: rect("[data-lab-workspace]"),
      devtools: rect("[data-lab-devtools]"),
      stage: rect("[data-lab-stage-viewport]"),
      frame: rect("[data-lab-preview-frame]"),
      frameCss: frame ? getComputedStyle(frame).width : null,
      fitLabel: fit?.textContent?.trim(),
      workspaceSurface: workspace ? getComputedStyle(workspace).backgroundColor : null,
      devtoolsSurface: devtools ? getComputedStyle(devtools).backgroundColor : null,
      advancedOpen: document.querySelector("[data-lab-advanced]")?.hasAttribute("open"),
      canvasCount: document.querySelectorAll("canvas").length,
    };
  });
  assert(!initial.bodyText.includes("Ameow UI Lab"), "Page title is visible");
  assert(initial.headingCount === 0 && initial.navCount === 0, `Legacy title/nav remains: ${JSON.stringify(initial)}`);
  assert(initial.scenarioFirst, "Scenario Navigation is not first workspace content");
  assert(initial.fitLabel === "适应", "Fit is not the default scale mode");
  assert(initial.frameCss === "200px", "Full logical geometry changed");
  assert(initial.stage.height - initial.frame.height <= 40, "Full Fit did not use available workspace with its safety margin");
  assert(initial.workspace.width > initial.devtools.width, "Preview Workspace is not dominant");
  assert(initial.workspaceSurface === initial.devtoolsSurface, "Workspace and Dev Tools surfaces diverge");
  assert(initial.advancedOpen === false, "Advanced Diagnostics starts expanded");
  assert(initial.canvasCount === 1, "Full target must mount exactly one canvas");

  const activation = page.locator('[data-lab-preset="intake-local"]');
  await activation.click();
  const mouseState = await activation.evaluate((button) => ({
    pressed: button.getAttribute("aria-pressed"),
    focusVisible: button.matches(":focus-visible"),
    selectedInGroup: button.parentElement.querySelectorAll('[aria-pressed="true"]').length,
  }));
  assert(mouseState.pressed === "true", "Scenario did not become selected");
  assert(mouseState.selectedInGroup === 1, "Scenario group has multiple selected states");
  assert(mouseState.focusVisible === false, "Mouse click left a focus-visible outline");
  await page.keyboard.press("Tab");
  const keyboardFocus = await page.evaluate(() => ({
    isLabControl: document.activeElement?.classList.contains("lab-control"),
    focusVisible: document.activeElement?.matches(":focus-visible"),
    outline: document.activeElement ? getComputedStyle(document.activeElement).outlineStyle : null,
  }));
  assert(keyboardFocus.isLabControl && keyboardFocus.focusVisible, "Keyboard focus-visible is missing");
  assert(keyboardFocus.outline !== "none", "Custom focus-visible ring is not visible");

  const beforeEnvironment = await page.locator("[data-lab-preview-frame]").boundingBox();
  await page.locator("[data-lab-env-trigger]").click();
  await page.getByRole("option", { name: "浅色", exact: true }).click();
  const environment = await page.evaluate(() => {
    const env = document.querySelector("[data-lab-env]");
    const frame = document.querySelector("[data-lab-preview-frame]");
    return {
      value: env?.getAttribute("data-lab-env"),
      background: env ? getComputedStyle(env).backgroundColor : null,
      frameInsideEnvironment: env?.contains(frame),
      frameCss: frame ? getComputedStyle(frame).width : null,
    };
  });
  const afterEnvironment = await page.locator("[data-lab-preview-frame]").boundingBox();
  assert(environment.value === "light", "Preview environment did not switch");
  assert(environment.frameInsideEnvironment === false, "Environment wraps export capture root");
  assert(environment.frameCss === "200px", "Environment changed logical geometry");
  assert(Math.abs(beforeEnvironment.width - afterEnvironment.width) < 0.5, "Environment changed display geometry");

  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-lab-export]").click();
  const download = await downloadPromise;
  const exportFile = path.join(ARTIFACTS, "ui-lab-layout-repair-export.png");
  await download.saveAs(exportFile);
  const exportSize = pngSize(exportFile);
  assert(exportSize.width === 912 && exportSize.height === 912, "Export contract changed");

  await page.getByRole("button", { name: "紧凑", exact: true }).click();
  await page.waitForTimeout(250);
  const compact = await page.evaluate(() => {
    const stage = document.querySelector("[data-lab-compact-stage]");
    const shell = document.querySelector("[data-lab-compact-shell]");
    return {
      stage: stage?.getBoundingClientRect().toJSON(),
      stageCss: stage ? getComputedStyle(stage).width : null,
      shellCss: shell ? getComputedStyle(shell).width : null,
      canvasCount: document.querySelectorAll("canvas").length,
      fitPressed: [...document.querySelectorAll('[role="group"]')]
        .find((group) => group.getAttribute("aria-label") === "显示缩放")
        ?.querySelector('[aria-pressed="true"]')?.textContent?.trim(),
    };
  });
  assert(compact.stageCss === "80px" && compact.shellCss === "60px", "Compact logical geometry changed");
  assert(compact.stage.width > 240, "Compact Fit is still capped at 3x");
  assert(compact.canvasCount === 0, "Compact introduced a canvas");
  assert(compact.fitPressed === "适应", "Target switch changed Fit mode");
  await page.screenshot({
    path: path.join(ARTIFACTS, "ui-lab-layout-repair-compact.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 900, height: 850 });
  await page.waitForTimeout(150);
  const narrow = await page.evaluate(() => {
    const devtools = document.querySelector("[data-lab-devtools]");
    return {
      display: getComputedStyle(devtools).display,
      width: devtools.getBoundingClientRect().width,
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  assert(narrow.display !== "none" && narrow.width >= 240, "Dev Tools is not persistent");

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole("button", { name: "全屏", exact: true }).click();
  await page.waitForTimeout(150);
  await page.screenshot({
    path: path.join(ARTIFACTS, "ui-lab-layout-repair-full.png"),
    fullPage: true,
  });
  assert(errors.length === 0, `Browser errors: ${JSON.stringify(errors)}`);
  console.log(JSON.stringify({ status: "PASS", initial, mouseState, keyboardFocus, environment, exportSize, compact, narrow, errors }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
