import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const LAB_URL = "http://127.0.0.1:1421/lab.html";
const OUT = fileURLToPath(new URL("./final-evidence/", import.meta.url));
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
await page.waitForSelector("[data-lab-preview-frame]", { timeout: 15_000 });
await page.getByRole("button", { name: /热力图实验|Heatmap Spike/ }).click();
await page.click('[data-lab-preset="heatmap-refraction-reduced"]');
await page.waitForFunction(() => {
  const canvas = document.querySelector("[data-lab-preview-frame] canvas");
  const gl = canvas?.getContext("webgl2");
  const program = gl?.getParameter(gl.CURRENT_PROGRAM);
  return program ? gl.getProgramParameter(program, gl.LINK_STATUS) === true : false;
}, { timeout: 30_000 });

await page.evaluate(() => {
  const chrome = document.querySelector("[data-lab-chrome]");
  if (chrome instanceof HTMLElement) chrome.style.display = "none";
});
const frame = page.locator("[data-lab-preview-frame]");

const drawPinned = ({ k, reducedMotion, refraction }) => page.evaluate(
  ({ phase, reduced, enabled }) => {
    const canvas = document.querySelector("[data-lab-preview-frame] canvas");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing Lab canvas");
    const gl = canvas.getContext("webgl2");
    if (gl === null) throw new Error("Missing WebGL2 context");
    const program = gl.getParameter(gl.CURRENT_PROGRAM);
    if (!program) throw new Error("Missing linked program");
    const setFloat = (name, value) => gl.uniform1f(gl.getUniformLocation(program, name), value);
    const setInt = (name, value) => gl.uniform1i(gl.getUniformLocation(program, name), value);
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
      textureBound: gl.getParameter(gl.TEXTURE_BINDING_2D) !== null,
      framebufferBound: gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null,
    };
  },
  { phase: k, reduced: reducedMotion, enabled: refraction },
);

const phases = [
  ["before-entry", 0],
  ["first-contact", 0.08],
  ["mid-ramp", 0.15],
  ["developed-early", 0.31],
  ["developed-middle", 0.42],
  ["developed-late", 0.53],
  ["near-exit", 0.65],
  ["post-boundary", 0.84],
  ["exact-zero", 0.95],
];
const captures = [];
for (const refraction of [false, true]) {
  for (const [phaseName, k] of phases) {
    const readout = await drawPinned({ k, reducedMotion: false, refraction });
    const name = `${refraction ? "refraction" : "baseline"}-${phaseName}`;
    const image = await frame.screenshot({ path: `${OUT}/${name}.png` });
    captures.push({
      name,
      k,
      refraction,
      reducedMotion: false,
      sha256: createHash("sha256").update(image).digest("hex"),
      readout,
    });
  }
  const readout = await drawPinned({ k: 0.42, reducedMotion: true, refraction });
  const name = `${refraction ? "refraction" : "baseline"}-reduced-motion`;
  const image = await frame.screenshot({ path: `${OUT}/${name}.png` });
  captures.push({
    name,
    k: 0.42,
    refraction,
    reducedMotion: true,
    sha256: createHash("sha256").update(image).digest("hex"),
    readout,
  });
}

writeFileSync(
  `${OUT}/capture-log.json`,
  `${JSON.stringify({ pageErrors, captures }, null, 2)}\n`,
);
await browser.close();
