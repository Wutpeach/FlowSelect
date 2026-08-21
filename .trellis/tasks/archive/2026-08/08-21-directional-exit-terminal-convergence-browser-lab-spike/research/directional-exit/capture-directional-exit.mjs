import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const LAB_URL = "http://127.0.0.1:1421/lab.html";
const OUT = "D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx/.trellis/tasks/08-21-directional-exit-terminal-convergence-browser-lab-spike/research/directional-exit/evidence";
mkdirSync(OUT, { recursive: true });

const phases = [
  { name: "developed", k: 0.55 },
  { name: "convergence-onset", k: 0.62 },
  { name: "exit-early", k: 0.70 },
  { name: "exit-middle", k: 0.78 },
  { name: "exit-late", k: 0.86 },
  { name: "upper-right-terminal", k: 0.92 },
  { name: "terminal-just-before-zero", k: 0.96 },
  { name: "zero", k: 1.0 },
];

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
await page.click('[data-lab-preset="heatmap-refraction-moving"]');
await page.waitForFunction(() => {
  const canvas = document.querySelector("[data-lab-preview-frame] canvas");
  const gl = canvas?.getContext("webgl2");
  const program = gl?.getParameter(gl.CURRENT_PROGRAM);
  return program ? gl.getProgramParameter(program, gl.LINK_STATUS) === true : false;
}, { timeout: 30000 });

await page.evaluate(() => {
  const marker = document.querySelector("[data-lab-chrome]");
  if (marker instanceof HTMLElement) marker.style.display = "none";
  // Stop the moving Lab runtime after its already-pending frame. Captures then
  // pin the existing shader phase directly without introducing app authority.
  window.requestAnimationFrame = () => 0;
});
await page.waitForTimeout(50);
const frame = page.locator("[data-lab-preview-frame]");
const captures = [];
for (const phase of phases) {
  const readout = await page.evaluate(({ k }) => {
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
    setFloat("uTime", k / 0.13);
    setInt("uReducedMotion", 0);
    setInt("uHeatmapMode", 1);
    setInt("uRefractionMode", 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let activePixels = 0;
    let lowerLeftActive = 0;
    let upperRightActive = 0;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const alpha = pixels[(y * canvas.width + x) * 4 + 3];
        if (alpha <= 12) continue;
        activePixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        if (x < canvas.width / 2 && y < canvas.height / 2) lowerLeftActive += 1;
        if (x >= canvas.width / 2 && y >= canvas.height / 2) upperRightActive += 1;
      }
    }
    return {
      k,
      canvasCount: document.querySelectorAll("canvas").length,
      width: canvas.width,
      height: canvas.height,
      linked: gl.getProgramParameter(program, gl.LINK_STATUS),
      heatmapMode: gl.getUniform(program, gl.getUniformLocation(program, "uHeatmapMode")),
      refractionMode: gl.getUniform(program, gl.getUniformLocation(program, "uRefractionMode")),
      reducedMotion: gl.getUniform(program, gl.getUniformLocation(program, "uReducedMotion")),
      boundTexture2D: gl.getParameter(gl.TEXTURE_BINDING_2D) !== null,
      framebufferBound: gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null,
      activePixels,
      activeFraction: activePixels / (canvas.width * canvas.height),
      lowerLeftActive,
      upperRightActive,
      activeBounds: activePixels === 0 ? null : { minX, minY, maxX, maxY },
    };
  }, phase);
  await frame.screenshot({ path: `${OUT}/${phase.name}.png` });
  captures.push({ name: phase.name, ...readout });
}

writeFileSync(`${OUT}/capture-log.json`, JSON.stringify({ pageErrors, captures }, null, 2));
await browser.close();
