import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  advanceAvatarPlayback,
  playAvatarAnimation,
  renderAvatarDefinition,
  renderAvatarFrame,
} from "@bible-strong/avatar-core";
import { COMPACT_MASCOT_ACTIONS, COMPACT_MASCOT_DEFINITION } from "../../../../src/presentation/main-window/compactMascotDefinition.ts";

const root = fileURLToPath(new URL("./", import.meta.url));
const evidence = `${root}evidence/`;
mkdirSync(evidence, { recursive: true });

const candidates = [
  { id: "A", width: 125, height: 205, depth: 110, x: 78, y: -78, z: -80, tilt: 0 },
  { id: "B", width: 120, height: 200, depth: 108, x: 72, y: -76, z: -80, tilt: 0 },
  { id: "C", width: 115, height: 195, depth: 105, x: 68, y: -74, z: -80, tilt: 0 },
  { id: "D", width: 125, height: 205, depth: 110, x: 74, y: -78, z: -80, tilt: 8 },
  { id: "current-failed", width: 125, height: 195, depth: 105, x: 42, y: -82, z: -80, tilt: 0 },
];

const actionTimes = [0, 800, 2300, 2550, 2800, 3050, 3700, 5100, 5600];
const shellRadius = (60 / 56) * 150;

const definitionFor = (candidate) => ({
  ...COMPACT_MASCOT_DEFINITION,
  body: {
    ...COMPACT_MASCOT_DEFINITION.body,
    nodes: [
      {
        surface: { type: "diamond", width: candidate.width, height: candidate.height, depth: candidate.depth, roundness: 1 },
        position: [-candidate.x, candidate.y, candidate.z],
        rotation: [0, 0, candidate.tilt],
      },
      {
        surface: { type: "diamond", width: candidate.width, height: candidate.height, depth: candidate.depth, roundness: 1 },
        position: [candidate.x, candidate.y, candidate.z],
        rotation: [0, 0, -candidate.tilt],
      },
    ],
  },
});

const pathPoints = (path) => {
  const tokens = [...path.matchAll(/[A-Za-z]|-?\d+(?:\.\d+)?/g)].map((m) => m[0]);
  const points = [];
  let command = "";
  let index = 0;
  while (index < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[index])) {
      command = tokens[index++];
      if (command.toUpperCase() === "Z") continue;
    }
    const upper = command.toUpperCase();
    const arity = upper === "C" ? 6 : upper === "A" ? 7 : 2;
    if (index + arity > tokens.length || /^[A-Za-z]$/.test(tokens[index])) break;
    const values = tokens.slice(index, index + arity).map(Number);
    index += arity;
    if (upper === "A") points.push([values[5], values[6]]);
    else if (arity >= 2) points.push([values[0], values[1]]);
    if (upper === "C") {
      points.push([values[2], values[3]], [values[4], values[5]]);
    }
  }
  return points;
};

