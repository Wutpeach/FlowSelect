import { chromium } from "playwright";
import http from "node:http";
import WebSocket from "ws";

const cdpUrl = "http://127.0.0.1:9333";
const extensionUrl = "ws://127.0.0.1:39527";
const mediaUrl = "http://127.0.0.1:18088/mr8-validation.mp4";
const screenshotPath = new URL("./mr8-windows-electron.png", import.meta.url).pathname
  .replace(/^\/([A-Z]:)/, "$1");

const mediaServer = http.createServer((request, response) => {
  if (request.method === "HEAD") {
    response.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": 20 * 1024 * 1024,
    });
    response.end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": "video/mp4",
    "Content-Length": 20 * 1024 * 1024,
  });
  const chunk = Buffer.alloc(8 * 1024);
  const handle = setInterval(() => response.write(chunk), 80);
  response.on("close", () => clearInterval(handle));
});
await new Promise((resolve, reject) => {
  mediaServer.once("error", reject);
  mediaServer.listen(18088, "127.0.0.1", resolve);
});

const browser = await chromium.connectOverCDP(cdpUrl);
const context = browser.contexts()[0];
const page = context.pages().find((candidate) => candidate.url().includes("127.0.0.1:1420"));
if (!page) throw new Error("Ameow renderer page was not found");
await page.waitForSelector("canvas");
const cdpSession = await context.newCDPSession(page);

// CDP media emulation belongs to the renderer session. Reset it explicitly so
// a preceding Reduced Motion run cannot turn the normal-motion proof static.
await cdpSession.send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas");

const readGraphics = () => page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return null;
  const gl = canvas.getContext("webgl2");
  if (!gl) return null;
  const program = gl.getParameter(gl.CURRENT_PROGRAM);
  const uniform = (name) => {
    if (!program) return null;
    const location = gl.getUniformLocation(program, name);
    return location === null ? null : gl.getUniform(program, location);
  };
  const rect = canvas.getBoundingClientRect();
  return {
    canvasCount: document.querySelectorAll("canvas").length,
    ariaHidden: canvas.getAttribute("aria-hidden"),
    pointerEvents: getComputedStyle(canvas).pointerEvents,
    cssSize: [Math.round(rect.width), Math.round(rect.height)],
    clientSize: [canvas.clientWidth, canvas.clientHeight],
    backingSize: [canvas.width, canvas.height],
    drawingBufferSize: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    contextLost: gl.isContextLost(),
    linked: program ? gl.getProgramParameter(program, gl.LINK_STATUS) : false,
    error: gl.getError(),
    mode: uniform("uMode"),
    reducedMotion: uniform("uReducedMotion"),
    time: uniform("uTime"),
    accessibleNodes: document.querySelectorAll(
      "button, [role], [aria-label], [aria-live]",
    ).length,
  };
});

const waitForMode = async (mode, timeout = 2500) => {
  const snapshot = await page.waitForFunction((expected) => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    const gl = canvas.getContext("webgl2");
    const program = gl?.getParameter(gl.CURRENT_PROGRAM);
    if (!gl || !program) return false;
    const location = gl.getUniformLocation(program, "uMode");
    if (location === null || gl.getUniform(program, location) !== expected) return false;
    const uniform = (name) => {
      const uniformLocation = gl.getUniformLocation(program, name);
      return uniformLocation === null ? null : gl.getUniform(program, uniformLocation);
    };
    const rect = canvas.getBoundingClientRect();
    return {
      canvasCount: document.querySelectorAll("canvas").length,
      ariaHidden: canvas.getAttribute("aria-hidden"),
      pointerEvents: getComputedStyle(canvas).pointerEvents,
      cssSize: [Math.round(rect.width), Math.round(rect.height)],
      clientSize: [canvas.clientWidth, canvas.clientHeight],
      backingSize: [canvas.width, canvas.height],
      drawingBufferSize: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      contextLost: gl.isContextLost(),
      linked: gl.getProgramParameter(program, gl.LINK_STATUS),
      error: gl.getError(),
      mode: expected,
      reducedMotion: uniform("uReducedMotion"),
      time: uniform("uTime"),
      accessibleNodes: document.querySelectorAll(
        "button, [role], [aria-label], [aria-live]",
      ).length,
    };
  }, mode, { timeout });
  return snapshot.jsonValue();
};

