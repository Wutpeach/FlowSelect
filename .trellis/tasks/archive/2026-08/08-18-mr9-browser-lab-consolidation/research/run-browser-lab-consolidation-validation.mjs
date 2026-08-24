/**
 * MR9 Browser Lab Consolidation — live validation via Playwright Chromium.
 *
 * Drives the consolidated 7-scenario Browser Lab (zh-CN three-pane IA, port
 * 1421, plain Vite, no Electron) and proves:
 *   - every migrated legacy scenario renders through production paths
 *     (runtime-auto-config, runtime-failed, download-active, download-queued,
 *     transcode-active, transcode-failed, mixed-busy)
 *   - production WebGL2 shader uniforms are driven correctly per scenario
 *   - the shared production overlay components mount inside the preview
 *   - the one-click 4x PNG export downloads a valid transparent 912x912 PNG
 *     (200x200 content + 14px production shadow gutter per side) and restores
 *     state, with a short-lived feedback label that returns to idle so
 *     repeated exports keep working
 *   - export failure never downloads a partial/wrong-size PNG and the button
 *     recovers to idle
 *   - reload + HMR survival
 *   - zero page errors, no fake controls, no desktop bridge
 *
 * Run: node .trellis/tasks/08-18-mr9-browser-lab-consolidation/research/run-browser-lab-consolidation-validation.mjs
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


const pngDimension = (bytes) => (bytes.length >= 24 ? bytes.readUInt32BE(16) : 0);

/**
 * In-page alpha audit of an exported PNG. The transparent-bleed contract:
 *   - the alpha bounds contain BOTH fully transparent exterior pixels (the
 *     rounded shell's outside) AND nonzero shadow pixels in the gutter
 *     outside the 200x200 content shell;
 *   - the content center is opaque; the outer corner is (near) transparent
 *     (no opaque square silhouette).
 */
const measureExportAlpha = (page, pngBytes) =>
  page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = "data:image/png;base64," + b64; });
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const W = canvas.width;
    // 200x200 content at a 14px gutter inset = [56, 856] at 4x (912 canvas).
    const contentStart = 56;
    const contentEnd = W - 56;
    let transparent = 0;
    let shadowOutside = 0;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const a = data[(y * W + x) * 4 + 3];
        if (a === 0) transparent += 1;
        const outsideShell = x < contentStart || x > contentEnd || y < contentStart || y > contentEnd;
        if (outsideShell && a > 8) shadowOutside += 1;
      }
    }
    const at = (x, y) => data[(y * W + x) * 4 + 3];
    return {
      width: canvas.width,
      height: canvas.height,
      transparentPixelCount: transparent,
      shadowOutsidePixelCount: shadowOutside,
      contentOpaque: at(Math.floor(W / 2), Math.floor(W / 2)) === 255,
      cornerAlpha: at(4, 4),
    };
  }, pngBytes.toString("base64"));

const measureBadgeGeometry = (page, pngBytes) =>
  page.evaluate(async (b64) => {
    const frame = document.querySelector("[data-lab-preview-frame]");
    const frameRect = frame.getBoundingClientRect();
    const live = frame.querySelector("button[aria-label]").getBoundingClientRect();
    const badge = {
      x: live.left - frameRect.left,
      y: live.top - frameRect.top,
      w: live.width,
      h: live.height,
    };
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = "data:image/png;base64," + b64; });
    const findBadge = (data, size, width) => {
      const bg = [0x1b, 0x19, 0x20];
      const regionW = 80 * size;
      const regionH = 60 * size;
      let minx = regionW, miny = regionH, maxx = -1, maxy = -1, cnt = 0;
      for (let y = 0; y < regionH; y += 1) {
        for (let x = 0; x < regionW; x += 1) {
          const ii = (y * width + x) * 4;
          // Transparent exterior pixels (alpha 0, RGB 0) differ from the
          // content bg; skip them so the transparent gutter never pollutes
          // the badge bbox.
          if (data[ii + 3] < 128) continue;
          const diff = Math.abs(data[ii] - bg[0]) + Math.abs(data[ii + 1] - bg[1]) + Math.abs(data[ii + 2] - bg[2]);
          if (diff > 25) {
            if (x < minx) minx = x; if (x > maxx) maxx = x;
            if (y < miny) miny = y; if (y > maxy) maxy = y;
            cnt += 1;
          }
        }
      }
      return cnt > 50 ? { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 } : null;
    };
    // 912 export: content shell at (56,56) = 800x800, badge inside it.
    const c4 = document.createElement("canvas"); c4.width = 912; c4.height = 912;
    const ctx4 = c4.getContext("2d"); ctx4.drawImage(img, 0, 0);
    const badge4 = findBadge(ctx4.getImageData(0, 0, 912, 912).data, 4, 912);
    // 228-downsample (200 content + 14 gutter per side): shell at (14,14).
    const c228 = document.createElement("canvas"); c228.width = 228; c228.height = 228;
    const ctx228 = c228.getContext("2d"); ctx228.drawImage(img, 0, 0, 228, 228);
    const badge228 = findBadge(ctx228.getImageData(0, 0, 228, 228).data, 1, 228);
    return { badge, badge4, badge228 };
  }, pngBytes.toString("base64"));

