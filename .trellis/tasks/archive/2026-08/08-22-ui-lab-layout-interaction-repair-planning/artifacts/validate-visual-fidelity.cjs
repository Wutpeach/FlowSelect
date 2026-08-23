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
    viewport: { width: 1600, height: 900 },
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
  await page.locator('[data-lab-preset="intake-local"]').click();
  await page.waitForTimeout(200);

  const full = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    const workspace = document.querySelector("[data-lab-workspace]");
    const devtools = document.querySelector("[data-lab-devtools]");
    const stage = document.querySelector("[data-lab-stage-viewport]");
    const frame = document.querySelector("[data-lab-preview-frame]");
    const scenarioButtons = [...document.querySelectorAll("[data-lab-scenario-strip] button")];
    const groups = [...document.querySelectorAll("[data-lab-control-group]")];
    const selected = scenarioButtons.filter((button) => button.getAttribute("aria-pressed") === "true");
    return {
      bodyText: document.body.textContent,
      headingCount: document.querySelectorAll("h1").length,
      navCount: document.querySelectorAll("nav").length,
      scenarioFirst: workspace?.firstElementChild?.hasAttribute("data-lab-scenario-strip"),
      scenarioCount: scenarioButtons.length,
      scenarioRows: new Set(scenarioButtons.map((button) => Math.round(button.getBoundingClientRect().top))).size,
      scenarioMinHeight: Math.min(...scenarioButtons.map((button) => button.getBoundingClientRect().height)),
      selectedCount: selected.length,
      workspace: rect("[data-lab-workspace]"),
      devtools: rect("[data-lab-devtools]"),
      stage: rect("[data-lab-stage-viewport]"),
      frame: rect("[data-lab-preview-frame]"),
      frameCss: frame ? getComputedStyle(frame).width : null,
      fillRatio: frame && stage
        ? Math.max(frame.getBoundingClientRect().width / stage.getBoundingClientRect().width,
          frame.getBoundingClientRect().height / stage.getBoundingClientRect().height)
        : null,
      groupKeys: groups.map((group) => group.getAttribute("data-lab-control-group")),
      groupTops: groups.map((group) => Math.round(group.getBoundingClientRect().top)),
      workspaceSurface: workspace ? getComputedStyle(workspace).backgroundColor : null,
      devtoolsSurface: devtools ? getComputedStyle(devtools).backgroundColor : null,
      advancedOpen: document.querySelector("[data-lab-advanced]")?.hasAttribute("open"),
      devtoolsSectionCount: document.querySelectorAll("[data-lab-devtools] h3").length,
      canvasCount: document.querySelectorAll("canvas").length,
    };
  });
  assert(!full.bodyText.includes("Ameow UI Lab"), "Page title is visible");
  assert(full.headingCount === 0 && full.navCount === 0, "Legacy title or navigation remains");
  assert(full.scenarioFirst, "Scenario strip is not first workspace content");
  assert(full.scenarioCount <= 7 && full.scenarioRows === 1, "Scenario strip is still dense or wrapped");
  assert(full.scenarioMinHeight >= 32, "Scenario selectors are too small");
  assert(full.selectedCount === 1, "Full scenario group must have one selected state");
  assert(full.frameCss === "200px", "Full logical geometry changed");
  assert(full.fillRatio >= 0.6 && full.fillRatio <= 0.84, `Full Fit lacks comfortable breathing room: ${full.fillRatio}`);
  assert(JSON.stringify(full.groupKeys) === JSON.stringify(["target", "scale", "actions"]), "Control groups are incomplete");
  assert(full.groupTops[0] < full.groupTops[1] && full.groupTops[1] < full.groupTops[2], "Control groups are not stacked");
  assert(full.workspace.width > full.devtools.width * 2, "Preview Workspace is not dominant");
  assert(full.devtools.width >= 360 && full.devtools.width <= 400, "Dev Tools width is outside the intended desktop range");
  assert(full.workspaceSurface === full.devtoolsSurface, "Workspace and Dev Tools surfaces diverge");
  assert(full.advancedOpen === false, "Advanced Diagnostics starts expanded");
  assert(full.devtoolsSectionCount >= 4, "Dev Tools hierarchy is not sectioned");
  assert(full.canvasCount === 1, "Full target must mount exactly one canvas");

  const activation = page.locator('[data-lab-preset="intake-local"]');
  const mouseState = await activation.evaluate((button) => ({
    focusVisible: button.matches(":focus-visible"),
    selectedInGroup: button.parentElement.querySelectorAll('[aria-pressed="true"]').length,
  }));
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
      frameInsideEnvironment: env?.contains(frame),
      frameCss: frame ? getComputedStyle(frame).width : null,
    };
  });
  const afterEnvironment = await page.locator("[data-lab-preview-frame]").boundingBox();
  assert(environment.value === "light", "Preview environment did not switch");
  assert(environment.frameInsideEnvironment === false, "Environment wraps export capture root");
  assert(environment.frameCss === "200px", "Environment changed logical geometry");
  assert(Math.abs(beforeEnvironment.width - afterEnvironment.width) < 0.5, "Environment changed display geometry");

  await page.locator("[data-lab-advanced] summary").click();
  assert(await page.locator("[data-lab-advanced]").getAttribute("open") !== null, "Advanced Diagnostics did not open");
  await page.locator("[data-lab-advanced] summary").click();

  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-lab-export]").click();
  const download = await downloadPromise;
  const exportFile = path.join(ARTIFACTS, "ui-lab-visual-fidelity-export.png");
  await download.saveAs(exportFile);
  const exportSize = pngSize(exportFile);
  assert(exportSize.width === 912 && exportSize.height === 912, "Export contract changed");

  await page.waitForTimeout(2200);
  await page.screenshot({
    path: path.join(ARTIFACTS, "ui-lab-visual-fidelity-full.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "紧凑", exact: true }).click();
  await page.waitForTimeout(250);
  const compact = await page.evaluate(() => {
    const stage = document.querySelector("[data-lab-stage-viewport]");
    const host = document.querySelector("[data-lab-compact-stage]");
    const shell = document.querySelector("[data-lab-compact-shell]");
    const targetGroups = document.querySelectorAll('[data-lab-control-group="target"] [aria-pressed="true"]');
    return {
      host: host?.getBoundingClientRect().toJSON(),
      stage: stage?.getBoundingClientRect().toJSON(),
      hostCss: host ? getComputedStyle(host).width : null,
      shellCss: shell ? getComputedStyle(shell).width : null,
      fillRatio: host && stage
        ? Math.max(host.getBoundingClientRect().width / stage.getBoundingClientRect().width,
          host.getBoundingClientRect().height / stage.getBoundingClientRect().height)
        : null,
      canvasCount: document.querySelectorAll("canvas").length,
      selectedScenarioCount: document.querySelectorAll('[data-lab-scenario-strip] [aria-pressed="true"]').length,
      selectedTargetCount: targetGroups.length,
    };
  });
  assert(compact.hostCss === "80px" && compact.shellCss === "60px", "Compact logical geometry changed");
  assert(compact.host.width > 240, "Compact Fit is still capped at 3x");
  assert(compact.fillRatio >= 0.6 && compact.fillRatio <= 0.84, `Compact Fit lacks comfortable breathing room: ${compact.fillRatio}`);
  assert(compact.canvasCount === 0, "Compact introduced a canvas");
  assert(compact.selectedScenarioCount === 1 && compact.selectedTargetCount === 1, "Compact selection state is ambiguous");
  await page.screenshot({
    path: path.join(ARTIFACTS, "ui-lab-visual-fidelity-compact.png"),
    fullPage: true,
  });

  assert(errors.length === 0, `Browser errors: ${JSON.stringify(errors)}`);
  const result = { status: "PASS", full, mouseState, keyboardFocus, environment, exportSize, compact, errors };
  fs.writeFileSync(
    path.join(ARTIFACTS, "browser-visual-fidelity-result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
