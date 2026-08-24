import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const evidence = fileURLToPath(new URL("./evidence/", import.meta.url));
const compactPanels = [
  ["final-neutral-front-1x", "neutral/front · primary"],
  ["final-idle-low-amplitude-1x", "idle · low amplitude"],
  ["final-pointer-approach-1x", "pointer approach"],
  ["final-reduced-motion-1x", "Reduced Motion"],
];
const compact = compactPanels.map(([name, label], index) => {
  const png = readFileSync(`${evidence}/${name}.png`).toString("base64");
  const x = 14 + index * 132;
  return `<g transform="translate(${x} 62)"><rect width="120" height="132" rx="12" fill="#19171c"/><text x="60" y="20" fill="#f4edf4" font-family="system-ui" font-size="10" font-weight="700" text-anchor="middle">${label}</text><image x="20" y="33" width="80" height="80" href="data:image/png;base64,${png}"/></g>`;
}).join("");
const full = readFileSync(`${evidence}/final-full-mr9-regression.png`).toString("base64");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="542" height="354" viewBox="0 0 542 354"><rect width="542" height="354" fill="#0e0d10"/><text x="14" y="26" fill="#fff" font-family="system-ui" font-size="17" font-weight="700">Production Compact static regression matrix</text><text x="14" y="43" fill="#c9bcc8" font-family="system-ui" font-size="10">Tight production-leaf crops · unchanged 80/60/56 Compact host</text>${compact}<g transform="translate(14 212)"><rect width="514" height="128" rx="12" fill="#19171c"/><text x="12" y="20" fill="#f4edf4" font-family="system-ui" font-size="11" font-weight="700">Full / MR9 unchanged comparison</text><image x="170" y="28" width="174" height="88" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${full}"/></g></svg>`;
writeFileSync(`${evidence}/final-static-regressions.svg`, svg);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 542, height: 354 }, deviceScaleFactor: 1 });
await page.setContent(svg);
await page.locator("svg").screenshot({ path: `${evidence}/final-static-regressions.png`, scale: "css" });
await browser.close();
