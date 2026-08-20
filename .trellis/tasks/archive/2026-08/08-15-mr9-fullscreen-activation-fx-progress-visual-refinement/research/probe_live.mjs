import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://127.0.0.1:1421/lab.html", { waitUntil: "networkidle" });
await page.waitForSelector("[data-lab-preview-frame]", { timeout: 15000 });
await page.getByRole("button", { name: /热力图实验|Heatmap Spike/ }).click();
await page.click('[data-lab-preset="heatmap-moving"]');
await page.waitForTimeout(800);
const out = await page.evaluate(() => {
  const c = document.querySelector("[data-lab-preview-frame] canvas");
  const gl = c.getContext("webgl2");
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w*h*4);
  gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
  const get = (fx, fy) => { // fx,fy in canvas UV (0=bottom)
    const x = Math.floor(fx*w), y = Math.floor(fy*h);
    const i = (y*w+x)*4;
    return [px[i],px[i+1],px[i+2],px[i+3]];
  };
  // sample: center, center-bottom (warm in sim), center-top
  return {
    drawW: w, drawH: h,
    center: get(0.5,0.5),
    centerBottom: get(0.5,0.2),
    centerTop: get(0.5,0.8),
    left: get(0.3,0.5),
    time: (() => { const loc = gl.getUniformLocation(gl.getParameter(gl.CURRENT_PROGRAM),"uTime"); const v = loc?gl.getUniform(gl.getParameter(gl.CURRENT_PROGRAM),loc):null; return v; })(),
  };
});
console.log(JSON.stringify(out));
await browser.close();
