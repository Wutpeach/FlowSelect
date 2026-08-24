/**
 * MR9 Browser Presentation Lab — live validation via Playwright Chromium.
 *
 * Starts the dedicated Lab Vite server (vite.lab.config.ts, port 1421) with
 * plain `vite` (no Electron, no downloader runtime) and drives the production
 * ExpandedPresentationSurface through the Lab UI: scenarios, click-origin,
 * replay, reduced motion, determinate/indeterminate progress, same-trace
 * downward revision, new-trace replacement, reload, and HMR.
 *
 * Run: node .trellis/tasks/08-15-mr9-fullscreen-activation-fx-progress-visual-refinement/research/run-browser-lab-validation.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, appendFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const worktree = resolve(__dirname, "../../../..");
const LAB_URL = "http://127.0.0.1:1421/lab.html";
const LAB_PORT = 1421;

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

let passed = 0;
let failed = 0;
const assert = (condition, label) => {
  if (condition) {
    passed += 1;
    console.log(`  PASS: ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL: ${label}`);
  }
};

const readGraphics = (page) => page.evaluate(() => {
  const canvases = Array.from(document.querySelectorAll("canvas"));
  const canvas = canvases[0];
  const base = {
    canvasCount: canvases.length,
    linked: false,
    progressMode: null,
    progress: null,
    activationKind: null,
    activationAge: null,
    activationOrigin: null,
    reducedMotion: null,
    heatmapMode: null,
    time: null,
    ariaHidden: null,
    pointerEvents: null,
    zIndex: null,
  };
  if (!(canvas instanceof HTMLCanvasElement)) {
    return base;
  }
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    return base;
  }
  const program = gl.getParameter(gl.CURRENT_PROGRAM);
  base.linked = Boolean(program) && gl.getProgramParameter(program, gl.LINK_STATUS) === true;
  const uniform = (name) => {
    if (!program) return null;
    const location = gl.getUniformLocation(program, name);
    if (location === null) return null;
    const value = gl.getUniform(program, location);
    if (value instanceof Float32Array) return Array.from(value);
    if (typeof value === "boolean") return value ? 1 : 0;
    return typeof value === "number" ? value : null;
  };
  base.progressMode = uniform("uProgressMode");
  base.progress = uniform("uProgress");
  base.activationKind = uniform("uActivationKind");
  base.activationAge = uniform("uActivationAge");
  base.activationOrigin = uniform("uActivationOrigin");
  base.reducedMotion = uniform("uReducedMotion");
  base.heatmapMode = uniform("uHeatmapMode");
  base.time = uniform("uTime");
  base.ariaHidden = canvas.getAttribute("aria-hidden");
  base.pointerEvents = getComputedStyle(canvas).pointerEvents;
  base.zIndex = getComputedStyle(canvas).zIndex;
  return base;
});

const near = (value, expected, epsilon = 0.035) =>
  typeof value === "number" && Math.abs(value - expected) < epsilon;

const nearVec = (value, expected, epsilon = 0.035) =>
  Array.isArray(value)
  && value.length === expected.length
  && value.every((component, index) => Math.abs(component - expected[index]) < epsilon);

// The Lab chrome is localized (zh-CN first); drive buttons by stable
// data-lab-preset / data-lab-action attributes instead of localized text.
const clickPreset = async (page, presetId) => {
  await page.locator(`[data-lab-preset="${presetId}"]`).first().click();
};

const clickAction = async (page, action) => {
  await page.locator(`[data-lab-action="${action}"]`).first().click();
};

const clickCategory = async (page, categoryId) => {
  await page.locator(`[data-lab-category="${categoryId}"]`).first().click();
};

/**
 * Analyze the production canvas backing pixels for the Heatmap spike visual
 * requirements: large dark areas, a cool (deep-blue/blue/cyan) halo, a warm
 * (yellow/orange) frontier, and a restrained pale-white hot core. Returns
 * bucket counts so the harness can assert each role is present.
 */
