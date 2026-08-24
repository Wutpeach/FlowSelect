import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderAvatarDefinition } from "@bible-strong/avatar-core";
import { chromium } from "playwright";
import {
  actionFrame,
  COMPACT_MASCOT_DEFINITION,
  headTuple,
  KIRBY_SOURCE_BODY,
  pathStats,
} from "./compact-mascot-evidence-core.mjs";

const evidence = fileURLToPath(new URL("./evidence/", import.meta.url));
mkdirSync(evidence, { recursive: true });
const kirby = { ...COMPACT_MASCOT_DEFINITION, name: "Upstream Kirby", body: KIRBY_SOURCE_BODY };
const art = (scene) => `${scene.geometry.backPaths.map((path) => `<path d="${path}" fill="#ffc2e9"/>`).join("")}<path d="${scene.geometry.headPath}" fill="#ffc2e9"/><path d="${scene.geometry.leftPath}" fill="#3e4e65"/><path d="${scene.geometry.rightPath}" fill="#3e4e65"/>${scene.geometry.frontPaths.map((path) => `<path d="${path}" fill="#ffc2e9"/>`).join("")}`;
const scene = (key, now) => actionFrame(key, now).scene;
const items = [
  ["Upstream Kirby", "neutral", renderAvatarDefinition(kirby, "neutral")],
  ["Ameow cat", "neutral", renderAvatarDefinition(COMPACT_MASCOT_DEFINITION, "neutral")],
  ["surprised", "03 hold · t=800ms", scene("surprised", 800)],
  ["surprised", "03 → 21 · t=3050ms", scene("surprised", 3050)],
  ["surprised", "21 hold · t=3700ms", scene("surprised", 3700)],
  ["curious-short", "00 hold · t=800ms", scene("curious-short", 800)],
  ["curious-short", "00 → 15 · t=3050ms", scene("curious-short", 3050)],
  ["curious-short", "15 hold · t=3700ms", scene("curious-short", 3700)],
  ["playful-short", "02 hold · t=800ms", scene("playful-short", 800)],
  ["playful-short", "02 → 17 · t=3050ms", scene("playful-short", 3050)],
  ["playful-short", "17 hold · t=3700ms", scene("playful-short", 3700)],
];
const sourceFrames = [800, 3050, 3700].map((timestampMs) => {
  const { playback, frame, scene: current } = actionFrame("curious-short", timestampMs);
  return {
    timestampMs,
    phase: playback.phase,
    expression: playback.activeExpression,
    transitionFrom: playback.transitionFrom,
    head: headTuple(frame),
    perspective: frame.expression.perspective,
    ears: { back: current.geometry.backPaths.map(pathStats), front: current.geometry.frontPaths.map(pathStats) },
  };
});
writeFileSync(`${evidence}/curious-evidence-frame-matrix.json`, JSON.stringify({
  source: {
    pipeline: "direct avatar-core frame from the production Compact definition; not browser Lab DOM; no pointer input",
    action: "curious-short",
    bodyNodes: COMPACT_MASCOT_DEFINITION.body.nodes,
    frames: sourceFrames,
  },
}, null, 2));
const panel = (x, y, [label, detail, current]) => `<g transform="translate(${x} ${y})"><rect width="220" height="275" rx="18" fill="#19171c"/><text x="110" y="25" fill="#f4edf4" font-family="system-ui" font-size="12" font-weight="700" text-anchor="middle">${label}</text><text x="110" y="43" fill="#c9bcc8" font-family="system-ui" font-size="11" text-anchor="middle">${detail}</text><g transform="translate(110 165) scale(.72)">${art(current)}</g></g>`;
const facts = `<g transform="translate(1180 395)"><rect width="220" height="275" rx="18" fill="#19171c"/><text x="16" y="30" fill="#f4edf4" font-family="system-ui" font-size="13" font-weight="700">Pinned facts / delta</text><text x="16" y="58" fill="#c9bcc8" font-family="system-ui" font-size="11">UPSTREAM</text><text x="16" y="78" fill="#f4edf4" font-family="system-ui" font-size="11">175691ab · 240 sphere</text><text x="16" y="96" fill="#f4edf4" font-family="system-ui" font-size="11">two sphere nodes · pink/navy</text><text x="16" y="114" fill="#f4edf4" font-family="system-ui" font-size="11">2300ms hold · 500ms smooth</text><text x="16" y="134" fill="#f4edf4" font-family="system-ui" font-size="9">15 head: [0.319140625, 35.307421875,</text><text x="16" y="148" fill="#f4edf4" font-family="system-ui" font-size="9">-10.904296875]</text><text x="16" y="174" fill="#c9bcc8" font-family="system-ui" font-size="11">AMEOW ONLY</text><text x="16" y="194" fill="#f4edf4" font-family="system-ui" font-size="10">two spaced diamonds 108×190×102</text><text x="16" y="212" fill="#f4edf4" font-family="system-ui" font-size="10">centers ±72 / y -50 · scale .95</text><text x="16" y="232" fill="#c9bcc8" font-family="system-ui" font-size="9">full current-pose 3D; natural turns</text><text x="16" y="247" fill="#c9bcc8" font-family="system-ui" font-size="9">remain physical, not billboarded.</text></g>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1420" height="690" viewBox="0 0 1420 690"><rect width="1420" height="690" fill="#0e0d10"/><text x="20" y="32" fill="#fff" font-family="system-ui" font-size="22" font-weight="700">Pinned Kirby → Ameow cat, direct-core action contact sheet</text><text x="20" y="56" fill="#c9bcc8" font-family="system-ui" font-size="13">Direct avatar-core production-definition reference, not browser Lab DOM: t=800ms holds, t=3050ms midpoint, t=3700ms second holds; no pointer input.</text>${items.map((item, index) => panel(20 + (index % 6) * 232, 90 + Math.floor(index / 6) * 305, item)).join("")}${facts}</svg>`;
writeFileSync(`${evidence}/kirby-to-cat-source-and-actions.svg`, svg);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1420, height: 690 }, deviceScaleFactor: 1 });
await page.setContent(svg);
await page.locator("svg").screenshot({ path: `${evidence}/kirby-to-cat-source-and-actions.png` });
await browser.close();
