// MR9 Paper Heatmap Literal Fidelity spike — capture harness.
// Drives the existing dev-only Browser Lab (127.0.0.1:1421/lab.html), pins
// phases by polling the production WebGL2 uTime uniform, and saves an
// exploratory sweep plus readout log into research/mr9-literal-fidelity/.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const LAB_URL = "http://127.0.0.1:1421/lab.html";
const OUT = "D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx/.trellis/tasks/08-15-mr9-fullscreen-activation-fx-progress-visual-refinement/research/mr9-literal-fidelity";
mkdirSync(OUT, { recursive: true });

// Canonical Frame 2-5 aligned captures (source-informed arc: warm onset ->
// spread -> warm volume with cool pocket -> cool pocket enlargement) plus
// useful in-betweens and the reduced snapshot.
const TARGETS = [
  { name: "f2", k: 0.10 },
  { name: "f3", k: 0.18 },
  { name: "f4", k: 0.26 },
  { name: "f5", k: 0.34 },
  { name: "in-between-a", k: 0.14 },
  { name: "in-between-b", k: 0.22 },
  { name: "in-between-c", k: 0.30 },
];

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

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

const waitForProgram = async () => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const prog = await page.evaluate(() => {
      const c = document.querySelector("[data-lab-preview-frame] canvas");
      const gl = c?.getContext("webgl2");
      const p = gl?.getParameter(gl.CURRENT_PROGRAM);
      return p ? gl.getProgramParameter(p, gl.LINK_STATUS) : null;
    });
    if (prog === true) return true;
    await page.waitForTimeout(100);
  }
  return false;
};

const readK = async () => {
  const t = await readUniform("uTime");
  if (t === null) return null;
  return (t * 0.10) % 1.0;
};

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.goto(LAB_URL, { waitUntil: "networkidle" });
await page.waitForSelector("[data-lab-preview-frame]", { timeout: 15000 });

// Open the Heatmap Spike category and the moving preset (locale-agnostic).
await page.getByRole("button", { name: /热力图实验|Heatmap Spike/ }).click();
await page.click('[data-lab-preset="heatmap-moving"]');
await page.waitForTimeout(600);
await waitForProgram();

const readout0 = await page.evaluate(() => {
  const c = document.querySelector("[data-lab-preview-frame] canvas");
  const gl = c?.getContext("webgl2");
  const prog = gl?.getParameter(gl.CURRENT_PROGRAM);
  const read = (n) => {
    if (!prog) return null;
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
    // Renderer ownership proof: exactly one bound texture (unit 0) and no
    // framebuffer in use — one-pass composition, no second render target.
    boundTexture2D: gl.getParameter(gl.TEXTURE_BINDING_2D) !== null,
    activeTextureUnit: gl.getParameter(gl.ACTIVE_TEXTURE),
    framebufferBound: gl.getParameter(gl.FRAMEBUFFER_BINDING),
  };
});
console.log("MOVING readout:", JSON.stringify(readout0));

const frame = page.locator("[data-lab-preview-frame]");
// Hide the lab's own decorative center chrome (a 16px white-bordered circle
// the lab overlays on every preview) so capture evidence shows only the
// heatmap material, not a lab-UI marker.
await page.evaluate(() => {
  const el = document.querySelector("[data-lab-chrome]");
  if (el) {
    el.style.display = "none";
  }
});
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

writeFileSync(
  `${OUT}/capture-log.json`,
  JSON.stringify(
    { moving: readout0, targets: captured, reduced: readoutR, uTimeFrozen: t1 === t2, pageErrors },
    null,
    2,
  ),
);
console.log("log written; pageErrors:", pageErrors.length);
await browser.close();
console.log("DONE");