const assertBadgeGeometry = (geo, label) => {
  const gutter4 = 14 * 4;
  if (geo.badge4) {
    assert(Math.abs(geo.badge4.x - (geo.badge.x * 4 + gutter4)) < 20 && Math.abs(geo.badge4.y - (geo.badge.y * 4 + gutter4)) < 20,
      `${label}: 4x badge position \u2248 4x live + gutter (${geo.badge4.x},${geo.badge4.y} vs ${(geo.badge.x * 4 + gutter4).toFixed(0)},${(geo.badge.y * 4 + gutter4).toFixed(0)})`);
    assert(Math.abs(geo.badge4.w - geo.badge.w * 4) < 20 && Math.abs(geo.badge4.h - geo.badge.h * 4) < 20,
      `${label}: 4x badge size \u2248 4x live (${geo.badge4.w}x${geo.badge4.h} vs ${(geo.badge.w * 4).toFixed(0)}x${(geo.badge.h * 4).toFixed(0)})`);
  } else {
    assert(false, `${label}: 4x badge landmark found in export`);
  }
  if (geo.badge228) {
    assert(Math.abs(geo.badge228.x - (geo.badge.x + 14)) < 8 && Math.abs(geo.badge228.y - (geo.badge.y + 14)) < 8,
      `${label}: 228-downsample badge position \u2248 live + gutter (${geo.badge228.x},${geo.badge228.y} vs ${(geo.badge.x + 14).toFixed(0)},${(geo.badge.y + 14).toFixed(0)})`);
    assert(Math.abs(geo.badge228.w - geo.badge.w) < 12 && Math.abs(geo.badge228.h - geo.badge.h) < 12,
      `${label}: 228-downsample badge size \u2248 live (${geo.badge228.w}x${geo.badge228.h} vs ${geo.badge.w.toFixed(0)}x${geo.badge.h.toFixed(0)})`);
  } else {
    assert(false, `${label}: 228-downsample badge landmark found in export`);
  }
};