const allEarPoints = (scene) => scene.geometry.backPaths.flatMap(pathPoints);
const allMascotPoints = (scene) => [
  ...allEarPoints(scene),
  [-122.31, 0], [122.31, 0], [0, -122.31], [0, 122.31],
];
const bounds = (points) => points.reduce((out, [x, y]) => ({
  minX: Math.min(out.minX, x), maxX: Math.max(out.maxX, x),
  minY: Math.min(out.minY, y), maxY: Math.max(out.maxY, y),
}), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

const sceneAt = (definition, action, now) => {
  const started = playAvatarAnimation(definition, action, 0);
  if (!started.ok) throw new Error(started.error.message);
  const playback = advanceAvatarPlayback(definition, started.value, now, { random: () => 0.45 });
  return renderAvatarFrame(definition, playback, now, { random: () => 0.45 });
};

const envelopePoints = (definition) => {
  const framePoints = [allMascotPoints(renderAvatarDefinition(definition))];
  for (const action of ["idle", ...COMPACT_MASCOT_ACTIONS]) {
    const times = action === "idle" ? [0, 800, 2300, 2550, 2800, 3700, 5100, 5600, 11200] : actionTimes;
    for (const now of times) framePoints.push(allMascotPoints(sceneAt(definition, action, now)));
  }
  return framePoints.flatMap((points) => {
    const frame = bounds(points);
    return [[frame.minX, frame.minY], [frame.minX, frame.maxY], [frame.maxX, frame.minY], [frame.maxX, frame.maxY]];
  });
};

const radiusAt = (points, scale, translationY) => Math.max(...points.map(([x, y]) => Math.hypot(x * scale, y * scale + translationY)));
const bestTranslation = (points, scale) => {
  let low = -100;
  let high = 100;
  for (let i = 0; i < 64; i += 1) {
    const a = low + (high - low) / 3;
    const b = high - (high - low) / 3;
    if (radiusAt(points, scale, a) < radiusAt(points, scale, b)) high = b;
    else low = a;
  }
  return (low + high) / 2;
};

const fitEnvelope = (points) => {
  let low = 0.1;
  let high = 1.5;
  for (let i = 0; i < 64; i += 1) {
    const scale = (low + high) / 2;
    const translationY = bestTranslation(points, scale);
    if (radiusAt(points, scale, translationY) <= shellRadius) low = scale;
    else high = scale;
  }
  const translationY = bestTranslation(points, low);
  return { scale: low, translationY, maxRadius: radiusAt(points, low, translationY), clearance: shellRadius - radiusAt(points, low, translationY) };
};

const art = (scene, scale, translationY) => `<g transform="translate(0 ${translationY.toFixed(3)}) scale(${scale.toFixed(5)})">${scene.geometry.backPaths.map((path) => `<path d="${path}" fill="#ffc2e9"/>`).join("")}<path d="${scene.geometry.headPath}" fill="#ffc2e9"/><path d="${scene.geometry.leftPath}" fill="#3e4e65"/><path d="${scene.geometry.rightPath}" fill="#3e4e65"/>${scene.geometry.frontPaths.map((path) => `<path d="${path}" fill="#ffc2e9"/>`).join("")}</g>`;

const rows = [];
for (const candidate of candidates) {
  const definition = definitionFor(candidate);
  const neutral = renderAvatarDefinition(definition);
  const envelope = envelopePoints(definition);
  const fit = fitEnvelope(envelope);
  const neutralBounds = bounds(allEarPoints(neutral));
  const headBounds = bounds(pathPoints(neutral.geometry.headPath));
  rows.push({
    ...candidate,
    fit: { ...fit, shellRadius },
    neutral: { earBounds: neutralBounds, headBounds, headWidth: headBounds.maxX - headBounds.minX },
    envelope: bounds(envelope),
    neutralScene: neutral,
    definition,
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1 });
const metrics = [];
for (const row of rows) {
  const scene = row.neutralScene;
  const radius = 122.31;
  const sides = scene.geometry.backPaths.map(pathPoints).map((side) => side.filter(([x, y]) => Math.hypot(x, y) > radius));
  const sideBounds = sides.map((side) => bounds(side));
  const tips = sides.map((side) => {
    const minY = Math.min(...side.map((point) => point[1]));
    const near = side.filter((point) => point[1] <= minY + 2);
    return near.reduce((sum, point) => sum + point[0], 0) / near.length;
  });
  const headWidth = 244.62;
  const metric = { sideBounds, tipSpacing: Math.abs(tips[1] - tips[0]), earWidth: sideBounds.map((side) => side.maxX - side.minX), headWidth };
  metrics.push({ id: row.id, ...metric, tipSpacingRatio: metric.tipSpacing / metric.headWidth, earWidthRatio: metric.earWidth.map((width) => width / metric.headWidth) });
}

const report = rows.map((row) => ({
  id: row.id, width: row.width, height: row.height, depth: row.depth, x: row.x, y: row.y, z: row.z, tilt: row.tilt,
  fit: row.fit, neutral: row.neutral, envelope: row.envelope,
  metrics: metrics.find((metric) => metric.id === row.id),
}));
writeFileSync(`${evidence}/combined-geometry-scale-study.json`, JSON.stringify(report, null, 2));

const referencePath = "C:\\Users\\ADMINI~1\\AppData\\Local\\Temp\\maker-core-image-resize\\599a723f5902152f22a87fccfda7aad6cdc10f6d45a1a95a9954c508adbbb0f3.webp";
const reference = readFileSync(referencePath).toString("base64");
const view = rows.filter((row) => ["A", "B", "C", "D", "current-failed"].includes(row.id));
const panel = (row, index) => {
  const x = 20 + (index + 1) * 232;
  const detail = `${row.width}×${row.height}×${row.depth} · x±${row.x} y${row.y} · s${row.fit.scale.toFixed(3)}`;
  const ratio = metrics.find((metric) => metric.id === row.id).tipSpacingRatio.toFixed(3);
  return `<g transform="translate(${x} 110)"><rect width="220" height="300" rx="16" fill="#19171c"/><text x="110" y="25" fill="#f4edf4" font-family="system-ui" font-size="13" font-weight="700" text-anchor="middle">${row.id}</text><text x="110" y="44" fill="#c9bcc8" font-family="system-ui" font-size="9" text-anchor="middle">${detail}</text><text x="110" y="59" fill="#c9bcc8" font-family="system-ui" font-size="9" text-anchor="middle">tip/head ${ratio} · clearance ${row.fit.clearance.toFixed(1)}u</text><circle cx="110" cy="180" r="116" fill="none" stroke="#514858" stroke-dasharray="3 3"/><g transform="translate(110 180)">${art(row.neutralScene, row.fit.scale, row.fit.translationY)}</g></g>`;
};
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="440" viewBox="0 0 1440 440"><rect width="1440" height="440" fill="#0e0d10"/><text x="20" y="30" fill="#fff" font-family="system-ui" font-size="20" font-weight="700">Combined ear geometry + shell-fit study</text><text x="20" y="52" fill="#c9bcc8" font-family="system-ui" font-size="11">Direct avatar-core current-pose paths · dashed circle = 60px shell · scale/translation fit full idle + three action envelopes</text><g transform="translate(20 110)"><rect width="220" height="300" rx="16" fill="#19171c"/><text x="110" y="25" fill="#f4edf4" font-family="system-ui" font-size="13" font-weight="700" text-anchor="middle">Reference</text><image x="20" y="45" width="180" height="180" href="data:image/webp;base64,${reference}"/><text x="110" y="250" fill="#c9bcc8" font-family="system-ui" font-size="10" text-anchor="middle">tip/head ≈ .675</text><text x="110" y="267" fill="#c9bcc8" font-family="system-ui" font-size="10" text-anchor="middle">broad rounded ears</text></g>${view.map(panel).join("")}</svg>`;
writeFileSync(`${evidence}/combined-geometry-scale-study.svg`, sheet);
await page.setContent(sheet);
await page.locator("svg").screenshot({ path: `${evidence}/combined-geometry-scale-study.png` });
await browser.close();

console.log(JSON.stringify(report, null, 2));
