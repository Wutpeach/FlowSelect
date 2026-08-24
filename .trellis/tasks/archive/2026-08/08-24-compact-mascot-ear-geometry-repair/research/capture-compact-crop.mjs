import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const label = process.env.AMEOW_CAPTURE_LABEL ?? "neutral";
const evidence = fileURLToPath(new URL("./evidence/", import.meta.url));
mkdirSync(evidence, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:1421/lab.html", { waitUntil: "networkidle", timeout: 60_000 });
await page.getByRole("button", { name: /紧凑|Compact/i }).click();
const stage = page.locator("[data-lab-compact-stage]");
await stage.screenshot({ path: `${evidence}/${label}.png`, scale: "css" });
await browser.close();
