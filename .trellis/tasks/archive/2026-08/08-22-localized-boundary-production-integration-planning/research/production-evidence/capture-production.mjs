import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../..");
const evidenceDir = here;
const port = 4176;
const debugPort = 9336;
const profileRoot = mkdtempSync(join(tmpdir(), "ameow-mr9-production-"));

mkdirSync(evidenceDir, { recursive: true });

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const waitForServer = async () => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}`);
      if (response.ok) return;
    } catch {
      // The preview process is still starting.
    }
    await sleep(100);
  }
  throw new Error("Timed out waiting for the production renderer preview server");
};

const waitForDebugPort = async () => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return;
    } catch {
      // Electron has not exposed its DevTools endpoint yet.
    }
    await sleep(100);
  }
  throw new Error("Timed out waiting for the Electron DevTools endpoint");
};

const captureScreenRect = (bounds, outputPath) => {
  const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const command = [
    "Add-Type -AssemblyName System.Drawing",
    `$bitmap = New-Object System.Drawing.Bitmap(${bounds.width}, ${bounds.height})`,
    "$graphics = [System.Drawing.Graphics]::FromImage($bitmap)",
    `$graphics.CopyFromScreen(${bounds.x}, ${bounds.y}, 0, 0, $bitmap.Size, [System.Drawing.CopyPixelOperation]::SourceCopy)`,
    `$bitmap.Save(${literal(outputPath)}, [System.Drawing.Imaging.ImageFormat]::Png)`,
    "$graphics.Dispose()",
    "$bitmap.Dispose()",
  ].join("; ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`Win32 screen capture failed: ${result.stderr || result.stdout}`);
  }
};

const telemetryInit = () => {
  const stats = {
    shaderCreates: 0,
    shaderCompiles: 0,
    shaderCompilePasses: 0,
    shaderLogs: [],
    programCreates: 0,
    programDeletes: 0,
    programObjects: [],
    programLinks: 0,
    programLinkPasses: 0,
    programLogs: [],
    textureCreates: 0,
    textureDeletes: 0,
    framebufferCreates: 0,
    framebufferDeletes: 0,
    drawCalls: 0,
    drawCallsByRafMax: 0,
    rafRequests: 0,
    rafFires: 0,
    rafCancels: 0,
    rafPending: 0,
    rafMaxPending: 0,
    readback: {
      width: 0,
      height: 0,
      cssWidth: 0,
      cssHeight: 0,
      outermost2pxMaxAlpha: 0,
      cornerMaxAlpha: 0,
      maximumExteriorSupportCssPx: 0,
      bestExteriorAlpha: 0,
      bestDataUrl: null,
    },
  };
  window.__mr9ProductionStats = stats;

  let activeRaf = null;
  const drawsPerRaf = new Map();
  const scheduledRafs = new Set();
  const originalRaf = window.requestAnimationFrame.bind(window);
  const originalCancelRaf = window.cancelAnimationFrame.bind(window);

  window.requestAnimationFrame = (callback) => {
    stats.rafRequests += 1;
    let handle = 0;
    handle = originalRaf((time) => {
      if (scheduledRafs.delete(handle)) stats.rafPending -= 1;
      stats.rafFires += 1;
      activeRaf = handle;
      try {
        callback(time);
      } finally {
        activeRaf = null;
      }
    });
    scheduledRafs.add(handle);
    stats.rafPending += 1;
    stats.rafMaxPending = Math.max(stats.rafMaxPending, stats.rafPending);
    return handle;
  };

  window.cancelAnimationFrame = (handle) => {
    if (scheduledRafs.delete(handle)) {
      stats.rafPending -= 1;
      stats.rafCancels += 1;
    }
    originalCancelRaf(handle);
  };

  const prototype = window.WebGL2RenderingContext?.prototype;
  if (!prototype) return;

  const wrapCount = (name, createKey, deleteKey) => {
    const original = prototype[name];
    prototype[name] = function (...args) {
      stats[createKey] += 1;
      const result = original.apply(this, args);
      if (deleteKey && result === undefined) stats[deleteKey] += 1;
      return result;
    };
  };

  const originalCreateShader = prototype.createShader;
  prototype.createShader = function (...args) {
    stats.shaderCreates += 1;
    return originalCreateShader.apply(this, args);
  };
  const originalCompileShader = prototype.compileShader;
  prototype.compileShader = function (shader) {
    originalCompileShader.call(this, shader);
    stats.shaderCompiles += 1;
    if (this.getShaderParameter(shader, this.COMPILE_STATUS)) stats.shaderCompilePasses += 1;
    const log = this.getShaderInfoLog(shader);
    if (log) stats.shaderLogs.push(log);
  };
  const originalCreateProgram = prototype.createProgram;
  prototype.createProgram = function (...args) {
    stats.programCreates += 1;
    const program = originalCreateProgram.apply(this, args);
    if (program) stats.programObjects.push(program);
    return program;
  };
  const originalDeleteProgram = prototype.deleteProgram;
  prototype.deleteProgram = function (...args) {
    stats.programDeletes += 1;
    return originalDeleteProgram.apply(this, args);
  };
  const originalLinkProgram = prototype.linkProgram;
  prototype.linkProgram = function (program) {
    originalLinkProgram.call(this, program);
    stats.programLinks += 1;
    if (this.getProgramParameter(program, this.LINK_STATUS)) stats.programLinkPasses += 1;
    const log = this.getProgramInfoLog(program);
    if (log) stats.programLogs.push(log);
  };
  wrapCount("createTexture", "textureCreates");
  const originalDeleteTexture = prototype.deleteTexture;
  prototype.deleteTexture = function (...args) {
    stats.textureDeletes += 1;
    return originalDeleteTexture.apply(this, args);
  };
  wrapCount("createFramebuffer", "framebufferCreates");
  const originalDeleteFramebuffer = prototype.deleteFramebuffer;
  prototype.deleteFramebuffer = function (...args) {
    stats.framebufferDeletes += 1;
    return originalDeleteFramebuffer.apply(this, args);
  };

  const originalDrawArrays = prototype.drawArrays;
  prototype.drawArrays = function (...args) {
    originalDrawArrays.apply(this, args);
    stats.drawCalls += 1;
    if (activeRaf !== null) {
      const count = (drawsPerRaf.get(activeRaf) ?? 0) + 1;
      drawsPerRaf.set(activeRaf, count);
      stats.drawCallsByRafMax = Math.max(stats.drawCallsByRafMax, count);
    }

    try {
      const canvas = this.canvas;
      const width = canvas.width;
      const height = canvas.height;
      const rect = canvas.getBoundingClientRect();
      if (width === 0 || height === 0 || rect.width === 0 || rect.height === 0) return;
      // Evidence is for the settled 228-domain production surface. Ignore
      // transient morph frames whose CSS box is intentionally between modes.
      if (Math.abs(rect.width - 228) > 0.5 || Math.abs(rect.height - 228) > 0.5) return;
      const pixels = new Uint8Array(width * height * 4);
      this.readPixels(0, 0, width, height, this.RGBA, this.UNSIGNED_BYTE, pixels);
      const scaleX = width / rect.width;
      const scaleY = height / rect.height;
      const edgeX = Math.max(1, Math.round(2 * scaleX));
      const edgeY = Math.max(1, Math.round(2 * scaleY));
      let edgeMax = 0;
      let cornerMax = 0;
      let exteriorMax = 0;
      let supportMax = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const alpha = pixels[(y * width + x) * 4 + 3];
          const inOuterStrip = x < edgeX || x >= width - edgeX || y < edgeY || y >= height - edgeY;
          if (inOuterStrip) edgeMax = Math.max(edgeMax, alpha);
          const inCorner = (x < edgeX || x >= width - edgeX) && (y < edgeY || y >= height - edgeY);
          if (inCorner) cornerMax = Math.max(cornerMax, alpha);
          if (alpha === 0) continue;
          const cssX = (x + 0.5) / scaleX;
          const cssY = rect.height - (y + 0.5) / scaleY;
          const centeredX = Math.abs(cssX - 114);
          const centeredY = Math.abs(cssY - 114);
          const qx = centeredX - 84;
          const qy = centeredY - 84;
          const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
          const signedDistance = outside + Math.min(Math.max(qx, qy), 0) - 16;
          if (signedDistance > 0) {
            exteriorMax = Math.max(exteriorMax, alpha);
            supportMax = Math.max(supportMax, signedDistance);
          }
        }
      }
      stats.readback.width = width;
      stats.readback.height = height;
      stats.readback.cssWidth = rect.width;
      stats.readback.cssHeight = rect.height;
      stats.readback.outermost2pxMaxAlpha = Math.max(stats.readback.outermost2pxMaxAlpha, edgeMax);
      stats.readback.cornerMaxAlpha = Math.max(stats.readback.cornerMaxAlpha, cornerMax);
      stats.readback.maximumExteriorSupportCssPx = Math.max(
        stats.readback.maximumExteriorSupportCssPx,
        supportMax,
      );

      if (exteriorMax > stats.readback.bestExteriorAlpha) {
        stats.readback.bestExteriorAlpha = exteriorMax;
        const output = document.createElement("canvas");
        output.width = width;
        output.height = height;
        const context = output.getContext("2d");
        const flipped = new Uint8ClampedArray(pixels.length);
        for (let row = 0; row < height; row += 1) {
          const sourceStart = row * width * 4;
          const targetStart = (height - row - 1) * width * 4;
          flipped.set(pixels.subarray(sourceStart, sourceStart + width * 4), targetStart);
        }
        context.putImageData(new ImageData(flipped, width, height), 0, 0);
        stats.readback.bestDataUrl = output.toDataURL("image/png");
      }
    } catch (error) {
      stats.readback.error = String(error);
    }
  };
};

const snapshotTelemetry = (page) => page.evaluate(() => {
  const stats = window.__mr9ProductionStats;
  const gl = document.querySelector("canvas")?.getContext("webgl2") ?? null;
  return {
    shaderCreates: stats.shaderCreates,
    shaderCompiles: stats.shaderCompiles,
    shaderCompilePasses: stats.shaderCompilePasses,
    shaderLogs: stats.shaderLogs,
    programCreates: stats.programCreates,
    programDeletes: stats.programDeletes,
    livePrograms: stats.programCreates - stats.programDeletes,
    validPrograms: gl ? stats.programObjects.filter((program) => gl.isProgram(program)).length : 0,
    programLinks: stats.programLinks,
    programLinkPasses: stats.programLinkPasses,
    programLogs: stats.programLogs,
    textureCreates: stats.textureCreates,
    textureDeletes: stats.textureDeletes,
    liveTextures: stats.textureCreates - stats.textureDeletes,
    framebufferCreates: stats.framebufferCreates,
    framebufferDeletes: stats.framebufferDeletes,
    liveFramebuffers: stats.framebufferCreates - stats.framebufferDeletes,
    drawCalls: stats.drawCalls,
    drawCallsByRafMax: stats.drawCallsByRafMax,
    rafRequests: stats.rafRequests,
    rafFires: stats.rafFires,
    rafCancels: stats.rafCancels,
    rafPending: stats.rafPending,
    rafMaxPending: stats.rafMaxPending,
    readback: { ...stats.readback, bestDataUrl: undefined },
  };
});

const forceStableRendererRedraw = async (page) => {
  await page.evaluate(async () => {
    const canvas = document.querySelector("canvas");
    canvas.style.width = "227px";
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
    canvas.style.width = "100%";
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  });
};

const measureComposition = (page) => page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const shell = canvas?.closest('div[tabindex="0"]');
  const outerFx = canvas?.parentElement;
  const clip = shell
    ? Array.from(shell.children).find((child) => child !== outerFx && getComputedStyle(child).overflow === "hidden")
    : null;
  const backdrop = shell?.previousElementSibling ?? null;
  const rect = (element) => {
    const value = element?.getBoundingClientRect();
    return value ? { x: value.x, y: value.y, width: value.width, height: value.height } : null;
  };
  const style = (element) => {
    if (!element) return null;
    const value = getComputedStyle(element);
    return {
      pointerEvents: value.pointerEvents,
      overflow: value.overflow,
      borderRadius: value.borderRadius,
      background: value.backgroundColor,
      boxShadow: value.boxShadow,
      zIndex: value.zIndex,
      transform: value.transform,
      opacity: value.opacity,
      filter: value.filter,
      isolation: value.isolation,
      willChange: value.willChange,
      clipPath: value.clipPath,
    };
  };
  const describe = (element) => {
    if (!element) return null;
    return {
      tag: element.tagName.toLowerCase(),
      className: typeof element.className === "string" ? element.className : "",
      insidePanel: Boolean(shell && (element === shell || shell.contains(element))),
      isCanvas: element === canvas,
    };
  };
  const centerHit = document.elementFromPoint(114, 114);
  const gutterHit = document.elementFromPoint(1, 1);
  const shadowCandidates = [backdrop, shell, outerFx, clip, canvas].map((element, index) => ({
    owner: ["backdrop", "panelShell", "outerFx", "innerClip", "canvas"][index],
    shadow: element ? getComputedStyle(element).boxShadow : "none",
  }));
  return {
    devicePixelRatio,
    viewport: { width: innerWidth, height: innerHeight },
    canvasCount: document.querySelectorAll("canvas").length,
    canvas: { rect: rect(canvas), style: style(canvas) },
    outerFx: { rect: rect(outerFx), style: style(outerFx) },
    panelShell: { rect: rect(shell), style: style(shell) },
    innerClip: { rect: rect(clip), style: style(clip) },
    hits: { center: describe(centerHit), gutter: describe(gutterHit) },
    shadowCandidates,
    exteriorShadowOwners: shadowCandidates.filter(({ shadow }) => shadow !== "none" && !shadow.includes("inset")),
  };
});

const invokeNativeWindow = (processId, body) => {
  const command = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Mr9NativeWindow {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int width, int height, bool repaint);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
}
'@
$process = Get-Process -Id ${processId} -ErrorAction Stop
$handle = $process.MainWindowHandle
if ($handle -eq [IntPtr]::Zero) { throw 'Electron MainWindowHandle is zero' }
${body}
`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
};

