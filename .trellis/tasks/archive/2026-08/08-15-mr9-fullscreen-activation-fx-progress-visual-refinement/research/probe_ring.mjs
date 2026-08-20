import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://127.0.0.1:1421/lab.html", { waitUntil: "networkidle" });
await page.waitForSelector("[data-lab-preview-frame]", { timeout: 15000 });
const info = await page.evaluate(() => {
  const frame = document.querySelector("[data-lab-preview-frame]");
  if (!frame) return { err: "no frame" };
  const children = Array.from(frame.children).map((el) => ({
    tag: el.tagName, cls: el.className, dataAttr: Array.from(el.attributes||[]).filter(a=>a.name.startsWith("data-")).map(a=>`${a.name}=${a.value}`),
    canvas: !!el.querySelector("canvas"),
    css: (()=>{ const s=getComputedStyle(el); return {position:s.position, w:s.width, h:s.height, borderRadius:s.borderRadius, background:s.backgroundColor, border:s.border}; })(),
  }));
  const rect = frame.getBoundingClientRect();
  return { frameRect: {x:rect.x,y:rect.y,w:rect.width,h:rect.height}, children };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
