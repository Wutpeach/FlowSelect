import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://127.0.0.1:1421/lab.html", { waitUntil: "networkidle" });
await page.waitForSelector("[data-lab-preview-frame]", { timeout: 15000 });
await page.getByRole("button", { name: /热力图实验|Heatmap Spike/ }).click();
await page.click('[data-lab-preset="heatmap-moving"]');
await page.waitForTimeout(600);
const data = await page.evaluate(() => {
  const c = document.querySelector("[data-lab-preview-frame] canvas");
  const gl = c.getContext("webgl2");
  // re-fetch the texture: create a fresh FBO and read the currently bound unit-0 texture
  const tex = gl.getParameter(gl.TEXTURE_BINDING_2D);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  const w = 256, h = 256;
  const px = new Uint8Array(w*h*4);
  if (status === gl.FRAMEBUFFER_COMPLETE) {
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  return { status: status === gl.FRAMEBUFFER_COMPLETE, size: gl.getTexParameter(tex, gl.TEXTURE_SIZE) ? 0 : 0, data: Array.from(px) };
});
writeFileSync("texdump.json", JSON.stringify(data));
console.log("status:", data.status, "len:", data.data.length);
await browser.close();
