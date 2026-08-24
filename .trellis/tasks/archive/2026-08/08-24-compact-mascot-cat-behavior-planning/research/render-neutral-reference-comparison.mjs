import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const evidence = fileURLToPath(new URL("./evidence/", import.meta.url));
const referencePath = "C:\\Users\\ADMINI~1\\AppData\\Local\\Temp\\maker-core-image-resize\\599a723f5902152f22a87fccfda7aad6cdc10f6d45a1a95a9954c508adbbb0f3.webp";
const reference = readFileSync(referencePath).toString("base64");
const compact = readFileSync(`${evidence}/kirby-cat-1x.png`).toString("base64");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="268" viewBox="0 0 520 268"><rect width="520" height="268" fill="#0e0d10"/><text x="18" y="28" fill="#fff" font-family="system-ui" font-size="18" font-weight="700">Neutral front silhouette comparison</text><text x="18" y="48" fill="#c9bcc8" font-family="system-ui" font-size="10">Reference and real Lab neutral at 1× — proportional silhouette check, not a pixel copy.</text><g transform="translate(18 68)"><rect width="232" height="180" rx="14" fill="#19171c"/><text x="116" y="22" fill="#f4edf4" font-family="system-ui" font-size="12" font-weight="700" text-anchor="middle">User-supplied reference</text><clipPath id="reference-crop"><rect x="56" y="32" width="120" height="132" rx="9"/></clipPath><image clip-path="url(#reference-crop)" x="-4" y="-28" width="248" height="248" href="data:image/webp;base64,${reference}"/><text x="116" y="176" fill="#c9bcc8" font-family="system-ui" font-size="10" text-anchor="middle">tip spacing ≈ .675 head width</text></g><g transform="translate(270 68)"><rect width="232" height="180" rx="14" fill="#19171c"/><text x="116" y="22" fill="#f4edf4" font-family="system-ui" font-size="12" font-weight="700" text-anchor="middle">Ameow production Lab · neutral 1×</text><image x="36" y="32" width="160" height="160" href="data:image/png;base64,${compact}"/><text x="116" y="176" fill="#c9bcc8" font-family="system-ui" font-size="10" text-anchor="middle">tip spacing .521 · .95 shell-safe</text></g></svg>`;
writeFileSync(`${evidence}/neutral-reference-comparison.svg`, svg);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 520, height: 268 }, deviceScaleFactor: 1 });
await page.setContent(svg);
await page.locator("svg").screenshot({ path: `${evidence}/neutral-reference-comparison.png`, scale: "css" });
await browser.close();
