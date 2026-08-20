import http from "node:http";
import { chromium } from "playwright";
import WebSocket from "ws";

const cdpUrl = "http://127.0.0.1:9333";
const extensionUrl = "ws://127.0.0.1:39527";
const mediaUrl = "http://127.0.0.1:18089/mr9-validation.mp4";
const screenshotPath = new URL("./mr9-windows-electron.png", import.meta.url).pathname
  .replace(/^\/([A-Z]:)/, "$1");

const mediaServer = http.createServer((request, response) => {
  if (request.method === "HEAD") {
    response.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": 20 * 1024 * 1024 });
    response.end();
    return;
  }
  response.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": 20 * 1024 * 1024 });
  const chunk = Buffer.alloc(8 * 1024);
  const handle = setInterval(() => response.write(chunk), 80);
  response.on("close", () => clearInterval(handle));
});
await new Promise((resolve, reject) => {
  mediaServer.once("error", reject);
  mediaServer.listen(18089, "127.0.0.1", resolve);
});

const browser = await chromium.connectOverCDP(cdpUrl);
const context = browser.contexts()[0];
const page = context.pages().find((candidate) => candidate.url().includes("127.0.0.1:1420"));
if (!page) throw new Error("Ameow renderer page was not found");
const cdpSession = await context.newCDPSession(page);

const setReducedMotion = async (reduced) => {
  await cdpSession.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }],
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas");
};

const readGraphics = () => page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return null;
  const gl = canvas.getContext("webgl2");
  const program = gl?.getParameter(gl.CURRENT_PROGRAM);
  const uniform = (name) => {
    if (!gl || !program) return null;
    const location = gl.getUniformLocation(program, name);
    return location === null ? null : gl.getUniform(program, location);
  };
  const protectedControl = document.querySelector("[data-mr9-protected-control='primary-cancel']");
  const coverable = document.querySelector("[data-mr9-coverable='task-progress']");
  return {
    canvasCount: document.querySelectorAll("canvas").length,
    ariaHidden: canvas.getAttribute("aria-hidden"),
    pointerEvents: getComputedStyle(canvas).pointerEvents,
    zIndex: getComputedStyle(canvas).zIndex,
    linked: Boolean(program && gl?.getProgramParameter(program, gl.LINK_STATUS)),
    error: gl?.getError(),
    progressMode: uniform("uProgressMode"),
    reducedMotion: uniform("uReducedMotion"),
    origin: uniform("uActivationOrigin"),
    activationAge: uniform("uActivationAge"),
    activationKind: uniform("uActivationKind"),
    progress: uniform("uProgress"),
    time: uniform("uTime"),
    protectedControl: protectedControl
      ? { zIndex: getComputedStyle(protectedControl.parentElement).zIndex, visible: getComputedStyle(protectedControl).visibility }
      : null,
    coverable: coverable ? { zIndex: getComputedStyle(coverable).zIndex } : null,
  };
});

const waitForActivation = async (kind = 1, timeout = 3000) => {
  await page.waitForFunction((expected) => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    const gl = canvas.getContext("webgl2");
    const program = gl?.getParameter(gl.CURRENT_PROGRAM);
    const location = gl && program ? gl.getUniformLocation(program, "uActivationKind") : null;
    return location !== null && gl?.getUniform(program, location) === expected;
  }, kind, { timeout });
  return readGraphics();
};

const requireActivation = (label, snapshot, expectedOrigin, reducedMotion) => {
  const origin = Array.from(snapshot?.origin ?? []);
  const originMatches = origin.length === 2
    && Math.abs(origin[0] - expectedOrigin[0]) < 0.035
    && Math.abs(origin[1] - expectedOrigin[1]) < 0.035;
  if (
    snapshot?.activationKind !== 1
    || snapshot.reducedMotion !== reducedMotion
    || snapshot.canvasCount !== 1
    || snapshot.ariaHidden !== "true"
    || snapshot.pointerEvents !== "none"
    || snapshot.linked !== true
    || snapshot.error !== 0
    || !originMatches
  ) {
    throw new Error(`${label} did not produce the required one-host Intake snapshot`);
  }
};

const dispatchPaste = async (url, point) => {
  const canvas = await page.$("canvas");
  const rect = await canvas?.boundingBox();
  if (!rect) throw new Error("Expanded canvas bounds were unavailable");
  if (point) {
    await page.mouse.move(rect.x + rect.width * point[0], rect.y + rect.height * point[1]);
  } else {
    await page.mouse.move(rect.x + rect.width + 20, rect.y + rect.height + 20);
  }
  await page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, url);
};