const waitForNotMode = async (mode, timeout = 3000) => {
  await page.waitForFunction((rejected) => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    const gl = canvas.getContext("webgl2");
    const program = gl?.getParameter(gl.CURRENT_PROGRAM);
    if (!gl || !program) return false;
    const location = gl.getUniformLocation(program, "uMode");
    return location !== null && gl.getUniform(program, location) !== rejected;
  }, mode, { timeout });
  return readGraphics();
};

const requireIntakeSnapshot = (label, snapshot, reducedMotion) => {
  if (
    snapshot?.mode !== 6
    || snapshot.reducedMotion !== reducedMotion
    || snapshot.canvasCount !== 1
    || snapshot.ariaHidden !== "true"
    || snapshot.pointerEvents !== "none"
    || snapshot.linked !== true
    || snapshot.error !== 0
  ) {
    throw new Error(`${label} did not produce the required atomic Intake snapshot`);
  }
};

const queueRendererDownload = (suffix) => page.evaluate(async (value) => (
  window.ameow.commands.invoke("queue_video_download", {
    url: `${value.url}?source=renderer-${value.suffix}`,
    pageUrl: `${value.url}?source=renderer-${value.suffix}`,
    siteHint: "generic",
    advancedQualityRequest: false,
  })
), { suffix, url: mediaUrl });

const queueExtensionDownload = (suffix) => new Promise((resolve, reject) => {
  const socket = new WebSocket(extensionUrl);
  const requestId = `mr8-extension-${suffix}`;
  const timer = setTimeout(() => {
    socket.close();
    reject(new Error("Extension-origin queue acknowledgement timed out"));
  }, 4000);
  socket.on("open", () => {
    socket.send(JSON.stringify({
      action: "video_selected_v2",
      requestId,
      data: {
        url: `${mediaUrl}?source=extension-${suffix}`,
        pageUrl: `${mediaUrl}?source=extension-${suffix}`,
        siteHint: "generic",
        title: "MR8 extension validation",
        advancedQualityRequest: false,
      },
    }));
  });
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message?.success !== true || typeof message?.data?.traceId !== "string") return;
    clearTimeout(timer);
    socket.close();
    if (message.success !== true) reject(new Error(JSON.stringify(message)));
    else resolve(message);
  });
  socket.on("error", (error) => {
    clearTimeout(timer);
    reject(error);
  });
});

const baseline = await readGraphics();
if (baseline?.reducedMotion !== false) {
  throw new Error("Normal-motion validation remained under Reduced Motion emulation");
}
const rendererAck = await queueRendererDownload(Date.now());
const rendererIntake = await waitForMode(6);
requireIntakeSnapshot("Renderer-origin Download", rendererIntake, false);
await page.screenshot({ path: screenshotPath, omitBackground: false });
const rendererAfterDeadline = await waitForNotMode(6);

const extensionAck = await queueExtensionDownload(Date.now());
const extensionIntake = await waitForMode(6);
requireIntakeSnapshot("Extension-origin Download", extensionIntake, false);
const extensionAfterDeadline = await waitForNotMode(6);

await cdpSession.send("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas");
const reducedBaseline = await readGraphics();
const reducedAck = await queueRendererDownload(`reduced-${Date.now()}`);
const reducedFirst = await waitForMode(6);
requireIntakeSnapshot("Reduced-Motion Download", reducedFirst, true);
await page.waitForTimeout(160);
const reducedSecond = await readGraphics();
if (
  reducedSecond?.mode !== 6
  || reducedSecond.reducedMotion !== true
  || reducedFirst?.time !== reducedSecond.time
) {
  throw new Error("Reduced Motion Intake did not remain static for the observation window");
}
const reducedAfterDeadline = await waitForNotMode(6);

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
  baseline,
  renderer: { ack: rendererAck, intake: rendererIntake, afterDeadline: rendererAfterDeadline },
  extension: { ack: extensionAck, intake: extensionIntake, afterDeadline: extensionAfterDeadline },
  reducedMotion: {
    baseline: reducedBaseline,
    ack: reducedAck,
    first: reducedFirst,
    second: reducedSecond,
    staticWhileStillIntake: reducedFirst?.time === reducedSecond?.time,
    afterDeadline: reducedAfterDeadline,
  },
  contextLifecycle,
  screenshotPath,
}, null, 2));

await browser.close();
await new Promise((resolve) => mediaServer.close(resolve));
