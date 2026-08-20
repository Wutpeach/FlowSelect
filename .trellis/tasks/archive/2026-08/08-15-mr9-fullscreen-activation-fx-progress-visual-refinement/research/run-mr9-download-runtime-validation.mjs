import { stat, unlink } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import { chromium } from "playwright";
import WebSocket from "ws";

const cdpUrl = "http://127.0.0.1:9333";
const extensionUrl = "ws://127.0.0.1:39527";
const outputRoot = path.resolve(
  "C:/Users/Administrator/AppData/Local/Temp/ameow-mr9-validation-appdata-lead/download-output",
);
const mediaSize = 4 * 1024 * 1024;
const mediaPort = 18090;

const mediaServer = http.createServer((request, response) => {
  const rangeMatch = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
  const start = rangeMatch ? Number(rangeMatch[1]) : 0;
  const requestedEnd = rangeMatch?.[2] ? Number(rangeMatch[2]) : mediaSize - 1;
  const end = Math.min(Math.max(requestedEnd, start), mediaSize - 1);
  const length = end - start + 1;
  const headers = {
    "Accept-Ranges": "bytes",
    "Content-Length": String(length),
    "Content-Type": "video/mp4",
    ...(rangeMatch ? { "Content-Range": `bytes ${start}-${end}/${mediaSize}` } : {}),
  };
  response.writeHead(rangeMatch ? 206 : 200, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  let remaining = length;
  const chunk = Buffer.alloc(32 * 1024, 0x2a);
  const timer = setInterval(() => {
    if (remaining <= 0) {
      clearInterval(timer);
      response.end();
      return;
    }
    const size = Math.min(chunk.length, remaining);
    remaining -= size;
    response.write(chunk.subarray(0, size));
  }, 25);
  response.on("close", () => clearInterval(timer));
});

await new Promise((resolve, reject) => {
  mediaServer.once("error", reject);
  mediaServer.listen(mediaPort, "127.0.0.1", resolve);
});

const browser = await chromium.connectOverCDP(cdpUrl);
const context = browser.contexts()[0];
const page = context.pages().find((candidate) => candidate.url().includes("127.0.0.1:1420"));
if (!page) throw new Error("Ameow renderer page was not found");

await page.evaluate(async () => {
  const evidence = { queueDetails: [], progress: [], complete: [] };
  window.__mr9DownloadRuntimeEvidence = evidence;
  const unwrap = (event) => event?.payload ?? event;
  await window.ameow.events.on("video-queue-detail", (event) => evidence.queueDetails.push(unwrap(event)));
  await window.ameow.events.on("video-download-progress", (event) => evidence.progress.push(unwrap(event)));
  await window.ameow.events.on("video-download-complete", (event) => evidence.complete.push(unwrap(event)));
});

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
  return {
    activationKind: uniform("uActivationKind"),
    origin: Array.from(uniform("uActivationOrigin") ?? []),
    progressMode: uniform("uProgressMode"),
    progress: uniform("uProgress"),
  };
});

const waitForNewTrace = async (detailCount) => {
  await page.waitForFunction((start) => (
    window.__mr9DownloadRuntimeEvidence.queueDetails
      .slice(start)
      .some((payload) => typeof payload?.acceptedTraceId === "string")
  ), detailCount, { timeout: 5_000 });
  return await page.evaluate((start) => (
    window.__mr9DownloadRuntimeEvidence.queueDetails
      .slice(start)
      .find((payload) => typeof payload?.acceptedTraceId === "string")
      .acceptedTraceId
  ), detailCount);
};

const waitForCompletion = async (traceId) => {
  await page.waitForFunction((trace) => (
    window.__mr9DownloadRuntimeEvidence.complete.some((payload) => payload?.traceId === trace)
  ), traceId, { timeout: 30_000 });
  return await page.evaluate((trace) => (
    window.__mr9DownloadRuntimeEvidence.complete.find((payload) => payload?.traceId === trace)
  ), traceId);
};

const queueExtensionDownload = (url) => new Promise((resolve, reject) => {
  const socket = new WebSocket(extensionUrl);
  const requestId = `mr9-runtime-extension-${Date.now()}`;
  const timer = setTimeout(() => {
    socket.close();
    reject(new Error("Extension queue acknowledgement timed out"));
  }, 5_000);
  socket.on("open", () => socket.send(JSON.stringify({
    action: "video_selected_v2",
    requestId,
    data: { url, pageUrl: url, siteHint: "generic", title: requestId },
  })));
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message?.success !== true || typeof message?.data?.traceId !== "string") return;
    clearTimeout(timer);
    socket.close();
    resolve(message.data.traceId);
  });
  socket.on("error", reject);
});

