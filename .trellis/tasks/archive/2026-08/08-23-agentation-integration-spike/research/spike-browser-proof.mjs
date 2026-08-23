import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const evidenceName = process.argv[2] ?? "browser-proof";
const taskRoot = resolve(".trellis/tasks/08-23-agentation-integration-spike");
const evidenceDir = resolve(taskRoot, "research/evidence");
await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const report = {
  evidenceName,
  browser: await browser.version(),
  viewport: page.viewportSize(),
  consoleErrors: [],
  toolbar: {},
  full: {},
  controls: {},
  sharedDom: {},
  compact: {},
};

page.on("console", (message) => {
  if (message.type() === "error") report.consoleErrors.push(message.text());
});
page.on("pageerror", (error) => report.consoleErrors.push(error.message));

const rectOf = async (locator) => {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error(`Missing rectangle for ${await locator.evaluate((node) => node.outerHTML.slice(0, 160))}`);
  return Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, Math.round(value * 100) / 100]));
};

const describeAt = async (x, y) => page.evaluate(({ x, y }) => {
  const describe = (element) => ({
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    classes: typeof element.className === "string" ? element.className : null,
    data: Object.fromEntries(Object.entries(element.dataset)),
    title: element.getAttribute("title"),
    role: element.getAttribute("role"),
    text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
  });
  return document.elementsFromPoint(x, y)
    .filter((element) => !element.closest("[data-agentation-root]"))
    .slice(0, 5)
    .map(describe);
}, { x, y });

const annotationStorage = async () => page.evaluate(() => {
  const raw = localStorage.getItem(`feedback-annotations-${location.pathname}`);
  return raw ? JSON.parse(raw) : [];
});

const markerRect = async () => {
  const marker = page.locator('[data-lab-chrome=""]').first();
  return await marker.count() ? await rectOf(marker) : null;
};

const placementSnapshot = async () => page.evaluate(() => {
  const stage = document.querySelector("[data-lab-stage-viewport]");
  const controls = document.querySelector("[data-lab-preview-controls]");
  const toolbar = document.querySelector("[data-agentation-toolbar]");
  const devtools = document.querySelector("[data-lab-devtools]");
  if (!(stage instanceof HTMLElement)
    || !(controls instanceof HTMLElement)
    || !(toolbar instanceof HTMLElement)
    || !(devtools instanceof HTMLElement)) return null;
  const roundRect = (element) => {
    const rect = element.getBoundingClientRect();
    return Object.fromEntries(["x", "y", "width", "height", "right", "bottom"]
      .map((key) => [key, Math.round(rect[key] * 100) / 100]));
  };
  const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const stageRect = stage.getBoundingClientRect();
  const controlsRect = controls.getBoundingClientRect();
  const toolbarRect = toolbar.getBoundingClientRect();
  const devtoolsRect = devtools.getBoundingClientRect();
  return {
    stage: roundRect(stage),
    controls: roundRect(controls),
    toolbar: roundRect(toolbar),
    devtools: roundRect(devtools),
    controlsInset: {
      left: Math.round((controlsRect.left - stageRect.left) * 100) / 100,
      bottom: Math.round((stageRect.bottom - controlsRect.bottom) * 100) / 100,
    },
    toolbarInset: {
      right: Math.round((stageRect.right - toolbarRect.right) * 100) / 100,
      bottom: Math.round((stageRect.bottom - toolbarRect.bottom) * 100) / 100,
    },
    toolbarDevtoolsOverlapArea: overlap(toolbarRect, devtoolsRect),
    controlsToolbarOverlapArea: overlap(controlsRect, toolbarRect),
  };
});

const activate = async () => {
  const collapsed = page.locator('[data-agentation-toolbar] [title="Start feedback mode"]');
  if (await collapsed.count()) {
    await collapsed.click();
  }
  await page.locator('[data-agentation-root] div[class*="overlay"]').waitFor({ state: "attached" });
};

const deactivate = async () => {
  if (await page.locator('[data-agentation-toolbar] [title="Start feedback mode"]').count()) return;
  const popup = page.locator("[data-annotation-popup]");
  if (await popup.count()) {
    await popup.locator("button").filter({ hasText: "Cancel" }).click();
    await popup.waitFor({ state: "detached" });
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await page.locator('[data-agentation-toolbar] [title="Start feedback mode"]').count()) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(220);
  }
  await page.locator('[data-agentation-toolbar] [title="Start feedback mode"]').waitFor();
};