const probeHeatmapPixels = (page) => page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    return null;
  }
  const gl = canvas.getContext("webgl2");
  if (gl === null) {
    return null;
  }
  const { width, height } = canvas;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let dark = 0;
  let cool = 0;
  let warm = 0;
  let core = 0;
  let alphaCovered = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (a > 40) alphaCovered += 1;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const bMinusR = (b - r) / 255;
    const rMinusB = (r - b) / 255;
    if (lum < 0.10) {
      dark += 1;
    } else if (lum < 0.5 && bMinusR > 0.12) {
      // deep-blue / blue / cyan halo: blue clearly above red
      cool += 1;
    } else if (lum > 0.55 && lum < 0.95 && rMinusB > 0.15) {
      // yellow/orange frontier: red clearly above blue, bright but not white
      warm += 1;
    } else if (r > 230 && g > 210 && b > 190) {
      // pale-yellow/white hot core
      core += 1;
    }
  }
  const total = width * height;
  return {
    width,
    height,
    total,
    dark,
    cool,
    warm,
    core,
    alphaCovered,
    darkRatio: dark / total,
    coolRatio: cool / total,
    warmRatio: warm / total,
    coreRatio: core / total,
  };
});

const clickPreview = async (page, x, y) => {
  await page.locator("[data-lab-preview-frame]")
    .click({ position: { x, y } });
};

const waitForCanvas = async (page) => {
  await page.waitForSelector("canvas");
  await sleep(200);
};

const killTree = (child) => {
  if (!child || child.pid === undefined) return;
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    if (result.status === 0) return;
  }
  try {
    child.kill();
  } catch {
    // ignore
  }
};

