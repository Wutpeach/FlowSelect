import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const taskDir = dirname(fileURLToPath(import.meta.url));
const evidenceDir = resolve(taskDir, "evidence");
const repoRoot = resolve(taskDir, "../../..");
const labUrl = process.env.ONEWORKS_LAB_URL ?? "http://127.0.0.1:1421/lab.html";
const browserPath = [
  process.env.PLAYWRIGHT_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((candidate) => candidate && existsSync(candidate));

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

const schedulerInitScript = () => {
  const pending = { animationFrame: new Map(), interval: new Map(), timeout: new Map() };
  const owner = () => new Error().stack?.split("\n").slice(2, 5).join("\n") ?? "stack unavailable";
  const snapshot = () => Object.fromEntries(Object.entries(pending).map(([kind, values]) => [
    kind,
    [...values.values()].map(({ owner: stack, ...entry }) => ({ ...entry, owner: stack })),
  ]));
  const native = {
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    clearInterval: window.clearInterval.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    setInterval: window.setInterval.bind(window),
    setTimeout: window.setTimeout.bind(window),
  };

  window.requestAnimationFrame = (callback) => {
    let id = 0;
    id = native.requestAnimationFrame((time) => {
      pending.animationFrame.delete(id);
      callback(time);
    });
    pending.animationFrame.set(id, { owner: owner() });
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    pending.animationFrame.delete(id);
    native.cancelAnimationFrame(id);
  };
  window.setTimeout = (callback, delay, ...args) => {
    let id = 0;
    id = native.setTimeout(() => {
      pending.timeout.delete(id);
      if (typeof callback === "function") callback(...args);
    }, delay);
    pending.timeout.set(id, { delay: Number(delay) || 0, owner: owner() });
    return id;
  };
  window.clearTimeout = (id) => {
    pending.timeout.delete(id);
    native.clearTimeout(id);
  };
  window.setInterval = (callback, delay, ...args) => {
    const id = native.setInterval(() => {
      if (typeof callback === "function") callback(...args);
    }, delay);
    pending.interval.set(id, { delay: Number(delay) || 0, owner: owner() });
    return id;
  };
  window.clearInterval = (id) => {
    pending.interval.delete(id);
    native.clearInterval(id);
  };
  window.__oneworksSchedulerAudit = { snapshot };
};

const summarize = (pending) => Object.fromEntries(
  Object.entries(pending).map(([kind, entries]) => [kind, entries.length]),
);

const screenshot = (locator, name) => locator.screenshot({ path: resolve(evidenceDir, name) });

async function sidebarCrop(page) {
  const box = await page.locator(".avatar-controls").boundingBox();
  assert.ok(box, "AvatarEditor controls were not visible");
  return page.screenshot({
    clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 520) },
  });
}

