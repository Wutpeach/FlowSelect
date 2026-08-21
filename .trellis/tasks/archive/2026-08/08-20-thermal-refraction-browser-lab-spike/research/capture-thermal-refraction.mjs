import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const LAB_URL = "http://127.0.0.1:1421/lab.html";
const evidenceName = process.argv[2] ?? "thermal-refraction";
const OUT = `D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx/.trellis/tasks/08-20-thermal-refraction-browser-lab-spike/research/${evidenceName}/evidence`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") pageErrors.push(`console: ${message.text()}`);
});

await page.goto(LAB_URL, { waitUntil: "networkidle" });
await page.waitForSelector("[data-lab-preview-frame]", { timeout: 15000 });
await page.getByRole("button", { name: /热力图实验|Heatmap Spike/ }).click();
await page.click('[data-lab-preset="heatmap-refraction-reduced"]');
await page.waitForFunction(() => {
  const canvas = document.querySelector("[data-lab-preview-frame] canvas");
  const gl = canvas?.getContext("webgl2");
  const program = gl?.getParameter(gl.CURRENT_PROGRAM);
  return program ? gl.getProgramParameter(program, gl.LINK_STATUS) === true : false;
}, { timeout: 30000 });

const frame = page.locator("[data-lab-preview-frame]");
await page.evaluate(() => {
  const marker = document.querySelector("[data-lab-chrome]");
  if (marker instanceof HTMLElement) marker.style.display = "none";
});

const drawPinned = async ({ k, reducedMotion, refraction }) => page.evaluate(
  ({ k: phase, reducedMotion: reduced, refraction: enabled }) => {
    const canvas = document.querySelector("[data-lab-preview-frame] canvas");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing Lab canvas");
    const gl = canvas.getContext("webgl2");
    if (gl === null) throw new Error("Missing WebGL2 context");
    const program = gl.getParameter(gl.CURRENT_PROGRAM);
    if (!program) throw new Error("Missing linked program");
    const setFloat = (name, value) => {
      const location = gl.getUniformLocation(program, name);
      if (location === null) throw new Error(`Missing ${name}`);
      gl.uniform1f(location, value);
    };
    const setInt = (name, value) => {
      const location = gl.getUniformLocation(program, name);
      if (location === null) throw new Error(`Missing ${name}`);
      gl.uniform1i(location, value);
    };
    setFloat("uTime", reduced ? 0 : phase / 0.13);
    setInt("uReducedMotion", reduced ? 1 : 0);
    setInt("uHeatmapMode", 1);
    setInt("uRefractionMode", enabled ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return {
      canvasCount: document.querySelectorAll("canvas").length,
      width: canvas.width,
      height: canvas.height,
      linked: gl.getProgramParameter(program, gl.LINK_STATUS),
      time: gl.getUniform(program, gl.getUniformLocation(program, "uTime")),
      reducedMotion: gl.getUniform(program, gl.getUniformLocation(program, "uReducedMotion")),
      heatmapMode: gl.getUniform(program, gl.getUniformLocation(program, "uHeatmapMode")),
      refractionMode: gl.getUniform(program, gl.getUniformLocation(program, "uRefractionMode")),
      boundTexture2D: gl.getParameter(gl.TEXTURE_BINDING_2D) !== null,
      framebufferBound: gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null,
    };
  },
  { k, reducedMotion, refraction },
);

const captures = [];
for (const k of [0.1, 0.25, 0.35, 0.5]) {
  const phase = String(Math.round(k * 100)).padStart(3, "0");
  for (const refraction of [false, true]) {
    const readout = await drawPinned({ k, reducedMotion: false, refraction });
    const name = `${refraction ? "refraction" : "baseline"}-k${phase}`;
    await frame.screenshot({ path: `${OUT}/${name}.png` });
    captures.push({ name, k, refraction, reducedMotion: false, readout });
  }
}

for (const refraction of [false, true]) {
  const readout = await drawPinned({ k: 0.42, reducedMotion: true, refraction });
  const name = `${refraction ? "refraction" : "baseline"}-reduced`;
  await frame.screenshot({ path: `${OUT}/${name}.png` });
  const t1 = readout.time;
  await page.waitForTimeout(500);
  const t2 = await page.evaluate(() => {
    const canvas = document.querySelector("[data-lab-preview-frame] canvas");
    const gl = canvas?.getContext("webgl2");
    const program = gl?.getParameter(gl.CURRENT_PROGRAM);
    const location = program ? gl.getUniformLocation(program, "uTime") : null;
    return location ? gl.getUniform(program, location) : null;
  });
  captures.push({
    name,
    k: 0.42,
    refraction,
    reducedMotion: true,
    timeFrozen: t1 === t2,
    readout,
  });
}

const log = { pageErrors, captures };
writeFileSync(`${OUT}/capture-log.json`, JSON.stringify(log, null, 2));
await browser.close();
