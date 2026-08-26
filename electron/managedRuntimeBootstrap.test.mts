import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  MANAGED_PYTHON_PACKAGE_SPECS,
  resolvePinnedManagedPythonPackage as resolvePinnedManagedPythonPackageFromManifest,
} from "./managedPythonPackageManifest.mjs";
import {
  assertPythonVersionSatisfiesManagedPackage,
  createRuntimeBootstrapExecutionContext,
  currentManagedRuntimeTarget,
  downloadToFile,
  managedDenoPath,
  managedFfmpegPaths,
  buildManagedPythonEnv,
  managedGalleryDlPath,
  managedPythonVirtualenvArgs,
  managedYtDlpPaths,
  resolveBootstrapRoutePolicy,
  resolvePinnedManagedPythonPackage,
  selectDenoRuntimeArtifactSpec,
  selectFfmpegRuntimeArtifactSpec,
  type RuntimeBootstrapExecutionContext,
} from "./managedRuntimeBootstrap.mjs";

const createOptions = (overrides = {}) => ({
  configDir: "/tmp/ameow-config",
  platform: "win32" as NodeJS.Platform,
  arch: "x64" as NodeJS.Architecture,
  fetch: vi.fn<typeof fetch>(),
  ...overrides,
});

describe("managed runtime bootstrap helpers", () => {
  it("resolves managed runtime target and binary paths consistently", () => {
    const options = createOptions();

    expect(currentManagedRuntimeTarget("win32", "x64")).toBe("x86_64-pc-windows-msvc");
    expect(managedDenoPath(options)).toBe(
      join("/tmp/ameow-config", "runtimes", "deno", "x86_64-pc-windows-msvc", "real", "deno.exe"),
    );
    expect(managedFfmpegPaths(options)).toEqual({
      ffmpeg: join("/tmp/ameow-config", "runtimes", "ffmpeg", "x86_64-pc-windows-msvc", "real", "ffmpeg.exe"),
      ffprobe: join("/tmp/ameow-config", "runtimes", "ffmpeg", "x86_64-pc-windows-msvc", "real", "ffprobe.exe"),
    });
    expect(managedYtDlpPaths(options).ytDlp).toBe(
      join("/tmp/ameow-config", "runtimes", "yt-dlp", "x86_64-pc-windows-msvc", "venv", "Scripts", "yt-dlp.exe"),
    );
    expect(managedGalleryDlPath(options)).toBe(
      join("/tmp/ameow-config", "runtimes", "gallery-dl", "x86_64-pc-windows-msvc", "venv", "Scripts", "gallery-dl.exe"),
    );
  });

  it("keeps pinned Python downloader package metadata explicit", () => {
    expect(resolvePinnedManagedPythonPackage("yt-dlp")).toMatchObject({
      packageVersion: "2026.07.04",
      installSource: "yt-dlp==2026.07.04",
      installSources: ["yt-dlp==2026.07.04", "yt-dlp-ejs==0.8.0"],
      packageSetId: "yt-dlp==2026.07.04;yt-dlp-ejs==0.8.0",
    });
    expect(resolvePinnedManagedPythonPackage("gallery-dl")).toMatchObject({
      packageVersion: "1.32.8",
      installSource: "gallery-dl==1.32.8",
      installSources: ["gallery-dl==1.32.8"],
    });
    expect(() => resolvePinnedManagedPythonPackage("unknown" as never)).toThrow(
      "Unsupported managed Python package tool: unknown",
    );
  });

  it("uses symlink-based Python virtualenv creation on every platform", () => {
    expect(managedPythonVirtualenvArgs("/tmp/ameow-venv")).toEqual([
      "-m",
      "venv",
      "/tmp/ameow-venv",
    ]);
    expect(managedPythonVirtualenvArgs("/tmp/ameow-venv")).not.toContain("--copies");
  });

  it("re-exports the app-owned Python downloader package manifest", () => {
    expect(resolvePinnedManagedPythonPackage).toBe(resolvePinnedManagedPythonPackageFromManifest);
    expect(Object.keys(MANAGED_PYTHON_PACKAGE_SPECS).sort()).toEqual([
      "gallery-dl",
      "yt-dlp",
    ]);
  });

  it("resolves managed deno and ffmpeg artifact specs per target", () => {
    expect(selectDenoRuntimeArtifactSpec(createOptions())).toMatchObject({
      component: "deno",
      target: "x86_64-pc-windows-msvc",
      size: 47277539,
    });
    expect(selectFfmpegRuntimeArtifactSpec(createOptions({
      platform: "darwin",
      arch: "arm64",
    }))).toMatchObject({
      component: "ffmpeg",
      target: "aarch64-apple-darwin",
      size: 69575396,
    });
  });

  it("rejects bundled Python versions below a managed package minimum", () => {
    expect(() =>
      assertPythonVersionSatisfiesManagedPackage("yt-dlp", "Python 3.11.15", [3, 10, 0]),
    ).not.toThrow();
    expect(() =>
      assertPythonVersionSatisfiesManagedPackage("yt-dlp", "Python 3.9.18", [3, 10, 0]),
    ).toThrow("Bundled Python 3.9.18 is too old for yt-dlp");
    expect(() =>
      assertPythonVersionSatisfiesManagedPackage("gallery-dl", "not-a-version", [3, 8, 0]),
    ).toThrow("Unable to parse bundled Python version for gallery-dl");
  });

  it("applies a resolved HTTP(S) route to managed Python package environments", () => {
    const env = buildManagedPythonEnv({
      root: "/tmp/ameow-config/runtimes/yt-dlp",
      venvDir: "/tmp/ameow-config/runtimes/yt-dlp/venv",
      python: "/tmp/ameow-config/runtimes/yt-dlp/venv/bin/python",
      entrypoint: "/tmp/ameow-config/runtimes/yt-dlp/venv/bin/yt-dlp",
      metadata: "/tmp/ameow-config/runtimes/yt-dlp/metadata.json",
    }, {
      preference: "manual",
      effectivePolicyReason: "manual_active",
      consumer: "runtime-bootstrap",
      targetUrl: "https://pypi.org/simple/",
      route: {
        mode: "proxy",
        source: "manual",
        protocol: "http",
        proxyUrl: "http://127.0.0.1:7890",
        resolvedFor: "https://pypi.org/simple/",
      },
      status: "resolved",
      trace: [],
    });

    expect(env).toMatchObject({
      HTTP_PROXY: "http://127.0.0.1:7890",
      HTTPS_PROXY: "http://127.0.0.1:7890",
      http_proxy: "http://127.0.0.1:7890",
      https_proxy: "http://127.0.0.1:7890",
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
    });
    expect(env.PLAYWRIGHT_BROWSERS_PATH).toContain("playwright-browsers");
  });

  it("creates distinct collision-safe identities per bootstrap lifecycle", () => {
    const first = createRuntimeBootstrapExecutionContext({});
    const second = createRuntimeBootstrapExecutionContext({});
    expect(first.identity).toMatch(/^[0-9a-f-]{36}$/i);
    expect(second.identity).toMatch(/^[0-9a-f-]{36}$/i);
    expect(first.identity).not.toBe(second.identity);
    expect(first.createdAtMs).toBeGreaterThan(0);
    expect(first.network).toBeNull();
  });

  it("applies direct and HTTP(S) routes for both asset fetch and pip", () => {
    const httpResolution = {
      preference: "system" as const,
      effectivePolicyReason: null,
      consumer: "runtime-bootstrap" as const,
      targetUrl: "https://pypi.org/simple/",
      route: {
        mode: "proxy" as const,
        source: "environment" as const,
        protocol: "http" as const,
        proxyUrl: "http://127.0.0.1:7890",
        resolvedFor: "https://pypi.org/simple/",
      },
      status: "resolved" as const,
      trace: [],
    };
    expect(resolveBootstrapRoutePolicy(httpResolution, "pip-install")).toEqual({ kind: "apply" });
    expect(resolveBootstrapRoutePolicy(httpResolution, "asset-fetch")).toEqual({ kind: "apply" });
    const directResolution = {
      ...httpResolution,
      route: {
        mode: "direct" as const,
        source: "system" as const,
        reason: "resolved_direct" as const,
        resolvedFor: "https://pypi.org/simple/",
      },
    };
    expect(resolveBootstrapRoutePolicy(directResolution, "pip-install")).toEqual({ kind: "apply" });
    expect(resolveBootstrapRoutePolicy(null, "pip-install")).toEqual({ kind: "apply" });
  });

  it("rejects SOCKS routes typed for pip but still applies them for asset fetch", () => {
    const socksResolution = {
      preference: "system" as const,
      effectivePolicyReason: null,
      consumer: "runtime-bootstrap" as const,
      targetUrl: "https://pypi.org/simple/",
      route: {
        mode: "proxy" as const,
        source: "environment" as const,
        protocol: "socks5" as const,
        proxyUrl: "socks5://127.0.0.1:1080",
        resolvedFor: "https://pypi.org/simple/",
      },
      status: "resolved" as const,
      trace: [],
    };
    expect(resolveBootstrapRoutePolicy(socksResolution, "pip-install"))
      .toEqual({ kind: "unsupported", reason: "socks5" });
    expect(resolveBootstrapRoutePolicy(socksResolution, "asset-fetch")).toEqual({ kind: "apply" });
  });

  it("rejects complex routes typed for both asset fetch and pip", () => {
    const complexResolution = {
      preference: "system" as const,
      effectivePolicyReason: null,
      consumer: "runtime-bootstrap" as const,
      targetUrl: "https://pypi.org/simple/",
      route: {
        mode: "complex" as const,
        source: "system" as const,
        reason: "multiple_candidates" as const,
        resolvedFor: "https://pypi.org/simple/",
      },
      status: "resolved" as const,
      trace: [],
    };
    expect(resolveBootstrapRoutePolicy(complexResolution, "asset-fetch"))
      .toEqual({ kind: "unsupported", reason: "multiple_candidates" });
    expect(resolveBootstrapRoutePolicy(complexResolution, "pip-install"))
      .toEqual({ kind: "unsupported", reason: "multiple_candidates" });
  });

  it("fails complex asset routes typed before any fetch is issued", async () => {
    const fetch = vi.fn();
    const fetchRouteAware = vi.fn();
    const logs: string[] = [];
    const complexResolution = {
      preference: "system" as const,
      effectivePolicyReason: null,
      consumer: "runtime-bootstrap" as const,
      targetUrl: "https://dl.example/a.zip",
      route: {
        mode: "complex" as const,
        source: "system" as const,
        reason: "multiple_candidates" as const,
        resolvedFor: "https://dl.example/a.zip",
      },
      status: "resolved" as const,
      trace: [],
    };
    const options = {
      ...createOptions({
        fetch,
        fetchRouteAware,
        log: (message: string) => logs.push(message),
      }),
      bootstrapContext: { identity: "ctx-1", createdAtMs: 1, network: null },
      resolveRoute: async () => complexResolution,
    };

    await expect(
      downloadToFile("https://dl.example/a.zip", "/tmp/ameow-assets/a.zip", options),
    ).rejects.toMatchObject({
      code: "E_EXECUTION_FAILED",
      context: {
        networkFailureClassification: "NETWORK_PROXY_UNSUPPORTED",
      },
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(fetchRouteAware).not.toHaveBeenCalled();
    expect(logs.some((line) => line.includes("aborted before request"))).toBe(true);
  });

  it("closes a partially written timeout stream before surfacing the normalized error", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "ameow-runtime-bootstrap-timeout-"));
    const outputPath = join(outputDir, "runtime.zip");
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
          controller.enqueue(new TextEncoder().encode("partial"));
        },
      });
      init?.signal?.addEventListener("abort", () => {
        streamController?.error(new Error("stalled by timeout"));
      }, { once: true });
      return new Response(body, { headers: { "content-length": "8" } });
    });

    try {
      await expect(downloadToFile("https://dl.example/runtime.zip", outputPath, {
        ...createOptions({ fetch }),
        timeoutMs: 10,
        timeoutErrorMessage: "runtime download timed out",
      })).rejects.toThrow("runtime download timed out");
      await expect(rm(outputPath)).resolves.toBeUndefined();
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("applies supported routes through the route-aware fetch adapter with the lifecycle identity", async () => {
    const fetch = vi.fn();
    const fetchRouteAware = vi.fn(async () => {
      throw new Error("fetch-route-aware reached");
    });
    const logs: string[] = [];
    const envResolution = {
      preference: "system" as const,
      effectivePolicyReason: null,
      consumer: "runtime-bootstrap" as const,
      targetUrl: "https://dl.example/a.zip",
      route: {
        mode: "proxy" as const,
        source: "environment" as const,
        protocol: "http" as const,
        proxyUrl: "http://user:secret@127.0.0.1:7890",
        resolvedFor: "https://dl.example/a.zip",
      },
      status: "resolved" as const,
      trace: [],
    };
    const bootstrapContext: RuntimeBootstrapExecutionContext = {
      identity: "ctx-abc",
      createdAtMs: 7,
      network: null,
    };
    const options = {
      ...createOptions({
        fetch,
        fetchRouteAware,
        log: (message: string) => logs.push(message),
      }),
      bootstrapContext,
      resolveRoute: async () => envResolution,
    };

    await expect(
      downloadToFile("https://dl.example/a.zip", "/tmp/ameow-assets/a.zip", options),
    ).rejects.toThrow("fetch-route-aware reached");
    expect(fetch).not.toHaveBeenCalled();
    expect(fetchRouteAware).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://dl.example/a.zip",
      identity: "ctx-abc",
    }));
    expect(fetchRouteAware.mock.calls[0]?.[0]?.resolution?.route).toMatchObject({
      mode: "proxy",
      source: "environment",
      protocol: "http",
    });
    expect(bootstrapContext.network?.route).toMatchObject({
      mode: "proxy",
      source: "environment",
    });
    expect(logs.some((line) => line.includes('"appliedToFetch":true'))).toBe(true);
    expect(logs.some((line) => line.includes("user:secret"))).toBe(false);
  });

  it("records non-application honestly when no route-aware adapter is available", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("fetch reached");
    });
    const logs: string[] = [];
    const envResolution = {
      preference: "system" as const,
      effectivePolicyReason: null,
      consumer: "runtime-bootstrap" as const,
      targetUrl: "https://dl.example/a.zip",
      route: {
        mode: "proxy" as const,
        source: "environment" as const,
        protocol: "http" as const,
        proxyUrl: "http://127.0.0.1:7890",
        resolvedFor: "https://dl.example/a.zip",
      },
      status: "resolved" as const,
      trace: [],
    };
    const options = {
      ...createOptions({
        fetch,
        log: (message: string) => logs.push(message),
      }),
      bootstrapContext: { identity: "ctx-legacy", createdAtMs: 1, network: null },
      resolveRoute: async () => envResolution,
    };

    await expect(
      downloadToFile("https://dl.example/a.zip", "/tmp/ameow-assets/a.zip", options),
    ).rejects.toThrow("fetch reached");
    expect(fetch).toHaveBeenCalled();
    expect(logs.some((line) => line.includes('"appliedToFetch":false'))).toBe(true);
    expect(logs.some((line) => line.includes("not applied"))).toBe(true);
  });

  it("redacts credentials from failed route-resolution diagnostics", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("fetch reached");
    });
    const logs: string[] = [];
    const options = {
      ...createOptions({
        fetch,
        log: (message: string) => logs.push(message),
      }),
      bootstrapContext: { identity: "ctx-redact", createdAtMs: 1, network: null },
      resolveRoute: async () => {
        throw new Error("resolve failed for http://user:hunter2@proxy.example:8080");
      },
    };

    await expect(
      downloadToFile("https://dl.example/a.zip", "/tmp/ameow-assets/a.zip", options),
    ).rejects.toThrow();
    expect(logs.some((line) => line.includes("hunter2"))).toBe(false);
    expect(logs.some((line) => line.includes("route resolution failed"))).toBe(true);
  });

  it("scrubs ambient proxy keys and never maps SOCKS/complex routes into pip env", () => {
    const previousEnv = { ...process.env };
    process.env.HTTP_PROXY = "http://ambient:8080";
    process.env.ALL_PROXY = "socks5://ambient:1080";
    process.env.NO_PROXY = "localhost";
    try {
      const env = buildManagedPythonEnv({
        root: "/tmp/ameow-config/runtimes/yt-dlp",
        venvDir: "/tmp/ameow-config/runtimes/yt-dlp/venv",
        python: "/tmp/ameow-config/runtimes/yt-dlp/venv/bin/python",
        entrypoint: "/tmp/ameow-config/runtimes/yt-dlp/venv/bin/yt-dlp",
        metadata: "/tmp/ameow-config/runtimes/yt-dlp/metadata.json",
      }, {
        preference: "system",
        effectivePolicyReason: null,
        consumer: "runtime-bootstrap",
        targetUrl: "https://pypi.org/simple/",
        route: {
          mode: "proxy",
          source: "environment",
          protocol: "socks5",
          proxyUrl: "socks5://127.0.0.1:1080",
          resolvedFor: "https://pypi.org/simple/",
        },
        status: "resolved",
        trace: [],
      });

      expect(env.HTTP_PROXY).toBeUndefined();
      expect(env.ALL_PROXY).toBeUndefined();
      expect(env.NO_PROXY).toBeUndefined();
      expect(env.HTTPS_PROXY).toBeUndefined();
    } finally {
      delete process.env.HTTP_PROXY;
      delete process.env.ALL_PROXY;
      delete process.env.NO_PROXY;
      process.env = previousEnv;
    }
  });
});