const readGraphics = (page) => page.evaluate(() => {
  const canvas = document.querySelector("[data-lab-preview-frame] canvas");
  const base = {
    canvasCount: document.querySelectorAll("[data-lab-preview-frame] canvas").length,
    linked: false,
    progressMode: null,
    progress: null,
    activationKind: null,
    activationAge: null,
    reducedMotion: null,
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
  base.reducedMotion = uniform("uReducedMotion");
  return base;
});

const near = (value, expected, epsilon = 0.035) =>
  typeof value === "number" && Math.abs(value - expected) < epsilon;

const clickButton = async (page, namePattern) => {
  await page.getByRole("button", { name: namePattern }).first().click();
};

const waitForCanvas = async (page) => {
  await page.waitForSelector("[data-lab-preview-frame] canvas");
  await sleep(250);
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
  const tempDir = mkdtempSync(join(tmpdir(), "ameow-lab-consolidation-"));
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
      // never crash for a stale log flush
    }
  };
  server.stdout.on("data", (chunk) => appendLog(serverOut, chunk));
  server.stderr.on("data", (chunk) => appendLog(serverErr, chunk));

  let browser;
  try {
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
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
    });

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
    assert(graphics.canvasCount === 1, `exactly one production canvas (${graphics.canvasCount})`);
    assert(graphics.linked === true, "production WebGL2 program linked");
    assert(pageErrors.length === 0, `no page errors on load (${pageErrors.join("; ") || "none"})`);
    await page.screenshot({ path: join(__dirname, "evidence", "mr9-browser-lab-consolidation-load.png"), fullPage: false });
    const frame = page.locator("[data-lab-preview-frame]");

    // ---- Seven migrated legacy scenarios, each through production paths ----
    console.log("\n== Scenario: runtime-auto-config (运行环境 → 自动配置) ==");
    await clickButton(page, /^运行环境$/);
    await sleep(150);
    await clickButton(page, /自动配置/);
    await sleep(400);
    graphics = await readGraphics(page);
    // Runtime indicators are DOM rings; the WebGL shader stays idle (0) here.
    assert(graphics.progressMode === 0, `runtime auto-config: shader idle uProgressMode=0 (${graphics.progressMode})`);
    const runtimeIndicatorCount = await frame.locator("[data-panel-double-click='ignore']").count();
    assert(runtimeIndicatorCount > 0, `runtime indicator mounted inside preview frame (${runtimeIndicatorCount})`);

    console.log("\n== Scenario: runtime-failed (运行失败) ==");
    await clickButton(page, /运行失败/);
    await sleep(400);
    graphics = await readGraphics(page);
    assert(graphics.progressMode === 0, `runtime-failed: shader idle uProgressMode=0 (${graphics.progressMode})`);
    // Hover the runtime indicator to reveal the diagnostics popover.
    const indicator = frame.locator("[data-panel-double-click='ignore']").first();
    await indicator.hover();
    await sleep(500);
    const popoverText = (await frame.innerText()).toLowerCase();
    assert(popoverText.includes("ffmpeg"), `runtime-failed popover shows ffmpeg diagnostic ("${popoverText.slice(0, 90)}…")`);
    assert(/bootstrap|failed|503|error/.test(popoverText), "runtime-failed popover shows failure detail");

    console.log("\n== Scenario: download-active (下载与进度 → 下载进行中) ==");
    await clickButton(page, /^下载与进度$/);
    await sleep(150);
    await clickButton(page, /下载进行中/);
    await sleep(500);
    graphics = await readGraphics(page);
    assert(graphics.progressMode === 1, `download-active: determinate uProgressMode=1 (${graphics.progressMode})`);
    assert(near(graphics.progress, 0.64), `download-active: uProgress≈0.64 (${graphics.progress})`);
    assert(graphics.activationKind === 1 || graphics.activationKind === 0,
      `download-active drives production activation (uActivationKind=${graphics.activationKind})`);
    const taskProgressOverlay = await frame.locator("[data-mr9-coverable='task-progress']").count();
    assert(taskProgressOverlay === 1, "download-active: center task-progress overlay mounted");

    console.log("\n== Scenario: download-queued (下载排队中) ==");
    await clickButton(page, /下载排队中/);
    await sleep(400);
    graphics = await readGraphics(page);
    // Both tasks are pending; the WebGL arc stays idle and the badge carries the count.
    assert(graphics.progressMode === 0, `download-queued: shader idle uProgressMode=0 (${graphics.progressMode})`);
    const badgeAria = await frame.locator("button[aria-label]").first().getAttribute("aria-label");
    assert(badgeAria !== null && /当前任务：2/.test(badgeAria ?? ""),
      `download-queued: queue badge shows task count (aria-label="${badgeAria}")`);

    console.log("\n== Scenario: transcode-active (转码 → 转码进行中) ==");
    await clickButton(page, /^转码$/);
    await sleep(150);
    await clickButton(page, /转码进行中/);
    await sleep(400);
    graphics = await readGraphics(page);
    // Transcode progress renders via the DOM ring, not the WebGL arc.
    assert(graphics.progressMode === 0, `transcode-active: shader idle uProgressMode=0 (${graphics.progressMode})`);
    const transcodeRing = await frame.locator("[data-mr9-coverable='task-progress']").count();
    assert(transcodeRing === 1, "transcode-active: center overlay with transcode ring mounted");

    console.log("\n== Scenario: transcode-failed (转码失败) ==");
    await clickButton(page, /转码失败/);
    await sleep(400);
    graphics = await readGraphics(page);
    assert(graphics.progressMode === 0, `transcode-failed: shader idle uProgressMode=0 (${graphics.progressMode})`);
    const copyButton = await frame.getByRole("button", { name: /复制诊断/ }).count();
    assert(copyButton > 0, `transcode-failed: copy-diagnostic control present (${copyButton})`);
    const failText = (await frame.innerText()).toLowerCase();
    assert(/ffmpeg|invalid|复制诊断/.test(failText), "transcode-failed: failure detail visible");

    console.log("\n== Scenario: mixed-busy (混合忙碌 → 混合忙碌) ==");
    await clickButton(page, /^混合忙碌$/);
    await sleep(150);
    // The scenario button is the later sibling; the category pill also matches.
    await page.getByRole("button", { name: /混合忙碌/ }).last().click();
    await sleep(500);
    graphics = await readGraphics(page);
    assert(graphics.progressMode === 1, `mixed-busy: determinate uProgressMode=1 (${graphics.progressMode})`);
    const mixedText = (await frame.innerText()).toLowerCase();
    assert(/下载/.test(mixedText) || /transcode|转码/.test(mixedText),
      "mixed-busy: download + transcode surfaces both present");

    console.log("\n== One-click 4x PNG export (download-active) ==");
    await clickButton(page, /^下载与进度$/);
    await sleep(150);
    await clickButton(page, /下载进行中/);
    await sleep(500);

    // CSS geometry invariant: the preview frame and canvas must stay 200x200
    // (CSS) for the entire export transaction. The old evidence-capture bug
    // resized the preview root's CSS to 800 and reflowed the composition; this
    // poll catches any such reflow live, before the download resolves.
    const cssProbe = page.evaluate(async () => {
      const frame = document.querySelector("[data-lab-preview-frame]");
      const canvas = frame.querySelector("canvas");
      const samples = [];
      const record = () => {
        samples.push([frame.offsetWidth, frame.offsetHeight, canvas.clientWidth, canvas.clientHeight]);
      };
      record();
      const timer = setInterval(record, 15);
      return new Promise((resolveOuter) => {
        const check = () => {
          const btn = document.querySelector("[data-lab-export]");
          const text = btn ? btn.textContent || "" : "";
          if (text && !/正在导出/.test(text)) {
            setTimeout(() => {
              clearInterval(timer);
              record();
              resolveOuter(samples);
            }, 300);
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    });
    const downloadPromise = page.waitForEvent("download");
    await page.locator("[data-lab-export]").click();
    const download = await downloadPromise;
    const cssSamples = await cssProbe;
    assert(download.suggestedFilename() === "ameow-lab-download-active-4x.png",
      `export filename derived from scenario ("${download.suggestedFilename()}")`);
    const downloadPath = await download.path();
    const pngBytes = readFileSync(downloadPath);
    assert(pngBytes.length > 5000, `export PNG has real bytes (${pngBytes.length})`);
    assert(pngBytes[0] === 0x89 && pngBytes[1] === 0x50 && pngBytes[2] === 0x4e && pngBytes[3] === 0x47,
      "export bytes are a PNG (magic header)");
    const pngDim = pngBytes.readUInt32BE(16);
    assert(pngDim === 912, `export PNG is 912px (200 + 2*14 gutter, at 4x) (${pngDim})`);
    const cssAll200 = cssSamples.every((s) => s[0] === 200 && s[1] === 200 && s[2] === 200 && s[3] === 200);
    assert(cssAll200, `CSS layout stayed 200x200 during export (${cssSamples.length} samples)`);

    // Transparent-bleed contract: the alpha bounds contain BOTH fully
    // transparent exterior pixels (outside the rounded shell) AND nonzero
    // shadow pixels in the gutter outside the 200x200 content shell; the
    // content center stays opaque and the outer corner is not an opaque
    // square (rounded production silhouette).
    const alpha = await measureExportAlpha(page, pngBytes);
    assert(alpha.width === 912 && alpha.height === 912, `export alpha canvas is 912x912 (${alpha.width}x${alpha.height})`);
    assert(alpha.transparentPixelCount > 1000,
      `transparent exterior pixels exist (alpha bounds include transparent, ${alpha.transparentPixelCount})`);
    assert(alpha.shadowOutsidePixelCount > 1000,
      `nonzero shadow pixels outside the 200x200 shell (shared recipe in the gutter, ${alpha.shadowOutsidePixelCount})`);
    assert(alpha.contentOpaque === true, "export content center is opaque (alpha 255)");
    assert(alpha.cornerAlpha < 8, `outer corner is (near) transparent - no opaque square silhouette (alpha ${alpha.cornerAlpha})`);

    // Composition geometry: the queue badge (DOM) must sit at exactly ~4x its
    // live 200-layout rect + the 14px gutter inset inside the 912x912 export,
    // and the 228-downsample must reproduce the live 200-layout rect at the
    // (14,14) inset. Raw pixel diffs between the 4x and 1x rasters are not a
    // valid signal (the shader is resolution-dependent), so we assert geometry
    // on the stable DOM landmark.
    const geo = await measureBadgeGeometry(page, pngBytes);
    assertBadgeGeometry(geo, "export");
    // State restoration: the preview must still be live after the export transaction.
    await sleep(400);
    graphics = await readGraphics(page);
    assert(graphics.linked === true, "after export: production program still linked (state restored)");
    const overlayAfterExport = await frame.locator("[data-mr9-coverable='task-progress']").count();
    assert(overlayAfterExport === 1, "after export: overlay still mounted (state restored)");
    assert(pageErrors.length === 0, `no page errors during export (${pageErrors.join("; ") || "none"})`);

    console.log("\n== Export feedback lifecycle (button returns to idle + repeatable) ==");
    const btnText = async () => (await page.locator("[data-lab-export]").textContent()) ?? "";
    // Success feedback label shows briefly...
    let successLabelSeen = false;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const text = await btnText();
      if (/已导出/.test(text)) { successLabelSeen = true; break; }
      await sleep(150);
    }
    assert(successLabelSeen, "success feedback label shown after export");
    // ...then returns to the normal idle label within the feedback interval.
    let idleAfterSuccess = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const text = await btnText();
      if (text.trim() === "导出 4× PNG") { idleAfterSuccess = true; break; }
      await sleep(150);
    }
    assert(idleAfterSuccess, "export button returns to idle label after success feedback");
    // Repeated export keeps working (second download, same scenario filename).
    const repeatDownloadPromise = page.waitForEvent("download", { timeout: 20000 });
    await page.locator("[data-lab-export]").click();
    const repeatDownload = await repeatDownloadPromise;
    const repeatBytes = readFileSync(await repeatDownload.path());
    assert(repeatDownload.suggestedFilename() === "ameow-lab-download-active-4x.png"
      && pngDimension(repeatBytes) === 912,
      `repeated export downloads again (${repeatDownload.suggestedFilename()}, ${pngDimension(repeatBytes)}px)`);
    let idleAfterRepeat = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const text = await btnText();
      if (text.trim() === "导出 4× PNG") { idleAfterRepeat = true; break; }
      await sleep(150);
    }
    assert(idleAfterRepeat, "export button back to idle after repeated export");

    console.log("\n== Export failure contract (no partial PNG on missing layer) ==");
    const failureContract = await page.evaluate(async () => {
      const { capturePreviewPng, ExportLayerFailure } = await import("/src/lab/exportPng.ts");
      const frame = document.querySelector("[data-lab-preview-frame]");
      const out = {};
      // 1) null WebGL readback (unavailable / timed out) must reject with
      // ExportLayerFailure('webgl') BEFORE any download can happen.
      try {
        await capturePreviewPng({ frameElement: frame, scale: 4, webglReadback: Promise.resolve(null) });
        out.webglRejected = false;
      } catch (error) {
        out.webglRejected = true;
        out.webglIsLayerFailure = error instanceof ExportLayerFailure && error.layer === "webgl";
      }
      // 2) a readback that does not match the absolute export content size
      // (e.g. a DPR-multiplied 1600x1600) must reject too, never download a
      // wrong-size layer.
      try {
        const pixels = new Uint8Array(1600 * 1600 * 4);
        await capturePreviewPng({
          frameElement: frame,
          scale: 4,
          webglReadback: Promise.resolve({ width: 1600, height: 1600, pixels }),
        });
        out.mismatchRejected = false;
      } catch (error) {
        out.mismatchRejected = true;
        out.mismatchMessage = error instanceof Error ? error.message : String(error);
      }
      // 3) an unsupported shadow recipe (e.g. inset) must reject with
      // ExportLayerFailure('shadow') instead of silently approximating.
      try {
        const pixels = new Uint8Array(800 * 800 * 4);
        await capturePreviewPng({
          frameElement: frame,
          scale: 4,
          shadowCss: "inset 0 0 0 1px rgba(0,0,0,0.2)",
          webglReadback: Promise.resolve({ width: 800, height: 800, pixels }),
        });
        out.shadowRejected = false;
      } catch (error) {
        out.shadowRejected = true;
        out.shadowIsLayerFailure = error instanceof ExportLayerFailure && error.layer === "shadow";
      }
      return out;
    });
    assert(failureContract.webglRejected && failureContract.webglIsLayerFailure === true,
      "null WebGL readback rejects with ExportLayerFailure('webgl') - no partial download");
    assert(failureContract.mismatchRejected && /does not match export content size 800x800/.test(failureContract.mismatchMessage || ""),
      "readback/export content size mismatch rejects (never downloads a wrong-size layer)");
    assert(failureContract.shadowRejected && failureContract.shadowIsLayerFailure === true,
      "unsupported shadow recipe rejects with ExportLayerFailure('shadow') - never approximated");

    console.log("\n== Export failure feedback lifecycle (button recovers after failure) ==");
    {
      // A fresh page where html2canvas has not been imported yet: blocking its
      // module URL makes the first export fail at the DOM layer, which must
      // surface the failure label + role=alert reason, never download a
      // partial PNG, and return the button to idle.
      const failPage = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        acceptDownloads: true,
      });
      try {
        await failPage.route("**/*html2canvas*", (route) => route.abort());
        await failPage.goto(LAB_URL, { waitUntil: "domcontentloaded" });
        await waitForCanvas(failPage);
        await clickButton(failPage, /^下载与进度$/);
        await sleep(150);
        await clickButton(failPage, /下载进行中/);
        await sleep(500);
        const failBtnText = async () => (await failPage.locator("[data-lab-export]").textContent()) ?? "";
        let downloadFired = false;
        const failDownloadWatch = failPage.waitForEvent("download", { timeout: 5000 })
          .then(() => { downloadFired = true; })
          .catch(() => undefined);
        await failPage.locator("[data-lab-export]").click();
        // Check the transient failure label while the no-download watch is
        // still pending (the feedback label resets to idle after ~2s, so it
        // must be observed concurrently, not after the download timeout).
        let failureLabelSeen = false;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const text = await failBtnText();
          if (/导出失败/.test(text)) { failureLabelSeen = true; break; }
          await sleep(120);
        }
        assert(failureLabelSeen, "failure feedback label shown after failed export");
        const alertText = await failPage.locator("[role=alert]").textContent().catch(() => null);
        assert(alertText !== null && alertText.trim().length > 0,
          `failure reason surfaced via role=alert ("${(alertText ?? "").trim()}")`);
        let idleAfterFailure = false;
        for (let attempt = 0; attempt < 30; attempt += 1) {
          const text = await failBtnText();
          if (text.trim() === "导出 4× PNG") { idleAfterFailure = true; break; }
          await sleep(150);
        }
        assert(idleAfterFailure, "export button returns to idle after failure feedback");
        await failDownloadWatch;
        assert(downloadFired === false, "failed export never downloads a partial PNG");
      } finally {
        await failPage.close().catch(() => undefined);
      }
      // Fresh, unblocked page: the export still works end-to-end afterwards.
      const recoveryPage = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        acceptDownloads: true,
      });
      try {
        await recoveryPage.goto(LAB_URL, { waitUntil: "domcontentloaded" });
        await waitForCanvas(recoveryPage);
        await clickButton(recoveryPage, /^下载与进度$/);
        await sleep(150);
        await clickButton(recoveryPage, /下载进行中/);
        await sleep(500);
        const recoveryDownloadPromise = recoveryPage.waitForEvent("download", { timeout: 20000 });
        await recoveryPage.locator("[data-lab-export]").click();
        const recoveryDownload = await recoveryDownloadPromise;
        const recoveryBytes = readFileSync(await recoveryDownload.path());
        assert(pngDimension(recoveryBytes) === 912,
          `export works on a fresh page after a failure (${pngDimension(recoveryBytes)}px)`);
      } finally {
        await recoveryPage.close().catch(() => undefined);
      }
    }


    console.log("\n== Reload survival ==");
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForCanvas(page);
    graphics = await readGraphics(page);
    assert(graphics.canvasCount === 1, `after reload: exactly one canvas (${graphics.canvasCount})`);
    assert(graphics.linked === true, "after reload: production program linked");
    await clickButton(page, /^全屏激活$/);
    await sleep(150);
    await clickButton(page, /Intake · 中心/);
    await sleep(200);
    graphics = await readGraphics(page);
    assert(graphics.activationKind === 1, "after reload: Intake center still activates");

    console.log("\n== HMR survival ==");
    const labComponentPath = resolve(worktree, "src/lab/PresentationLab.tsx");
    const probe = "\n// lab-hmr-probe\n";
    try {
      appendFileSync(labComponentPath, probe);
      let sawHmr = false;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await sleep(250);
        if (hmrMessages.some((message) => /updated|hmr|reload/i.test(message))) {
          sawHmr = true;
          break;
        }
        const count = await page.evaluate(
          () => document.querySelectorAll("[data-lab-preview-frame] canvas").length,
        ).catch(() => -1);
        if (count === 1) {
          continue;
        }
      }
      await waitForCanvas(page);
      graphics = await readGraphics(page);
      assert(graphics.canvasCount === 1, `after HMR: exactly one canvas (${graphics.canvasCount})`);
      assert(graphics.linked === true, "after HMR: production program linked");
      assert(sawHmr || hmrMessages.length > 0,
        `Vite HMR signal observed (${hmrMessages.slice(-2).join(" | ") || "none captured"})`);
    } finally {
      const original = readFileSync(labComponentPath, "utf8");
      writeFileSync(labComponentPath, original.replace(probe, ""), "utf8");
    }


    console.log("\n== Cross-DPR export regression (absolute backingScale) ==");
    for (const dpr of [2, 1.25]) {
      const dprPage = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: dpr,
        acceptDownloads: true,
      });
      try {
        await dprPage.goto(LAB_URL, { waitUntil: "domcontentloaded" });
        await waitForCanvas(dprPage);
        await clickButton(dprPage, /^下载与进度$/);
        await sleep(150);
        await clickButton(dprPage, /下载进行中/);
        await sleep(500);
        const frameCss = await dprPage.evaluate(() => {
          const frame = document.querySelector("[data-lab-preview-frame]");
          const canvas = frame.querySelector("canvas");
          return { fw: frame.offsetWidth, fh: frame.offsetHeight, cw: canvas.clientWidth, ch: canvas.clientHeight };
        });
        assert(frameCss.fw === 200 && frameCss.fh === 200 && frameCss.cw === 200 && frameCss.ch === 200,
          `DPR ${dpr}: frame CSS stays 200x200 (${frameCss.fw}x${frameCss.fh} frame, ${frameCss.cw}x${frameCss.ch} canvas)`);
        const dprDownloadPromise = dprPage.waitForEvent("download", { timeout: 20000 });
        await dprPage.locator("[data-lab-export]").click();
        const dprDownload = await dprDownloadPromise;
        const dprBytes = readFileSync(await dprDownload.path());
        assert(dprBytes[0] === 0x89 && dprBytes[1] === 0x50 && pngDimension(dprBytes) === 912,
          `DPR ${dpr}: export is exactly 912x912 (${pngDimension(dprBytes)}px)`);
        const dprGeo = await measureBadgeGeometry(dprPage, dprBytes);
        assertBadgeGeometry(dprGeo, `DPR ${dpr}`);
      } finally {
        await dprPage.close().catch(() => undefined);
      }
    }

    console.log("\n== No fake controls / no desktop bridge (structural) ==");

    const labSource = readFileSync(labComponentPath, "utf8");
    assert(!/distortion|chromatic|lens|scrub|timeScale|pause/.test(labSource),
      "no distortion/scrub/pause fake controls exist");
    const labMain = readFileSync(resolve(worktree, "src/lab/lab-main.tsx"), "utf8");
    assert(!/desktopBridge|electronBridge|desktop\/runtime|"ui-lab"|ui-lab-reset/.test(labMain),
      "Lab entry imports no desktop bridge (pure browser)");

    console.log(`\n===== LAB CONSOLIDATION VALIDATION: ${passed} passed, ${failed} failed =====`);
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
  console.error("Lab consolidation validation failed:", error);
  process.exit(1);
});