const main = async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "ameow-lab-validation-"));
  const serverOut = join(tempDir, "vite-lab.out.log");
  const serverErr = join(tempDir, "vite-lab.err.log");
  const viteEntry = resolve(worktree, "node_modules/vite/bin/vite.js");
  const configPath = resolve(worktree, "vite.lab.config.ts");

  const server = spawn(process.execPath, [viteEntry, "--config", configPath], {
    cwd: worktree,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const appendLog = (file, chunk) => {
    try {
      writeFileSync(file, chunk, { flag: "a" });
    } catch {
      // The temp dir may already be removed during shutdown; never crash the
      // validation run for a stale log flush.
    }
  };
  server.stdout.on("data", (chunk) => appendLog(serverOut, chunk));
  server.stderr.on("data", (chunk) => appendLog(serverErr, chunk));

  let browser;
  try {
    // Wait for the Lab server to accept connections.
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await sleep(250);
      try {
        const response = await fetch(LAB_URL);
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        // not up yet
      }
    }
    if (!ready) {
      throw new Error(`Lab Vite server did not become ready on port ${LAB_PORT}\nstderr: ${readFileSync(serverErr, "utf8")}`);
    }
    console.log("Lab Vite server ready at", LAB_URL);

    browser = await chromium.launch({
      headless: true,
      args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--disable-gpu"],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    const hmrMessages = [];
    page.on("console", (message) => {
      const text = message.text();
      if (/vite|hmr|updated/i.test(text)) {
        hmrMessages.push(text);
      }
    });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    console.log("\n== Load & single production canvas ==");
    await page.goto(LAB_URL, { waitUntil: "domcontentloaded" });
    await waitForCanvas(page);
    let graphics = await readGraphics(page);
    assert(graphics.canvasCount === 1, `exactly one canvas (${graphics.canvasCount})`);
    assert(graphics.linked === true, "production WebGL2 program linked");
    assert(graphics.ariaHidden === "true", "production canvas aria-hidden");
    assert(graphics.pointerEvents === "none", "production canvas pointer-events none");
    assert(graphics.progressMode === 1, "initial determinate mode (uProgressMode=1)");
    assert(near(graphics.progress, 0.5), `initial progress level 0.5 (${graphics.progress})`);
    assert(pageErrors.length === 0, `no page errors on load (${pageErrors.join("; ") || "none"})`);
    await page.screenshot({ path: join(__dirname, "mr9-browser-lab.png"), fullPage: true });

    console.log("\n== Activation scenarios ==");
    await clickPreset(page, "intake-center");
    await sleep(150);
    graphics = await readGraphics(page);
    assert(graphics.activationKind === 1, "Intake center: uActivationKind=1");
    assert(nearVec(graphics.activationOrigin, [0.5, 0.5]), "Intake center: origin (0.5,0.5)");

    await clickPreview(page, 50, 50);
    await clickPreset(page, "intake-local");
    await sleep(150);
    graphics = await readGraphics(page);
    assert(graphics.activationKind === 1, "Intake local: uActivationKind=1");
    assert(nearVec(graphics.activationOrigin, [0.25, 0.25]),
      `Intake local: origin from preview click ≈(0.25,0.25) (${JSON.stringify(graphics.activationOrigin)})`);

    await clickPreset(page, "folder");
    await sleep(150);
    graphics = await readGraphics(page);
    assert(graphics.activationKind === 2, "Folder: uActivationKind=2");

    await clickCategory(page, "reducedMotion");
    await clickPreset(page, "intake-reduced");
    await sleep(150);
    graphics = await readGraphics(page);
    assert(graphics.reducedMotion === 1, "Intake RM: uReducedMotion=1");
    assert(graphics.activationKind === 1, "Intake RM: uActivationKind=1");

    await clickPreset(page, "folder-reduced");
    await sleep(150);
    graphics = await readGraphics(page);
    assert(graphics.reducedMotion === 1, "Folder RM: uReducedMotion=1");
    assert(graphics.activationKind === 2, "Folder RM: uActivationKind=2");

    console.log("\n== Replay ==");
    await clickCategory(page, "activation");
    await clickPreset(page, "intake-center");
    await sleep(320); // let the bounded phase advance
    const beforeReplay = await readGraphics(page);
    await clickAction(page, "replay");
    await sleep(120);
    const afterReplay = await readGraphics(page);
    assert(beforeReplay.activationKind === 1 && afterReplay.activationKind === 1,
      "Replay keeps Intake activation");
    assert(
      typeof beforeReplay.activationAge === "number"
      && typeof afterReplay.activationAge === "number"
      && afterReplay.activationAge < beforeReplay.activationAge,
      `Replay restarts the bounded phase (age ${beforeReplay.activationAge} -> ${afterReplay.activationAge})`,
    );

    console.log("\n== Progress presets & transitions ==");
    await clickCategory(page, "downloadProgress");
    await clickPreset(page, "progress-25");
    await sleep(150);
    graphics = await readGraphics(page);
    assert(graphics.activationKind === 0, "progress clears activation (uActivationKind=0)");
    assert(graphics.progressMode === 1, "25%: uProgressMode=1");
    assert(near(graphics.progress, 0.25), `25%: uProgress≈0.25 (${graphics.progress})`);

    await clickPreset(page, "progress-75");
    await sleep(500); // let production runtime converge 0.25 -> 0.75
    graphics = await readGraphics(page);
    assert(near(graphics.progress, 0.75), `75%: uProgress≈0.75 after convergence (${graphics.progress})`);

    await clickAction(page, "downward-revision");
    await sleep(200);
    graphics = await readGraphics(page);
    assert(near(graphics.progress, 0.25),
      `downward revision snaps to 0.25 (production semantics) (${graphics.progress})`);

    await clickAction(page, "replace-trace");
    await sleep(200);
    graphics = await readGraphics(page);
    assert(near(graphics.progress, 0.5),
      `new trace replacement resets to 0.5 (${graphics.progress})`);

    await clickAction(page, "indeterminate");
    await sleep(150);
    graphics = await readGraphics(page);
    assert(graphics.progressMode === 2, "indeterminate: uProgressMode=2");

    console.log("\n== Reduced motion toggle (inspector) ==");
    const rmCheckbox = page.locator('[data-lab-inspector="reduced-motion"] input[type="checkbox"]');
    await rmCheckbox.check();
    await sleep(150);
    graphics = await readGraphics(page);
    assert(graphics.reducedMotion === 1, "inspector RM toggle drives uReducedMotion=1");
    await rmCheckbox.uncheck();
    await sleep(150);
    graphics = await readGraphics(page);
    assert(graphics.reducedMotion === 0, "inspector RM toggle off -> uReducedMotion=0");

    console.log("\n== Heatmap spike (Paper Shaders clean-room prototype) ==");
    await clickCategory(page, "heatmapSpike");
    await clickPreset(page, "heatmap-moving");
    await sleep(250);
    graphics = await readGraphics(page);
    assert(graphics.heatmapMode === 1, `moving field: uHeatmapMode=1 (${graphics.heatmapMode})`);
    assert(graphics.reducedMotion === 0, "moving field: reduced motion off");
    const heatA = await probeHeatmapPixels(page);
    assert(heatA !== null, "moving field: pixel probe returned data");
    if (heatA !== null) {
      assert(heatA.alphaCovered / heatA.total > 0.5,
        `moving field: material covers >50% of the surface (${(100 * heatA.alphaCovered / heatA.total).toFixed(0)}%)`);
      assert(heatA.darkRatio > 0.15,
        `moving field: large dark areas present (${(100 * heatA.darkRatio).toFixed(0)}%)`);
      assert(heatA.cool > 0, "moving field: deep-blue/blue/cyan halo present");
      assert(heatA.warm > 0, "moving field: yellow/orange frontier present");
      assert(heatA.core > 0, "moving field: pale-white hot core present");
    }
    await sleep(700); // let the field move
    const heatB = await probeHeatmapPixels(page);
    if (heatA !== null && heatB !== null) {
      // The moving core shifts the warm/core buckets over time.
      assert(
        Math.abs(heatA.warm - heatB.warm) > 0 || Math.abs(heatA.core - heatB.core) > 0,
        "moving field: warm/core buckets shift over time (field is animating)",
      );
    }
    await page.screenshot({ path: join(__dirname, "mr9-heatmap-moving.png"), fullPage: false });

    await clickPreset(page, "heatmap-reduced");
    await sleep(250);
    graphics = await readGraphics(page);
    assert(graphics.heatmapMode === 1, "reduced heatmap: uHeatmapMode=1");
    assert(graphics.reducedMotion === 1, "reduced heatmap: uReducedMotion=1 (static snapshot)");
    const heatRM1 = await probeHeatmapPixels(page);
    await sleep(500);
    const heatRM2 = await probeHeatmapPixels(page);
    if (heatRM1 !== null && heatRM2 !== null) {
      assert(
        heatRM1.warm === heatRM2.warm && heatRM1.core === heatRM2.core,
        "reduced heatmap: static snapshot does not travel (identical warm/core buckets)",
      );
    }
    await page.screenshot({ path: join(__dirname, "mr9-heatmap-reduced.png"), fullPage: false });

    await clickAction(page, "clear-heatmap");
    await sleep(200);
    graphics = await readGraphics(page);
    assert(graphics.heatmapMode === 0, `clear heatmap: uHeatmapMode=0 (${graphics.heatmapMode})`);

    console.log("\n== Reload survival ==");
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForCanvas(page);
    graphics = await readGraphics(page);
    assert(graphics.canvasCount === 1, `after reload: exactly one canvas (${graphics.canvasCount})`);
    assert(graphics.linked === true, "after reload: production program linked");
    await clickPreset(page, "intake-center");
    await sleep(150);
    graphics = await readGraphics(page);
    assert(graphics.activationKind === 1, "after reload: Intake center still activates");
    assert(nearVec(graphics.activationOrigin, [0.5, 0.5]), "after reload: origin still center");

    console.log("\n== HMR survival ==");
    const labComponentPath = resolve(worktree, "src/lab/PresentationLab.tsx");
    const probe = "\n// lab-hmr-probe\n";
    try {
      appendFileSync(labComponentPath, probe);
      // Wait for a Vite HMR/reload signal or a fresh functional page.
      let sawHmr = false;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await sleep(250);
        if (hmrMessages.some((message) => /updated|hmr|reload/i.test(message))) {
          sawHmr = true;
          break;
        }
        const count = await page.evaluate(() => document.querySelectorAll("canvas").length)
          .catch(() => -1);
        if (count === 1) {
          // page is alive; keep waiting for an explicit HMR signal up to timeout
          continue;
        }
      }
      await waitForCanvas(page);
      graphics = await readGraphics(page);
      assert(graphics.canvasCount === 1, `after HMR: exactly one canvas (${graphics.canvasCount})`);
      assert(graphics.linked === true, "after HMR: production program linked");
      await clickPreset(page, "intake-center");
      await sleep(150);
      graphics = await readGraphics(page);
      assert(graphics.activationKind === 1, "after HMR: Intake center still activates");
      assert(sawHmr || hmrMessages.length > 0,
        `Vite HMR signal observed (${hmrMessages.slice(-2).join(" | ") || "none captured"})`);
    } finally {
      const original = readFileSync(labComponentPath, "utf8");
      writeFileSync(labComponentPath, original.replace(probe, ""), "utf8");
    }

    console.log("\n== No fake controls (structural) ==");
    const labSource = readFileSync(labComponentPath, "utf8");
    assert(!/distortion|chromatic|lens/i.test(labSource),
      "no distortion/chromatic/lens control exists (production has no such uniform)");
    assert(!/pause|scrub|timeScale/i.test(labSource),
      "no fake time scrub/pause control exists (production uTime is continuous)");

    console.log(`\n===== LAB VALIDATION: ${passed} passed, ${failed} failed =====`);
    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
    killTree(server);
    server.stdout.removeAllListeners();
    server.stderr.removeAllListeners();
    server.stdout.destroy();
    server.stderr.destroy();
    rmSync(tempDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error("Lab validation failed:", error);
  process.exit(1);
});
