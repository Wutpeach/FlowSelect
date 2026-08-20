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
  const prog = gl.getParameter(gl.CURRENT_PROGRAM);
  const shaders = gl.getAttachedShaders(prog);
  const src = [];
  for (const s of shaders) {
    const t = gl.getShaderParameter(s, gl.SHADER_TYPE);
    src.push({ type: t === gl.FRAGMENT_SHADER ? "FRAG" : "VERT", source: gl.getShaderSource(s) });
  }
  // read reducedMotion properly
  const read = (n) => { const loc = gl.getUniformLocation(prog, n); return loc ? gl.getUniform(prog, loc) : "n/a"; };
  return { src, reducedMotion: read("uReducedMotion"), heatmapMode: read("uHeatmapMode") };
});
const fs = out.src.find(s => s.type === "FRAG");
const frag = fs.source;
const marker = frag.indexOf("heatmapOutput");
const hasHeatmap = marker >= 0;
const clampLine = frag.split("\n").filter(l => l.includes("clamp(")).join("\n");
const pLine = frag.split("\n").filter(l => l.includes("float p =")).join("\n");
console.log("HAS heatmapOutput:", hasHeatmap);
console.log("clamp lines:", clampLine);
console.log("p line:", pLine);
console.log("reducedMotion:", out.reducedMotion, "heatmapMode:", out.heatmapMode);
console.log("frag length:", frag.length);
await browser.close();