const hoverProbe = async (selector) => {
  const target = page.locator(selector).first();
  const targetRect = await rectOf(target);
  const center = {
    x: targetRect.x + targetRect.width / 2,
    y: targetRect.y + targetRect.height / 2,
  };
  await page.mouse.move(center.x, center.y);
  await page.waitForTimeout(140);
  const highlight = page.locator('[data-agentation-root] div[class*="hoverHighlight"]').first();
  const highlightRect = await highlight.count() ? await rectOf(highlight) : null;
  const tooltip = page.locator('[data-agentation-root] div[class*="hoverTooltip"]').first();
  return {
    targetRect,
    highlightRect,
    delta: highlightRect ? {
      x: Math.round((highlightRect.x - targetRect.x) * 100) / 100,
      y: Math.round((highlightRect.y - targetRect.y) * 100) / 100,
      width: Math.round((highlightRect.width - targetRect.width) * 100) / 100,
      height: Math.round((highlightRect.height - targetRect.height) * 100) / 100,
    } : null,
    tooltip: await tooltip.count() ? (await tooltip.innerText()).trim().replace(/\s+/g, " ") : null,
    nativeTargets: await describeAt(center.x, center.y),
  };
};

const addPointAnnotation = async (selector, comment, position = { x: 0.5, y: 0.5 }) => {
  const target = page.locator(selector).first();
  const targetRect = await rectOf(target);
  const beforeOrigin = await markerRect();
  await page.mouse.click(
    targetRect.x + targetRect.width * position.x,
    targetRect.y + targetRect.height * position.y,
  );
  await page.locator("[data-annotation-popup] textarea").waitFor();
  const pendingHeader = (await page.locator("[data-annotation-popup]").innerText()).trim().replace(/\s+/g, " ");
  const afterOrigin = await markerRect();
  await page.locator("[data-annotation-popup] textarea").fill(comment);
  await page.locator("[data-annotation-popup] button").filter({ hasText: "Add" }).click();
  await page.waitForTimeout(120);
  const annotations = await annotationStorage();
  return { beforeOrigin, afterOrigin, pendingHeader, annotation: annotations.at(-1) ?? null };
};

const addAreaAnnotation = async (selector, comment) => {
  const targetRect = await rectOf(page.locator(selector).first());
  const start = { x: targetRect.x + 20, y: targetRect.y + 20 };
  const end = { x: start.x + Math.min(48, targetRect.width / 4), y: start.y + Math.min(48, targetRect.height / 4) };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await page.locator("[data-annotation-popup] textarea").waitFor();
  const pendingHeader = (await page.locator("[data-annotation-popup]").innerText()).trim().replace(/\s+/g, " ");
  await page.locator("[data-annotation-popup] textarea").fill(comment);
  await page.locator("[data-annotation-popup] button").filter({ hasText: "Add" }).click();
  await page.waitForTimeout(120);
  const annotations = await annotationStorage();
  return { drag: { start, end }, pendingHeader, annotation: annotations.at(-1) ?? null };
};

const copyFeedback = async () => {
  await page.keyboard.press("c");
  await page.waitForTimeout(120);
  return page.evaluate(() => navigator.clipboard.readText());
};

const clearFeedback = async () => {
  await page.keyboard.press("x");
  await page.waitForTimeout(260);
};

const clickScale = async (text) => {
  await deactivate();
  const buttons = page.locator('[data-lab-control-group="scale"] button');
  const fixedIndex = text === "Auto" ? 0 : text.startsWith("1") ? 1 : text.startsWith("2") ? 2 : text.startsWith("3") ? 3 : -1;
  if (fixedIndex >= 0) {
    const button = buttons.nth(fixedIndex);
    await button.click();
    await page.waitForTimeout(140);
    return (await button.innerText()).trim();
  }
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if ((await button.innerText()).includes(text)) {
      await button.click();
      await page.waitForTimeout(140);
      return (await button.innerText()).trim();
    }
  }
  throw new Error(`Scale control not found: ${text}`);
};

