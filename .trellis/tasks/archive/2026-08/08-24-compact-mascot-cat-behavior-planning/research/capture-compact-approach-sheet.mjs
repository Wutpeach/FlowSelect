import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const evidence = fileURLToPath(new URL("./evidence/", import.meta.url));
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:1421/lab.html", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "紧凑" }).click();
await page.getByText("紧凑 · 指针").click();
const stage = page.locator("[data-lab-compact-stage]");
const approach = page.locator("[data-lab-compact-approach]");
const box = await approach.boundingBox();
if (box === null) throw new Error("Compact approach capture is not visible");
const samples = [
  ["NW", 18, 18, "r31"], ["N", 40, 8, "r32"], ["NE", 62, 18, "r31"],
  ["W", 8, 40, "r32"], ["center", 40, 40, "r0"], ["E", 72, 40, "r32"],
  ["SW", 18, 62, "r31"], ["S", 40, 72, "r32"], ["SE", 62, 62, "r31"],
];
for (const sample of samples) {
  const [, x, y] = sample;
  await page.mouse.move(box.x + x + 16, box.y + y + 16);
  sample.push(await stage.screenshot({ scale: "css" }));
}
const panel = (label, sampleX, sampleY, range, png, x, y) => {
  const encoded = png.toString("base64");
  return `<g transform="translate(${x} ${y})"><rect width="156" height="144" rx="14" fill="#19171c"/><text x="78" y="23" fill="#f4edf4" font-family="system-ui" font-size="14" font-weight="700" text-anchor="middle">${label} · ${range}</text><rect x="38" y="33" width="80" height="80" rx="4" fill="#111"/><image x="38" y="33" width="80" height="80" href="data:image/png;base64,${encoded}"/><circle cx="78" cy="73" r="19" fill="none" stroke="#f5b965" stroke-width="1.2" stroke-dasharray="3 2"/><circle cx="${38 + sampleX}" cy="${33 + sampleY}" r="3" fill="#8ad8ff" stroke="#0e0d10" stroke-width="1"/><text x="78" y="133" fill="#c9bcc8" font-family="system-ui" font-size="10" text-anchor="middle">hotspot r19 · dot sample</text></g>`;
};
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="510" viewBox="0 0 500 510"><rect width="500" height="510" fill="#0e0d10"/><text x="16" y="26" fill="#fff" font-family="system-ui" font-size="18" font-weight="700">Production Compact pointer approach</text><text x="16" y="46" fill="#c9bcc8" font-family="system-ui" font-size="11">Same 80px shell. Dashed r19 is the Windows hotspot; every r31/r32 sample stays outside.</text>${samples.map(([label, sampleX, sampleY, range, png], index) => panel(label, sampleX, sampleY, range, png, 16 + (index % 3) * 164, 62 + Math.floor(index / 3) * 148)).join("")}</svg>`;
writeFileSync(`${evidence}/compact-pointer-approach.svg`, svg);
const sheet = await browser.newPage({ viewport: { width: 500, height: 510 }, deviceScaleFactor: 1 });
await sheet.setContent(svg);
await sheet.locator("svg").screenshot({ path: `${evidence}/compact-pointer-approach.png`, scale: "css" });
await browser.close();