const dispatchUrlDrop = async (url, point) => page.evaluate(({ value, normalized }) => {
  const canvas = document.querySelector("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Expanded canvas was unavailable");
  const rect = canvas.getBoundingClientRect();
  const clientX = rect.left + rect.width * normalized[0];
  const clientY = rect.top + rect.height * normalized[1];
  const data = new DataTransfer();
  data.setData("text/uri-list", value);
  data.setData("text/plain", value);
  (document.elementFromPoint(clientX, clientY) ?? canvas).dispatchEvent(new DragEvent("drop", {
    dataTransfer: data,
    clientX,
    clientY,
    bubbles: true,
    cancelable: true,
  }));
}, { value: url, normalized: point });

const queueExtensionDownload = (url) => new Promise((resolve, reject) => {
  const socket = new WebSocket(extensionUrl);
  const requestId = `mr9-extension-${Date.now()}`;
  const timer = setTimeout(() => {
    socket.close();
    reject(new Error("Extension-origin queue acknowledgement timed out"));
  }, 4000);
  socket.on("open", () => socket.send(JSON.stringify({
    action: "video_selected_v2",
    requestId,
    data: { url, pageUrl: url, siteHint: "generic", title: "MR9 extension validation" },
  })));
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message?.success !== true || typeof message?.data?.traceId !== "string") return;
    clearTimeout(timer);
    socket.close();
    resolve(message);
  });
  socket.on("error", (error) => {
    clearTimeout(timer);
    reject(error);
  });
});

await setReducedMotion(false);

await dispatchPaste(`${mediaUrl}?source=paste-local-${Date.now()}`, [0.25, 0.75]);
const pasteLocal = await waitForActivation();
requireActivation("Paste with in-surface pointer", pasteLocal, [0.25, 0.75], false);
if (pasteLocal?.zIndex !== "2" || pasteLocal.protectedControl?.zIndex !== "3") {
  throw new Error("Normal-motion thermal occlusion/protected-control stacking was not observed");
}
await page.screenshot({ path: screenshotPath, omitBackground: false });

await page.waitForTimeout(1250);
await dispatchPaste(`${mediaUrl}?source=paste-center-${Date.now()}`, null);
const pasteCenter = await waitForActivation();
requireActivation("Paste without in-surface pointer", pasteCenter, [0.5, 0.5], false);

await page.waitForTimeout(1250);
await dispatchUrlDrop(`${mediaUrl}?source=drop-${Date.now()}`, [0.7, 0.3]);
const urlDrop = await waitForActivation();
requireActivation("Fullscreen URL drop", urlDrop, [0.7, 0.3], false);

await page.waitForTimeout(1250);
const extensionAck = await queueExtensionDownload(`${mediaUrl}?source=extension-${Date.now()}`);
const extension = await waitForActivation();
requireActivation("Browser Extension", extension, [0.5, 0.5], false);

await setReducedMotion(true);
const reducedAck = await page.evaluate((url) => window.ameow.commands.invoke("queue_video_download", {
  url,
  siteHint: "generic",
  intakeOrigin: { x: 0.3, y: 0.7 },
}), `${mediaUrl}?source=reduced-${Date.now()}`);
const reducedFirst = await waitForActivation();
requireActivation("Reduced Motion Intake", reducedFirst, [0.3, 0.7], true);
await page.waitForTimeout(160);
const reducedSecond = await readGraphics();
if (
  reducedSecond?.activationKind !== 1
  || reducedSecond.zIndex !== "0"
  || reducedFirst?.time !== reducedSecond.time
) {
  throw new Error("Reduced Motion Activation travelled, looped, or occluded the DOM");
}

const contextLifecycle = await page.evaluate(async () => {
  const canvas = document.querySelector("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return null;
  const gl = canvas.getContext("webgl2");
  const extension = gl?.getExtension("WEBGL_lose_context");
  if (!gl || !extension) return { supported: false };
  let lost = 0;
  let restored = 0;
  canvas.addEventListener("webglcontextlost", () => { lost += 1; });
  canvas.addEventListener("webglcontextrestored", () => { restored += 1; });
  extension.loseContext();
  await new Promise((resolve) => setTimeout(resolve, 100));
  extension.restoreContext();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const restoredGl = canvas.getContext("webgl2");
  const program = restoredGl?.getParameter(restoredGl.CURRENT_PROGRAM);
  return {
    supported: true,
    lost,
    restored,
    contextLost: restoredGl?.isContextLost() ?? true,
    linked: Boolean(program && restoredGl?.getProgramParameter(program, restoredGl.LINK_STATUS)),
    error: restoredGl?.getError() ?? null,
  };
});

console.log(JSON.stringify({
  pasteLocal,
  pasteCenter,
  urlDrop,
  extension: { ack: extensionAck, graphics: extension },
  reducedMotion: { ack: reducedAck, first: reducedFirst, second: reducedSecond },
  contextLifecycle,
  screenshotPath,
}, null, 2));

await browser.close();
await new Promise((resolve) => mediaServer.close(resolve));