const clickTarget = async (text) => {
  await deactivate();
  const buttons = page.locator('[data-lab-control-group="target"] button');
  if (text === "Compact") {
    const button = buttons.nth(1);
    await button.click();
    await page.waitForTimeout(140);
    return (await button.innerText()).trim();
  }
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if ((await button.innerText()).toLowerCase().includes(text.toLowerCase())) {
      await button.click();
      await page.waitForTimeout(140);
      return (await button.innerText()).trim();
    }
  }
  throw new Error(`Target control not found: ${text}`);
};

try {
  await page.goto("http://127.0.0.1:1421/lab.html", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("[data-lab-workspace]").waitFor();
  await page.locator("[data-agentation-toolbar]").waitFor();

  const toolbar = page.locator("[data-agentation-toolbar]");
  report.toolbar.wrapperRect = await rectOf(toolbar);
  report.toolbar.collapsedRect = await rectOf(page.locator('[data-agentation-toolbar] [title="Start feedback mode"]'));
  report.toolbar.initialPlacement = await placementSnapshot();
  report.toolbar.placement = await page.evaluate(() => {
    const toolbar = document.querySelector('[data-agentation-toolbar] [title="Start feedback mode"]');
    const devtools = document.querySelector("[data-lab-devtools]");
    const workspace = document.querySelector("[data-lab-workspace]");
    if (!(toolbar instanceof HTMLElement) || !(devtools instanceof HTMLElement) || !(workspace instanceof HTMLElement)) return null;
    const t = toolbar.getBoundingClientRect();
    const d = devtools.getBoundingClientRect();
    const w = workspace.getBoundingClientRect();
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return {
      viewportGapRight: innerWidth - t.right,
      viewportGapBottom: innerHeight - t.bottom,
      devtoolsOverlapArea: overlap(t, d),
      workspaceOverlapArea: overlap(t, w),
      underlying: (() => {
        const element = document.elementsFromPoint(t.left + t.width / 2, t.top + t.height / 2)
          .find((candidate) => !candidate.closest("[data-agentation-root]"));
        return element ? { tag: element.tagName.toLowerCase(), data: Object.fromEntries(Object.entries(element.dataset)), text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100) } : null;
      })(),
    };
  });
  await page.locator('[data-lab-env-trigger]').click();
  const menu = page.locator('[role="listbox"]');
  await menu.waitFor();
  report.controls.openMenu = {
    menuRect: await rectOf(menu),
    triggerRect: await rectOf(page.locator('[data-lab-env-trigger]')),
    resetRect: await rectOf(page.locator('[data-lab-reset=""]')),
    overlapArea: await page.evaluate(() => {
      const menuElement = document.querySelector('[role="listbox"]');
      const resetElement = document.querySelector('[data-lab-reset=""]');
      if (!(menuElement instanceof HTMLElement) || !(resetElement instanceof HTMLElement)) return null;
      const menuRect = menuElement.getBoundingClientRect();
      const resetRect = resetElement.getBoundingClientRect();
      return Math.max(0, Math.min(menuRect.right, resetRect.right) - Math.max(menuRect.left, resetRect.left))
        * Math.max(0, Math.min(menuRect.bottom, resetRect.bottom) - Math.max(menuRect.top, resetRect.top));
    }),
  };
  await page.screenshot({
    path: resolve(evidenceDir, `${evidenceName}-left-controls.png`),
    clip: { x: 40, y: 628, width: 184, height: 154 },
  });
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  await page.screenshot({
    path: resolve(evidenceDir, `${evidenceName}-agentation-toolbar.png`),
    clip: { x: 674, y: 710, width: 373, height: 72 },
  });

  report.controls.scaleLabels = await page.locator('[data-lab-control-group="scale"] button').allInnerTexts();
  report.controls.targetLabels = await page.locator('[data-lab-control-group="target"] button').allInnerTexts();

  for (const [key, control] of [["one", "1×"], ["auto", "Auto"], ["three", "3×"]]) {
    const selectedLabel = await clickScale(control);
    await activate();
    report.full[key] = { selectedLabel, ...(await hoverProbe('[data-lab-preview-frame]')) };
    if (key === "one") {
      await page.screenshot({
        path: resolve(evidenceDir, `${evidenceName}-agentation-expanded.png`),
        clip: { x: 674, y: 698, width: 373, height: 84 },
      });
    }
    if (key === "three") {
      const frame = report.full[key].targetRect;
      await page.screenshot({
        path: resolve(evidenceDir, `${evidenceName}-full-3x-outline.png`),
        clip: {
          x: Math.max(0, frame.x - 24),
          y: Math.max(0, frame.y - 44),
          width: Math.min(1440 - Math.max(0, frame.x - 24), frame.width + 48),
          height: Math.min(1000 - Math.max(0, frame.y - 44), frame.height + 68),
        },
      });
    }
  }
  report.toolbar.afterFullScaleChanges = await placementSnapshot();

  await clickScale("Auto");
  await activate();
  report.full.pointAnnotation = await addPointAnnotation(
    '[data-lab-preview-frame]',
    "full frame proof",
    { x: 0.25, y: 0.3 },
  );
  report.full.pointCopy = await copyFeedback();
  await clearFeedback();
  report.full.areaAnnotation = await addAreaAnnotation('[data-lab-preview-frame]', "full area proof");
  report.full.areaCopy = await copyFeedback();
  report.full.drawToolbarVisible = (await page.locator('[data-agentation-root]').innerText()).includes("Draw mode");
  await clearFeedback();
  await deactivate();

  report.controls.annotationModeBlocking = await (async () => {
    const trigger = page.locator('[data-lab-env-trigger]');
    const before = await trigger.getAttribute("aria-expanded");
    await activate();
    await trigger.click();
    await page.locator("[data-annotation-popup]").waitFor();
    const during = await trigger.getAttribute("aria-expanded");
    await page.locator("[data-annotation-popup] button").filter({ hasText: "Cancel" }).click();
    await page.locator("[data-annotation-popup]").waitFor({ state: "detached" });
    await deactivate();
    await trigger.click();
    const after = await trigger.getAttribute("aria-expanded");
    const optionCount = await page.locator('[role="listbox"] [role="option"]').count();
    await page.keyboard.press("Escape");
    return { before, during, after, optionCount };
  })();

  report.controls.resetModeRecovery = await (async () => {
    const frame = await rectOf(page.locator('[data-lab-preview-frame]'));
    await page.mouse.click(frame.x + frame.width * 0.72, frame.y + frame.height * 0.68);
    await page.waitForTimeout(100);
    const changedOrigin = await markerRect();
    await activate();
    await page.locator('[data-lab-reset=""]').click();
    await page.locator("[data-annotation-popup]").waitFor();
    const blockedOrigin = await markerRect();
    await page.locator("[data-annotation-popup] button").filter({ hasText: "Cancel" }).click();
    await page.locator("[data-annotation-popup]").waitFor({ state: "detached" });
    await deactivate();
    await page.locator('[data-lab-reset=""]').click();
    await page.waitForTimeout(100);
    const resetOrigin = await markerRect();
    return { changedOrigin, blockedOrigin, resetOrigin };
  })();

  await page.locator('[data-lab-preset="download-active"]').click();
  await page.waitForTimeout(180);
  const previewButtons = page.locator('[data-lab-preview-frame] button');
  report.sharedDom.previewButtons = await previewButtons.evaluateAll((buttons) => buttons.map((button) => ({
    text: (button.textContent || "").trim(),
    title: button.getAttribute("title"),
    ariaLabel: button.getAttribute("aria-label"),
  })));
  await previewButtons.first().click();
  await page.locator('[data-panel-double-click="ignore"]').waitFor();
  const queueTarget = page.locator('[data-panel-double-click="ignore"] span[title]').first();
  report.sharedDom.queueTargetRect = await rectOf(queueTarget);
  await activate();
  report.sharedDom.queueHover = await hoverProbe('[data-panel-double-click="ignore"] span[title]');
  report.sharedDom.queueAnnotation = await addPointAnnotation('[data-panel-double-click="ignore"] span[title]', "queue row proof");
  report.sharedDom.queueCopy = await copyFeedback();
  await clearFeedback();
  await deactivate();
  report.sharedDom.queueRecovered = await page.locator('[data-panel-double-click="ignore"]').count();
  await previewButtons.first().click();
  await page.waitForTimeout(180);

  await page.locator('[data-lab-preset="mixed-busy"]').click();
  await page.waitForTimeout(180);
  const runtimeSelector = '[data-lab-preview-frame] [data-panel-double-click="ignore"] > [title]';
  const runtimeTarget = page.locator(runtimeSelector).last();
  const visibleRuntimeEntry = await runtimeTarget.count();
  const injectedExistingFixture = visibleRuntimeEntry === 0
    ? await page.evaluate(() => {
        const workspace = document.querySelector("[data-lab-workspace]");
        if (!(workspace instanceof HTMLElement)) return false;
        const key = Object.keys(workspace).find((candidate) => candidate.startsWith("__reactFiber$"));
        if (!key) return false;
        let fiber = workspace[key];
        while (fiber && fiber.type?.name !== "PresentationLab") fiber = fiber.return;
        let hook = fiber?.memoizedState;
        while (hook) {
          if (hook.memoizedState === "mixed-busy" && typeof hook.queue?.dispatch === "function") {
            hook.queue.dispatch("runtime-auto-config");
            return true;
          }
          hook = hook.next;
        }
        return false;
      })
    : false;
  if (injectedExistingFixture) await page.waitForTimeout(180);
  report.sharedDom.runtimeAccess = {
    visibleRuntimeEntry: visibleRuntimeEntry > 0,
    injectedExistingFixture,
    note: visibleRuntimeEntry > 0
      ? "Runtime fixture was visible."
      : "The final scenario strip has no runtime entry; the browser proof switched the existing activeFixtureId hook to runtime-auto-config without changing source or layout.",
  };
  if (await runtimeTarget.count()) {
    const runtimeRoot = runtimeTarget.locator("..");
    await runtimeTarget.hover();
    await page.waitForTimeout(180);
    report.sharedDom.runtimeBefore = {
      reachable: true,
      targetRect: await rectOf(runtimeTarget),
      rootText: (await runtimeRoot.innerText()).trim().replace(/\s+/g, " "),
    };
    await activate();
    report.sharedDom.runtimeHover = await hoverProbe(runtimeSelector);
    report.sharedDom.runtimeAnnotation = await addPointAnnotation(
      runtimeSelector,
      "runtime control proof",
    );
    report.sharedDom.runtimeCopy = await copyFeedback();
    await clearFeedback();
    await deactivate();
    await runtimeTarget.hover();
    await page.waitForTimeout(180);
    report.sharedDom.runtimeAfter = {
      visible: await runtimeRoot.isVisible(),
      rootText: (await runtimeRoot.innerText()).trim().replace(/\s+/g, " "),
    };
  } else {
    report.sharedDom.runtimeBefore = {
      reachable: false,
      reason: "The final visible scenario strip exposes no runtime fixture; showRuntimeOverlay requires fixtureKind=runtime.",
    };
  }

  await clickTarget("Compact");
  await clickScale("3×");
  report.toolbar.afterCompactTargetChange = await placementSnapshot();
  await activate();
  report.compact.stage = await hoverProbe('[data-lab-compact-stage]');
  report.compact.shell = await hoverProbe('[data-lab-compact-shell]');
  report.compact.nativeCenterTargets = report.compact.shell.nativeTargets;
  await page.screenshot({
    path: resolve(evidenceDir, `${evidenceName}-compact-3x-outline.png`),
    clip: {
      x: Math.max(0, report.compact.shell.targetRect.x - 36),
      y: Math.max(0, report.compact.shell.targetRect.y - 56),
      width: report.compact.shell.targetRect.width + 360,
      height: report.compact.shell.targetRect.height + 92,
    },
  });
  report.compact.annotation = await addPointAnnotation('[data-lab-compact-shell]', "compact shell proof");
  report.compact.copy = await copyFeedback();
  await clearFeedback();

  report.compact.areaAnnotation = await addAreaAnnotation('[data-lab-compact-shell]', "compact area proof");
  report.compact.areaCopy = await copyFeedback();
  await clearFeedback();
  await deactivate();

  report.controls.resetRecovered = await (async () => {
    const reset = page.locator('[data-lab-reset=""]');
    const before = await reset.getAttribute("title");
    await reset.click();
    await page.waitForTimeout(120);
    return { title: before, stillVisible: await reset.isVisible() };
  })();
} catch (error) {
  report.failure = error instanceof Error ? { message: error.message, stack: error.stack } : String(error);
  throw error;
} finally {
  await writeFile(resolve(evidenceDir, `${evidenceName}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await browser.close();
}