const mainBounds = async (processId) => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const output = invokeNativeWindow(processId, `
$rect = New-Object Mr9NativeWindow+RECT
[void][Mr9NativeWindow]::GetWindowRect($handle, [ref]$rect)
@{ hwnd = $handle.ToInt64(); x = $rect.Left; y = $rect.Top; width = $rect.Right - $rect.Left; height = $rect.Bottom - $rect.Top; visible = [Mr9NativeWindow]::IsWindowVisible($handle) } | ConvertTo-Json -Compress
`);
      const value = JSON.parse(output);
      return {
        bounds: { x: value.x, y: value.y, width: value.width, height: value.height },
        visible: value.visible,
        processId,
        hwnd: value.hwnd,
      };
    } catch {
      await sleep(100);
    }
  }
  throw new Error("228x228 native Electron Main Window was not found");
};

const restoreBounds = async (processId, bounds) => {
  invokeNativeWindow(processId, `
[void][Mr9NativeWindow]::MoveWindow($handle, ${bounds.x}, ${bounds.y}, ${bounds.width}, ${bounds.height}, $true)
[void][Mr9NativeWindow]::SetForegroundWindow($handle)
`);
  await sleep(100);
};

const getCursorPosition = (processId) => JSON.parse(invokeNativeWindow(processId, `
$point = New-Object Mr9NativeWindow+POINT
[void][Mr9NativeWindow]::GetCursorPos([ref]$point)
@{ x = $point.X; y = $point.Y } | ConvertTo-Json -Compress
`));

