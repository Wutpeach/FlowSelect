// Minimal live probe: read the shader's per-uniform + texture binding state
// from the running lab, and capture a fresh frame.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const OUT = "D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx/.trellis/tasks/08-15-mr9-fullscreen-activation-fx-progress-visual-refinement/research/mr9-literal-fidelity";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://127.0.0.1:1421/lab.html", { waitUntil: "networkidle" });
await page.waitForSelector("[data-lab-preview-frame]", { timeout: 15000 });
await page.getByRole("button", { name: /热力图实验|Heatmap Spike/ }).click();
await page.click('[data-lab-preset="heatmap-moving"]');
await page.waitForTimeout(800);
await page.evaluate(() => { const el = document.querySelector("[data-lab-chrome]"); if (el) el.style.display = "none"; });

// Capture a frame at a known phase by waiting for k ~ 0.18
const readK = () => page.evaluate(() => {
  const c = document.querySelector("[data-lab-preview-frame] canvas");
  const gl = c.getContext("webgl2");
  const prog = gl.getParameter(gl.CURRENT_PROGRAM);
  const loc = gl.getUniformLocation(prog, "uTime");
  const t = loc ? gl.getUniform(prog, loc) : null;
  return typeof t === "number" ? (t * 0.10) % 1.0 : null;
});
const deadline = Date.now() + 90000;
let got = null;
while (Date.now() < deadline) {
  const k = await readK();
  if (k !== null && Math.abs(k - 0.18) < 0.004) {
    await page.locator("[data-lab-preview-frame]").screenshot({ path: `${OUT}/probe-f3.png` });
    got = k;
    break;
  }
  await page.waitForTimeout(20);
}
console.log("captured at k =", got);

const info = await page.evaluate(() => {
  const c = document.querySelector("[data-lab-preview-frame] canvas");
  const gl = c.getContext("webgl2");
  const prog = gl.getParameter(gl.CURRENT_PROGRAM);
  const read = (n) => {
    const loc = gl.getUniformLocation(prog, n);
    const v = loc ? gl.getUniform(prog, loc) : null;
    return v;
  };
  const tex = gl.getParameter(gl.TEXTURE_BINDING_2D);
  let texSize = null;
  let texR = null;
  if (tex) {
    texSize = [gl.getTexParameter(tex, gl.TEXTURE_WIDTH), gl.getTexParameter(tex, gl.TEXTURE_HEIGHT)];
    // sample center + corner texels via readPixels from the texture using a temp fbo
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
      const px = new Uint8Array(4);
      gl.readPixels(128, 128, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      texR = [px[0], px[1], px[2], px[3]];
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
  }
  return {
    heatmapMode: read("uHeatmapMode"),
    cornerRadius: read("uCornerRadius"),
    time: read("uTime"),
    texSize,
    texCenterRGBA: texR,
    programLinked: gl.getProgramParameter(prog, gl.LINK_STATUS),
    blend: gl.isEnabled(gl.BLEND),
    viewport: gl.getParameter(gl.VIEWPORT),
  };
});
console.log(JSON.stringify(info));
writeFileSync(`${OUT}/probe-info.json`, JSON.stringify(info, null, 2));
await browser.close();
console.log("DONE");