const dispatchPaste = async (url, point) => {
  const canvas = await page.$("canvas");
  const rect = await canvas?.boundingBox();
  if (!rect) throw new Error("Expanded canvas bounds were unavailable");
  if (point) {
    await page.mouse.move(rect.x + rect.width * point[0], rect.y + rect.height * point[1]);
  } else {
    await page.mouse.move(rect.x + rect.width + 20, rect.y + rect.height + 20);
  }
  const detailCount = await page.evaluate(() => window.__mr9DownloadRuntimeEvidence.queueDetails.length);
  await page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    window.dispatchEvent(new ClipboardEvent("paste", {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    }));
  }, url);
  return await waitForNewTrace(detailCount);
};

const runCase = async ({ label, queue, expectedOrigin }) => {
  const progressStart = await page.evaluate(() => window.__mr9DownloadRuntimeEvidence.progress.length);
  const traceId = await queue();
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    const gl = canvas.getContext("webgl2");
    const program = gl?.getParameter(gl.CURRENT_PROGRAM);
    const location = gl && program ? gl.getUniformLocation(program, "uActivationKind") : null;
    return location !== null && gl.getUniform(program, location) === 1;
  }, null, { timeout: 3_000 });
  const activation = await readGraphics();
  let maxRenderedProgress = 0;
  const sampleTimer = setInterval(async () => {
    const graphics = await readGraphics().catch(() => null);
    if (graphics?.progressMode === 1 && Number.isFinite(graphics.progress)) {
      maxRenderedProgress = Math.max(maxRenderedProgress, graphics.progress);
    }
  }, 50);
  const completion = await waitForCompletion(traceId);
  clearInterval(sampleTimer);
  const progress = await page.evaluate(({ trace, start }) => (
    window.__mr9DownloadRuntimeEvidence.progress
      .slice(start)
      .filter((payload) => payload?.traceId === trace)
  ), { trace: traceId, start: progressStart });
  const origin = activation?.origin ?? [];
  if (
    origin.length !== 2
    || Math.abs(origin[0] - expectedOrigin[0]) > 0.04
    || Math.abs(origin[1] - expectedOrigin[1]) > 0.04
  ) {
    throw new Error(`${label} used the wrong Intake origin: ${JSON.stringify(origin)}`);
  }
  if (completion?.success !== true || typeof completion.file_path !== "string") {
    throw new Error(`${label} did not reach a successful terminal outcome`);
  }
  if (!progress.some((payload) => Number.isFinite(payload?.percent) && payload.percent >= 0)) {
    throw new Error(`${label} emitted no authoritative determinate progress`);
  }
  const outputPath = path.resolve(completion.file_path);
  if (!outputPath.startsWith(`${outputRoot}${path.sep}`)) {
    throw new Error(`${label} wrote outside the validation output root`);
  }
  const outputStats = await stat(outputPath);
  await page.waitForTimeout(900);
  const terminalGraphics = await readGraphics();
  await unlink(outputPath);
  return {
    label,
    traceId,
    activationOrigin: origin,
    progressEventCount: progress.length,
    maxAuthoritativePercent: Math.max(...progress.map((payload) => payload.percent ?? -1)),
    maxRenderedProgress,
    terminal: completion,
    outputBytes: outputStats.size,
    terminalActivationKind: terminalGraphics?.activationKind,
    cleanedOutput: outputPath,
  };
};

const nonce = Date.now();
const results = [];
results.push(await runCase({
  label: "paste-local",
  queue: () => dispatchPaste(`http://127.0.0.1:${mediaPort}/video/paste-local-${nonce}.mp4`, [0.25, 0.75]),
  expectedOrigin: [0.25, 0.75],
}));
results.push(await runCase({
  label: "paste-center",
  queue: () => dispatchPaste(`http://127.0.0.1:${mediaPort}/video/paste-center-${nonce}.mp4`, null),
  expectedOrigin: [0.5, 0.5],
}));
results.push(await runCase({
  label: "browser-extension",
  queue: () => queueExtensionDownload(`http://127.0.0.1:${mediaPort}/video/extension-${nonce}.mp4`),
  expectedOrigin: [0.5, 0.5],
}));

console.log(JSON.stringify({ results }, null, 2));
await browser.close();
await new Promise((resolve) => mediaServer.close(resolve));