const setCursorPosition = (processId, point) => {
  invokeNativeWindow(processId, `[void][Mr9NativeWindow]::SetCursorPos(${Math.round(point.x)}, ${Math.round(point.y)})`);
};

const runInteractionMatrix = async (page, processId, startingBounds) => {
  const cursorBeforeInteractionMatrix = getCursorPosition(processId);
  setCursorPosition(processId, {
    x: startingBounds.x + 114,
    y: startingBounds.y + 114,
  });
  await page.evaluate(() => {
    window.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      clientX: 114,
      clientY: 114,
    }));
  });
  await page.waitForFunction(() => {
    const width = document.querySelector('div[tabindex="0"]')?.getBoundingClientRect().width ?? 0;
    return Math.abs(width - 200) <= 0.75;
  }, undefined, { timeout: 5_000 });

  const beforeGutter = (await mainBounds(processId)).bounds;
  await page.mouse.move(3, 3);
  await page.mouse.down();
  await page.mouse.move(18, 18, { steps: 3 });
  await page.mouse.up();
  await sleep(150);
  const afterGutter = (await mainBounds(processId)).bounds;

  await restoreBounds(processId, startingBounds);
  const beforePanel = (await mainBounds(processId)).bounds;
  await page.mouse.move(35, 35);
  await page.mouse.down();
  const panelCaptureWhileDown = await page.evaluate(() => {
    const shell = document.querySelector('div[tabindex="0"]');
    return shell?.hasPointerCapture(1) ?? false;
  });
  await page.mouse.move(47, 43, { steps: 4 });
  await page.mouse.up();
  await sleep(150);
  const afterPanel = (await mainBounds(processId)).bounds;
  await restoreBounds(processId, startingBounds);

  const drop = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const shell = canvas?.closest('div[tabindex="0"]');
    const gutter = document.elementFromPoint(1, 1);
    const dispatch = (target) => {
      const data = new DataTransfer();
      data.setData("text/plain", "not-a-download-url");
      const event = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    return {
      panelDefaultPrevented: dispatch(shell),
      gutterDefaultPrevented: dispatch(gutter),
    };
  });

  // Leave the real panel before collapsing so hover/Magnetic facts do not
  // legitimately request an immediate Full re-entry during the settle.
  const expandedBefore = await page.evaluate(() => document.querySelector('div[tabindex="0"]')?.getBoundingClientRect().width);
  setCursorPosition(processId, {
    x: startingBounds.x - 24,
    y: startingBounds.y - 24,
  });
  await page.mouse.move(227, 227);
  await page.waitForFunction(() => {
    const width = document.querySelector('div[tabindex="0"]')?.getBoundingClientRect().width ?? 0;
    return Math.abs(width - 60) <= 0.75;
  }, undefined, { timeout: 3_000 });
  const compact = {
    panelRect: await page.evaluate(() => {
      const rect = document.querySelector('div[tabindex="0"]')?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
    }),
    native: await mainBounds(processId),
  };
  compact.panelWidth = compact.panelRect?.width ?? 0;
  // Compact is intentionally native-pass-through. Exercise the existing
  // native pointer-boundary fallback by moving the real Windows cursor into
  // the compact hotspot; do not invent a renderer-only re-entry shortcut.
  setCursorPosition(processId, {
    x: compact.native.bounds.x + compact.panelRect.x + compact.panelRect.width / 2,
    y: compact.native.bounds.y + compact.panelRect.y + compact.panelRect.height / 2,
  });
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      clientX: x,
      clientY: y,
    }));
  }, {
    x: compact.panelRect.x + compact.panelRect.width / 2,
    y: compact.panelRect.y + compact.panelRect.height / 2,
  });
  await page.waitForFunction(() => {
    const width = document.querySelector('div[tabindex="0"]')?.getBoundingClientRect().width ?? 0;
    return Math.abs(width - 200) <= 0.75;
  }, undefined, { timeout: 5_000 });
  setCursorPosition(processId, cursorBeforeInteractionMatrix);
  const reexpanded = {
    panelWidth: await page.evaluate(() => document.querySelector('div[tabindex="0"]')?.getBoundingClientRect().width),
    native: await mainBounds(processId),
  };

  return {
    gutterDrag: { before: beforeGutter, after: afterGutter, moved: beforeGutter.x !== afterGutter.x || beforeGutter.y !== afterGutter.y },
    panelDrag: { before: beforePanel, after: afterPanel, moved: beforePanel.x !== afterPanel.x || beforePanel.y !== afterPanel.y },
    panelCaptureWhileDown,
    drop,
    collapse: {
      expandedBefore,
      compact,
      reentryInput: "native cursor plus forwarded window mousemove at the derived compact center",
      reexpanded,
    },
  };
};

