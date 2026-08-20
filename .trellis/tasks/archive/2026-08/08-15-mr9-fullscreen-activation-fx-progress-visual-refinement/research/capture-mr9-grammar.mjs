// MR9 grammar capture harness retained with the visual-spike evidence.
// Drives the existing dev-only Browser Lab (127.0.0.1:1421/lab.html),
// pins phases by polling the production WebGL2 uTime uniform, and saves
// seven ordered frames plus one reduced-motion frame. The contact sheet is
// assembled from those captures as a separate evidence artifact.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const LAB_URL = "http://127.0.0.1:1421/lab.html";
const OUT = "D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx/.trellis/tasks/08-15-mr9-fullscreen-activation-fx-progress-visual-refinement/research/mr9-grammar";
mkdirSync(OUT, { recursive: true });

// Seven phases matching the Paper reference frames (top-edge onset -> inward
// shell -> morphing cavity -> coordinated peak -> contraction/dissipation).
const TARGETS = [
  { name: "f1-onset", k: 0.05 },
  { name: "f2-growth", k: 0.20 },
  { name: "f3-shell", k: 0.34 },
  { name: "f4-cavity", k: 0.46 },
  { name: "f5-perimeter", k: 0.58 },
  { name: "f6-peak", k: 0.68 },
  { name: "f7-contract", k: 0.86 },
];

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// Read the production WebGL2 uniform (same technique as the Lab readout).
const readUniform = (name) =>
  page.evaluate((n) => {
    const c = document.querySelector("[data-lab-preview-frame] canvas");
    if (!c) return null;
    const gl = c.getContext("webgl2");
    if (!gl) return null;
    const prog = gl.getParameter(gl.CURRENT_PROGRAM);
    if (!prog) return null;
    const loc = gl.getUniformLocation(prog, n);
    if (!loc) return null;
    const v = gl.getUniform(prog, loc);
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }, name);

const readK = async () => {
  const t = await readUniform("uTime");
  if (t === null) return null;
  return (t * 0.10) % 1.0;
};

await page.goto(LAB_URL, { waitUntil: "networkidle" });
await page.waitForSelector("[data-lab-preview-frame]", { timeout: 15000 });

// Open the Heatmap Spike category and the moving preset (locale-agnostic).
await page.getByRole("button", { name: /热力图实验|Heatmap Spike/ }).click();
await page.click('[data-lab-preset="heatmap-moving"]');
await page.waitForTimeout(600);

const readout0 = await page.evaluate(() => {
  const c = document.querySelector("[data-lab-preview-frame] canvas");
  const gl = c?.getContext("webgl2");
  const prog = gl?.getParameter(gl.CURRENT_PROGRAM);
  const read = (n) => {
    const loc = gl.getUniformLocation(prog, n);
    const v = loc ? gl.getUniform(prog, loc) : null;
    return typeof v === "number" ? v : null;
  };
  return {
    canvasCount: document.querySelectorAll("canvas").length,
    linked: prog ? gl.getProgramParameter(prog, gl.LINK_STATUS) : false,
    heatmapMode: read("uHeatmapMode"),
    cornerRadius: read("uCornerRadius"),
    reducedMotion: read("uReducedMotion"),
    time: read("uTime"),
  };
});
console.log("MOVING readout:", JSON.stringify(readout0));

const frame = page.locator("[data-lab-preview-frame]");
const captured = [];

for (const t of TARGETS) {
  let got = null;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const k = await readK();
    if (k !== null && Math.abs(k - t.k) < 0.004) {
      const path = `${OUT}/${t.name}.png`;
      await frame.screenshot({ path });
      const kAfter = await readK();
      got = { target: t.k, k: k === null ? -1 : k, kAfter };
      console.log(`captured ${t.name} target=${t.k} k=${k.toFixed(4)} kAfter=${kAfter?.toFixed(4)}`);
      break;
    }
    await page.waitForTimeout(20);
  }
  if (!got) console.log(`MISSED ${t.name} target=${t.k}`);
  captured.push(got ?? { target: t.k, k: -1, kAfter: -1 });
}

// Reduced Motion: static snapshot + no-travel proof (uTime frozen).
await page.click('[data-lab-preset="heatmap-reduced"]');
await page.waitForTimeout(600);
const t1 = await readUniform("uTime");
await page.waitForTimeout(500);
const t2 = await readUniform("uTime");
const readoutR = await page.evaluate(() => {
  const c = document.querySelector("[data-lab-preview-frame] canvas");
  const gl = c?.getContext("webgl2");
  const prog = gl?.getParameter(gl.CURRENT_PROGRAM);
  const read = (n) => {
    const loc = gl.getUniformLocation(prog, n);
    const v = loc ? gl.getUniform(prog, loc) : null;
    return typeof v === "number" ? v : null;
  };
  return {
    heatmapMode: read("uHeatmapMode"),
    reducedMotion: read("uReducedMotion"),
    time: read("uTime"),
  };
});
console.log("REDUCED readout:", JSON.stringify(readoutR), "uTime t1/t2:", t1, t2);
await frame.screenshot({ path: `${OUT}/reduced.png` });
console.log("reduced captured");

console.log("capture summary:", JSON.stringify(captured));
await browser.close();
console.log("DONE");
