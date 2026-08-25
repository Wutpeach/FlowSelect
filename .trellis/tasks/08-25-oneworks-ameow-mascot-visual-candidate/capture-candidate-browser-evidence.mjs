import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const image = (buffer) => `data:image/png;base64,${buffer.toString("base64")}`;

async function composePointerEvidence(page, captures) {
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #17151b; color: #eeeeee; font: 14px system-ui, sans-serif; }
      main { width: 980px; padding: 18px; border: 1px solid #4b4951; }
      h1 { margin: 0 0 6px; color: #60a5fa; font-size: 17px; }
      p { margin: 0; color: #b9b3c8; line-height: 1.4; }
      section { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-top: 14px; }
      figure { margin: 0; }
      figcaption { margin-bottom: 6px; font-weight: 700; }
      img { display: block; width: 455px; border: 1px solid #4b4951; }
    </style>
    <main>
      <h1>Candidate pointer preview · production attention input, Lab-only pose envelope</h1>
      <p>Center/dead-zone and outer-radius inputs recenter. Reduced Motion reads the smaller production eye branch but intentionally renders the static canonical candidate.</p>
      <section>${captures.map(({ label, buffer }) => `<figure><figcaption>${label}</figcaption><img src="${image(buffer)}"></figure>`).join("")}</section>
    </main>
  `);
  await page.screenshot({ path: resolve(evidenceDir, "candidate-pointer-normal-reduced.png"), fullPage: true });
}

async function composeActionEvidence(page, captures) {
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #17151b; color: #eeeeee; font: 14px system-ui, sans-serif; }
      main { width: 1200px; padding: 18px; border: 1px solid #4b4951; }
      h1 { margin: 0 0 6px; color: #60a5fa; font-size: 17px; }
      p { margin: 0; color: #b9b3c8; line-height: 1.4; }
      section { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 14px; }
      figure { margin: 0; }
      figcaption { margin-bottom: 6px; font-weight: 700; text-align: center; }
      img { display: block; width: 280px; border: 1px solid #4b4951; }
    </style>
    <main>
      <h1>Deterministic upstream action previews</h1>
      <p>Idle is static. The three labeled previews use public OneWorks animation clips; they preserve product meaning, not old-renderer pixel or timing identity.</p>
      <section>${captures.map(({ label, buffer }) => `<figure><figcaption>${label}</figcaption><img src="${image(buffer)}"></figure>`).join("")}</section>
    </main>
  `);
  await page.screenshot({ path: resolve(evidenceDir, "candidate-action-previews.png"), fullPage: true });
}

async function composeComparisonEvidence(page, source, candidate) {
  const diamond = await readFile(resolve(
    repoRoot,
    ".trellis/tasks/archive/2026-08/08-24-compact-mascot-ear-geometry-repair/research/evidence/final-neutral-front-1x.png",
  ));
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #17151b; color: #eeeeee; font: 14px system-ui, sans-serif; }
      main { width: 760px; padding: 18px; border: 1px solid #4b4951; }
      h1 { margin: 0 0 6px; color: #60a5fa; font-size: 17px; }
      p { margin: 0; color: #b9b3c8; line-height: 1.4; }
      section { display: grid; gap: 12px; margin: 14px 0; }
      figure { display: grid; grid-template-columns: 60px 1fr; align-items: center; gap: 12px; margin: 0; }
      img { width: 60px; height: 60px; border: 1px solid #4b4951; }
      figcaption { font-weight: 700; }
      small { color: #b9b3c8; font-weight: 400; }
    </style>
    <main>
      <h1>Lab-only 60 px comparison · source reference / Ameow candidate / archived diamond</h1>
      <section>
        <figure><img src="${image(source)}"><figcaption>Pinned OneWorks cat reference<br><small>Route A source fixture with normalized Lab framing; not a claim of byte-identical package-default framing.</small></figcaption></figure>
        <figure><img src="${image(candidate)}"><figcaption>Final Ameow OneWorks candidate<br><small>Calibrated blue silhouette, rounded-cone ears, and face/framing.</small></figcaption></figure>
        <figure><img src="${image(diamond)}"><figcaption>Approved Ameow diamond, archived neutral/front 1×<br><small>Frozen production baseline, scaled to the same 60 px comparison specimen.</small></figcaption></figure>
      </section>
      <p>This Lab-only sheet supports visual-adoption planning only. It does not imply production migration, recalibration, or Architecture PASS.</p>
    </main>
  `);
  await page.screenshot({ path: resolve(evidenceDir, "candidate-source-candidate-diamond-comparison.png"), fullPage: true });
}

await mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });

try {
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1600, height: 1200 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(labUrl, { waitUntil: "commit" });
  await page.locator("[data-lab-oneworks-inspector-open]").click();
  await page.locator("[data-oneworks-mascot-inspector]").waitFor();
  await page.locator(".oneworks-avatar-editor").waitFor();
  const editorControls = page.locator(".avatar-controls");
  await editorControls.evaluate((element) => {
    element.style.maxHeight = "900px";
    element.style.overflow = "hidden";
  });
  await editorControls.screenshot({ path: resolve(evidenceDir, "candidate-editor-calibration.png") });

  const productControls = page.locator("[data-oneworks-candidate-product-controls]");
  const productPreview = page.locator("[data-oneworks-candidate-attention-stage]");
  const candidate60 = page.locator("[data-oneworks-candidate-avatar-60]");
  const candidateMagnified = page.locator("[data-oneworks-candidate-avatar-magnified]");
  const attentionControls = page.locator("[data-oneworks-attention-controls]");

  for (const [label, filename] of [
    ["Front", "candidate-product-front.png"],
    ["Moderate yaw", "candidate-product-moderate-yaw.png"],
    ["Moderate pitch", "candidate-product-moderate-pitch.png"],
  ]) {
    await productControls.getByRole("button", { name: label }).click();
    await wait(120);
    await productPreview.screenshot({ path: resolve(evidenceDir, filename) });
  }
  await productControls.getByRole("button", { name: "Front" }).click();
  await candidate60.screenshot({ path: resolve(evidenceDir, "candidate-true-60-front.png") });

  const pointerCaptures = [];
  for (const [label, button] of [
    ["Center / dead zone · normal", "Center / dead zone"],
    ["Approach peak · normal", "Approach peak"],
    ["Outer recenter · normal", "Outer recenter"],
  ]) {
    await attentionControls.getByRole("button", { name: button }).click();
    await wait(100);
    pointerCaptures.push({ label, buffer: await productPreview.screenshot() });
  }
  const reducedMotion = productControls.locator('input[type="checkbox"]');
  await reducedMotion.check();
  await attentionControls.getByRole("button", { name: "Approach peak" }).click();
  await wait(100);
  pointerCaptures.push({ label: "Approach peak · Reduced Motion static candidate", buffer: await productPreview.screenshot() });
  await composePointerEvidence(await browser.newPage({ viewport: { width: 1000, height: 760 } }), pointerCaptures);
  await reducedMotion.uncheck();
  await productControls.getByRole("button", { name: "Front" }).click();

  const actionCaptures = [];
  for (const action of ["idle", "surprised", "curious-short", "playful-short"]) {
    await productControls.getByRole("button", { name: action }).click();
    await wait(action === "idle" ? 40 : 220);
    actionCaptures.push({ label: action, buffer: await candidateMagnified.screenshot() });
  }
  await composeActionEvidence(await browser.newPage({ viewport: { width: 1220, height: 380 } }), actionCaptures);
  await productControls.getByRole("button", { name: "idle" }).click();

  await page.locator("[data-oneworks-sweep-sheet]").screenshot({ path: resolve(evidenceDir, "candidate-360-yaw-sweep.png") });
  const sourceReference = await page.locator("[data-oneworks-source-reference-avatar-60]").screenshot();
  const candidateReference = await candidate60.screenshot();
  await composeComparisonEvidence(await browser.newPage({ viewport: { width: 780, height: 400 } }), sourceReference, candidateReference);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current candidate JSON" }).click();
  const exportDownload = await download;
  const exportPath = resolve(taskDir, "canonical-candidate.json");
  await exportDownload.saveAs(exportPath);
  const exported = JSON.parse(await readFile(exportPath, "utf8"));
  assert.equal(exported.candidateId, "ameow-oneworks-cat-2026-08-25-v1");
  assert.match(exported.checksum, /^fnv1a32:[0-9a-f]{8}$/);

  await page.getByRole("button", { name: "Reload canonical candidate" }).click();
  await candidate60.waitFor();
  assert.equal(pageErrors.length, 0, `Browser page errors: ${pageErrors.join(" | ")}`);
  const result = {
    browserPath: browserPath ?? "Playwright default",
    candidateChecksum: exported.checksum,
    evidence: [
      "candidate-product-front.png",
      "candidate-product-moderate-yaw.png",
      "candidate-product-moderate-pitch.png",
      "candidate-true-60-front.png",
      "candidate-pointer-normal-reduced.png",
      "candidate-action-previews.png",
      "candidate-360-yaw-sweep.png",
      "candidate-source-candidate-diamond-comparison.png",
      "candidate-editor-calibration.png",
    ],
    pageErrors,
  };
  await writeFile(resolve(evidenceDir, "candidate-browser-result.json"), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await browser.close();
}