const createReviewSheet = async (metrics) => {
  const osImage = readFileSync(join(evidenceDir, "windows-os-composite.png")).toString("base64");
  const alphaImage = readFileSync(join(evidenceDir, "native-alpha.png")).toString("base64");
  const pass = (value) => value ? '<span class="pass">PASS</span>' : '<span class="fail">FAIL</span>';
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;background:#0b1018;color:#e8eef8;font:14px/1.35 Segoe UI,system-ui,sans-serif}
    main{width:1000px;height:430px;box-sizing:border-box;padding:18px;display:grid;grid-template-columns:250px 250px 1fr;gap:18px}
    section{background:#121b28;border:1px solid #29384d;border-radius:12px;padding:12px;box-sizing:border-box;overflow:hidden}
    h1{font-size:18px;margin:0 0 10px;color:#fff} h2{font-size:13px;margin:0 0 8px;color:#a9bdd7;text-transform:uppercase;letter-spacing:.08em}
    img{display:block;width:228px;height:228px;object-fit:contain;background:repeating-conic-gradient(#182332 0 25%,#101925 0 50%) 0/16px 16px;border-radius:6px}
    dl{display:grid;grid-template-columns:1fr auto;gap:7px 12px;margin:0} dt{color:#a9bdd7} dd{margin:0;text-align:right}
    .pass{color:#62e6a7}.fail{color:#ff7387}.note{margin-top:10px;color:#8ca0ba;font-size:12px}
  </style></head><body><main>
    <section><h2>Windows OS composite</h2><img src="data:image/png;base64,${osImage}"><p class="note">Exact 228×228 Win32 screen crop.</p></section>
    <section><h2>Native-alpha WebGL</h2><img src="data:image/png;base64,${alphaImage}"><p class="note">Exact canvas readback at Reduced Motion.</p></section>
    <section><h1>MR9 Production Main Window</h1><dl>
      <dt>Native / DOM / canvas 228²</dt><dd>${pass(metrics.gates.geometry)}</dd>
      <dt>Panel clip (14,14,200²) / r16</dt><dd>${pass(metrics.gates.panelClip)}</dd>
      <dt>Shader compile + link</dt><dd>${pass(metrics.gates.shader)}</dd>
      <dt>Outermost 2px alpha = 0</dt><dd>${pass(metrics.gates.outerAlpha)}</dd>
      <dt>Halo support ≤12px</dt><dd>${pass(metrics.gates.haloSupport)}</dd>
      <dt>1 canvas / program; 0 texture/FBO</dt><dd>${pass(metrics.gates.resources)}</dd>
      <dt>Sole exterior CSS shadow</dt><dd>${pass(metrics.gates.shadow)}</dd>
      <dt>Gutter drag/drop rejected</dt><dd>${pass(metrics.gates.gutterInteraction)}</dd>
      <dt>Panel drag/capture/drop preserved</dt><dd>${pass(metrics.gates.panelInteraction)}</dd>
      <dt>Collapse → compact → re-expand</dt><dd>${pass(metrics.gates.lifecycle)}</dd>
      <dt>Context loss/restore: 1 live program</dt><dd>${pass(metrics.gates.contextRestore)}</dd>
      <dt>Reduced Motion stable ≥500ms</dt><dd>${pass(metrics.gates.reducedMotion)}</dd>
    </dl><p class="note">Electron production route on Windows; Browser Lab was not used. Packaged-dir build was blocked by host EPERM and is recorded separately. macOS NOT VERIFIED.</p></section>
  </main></body></html>`;
  const htmlPath = join(evidenceDir, "review-sheet.html");
  writeFileSync(htmlPath, html);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 430 }, deviceScaleFactor: 1 });
  await page.goto(`file:///${htmlPath.replaceAll("\\", "/")}`);
  await page.screenshot({ path: join(evidenceDir, "review-sheet.png") });
  await browser.close();
};

const preview = spawn(
  process.execPath,
  [join(repoRoot, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);

let electronProcess;
let browser;
try {
  await waitForServer();
  console.log("stage: preview-ready");
  electronProcess = spawn(
    join(repoRoot, "node_modules/electron/dist/electron.exe"),
    [`--remote-debugging-port=${debugPort}`, "."],
    {
    cwd: repoRoot,
    env: {
      ...process.env,
      AMEOW_FRONTEND_URL: `http://127.0.0.1:${port}`,
      APPDATA: join(profileRoot, "Roaming"),
      LOCALAPPDATA: join(profileRoot, "Local"),
    },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: false,
    },
  );
  await waitForDebugPort();
  console.log("stage: electron-launched");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const context = browser.contexts()[0];
  const deadline = Date.now() + 30_000;
  let page = null;
  while (Date.now() < deadline && page === null) {
    page = context.pages().find((candidate) => candidate.url().includes(`#/`)) ?? null;
    if (page === null) await sleep(100);
  }
  if (page === null) throw new Error("Electron Main Window renderer page was not found");
  console.log("stage: first-window");
  await page.waitForLoadState("domcontentloaded");
  await page.addInitScript(telemetryInit);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas");
  await sleep(1_000);
  console.log("stage: ordinary-ready");

  const initialNative = await mainBounds(electronProcess.pid);
  await restoreBounds(electronProcess.pid, initialNative.bounds);
  const ordinaryComposition = await measureComposition(page);
  const ordinaryTelemetry = await snapshotTelemetry(page);
  const interactions = await runInteractionMatrix(page, electronProcess.pid, initialNative.bounds);
  console.log("stage: interactions-complete");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas");
  await sleep(1_000);
  // The Reduced-Motion renderer has no continuing frames. Exercise its
  // existing ResizeObserver redraw contract once after the shell settles so
  // native-alpha evidence is captured at the exact 228px production size.
  await forceStableRendererRedraw(page);
  const reducedStart = await snapshotTelemetry(page);
  await sleep(600);
  const reducedEnd = await snapshotTelemetry(page);
  const reducedComposition = await measureComposition(page);
  const reducedNative = await mainBounds(electronProcess.pid);
  console.log("stage: reduced-ready");

  await restoreBounds(electronProcess.pid, reducedNative.bounds);
  await page.bringToFront();
  await sleep(200);
  await page.screenshot({ path: join(evidenceDir, "webcontents.png"), omitBackground: true });
  captureScreenRect(reducedNative.bounds, join(evidenceDir, "windows-os-composite.png"));
  const alphaUrl = await page.evaluate(() => window.__mr9ProductionStats.readback.bestDataUrl);
  if (!alphaUrl) throw new Error("No native-alpha WebGL readback was captured");
  writeFileSync(join(evidenceDir, "native-alpha.png"), Buffer.from(alphaUrl.split(",")[1], "base64"));
  console.log("stage: captures-complete");

  const beforeContext = await snapshotTelemetry(page);
  const contextResult = await page.evaluate(async () => {
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl2");
    const extension = gl.getExtension("WEBGL_lose_context");
    if (!extension) return { supported: false };
    extension.loseContext();
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
    extension.restoreContext();
    await new Promise((resolveWait) => setTimeout(resolveWait, 600));
    return { supported: true, contextLostAfterRestore: gl.isContextLost() };
  });
  const afterContext = await snapshotTelemetry(page);
  console.log("stage: context-complete");

  const approx = (value, expected, tolerance = 0.75) => Math.abs(value - expected) <= tolerance;
  const clip = reducedComposition.innerClip;
  const readback = reducedEnd.readback;
  const gates = {
    geometry: reducedNative.bounds.width === 228 && reducedNative.bounds.height === 228
      && reducedComposition.viewport.width === 228 && reducedComposition.viewport.height === 228
      && approx(reducedComposition.canvas.rect.width, 228) && approx(reducedComposition.canvas.rect.height, 228),
    panelClip: approx(clip.rect.x, 14) && approx(clip.rect.y, 14)
      && approx(clip.rect.width, 200) && approx(clip.rect.height, 200)
      && clip.style.borderRadius === "16px" && clip.style.overflow === "hidden",
    shader: reducedEnd.shaderCompiles > 0 && reducedEnd.shaderCompiles === reducedEnd.shaderCompilePasses
      && reducedEnd.programLinks > 0 && reducedEnd.programLinks === reducedEnd.programLinkPasses
      && reducedEnd.shaderLogs.length === 0 && reducedEnd.programLogs.length === 0,
    outerAlpha: readback.outermost2pxMaxAlpha === 0 && readback.cornerMaxAlpha === 0,
    haloSupport: readback.bestExteriorAlpha > 0 && readback.maximumExteriorSupportCssPx <= 12.1,
    resources: reducedComposition.canvasCount === 1 && reducedEnd.livePrograms === 1
      && reducedEnd.liveTextures === 0 && reducedEnd.liveFramebuffers === 0
      && reducedEnd.drawCallsByRafMax <= 1,
    shadow: reducedComposition.exteriorShadowOwners.length === 1
      && reducedComposition.exteriorShadowOwners[0].owner === "backdrop",
    gutterInteraction: !interactions.gutterDrag.moved && !interactions.drop.gutterDefaultPrevented
      && !reducedComposition.hits.gutter.insidePanel && !reducedComposition.hits.gutter.isCanvas,
    panelInteraction: interactions.panelDrag.moved && interactions.panelCaptureWhileDown
      && interactions.drop.panelDefaultPrevented && reducedComposition.hits.center.insidePanel,
    lifecycle: approx(interactions.collapse.expandedBefore, 200)
      && approx(interactions.collapse.compact.panelWidth, 60)
      && interactions.collapse.compact.native.bounds.width === 228
      && approx(interactions.collapse.reexpanded.panelWidth, 200)
      && interactions.collapse.reexpanded.native.bounds.width === 228,
    contextRestore: contextResult.supported && !contextResult.contextLostAfterRestore
      && afterContext.validPrograms === 1 && afterContext.programCreates > beforeContext.programCreates,
    reducedMotion: reducedEnd.drawCalls === reducedStart.drawCalls
      && reducedEnd.rafFires === reducedStart.rafFires && reducedEnd.rafPending === 0,
  };

  const metrics = {
    capturedAt: new Date().toISOString(),
    host: { platform: process.platform, electronRoute: `http://127.0.0.1:${port}`, packaged: false },
    packageAttempt: { status: "BLOCKED", reason: "electron-builder EPERM renaming win-unpacked.tmp to win-unpacked on two attempts" },
    initialNative,
    ordinary: { composition: ordinaryComposition, telemetry: ordinaryTelemetry },
    interactions,
    reducedMotion: { native: reducedNative, composition: reducedComposition, start: reducedStart, end: reducedEnd },
    contextRecovery: { before: beforeContext, result: contextResult, after: afterContext },
    gates,
    macOS: "NOT VERIFIED",
  };
  writeFileSync(join(evidenceDir, "measurements.json"), `${JSON.stringify(metrics, null, 2)}\n`);
  await createReviewSheet(metrics);
  console.log(JSON.stringify({ gates, evidenceDir }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (electronProcess && !electronProcess.killed) electronProcess.kill();
  preview.kill();
}