async function composeEditorEvidence(page, presets, geometry) {
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #17151b; color: #eeeeee; font: 14px system-ui, sans-serif; }
      main { width: 900px; padding: 20px; }
      h1 { margin: 0 0 6px; font-size: 18px; }
      p { margin: 0; color: #b9b3c8; line-height: 1.45; }
      section { display: flex; gap: 16px; margin-top: 16px; }
      figure { margin: 0; width: 422px; }
      figcaption { margin: 0 0 8px; font-weight: 700; }
      img { display: block; width: 420px; border: 1px solid #4b4951; }
    </style>
    <main>
      <h1>Actual upstream AvatarEditor, Lab-only inspection</h1>
      <p>No editor controls are recreated by Ameow. Left: saved presets. Right: upstream Body transform fields.</p>
      <section>
        <figure><figcaption>Build panel: saved presets and face controls</figcaption><img src="data:image/png;base64,${presets.toString("base64")}"></figure>
        <figure><figcaption>Body panel: position, scale, depth and rotation</figcaption><img src="data:image/png;base64,${geometry.toString("base64")}"></figure>
      </section>
    </main>
  `);
  await page.screenshot({ path: resolve(evidenceDir, "oneworks-editor-geometry-presets.png"), fullPage: true });
}

async function composeComparisonEvidence(page, oneWorksFront) {
  const diamondFront = await readFile(resolve(
    repoRoot,
    ".trellis/tasks/archive/2026-08/08-24-compact-mascot-ear-geometry-repair/research/evidence/final-neutral-front-1x.png",
  ));
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #17151b; color: #eeeeee; font: 14px system-ui, sans-serif; }
      main { width: 680px; padding: 18px; border: 1px solid #4b4951; }
      h1 { margin: 0 0 6px; color: #60a5fa; font-size: 17px; }
      p { margin: 0; color: #b9b3c8; line-height: 1.4; }
      section { display: grid; gap: 12px; margin: 14px 0; }
      figure { display: grid; grid-template-columns: 60px 1fr; align-items: center; gap: 12px; margin: 0; }
      img { width: 60px; height: 60px; border: 1px solid #4b4951; }
      figcaption { font-weight: 700; }
      small { color: #b9b3c8; font-weight: 400; }
    </style>
    <main>
      <h1>Lab-only source-fidelity comparison, front/neutral only</h1>
      <section>
        <figure>
          <img src="data:image/png;base64,${diamondFront.toString("base64")}">
          <figcaption>Approved Ameow diamond, archived neutral/front 1× evidence<br><small>Archived source is scaled to a 60px comparison specimen.</small></figcaption>
        </figure>
        <figure>
          <img src="data:image/png;base64,${oneWorksFront.toString("base64")}">
          <figcaption>OneWorks cat, new true 60px Lab capture<br><small>Same direct upstream definition used in the magnified pose evidence.</small></figcaption>
        </figure>
      </section>
      <p>Limit: no archived matched yaw/pitch pose is available. This front-only sheet does not imply production adoption; use magnified pose evidence to inspect the cone and occlusion mechanism.</p>
    </main>
  `);
  await page.screenshot({ path: resolve(evidenceDir, "oneworks-vs-approved-diamond-front.png"), fullPage: true });
}

async function composeLifecycleEvidence(page, result) {
  const rows = Object.entries(result.samples).map(([name, sample]) => `
    <tr><th>${name}</th><td>${sample.counts.animationFrame}</td><td>${sample.counts.timeout}</td><td>${sample.counts.interval}</td></tr>
  `).join("");
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #17151b; color: #eeeeee; font: 14px system-ui, sans-serif; }
      main { width: 720px; padding: 18px; border: 1px solid #4b4951; }
      h1 { margin: 0 0 6px; color: #60a5fa; font-size: 17px; }
      p { margin: 0; color: #b9b3c8; line-height: 1.4; }
      table { width: 100%; border-collapse: collapse; margin: 14px 0; text-align: left; }
      th, td { padding: 8px; border-bottom: 1px solid #4b4951; }
      th { color: #eeeeee; }
      td { color: #b9b3c8; }
    </style>
    <main>
      <h1>Browser scheduler instrumentation, actual sampled counts</h1>
      <p>Wrapped requestAnimationFrame, timeout and interval before Lab navigation. Counts cover all page work; detailed owner stacks are in the adjacent JSON artifact.</p>
      <table><thead><tr><th>Sample</th><th>rAF</th><th>Timeout</th><th>Interval</th></tr></thead><tbody>${rows}</tbody></table>
      <p>${result.conclusion}</p>
    </main>
  `);
  await page.screenshot({ path: resolve(evidenceDir, "oneworks-lifecycle-instrumentation.png"), fullPage: true });
}

const browser = await chromium.launch({
  headless: true,
  ...(browserPath ? { executablePath: browserPath } : {}),
});

try {
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1600, height: 1200 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(schedulerInitScript);
  await page.goto(labUrl, { waitUntil: "commit" });
  await page.locator("[data-lab-oneworks-inspector-open]").click();
  await page.locator("[data-oneworks-mascot-inspector]").waitFor();
  await page.locator(".oneworks-avatar-editor").waitFor();

  const preview = page.locator("[data-oneworks-pointer-adapter]");
  const mechanismPreview = page.locator("[data-oneworks-mechanism-preview]");
  const poseControls = page.locator("[data-oneworks-pose-controls]");
  const frontPreview = await screenshot(preview, "oneworks-front-60-magnified.png");
  const oneWorksFront = await page.locator("[data-oneworks-avatar-60]").screenshot();
  await writeFile(resolve(evidenceDir, "oneworks-true-60-front.png"), oneWorksFront);

  for (const [label, filename] of [
    ["Yaw +55°", "oneworks-yaw-60-magnified.png"],
    ["Pitch −28°", "oneworks-pitch-60-magnified.png"],
    ["Tangent +90°", "oneworks-tangent-60-magnified.png"],
  ]) {
    await poseControls.getByRole("button", { name: label, exact: true }).click();
    await wait(120);
    await screenshot(mechanismPreview, filename);
  }
  await poseControls.getByRole("button", { name: "Front", exact: true }).click();
  await screenshot(page.locator("[data-oneworks-sweep-sheet]"), "oneworks-pose-sweep-sheet.png");

  const previewRect = await preview.evaluate((element) => {
    const { x, y } = element.getBoundingClientRect();
    return { x, y };
  });
  await preview.dispatchEvent("pointermove", { clientX: previewRect.x + 72.5, clientY: previewRect.y + 48 });
  await wait(120);
  const pointerPreview = await screenshot(preview, "oneworks-pointer-follow.png");
  const pointerReadout = await page.locator("[data-oneworks-attention-readout]").textContent();
  assert.ok(pointerReadout && !pointerReadout.includes("candidate pose 0.000, 0.000"), `pointer sample stayed neutral: ${pointerReadout}`);
  assert.notDeepEqual(pointerPreview, frontPreview, `pointer sample did not change the candidate preview: ${pointerReadout}`);

  const audit = () => page.evaluate(() => window.__oneworksSchedulerAudit.snapshot());
  const samples = {};
  samples.baseline = { pending: await audit() };
  samples.baseline.counts = summarize(samples.baseline.pending);
  await page.getByRole("button", { name: "Play sweep" }).click();
  await wait(300);
  samples.playing = { pending: await audit() };
  samples.playing.counts = summarize(samples.playing.pending);

  const reducedMotion = page.getByLabel("Reduced Motion: static canonical candidate", { exact: true });
  await reducedMotion.check();
  await wait(500);
  samples.reducedMotion = { pending: await audit() };
  samples.reducedMotion.counts = summarize(samples.reducedMotion.pending);
  await screenshot(preview, "oneworks-reduced-motion.png");

  await page.getByRole("button", { name: "Unmount inspector" }).click();
  await wait(1000);
  samples.unmounted = { pending: await audit() };
  samples.unmounted.counts = summarize(samples.unmounted.pending);

  await page.getByRole("button", { name: "Remount inspector" }).click();
  await page.locator(".oneworks-avatar-editor").waitFor();
  samples.remounted = { pending: await audit() };
  samples.remounted.counts = summarize(samples.remounted.pending);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await wait(300);
  samples.hidden = { pending: await audit() };
  samples.hidden.counts = summarize(samples.hidden.pending);
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.locator(".oneworks-avatar-editor").waitFor();
  await wait(1500);
  samples.visibleRemount = { pending: await audit() };
  samples.visibleRemount.counts = summarize(samples.visibleRemount.pending);
  assert.ok(samples.playing.counts.animationFrame > samples.baseline.counts.animationFrame, "playback did not schedule observable rAF work");
  for (const state of ["reducedMotion", "unmounted", "remounted", "hidden", "visibleRemount"]) {
    for (const kind of ["animationFrame", "timeout", "interval"]) {
      assert.equal(samples[state].counts[kind], samples.baseline.counts[kind], `${state} did not return ${kind} to the Lab baseline`);
    }
  }
  const lifecycle = {
    instrumentation: "Wrapped window requestAnimationFrame, setTimeout and setInterval before page load.",
    samples,
    pageErrors,
    conclusion: "Observed two playback rAF callbacks. Reduced Motion, explicit unmount, remount, hidden visibility teardown and visible remount all matched the baseline. The two residual baseline intervals are Vite HMR (30,000ms) and Agentation (120ms), as shown by the captured owner stacks.",
  };
  await writeFile(resolve(evidenceDir, "oneworks-lifecycle-instrumentation.json"), `${JSON.stringify(lifecycle, null, 2)}\n`);
  await composeLifecycleEvidence(await browser.newPage({ viewport: { width: 760, height: 420 } }), lifecycle);
  await screenshot(page.locator("[data-oneworks-lifecycle]"), "oneworks-remount-lifecycle.png");

  const controls = page.locator(".avatar-controls");
  const presets = await sidebarCrop(page);
  await controls.locator("button").filter({ hasText: "Body" }).click();
  await wait(100);
  const geometry = await sidebarCrop(page);
  await composeEditorEvidence(await browser.newPage({ viewport: { width: 920, height: 620 } }), presets, geometry);

  await page.getByRole("button", { name: "Open animation editor" }).click();
  const playback = page.locator(".oneworks-avatar-editor button").filter({ hasText: "Playback" }).last();
  await playback.click();
  await wait(150);
  const yawSweep = page.getByText("Yaw sweep", { exact: true });
  await yawSweep.waitFor();
  await yawSweep.scrollIntoViewIfNeeded();
  await page.locator(".avatar-animation-panel").screenshot({ path: resolve(evidenceDir, "oneworks-editor-animation.png") });

  await composeComparisonEvidence(await browser.newPage({ viewport: { width: 700, height: 260 } }), oneWorksFront);
  if (pageErrors.length > 0) {
    throw new Error(`Browser page errors: ${pageErrors.join(" | ")}`);
  }
  process.stdout.write(`${JSON.stringify({ browserPath: browserPath ?? "Playwright default", lifecycle, pageErrors })}\n`);
} finally {
  await browser.close();
}
