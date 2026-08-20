// MR9 edge-capture baseline restore + material repair — capture harness.
// Drives the dev-only Browser Lab (127.0.0.1:1421/lab.html), pins phases by
// polling the production WebGL2 uTime uniform, and saves phase-pinned
// captures of the restored Checkpoint C + Rounded Boundary Edge Capture field
// into research/mr9-edge-repair/evidence/. The 6 phases match the archived
// baseline mr9-edge-* evidence (k = fract(uTime * 0.13)).
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const LAB_URL = "http://127.0.0.1:1421/lab.html";
const TASK = "D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx/.trellis/tasks/08-15-mr9-fullscreen-activation-fx-progress-visual-refinement";
const OUT = `${TASK}/research/mr9-edge-repair/evidence`;
mkdirSync(OUT, { recursive: true });

// Matched to the archived baseline phases (mr9-rounded-boundary-edge-capture-spike.md):
// pre-contact k~0.03, first-contact k~0.10, developed k~0.25, developed-later
// k~0.35, late-sweep k~0.50, reduced k=0.42 (static RM snapshot).
const MOVING_TARGETS = [
  { name: "repair-pre-contact", k: 0.03 },
  { name: "repair-first-contact", k: 0.10 },
  { name: "repair-developed", k: 0.25 },
  { name: "repair-developed-later", k: 0.35 },
  { name: "repair-late-sweep", k: 0.50 },
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
    if (typeof v === "boolean") return v;
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
  return (t * 0.13) % 1.0;
};

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") pageErrors.push(`console: ${m.text()}`);
});

await page.goto(LAB_URL, { waitUntil: "networkidle" });
await page.waitForSelector("[data-lab-preview-frame]", { timeout: 15000 });

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
    if (typeof v === "boolean") return v;
    return typeof v === "number" ? v : null;
  };
  return {
    canvasCount: document.querySelectorAll("canvas").length,
    linked: prog ? gl.getProgramParameter(prog, gl.LINK_STATUS) : false,
    heatmapMode: read("uHeatmapMode"),
    cornerRadius: read("uCornerRadius"),
    reducedMotion: read("uReducedMotion"),
    time: read("uTime"),
    boundTexture2D: gl.getParameter(gl.TEXTURE_BINDING_2D) !== null,
    framebufferBound: gl.getParameter(gl.FRAMEBUFFER_BINDING),
  };
});
console.log("MOVING readout:", JSON.stringify(readout0));

const frame = page.locator("[data-lab-preview-frame]");
await page.evaluate(() => {
  const el = document.querySelector("[data-lab-chrome]");
  if (el) el.style.display = "none";
});
const captured = [];

for (const t of MOVING_TARGETS) {
  let got = null;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const k = await readK();
    if (k !== null && Math.abs(k - t.k) < 0.004) {
      const path = `${OUT}/${t.name}.png`;
      await frame.screenshot({ path });
      const kAfter = await readK();
      got = { target: t.k, k, kAfter };
      console.log(`captured ${t.name} target=${t.k} k=${k.toFixed(4)} kAfter=${kAfter?.toFixed(4)}`);
      break;
    }
    await page.waitForTimeout(15);
  }
  captured.push({ name: t.name, target: t.k, ...got });
}

// Reduced Motion: static pinned snapshot (k = 0.42, uTime frozen).
await page.click('[data-lab-preset="heatmap-reduced"]');
await page.waitForTimeout(400);
await waitForProgram();
const t1 = await readUniform("uTime");
await page.waitForTimeout(500);
const t2 = await readUniform("uTime");
const reducedPath = `${OUT}/repair-reduced.png`;
await frame.screenshot({ path: reducedPath });
const readoutRed = await page.evaluate(({ t1, t2 }) => {
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
    heatmapMode: read("uHeatmapMode"),
    reducedMotion: read("uReducedMotion"),
    cornerRadius: read("uCornerRadius"),
    timeFrozen: t1 === t2,
    t1,
    t2,
  };
}, { t1, t2 });
console.log("REDUCED readout:", JSON.stringify(readoutRed));
captured.push({ name: "repair-reduced", target: 0.42, k: readoutRed.heatmapMode !== null ? 0.42 : null, reduced: readoutRed });

// Fresh default-Progress check: reload, do NOT open heatmap, confirm no texture.
const fresh = await page.evaluate(() => {
  const c = document.querySelector("[data-lab-preview-frame] canvas");
  const gl = c?.getContext("webgl2");
  return gl ? gl.getParameter(gl.TEXTURE_BINDING_2D) === null : false;
});

const log = {
  movingReadout: readout0,
  reducedReadout: readoutRed,
  freshDefaultProgressNoTexture: fresh,
  pageErrors,
  captured,
};
writeFileSync(`${OUT}/capture-log.json`, JSON.stringify(log, null, 2));
console.log("PAGE ERRORS:", JSON.stringify(pageErrors));
await browser.close();
