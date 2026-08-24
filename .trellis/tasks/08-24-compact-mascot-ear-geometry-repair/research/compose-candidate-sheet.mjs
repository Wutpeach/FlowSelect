import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const evidence = fileURLToPath(new URL("./evidence/", import.meta.url));
const candidates = [
  ["candidate-0-current-diamond-neutral-1x", "0 · current tall diamond", "Rejected · one broad crown"],
  ["candidate-2-short-diamond-neutral-1x", "2 · short diamond", "Rejected · uneven peaks"],
  ["candidate-3-capsule-neutral-1x", "3 · capsule", "Rejected · bear-like crown"],
  ["candidate-4-rounded-cone-neutral-1x", "4 · rounded cone", "Rejected · sharp/small apex"],
  ["candidate-6-wide-set-diamond-neutral-1x", "6 · wide-set diamond", "Rejected · action shell bound"],
  ["candidate-7-deep-root-diamond-neutral-1x", "7 · deep-root diamond", "Selected · cat read + shell"],
];
const panel = ([name, title, verdict], index) => {
  const png = readFileSync(`${evidence}/${name}.png`).toString("base64");
  const x = 14 + (index % 3) * 176;
  const y = 58 + Math.floor(index / 3) * 170;
  return `<g transform="translate(${x} ${y})"><rect width="164" height="154" rx="12" fill="#19171c"/><text x="82" y="21" fill="#f4edf4" font-family="system-ui" font-size="11" font-weight="700" text-anchor="middle">${title}</text><image x="42" y="31" width="80" height="80" href="data:image/png;base64,${png}"/><text x="82" y="134" fill="#c9bcc8" font-family="system-ui" font-size="9" text-anchor="middle">${verdict}</text></g>`;
};
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="542" height="396" viewBox="0 0 542 396"><rect width="542" height="396" fill="#0e0d10"/><text x="14" y="26" fill="#fff" font-family="system-ui" font-size="17" font-weight="700">Compact Mascot 1× production calibration</text><text x="14" y="43" fill="#c9bcc8" font-family="system-ui" font-size="10">Same 80/60/56 host · bounded two-node candidates · neutral/front is the selection gate</text>${candidates.map(panel).join("")}</svg>`;
writeFileSync(`${evidence}/candidate-comparison-1x.svg`, svg);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 542, height: 396 }, deviceScaleFactor: 1 });
await page.setContent(svg);
await page.locator("svg").screenshot({ path: `${evidence}/candidate-comparison-1x.png`, scale: "css" });
await browser.close();
