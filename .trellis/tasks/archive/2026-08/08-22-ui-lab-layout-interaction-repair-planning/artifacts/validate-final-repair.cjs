/*
 * Final Workspace Shell repair — Playwright/Edge validation (Lead-run).
 *
 * Asserts the Lead Override decisions on top of the current uncommitted Lab:
 *   - exactly two first-level surfaces with one surface language;
 *   - Workspace Shell Header / Body / Footer markers (one outer boundary,
 *     no per-group cards);
 *   - Auto default resolves only to {1,2,3}; integer metadata ("自动 · 2×");
 *   - comfortable Preview size; Auto never above 3x (Compact host = 240 max);
 *   - Background popover unchanged;
 *   - Reset affordance (data-lab-reset, title/aria-label) restores origin to
 *     center and re-applies the scenario;
 *   - origin marker visible for Intake / origin editing, hidden for
 *     Heatmap / Download / Transcode / Mixed / Compact;
 *   - Replay and Export secondary (no orange), success feedback temporary;
 *   - selected / hover / focus-visible clarity; Advanced collapsed; no errors;
 *   - Full export 912x912; Compact zero canvas.
 *
 * Run: node artifacts/validate-final-repair.cjs  (server on 127.0.0.1:1423)
 */
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

  const shell = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    const workspace = document.querySelector("[data-lab-workspace]");
    const header = document.querySelector("[data-lab-workspace-header]");
    const body = document.querySelector("[data-lab-workspace-body]");
    const footer = document.querySelector("[data-lab-workspace-footer]");
    const devtools = document.querySelector("[data-lab-devtools]");
    const stage = document.querySelector("[data-lab-stage-viewport]");
    const frame = document.querySelector("[data-lab-preview-frame]");
    const groups = [...document.querySelectorAll("[data-lab-control-group]")];
    const scaleGroup = document.querySelector('[data-lab-control-group="scale"]');
    const selectedScale = scaleGroup?.querySelector('[aria-pressed="true"]')?.textContent ?? null;
    const scenarioButtons = [...document.querySelectorAll("[data-lab-scenario-strip] button")];
    const selected = scenarioButtons.filter((button) => button.getAttribute("aria-pressed") === "true");
    const reset = document.querySelector("[data-lab-reset]");
    const originMarker = document.querySelector("[data-lab-chrome]");
    return {
      bodyText: document.body.textContent,
      headingCount: document.querySelectorAll("h1").length,
      navCount: document.querySelectorAll("nav").length,
      scenarioFirst: workspace?.firstElementChild?.hasAttribute("data-lab-scenario-strip"),
      scenarioCount: scenarioButtons.length,
      scenarioRows: new Set(scenarioButtons.map((button) => Math.round(button.getBoundingClientRect().top))).size,
      selectedCount: selected.length,
      workspace: rect("[data-lab-workspace]"),
      devtools: rect("[data-lab-devtools]"),
      header: rect("[data-lab-workspace-header]"),
      body: rect("[data-lab-workspace-body]"),
      footer: rect("[data-lab-workspace-footer]"),
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
      canvasCount: document.querySelectorAll("canvas").length,
      selectedScale,
      scaleMetaText: scaleGroup ? scaleGroup.textContent : null,
      hasHeaderOnStrip: header?.hasAttribute("data-lab-scenario-strip") ?? false,
      bodyIsStage: body?.hasAttribute("data-lab-stage-viewport") ?? false,
      footerWrapsControls: footer?.querySelector("[data-lab-control-groups]") !== null,
      resetPresent: reset !== null,
      resetTitle: reset?.getAttribute("title") ?? null,
      resetLabel: reset?.getAttribute("aria-label") ?? null,
      originMarkerVisible: originMarker !== null,
      exportOrange: (() => {
        const exportButton = document.querySelector("[data-lab-export]");
        if (!exportButton) return null;
        const style = getComputedStyle(exportButton);
        return { color: style.color, borderColor: style.borderColor, background: style.backgroundColor };
      })(),
    };
  });

  assert(shell.headingCount === 0 && shell.navCount === 0, "Page title or nav remains");
  assert(shell.scenarioFirst, "Scenario strip is not the FIRST Workspace content");
  assert(shell.hasHeaderOnStrip, "Workspace Header is not on the scenario strip");
  assert(shell.bodyIsStage, "Workspace Body is not the stage viewport");
  assert(shell.footerWrapsControls, "Workspace Footer does not wrap the controls");
  assert(shell.scenarioCount <= 7 && shell.scenarioRows === 1, "Scenario strip dense or wrapped");
  assert(shell.selectedCount === 1, "Scenario group must have exactly one selected");
  assert(shell.frameCss === "200px", "Full logical geometry changed");
  assert(shell.fillRatio >= 0.55 && shell.fillRatio <= 0.84, `Full Auto lacks comfortable breathing room: ${shell.fillRatio}`);
  assert(JSON.stringify(shell.groupKeys) === JSON.stringify(["target", "scale", "actions"]), "Control groups incomplete");
  assert(shell.groupTops[0] < shell.groupTops[1] && shell.groupTops[1] < shell.groupTops[2], "Control groups not stacked");
  assert(shell.workspace.width > shell.devtools.width * 2, "Workspace not dominant");
  assert(shell.workspaceSurface === shell.devtoolsSurface, "Surfaces diverge");
  assert(shell.advancedOpen === false, "Advanced Diagnostics starts expanded");
  assert(shell.canvasCount === 1, "Full target must mount exactly one canvas");
  assert(shell.selectedScale === "自动", `Auto is not the default scale segment: ${shell.selectedScale}`);
  // Auto metadata is integer ("自动 · 2×"), never a continuous decimal.
  assert(/自动 · [123]×/.test(shell.scaleMetaText ?? ""), `Auto metadata is not integer: ${shell.scaleMetaText}`);
  assert(!/\d+\.\d+/.test(shell.scaleMetaText ?? ""), `Auto metadata contains a decimal: ${shell.scaleMetaText}`);
  assert(shell.resetPresent, "Reset affordance is missing");
  assert(!!shell.resetTitle && !!shell.resetLabel, "Reset lacks tooltip or accessible label");
  assert(shell.originMarkerVisible, "Origin marker hidden on the origin-relevant Intake scenario");
  // Export must not be the persistent orange hierarchy.
  assert(shell.exportOrange && shell.exportOrange.color !== "rgb(255, 217, 184)", "Export still uses the orange hierarchy");

  // Conditional origin marker: hidden on Heatmap, Download, Transcode, Mixed.
  for (const scenario of ["heatmap-moving", "download-active", "transcode-active", "mixed-busy"]) {
    await page.locator(`[data-lab-preset="${scenario}"]`).click();
    await page.waitForTimeout(120);
    const visible = await page.evaluate(() => document.querySelector("[data-lab-chrome]") !== null);
    assert(!visible, `Origin marker visible on unrelated scenario ${scenario}`);
  }
  // Back to Intake -> marker returns.
  await page.locator('[data-lab-preset="intake-local"]').click();
  await page.waitForTimeout(120);
  assert(await page.evaluate(() => document.querySelector("[data-lab-chrome]") !== null), "Origin marker did not return on Intake");

  // While actively editing origin (focus the origin X input) the marker shows,
  // even on a scenario that is not origin-relevant (Heatmap).
  await page.locator('[data-lab-preset="heatmap-moving"]').click();
  await page.waitForTimeout(120);
  const markerHiddenBeforeEdit = await page.evaluate(() => document.querySelector("[data-lab-chrome]") === null);
  assert(markerHiddenBeforeEdit, "Marker should be hidden on Heatmap");
  const originX = page.locator('[data-lab-devtools] input[type="number"]').first();
  await originX.focus();
  assert(await page.evaluate(() => document.querySelector("[data-lab-chrome]") !== null), "Marker hidden while editing origin");
  await originX.blur();
  await page.locator('[data-lab-preset="intake-local"]').click();
  await page.waitForTimeout(120);

  // Reset: set origin to a non-center value, then Reset restores center.
  const xInput = page.locator('[data-lab-devtools] input[type="number"]').nth(0);
  await xInput.fill("0.3");
  await page.waitForTimeout(80);
  await page.locator("[data-lab-reset]").click();
  await page.waitForTimeout(120);
  const xAfterReset = await xInput.inputValue();
  assert(xAfterReset === "0.5", `Reset did not recenter origin (X=${xAfterReset})`);

  // Keyboard focus-visible ring on a lab control.
  await page.keyboard.press("Tab");
  const keyboardFocus = await page.evaluate(() => ({
    isLabControl: document.activeElement?.classList.contains("lab-control"),
    focusVisible: document.activeElement?.matches(":focus-visible"),
    outline: document.activeElement ? getComputedStyle(document.activeElement).outlineStyle : null,
  }));
  assert(keyboardFocus.isLabControl && keyboardFocus.focusVisible, "Keyboard focus-visible is missing");
  assert(keyboardFocus.outline !== "none", "Custom focus-visible ring is not visible");

  // Background popover.
  await page.locator("[data-lab-env-trigger]").click();
  await page.getByRole("option", { name: "浅色", exact: true }).click();
  const environment = await page.evaluate(() => ({
    value: document.querySelector("[data-lab-env]")?.getAttribute("data-lab-env"),
    frameInsideEnvironment: document.querySelector("[data-lab-env]")?.contains(document.querySelector("[data-lab-preview-frame]")),
  }));
  assert(environment.value === "light", "Preview environment did not switch");
  assert(environment.frameInsideEnvironment === false, "Environment wraps export capture root");

  // Export: 912x912, then success feedback returns to idle (temporary).
  const downloadPromise = page.waitForEvent("download");
  await page.locator("[data-lab-export]").click();
  const download = await downloadPromise;
  const exportFile = path.join(ARTIFACTS, "final-layout-repair-export.png");
  await download.saveAs(exportFile);
  const exportSize = pngSize(exportFile);
  assert(exportSize.width === 912 && exportSize.height === 912, "Export contract changed");
  const labelDuring = await page.locator("[data-lab-export]").textContent();
  assert(labelDuring.includes("已导出") || labelDuring.includes("Exported"), "Export success feedback missing");
  await page.waitForTimeout(2300);
  const labelIdle = await page.locator("[data-lab-export]").textContent();
  assert(labelIdle.includes("导出") && !labelIdle.includes("✓"), "Export feedback did not return to idle");

  await page.screenshot({ path: path.join(ARTIFACTS, "final-layout-repair-full.png"), fullPage: true });

  // Compact: Auto capped at 3x (host 240), zero canvas, no origin marker.
  await page.getByRole("button", { name: "紧凑", exact: true }).click();
  await page.waitForTimeout(250);
  const compact = await page.evaluate(() => {
    const stage = document.querySelector("[data-lab-stage-viewport]");
    const host = document.querySelector("[data-lab-compact-stage]");
    const shell = document.querySelector("[data-lab-compact-shell]");
    return {
      host: host?.getBoundingClientRect().toJSON(),
      stage: stage?.getBoundingClientRect().toJSON(),
      hostCss: host ? getComputedStyle(host).width : null,
      shellCss: shell ? getComputedStyle(shell).width : null,
      canvasCount: document.querySelectorAll("canvas").length,
      originMarkerVisible: document.querySelector("[data-lab-chrome]") !== null,
      selectedScenarioCount: document.querySelectorAll('[data-lab-scenario-strip] [aria-pressed="true"]').length,
      selectedTargetCount: document.querySelectorAll('[data-lab-control-group="target"] [aria-pressed="true"]').length,
    };
  });
  assert(compact.hostCss === "80px" && compact.shellCss === "60px", "Compact logical geometry changed");
  assert(compact.host.width === 240, `Compact Auto must cap at 3x (was ${compact.host.width})`);
  assert(compact.canvasCount === 0, "Compact introduced a canvas");
  assert(compact.originMarkerVisible === false, "Origin marker visible on Compact");
  assert(compact.selectedScenarioCount === 1 && compact.selectedTargetCount === 1, "Compact selection ambiguous");
  await page.screenshot({ path: path.join(ARTIFACTS, "final-layout-repair-compact.png"), fullPage: true });

  assert(errors.length === 0, `Browser errors: ${JSON.stringify(errors)}`);
  const result = {
    status: "PASS",
    shell,
    keyboardFocus,
    environment,
    exportSize,
    labelDuring,
    labelIdle,
    compact,
    errors,
  };
  fs.writeFileSync(
    path.join(ARTIFACTS, "browser-final-repair-result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
