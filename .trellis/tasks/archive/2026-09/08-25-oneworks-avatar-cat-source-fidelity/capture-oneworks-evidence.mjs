import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const taskDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(taskDir, "../../..");
const buildDir = resolve(taskDir, "lab-build");
const evidenceDir = resolve(taskDir, "evidence");
const archiveFront = resolve(
  repoRoot,
  ".trellis/tasks/archive/2026-08/08-24-compact-mascot-ear-geometry-repair/research/evidence/final-neutral-front-1x.png",
);
const contentTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
};

const serveBuild = async () => {
  const server = createServer(async (request, response) => {
    const requestPath = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const relativePath = requestPath === "/" ? "lab.html" : decodeURIComponent(requestPath).replace(/^\/+/, "");
    const filePath = resolve(buildDir, relativePath);
    if (!filePath.startsWith(`${buildDir}${sep}`) && filePath !== buildDir) {
      response.writeHead(403).end();
      return;
    }
    try {
      const file = await stat(filePath);
      const body = await readFile(file.isDirectory() ? resolve(filePath, "lab.html") : filePath);
      response.writeHead(200, { "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream" }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Could not start the Lab evidence server.");
  return { server, url: `http://127.0.0.1:${address.port}/lab.html` };
};

const installWorkTracker = () => {
  const original = {
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    clearInterval: window.clearInterval.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    setInterval: window.setInterval.bind(window),
    setTimeout: window.setTimeout.bind(window),
  };
  const pending = { animationFrame: new Map(), interval: new Map(), timeout: new Map() };
  const track = (kind, handle) => pending[kind].set(handle, new Error(`${kind} scheduled`).stack);
  const untrack = (kind, handle) => pending[kind].delete(handle);
  const count = (kind) => pending[kind].size;

  window.requestAnimationFrame = (callback) => {
    let handle;
    handle = original.requestAnimationFrame((time) => {
      untrack("animationFrame", handle);
      callback(time);
    });
    track("animationFrame", handle);
    return handle;
  };
  window.cancelAnimationFrame = (handle) => {
    untrack("animationFrame", handle);
    original.cancelAnimationFrame(handle);
  };
  window.setTimeout = (callback, delay, ...args) => {
    let handle;
    handle = original.setTimeout(() => {
      untrack("timeout", handle);
      if (typeof callback === "function") callback(...args);
    }, delay);
    track("timeout", handle);
    return handle;
  };
  window.clearTimeout = (handle) => {
    untrack("timeout", handle);
    original.clearTimeout(handle);
  };
  window.setInterval = (callback, delay, ...args) => {
    const handle = original.setInterval(() => {
      if (typeof callback === "function") callback(...args);
    }, delay);
    track("interval", handle);
    return handle;
  };
  window.clearInterval = (handle) => {
    untrack("interval", handle);
    original.clearInterval(handle);
  };
  window.__oneWorksLabPendingWork = () => ({
    animationFrame: count("animationFrame"),
    interval: count("interval"),
    timeout: count("timeout"),
    total: count("animationFrame") + count("interval") + count("timeout"),
  });
};

const getSnapshot = (page) => page.evaluate(() => window.__oneWorksLabPendingWork());

const waitForSettlement = (page) => page.waitForTimeout(750);

const screenshot = (locator, filename) => locator.screenshot({ path: resolve(evidenceDir, filename) });

const makeComparisonSheet = async (browser, oneWorksFront) => {
  const [diamond, oneWorks] = await Promise.all([readFile(archiveFront), readFile(oneWorksFront)]);
  const page = await browser.newPage({ viewport: { width: 760, height: 258 } });
  await page.setContent(`
    <main id="sheet" style="box-sizing:border-box;width:760px;padding:14px 16px 12px;background:#201e25;color:#eeeeee;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
      <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#60a5fa">Lab-only source-fidelity comparison · no production adoption</div>
      <div style="display:flex;gap:28px;align-items:center;margin-top:10px">
        <section style="display:grid;grid-template-columns:120px minmax(0,1fr);gap:10px;align-items:center;width:350px">
          <img alt="Approved diamond-ear baseline" src="data:image/png;base64,${diamond.toString("base64")}" style="display:block;width:120px;height:120px" />
          <div><strong style="font-size:12px">Approved diamond-ear baseline</strong><div style="margin-top:4px;font-size:10px;line-height:1.35;color:#aaa">Archived neutral/front 1× evidence. Frozen Compact result.</div></div>
        </section>
        <section style="display:grid;grid-template-columns:120px minmax(0,1fr);gap:10px;align-items:center;width:350px">
          <img alt="OneWorks true 60 pixel front" src="data:image/png;base64,${oneWorks.toString("base64")}" style="display:block;width:120px;height:120px;image-rendering:auto" />
          <div><strong style="font-size:12px">OneWorks front</strong><div style="margin-top:4px;font-size:10px;line-height:1.35;color:#aaa">Direct upstream Avatar at true 60 CSS px, enlarged only for review.</div></div>
        </section>
      </div>
      <p style="margin:10px 0 0;font-size:10px;line-height:1.35;color:#aaa">Comparison limit: the archived baseline provides neutral/front evidence only, not a pose-matched sweep.</p>
    </main>
  `);
  await page.locator("#sheet").screenshot({ path: resolve(evidenceDir, "oneworks-vs-approved-diamond-front-comparison.png") });
  await page.close();
};

const main = async () => {
  const { server, url } = await serveBuild();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1680, height: 1080 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(installWorkTracker);

  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await waitForSettlement(page);
    const labBaseline = await getSnapshot(page);
    await page.getByRole("button", { name: "OneWorks Mascot Inspector", exact: true }).click();
    await page.locator("[data-oneworks-mascot-inspector]").waitFor();
    await waitForSettlement(page);

    const pointerAdapter = page.locator("[data-oneworks-pointer-adapter]");
    const mechanismPreview = page.locator("[data-oneworks-mechanism-preview]");
    const poseControls = page.locator("[data-oneworks-pose-controls]");
    const frontPreview = await screenshot(pointerAdapter, "oneworks-front-60-magnified.png");
    const true60Path = resolve(evidenceDir, "oneworks-true-60-front.png");
    await page.locator("[data-oneworks-avatar-60]").screenshot({ path: true60Path });
    await screenshot(page.locator("[data-oneworks-sweep-sheet]"), "oneworks-pose-sweep-sheet.png");

    for (const [name, label] of [["yaw", "Yaw +55°"], ["pitch", "Pitch −28°"], ["tangent", "Tangent +90°"]]) {
      await poseControls.getByRole("button", { name: label, exact: true }).click();
      await page.waitForTimeout(100);
      await screenshot(mechanismPreview, `oneworks-${name}-60-magnified.png`);
    }

    const pointerRect = await pointerAdapter.evaluate((element) => {
      const { x, y } = element.getBoundingClientRect();
      return { x, y };
    });
    await pointerAdapter.dispatchEvent("pointermove", { clientX: pointerRect.x + 72.5, clientY: pointerRect.y + 48 });
    await page.waitForTimeout(100);
    const pointerPreview = await screenshot(pointerAdapter, "oneworks-pointer-follow.png");
    const pointerReadout = await page.locator("[data-oneworks-attention-readout]").textContent();
    assert.ok(pointerReadout && !pointerReadout.includes("candidate pose 0.000, 0.000"), `pointer sample stayed neutral: ${pointerReadout}`);
    assert.notDeepEqual(pointerPreview, frontPreview, `pointer sample did not change the candidate preview: ${pointerReadout}`);

    await poseControls.getByRole("button", { name: "Front", exact: true }).click();
    const baseline = await getSnapshot(page);
    await page.getByRole("button", { name: "Play sweep", exact: true }).click();
    await page.waitForTimeout(350);
    const playback = await getSnapshot(page);

    const reducedMotionInput = page.getByLabel("Reduced Motion: static canonical candidate", { exact: true });
    await reducedMotionInput.check();
    await waitForSettlement(page);
    const reducedMotion = await getSnapshot(page);
    await screenshot(pointerAdapter, "oneworks-reduced-motion.png");

    const editorHost = page.locator("[data-oneworks-editor-host]");
    await editorHost.scrollIntoViewIfNeeded();
    await screenshot(editorHost, "oneworks-editor-geometry-presets.png");

    const playbackControl = page.getByLabel("Open animation editor", { exact: true });
    if (await playbackControl.count() === 0) throw new Error("The upstream editor Animation control was not found.");
    await playbackControl.click();
    const playbackPanel = page.locator(".oneworks-avatar-editor button").filter({ hasText: "Playback" }).last();
    await playbackPanel.click();
    const yawSweep = page.getByText("Yaw sweep", { exact: true });
    await yawSweep.waitFor();
    await yawSweep.scrollIntoViewIfNeeded();
    await screenshot(page.locator(".avatar-animation-panel"), "oneworks-editor-animation.png");

    const unmount = page.getByRole("button", { name: "Unmount inspector", exact: true });
    await unmount.scrollIntoViewIfNeeded();
    await unmount.click();
    await waitForSettlement(page);
    const unmounted = await getSnapshot(page);
    await screenshot(page.locator("[data-oneworks-lifecycle]"), "oneworks-unmount-lifecycle.png");

    await page.getByRole("button", { name: "Remount inspector", exact: true }).click();
    await waitForSettlement(page);
    const remounted = await getSnapshot(page);
    await screenshot(page.locator("[data-oneworks-lifecycle]"), "oneworks-remount-lifecycle.png");
    await makeComparisonSheet(browser, true60Path);

    const inspectorWorkSettled = (snapshot) => (
      snapshot.animationFrame === 0
      && snapshot.timeout === 0
      && snapshot.interval === labBaseline.interval
    );

    const lifecycle = {
      schemaVersion: 1,
      sampledAt: new Date().toISOString(),
      instrumentation: "requestAnimationFrame, setTimeout, and setInterval wrapped before Lab code loaded",
      snapshots: { labBaseline, baseline, playback, reducedMotion, unmounted, remounted },
      residualAfterReducedMotion: "one pre-existing Lab dev-tool interval",
      residualAfterUnmount: "one pre-existing Lab dev-tool interval",
      inspectorWorkSettledAfterReducedMotion: inspectorWorkSettled(reducedMotion),
      inspectorWorkSettledAfterUnmount: inspectorWorkSettled(unmounted),
      pageErrors,
    };
    await writeFile(resolve(evidenceDir, "oneworks-lifecycle-settlement.json"), `${JSON.stringify(lifecycle, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(lifecycle)}\n`);
    if (pageErrors.length > 0) throw new Error(`Browser page errors: ${pageErrors.join(" | ")}`);
  } finally {
    await context.close();
    await browser.close();
    await new Promise((close) => server.close(close));
  }
};

await main();
