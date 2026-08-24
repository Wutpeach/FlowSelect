import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const evidence = fileURLToPath(new URL("./evidence/", import.meta.url));
mkdirSync(evidence, { recursive: true });
const actions = [
  { key: "surprised", random: 0, max: "first hold" },
  { key: "curious-short", random: 0.45, max: "second hold" },
  { key: "playful-short", random: 0.99, max: "first hold" },
];
const captures = await Promise.all(actions.map(async ({ key, random, max }) => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript((value) => { Math.random = () => value; }, random);
  await page.goto("http://127.0.0.1:1421/lab.html", { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByRole("button", { name: /紧凑|Compact/i }).click();
  const started = await page.evaluate(() => performance.now());
  const deadline = 18_000 + random * 14_000;
  const frames = [
    { label: `first hold${max === "first hold" ? " · max rotation" : ""}`, at: deadline + 800 },
    { label: "transition", at: deadline + 3_050 },
    { label: `second hold${max === "second hold" ? " · max rotation" : ""}`, at: deadline + 3_700 },
  ];
  const stage = page.locator("[data-lab-compact-stage]");
  const png = [];
  for (const frame of frames) {
    const elapsed = await page.evaluate((then) => performance.now() - then, started);
    await page.waitForTimeout(Math.max(0, frame.at - elapsed));
    png.push({ ...frame, png: await stage.screenshot({ scale: "css" }) });
  }
  await browser.close();
  return { key, frames: png };
}));
const panels = captures.flatMap(({ key, frames }, actionIndex) => frames.map(({ label, png }, frameIndex) => {
  const x = 14 + frameIndex * 176;
  const y = 62 + actionIndex * 158;
  return `<g transform="translate(${x} ${y})"><rect width="164" height="144" rx="12" fill="#19171c"/><text x="82" y="20" fill="#f4edf4" font-family="system-ui" font-size="11" font-weight="700" text-anchor="middle">${key}</text><text x="82" y="34" fill="#c9bcc8" font-family="system-ui" font-size="9" text-anchor="middle">${label}</text><image x="42" y="43" width="80" height="80" href="data:image/png;base64,${png.toString("base64")}"/></g>`;
}));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="542" height="544" viewBox="0 0 542 544"><rect width="542" height="544" fill="#0e0d10"/><text x="14" y="26" fill="#fff" font-family="system-ui" font-size="17" font-weight="700">Production Compact retained actions</text><text x="14" y="43" fill="#c9bcc8" font-family="system-ui" font-size="10">Each real browser-Lab action is sampled at its first hold, transition, and second hold.</text>${panels.join("")}</svg>`;
writeFileSync(`${evidence}/final-retained-actions.svg`, svg);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 542, height: 544 }, deviceScaleFactor: 1 });
await page.setContent(svg);
await page.locator("svg").screenshot({ path: `${evidence}/final-retained-actions.png`, scale: "css" });
await browser.close();
