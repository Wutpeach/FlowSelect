import { describe, expect, it, vi } from "vitest";

import type {
  RuntimeDependencyGateStatePayload,
  RuntimeDependencyManagedComponent,
  RuntimeDependencyStatusEntry,
  RuntimeDependencyStatusSnapshot,
} from "../src/types/runtimeDependencies.js";
import { createRuntimeDependencyGateController } from "./runtimeDependencyGate.mjs";

const readyBundledEntry: RuntimeDependencyStatusEntry = {
  state: "ready",
  source: "bundled",
  path: "D:/runtime/tool.exe",
  error: null,
};

const readyManagedEntry: RuntimeDependencyStatusEntry = {
  state: "ready",
  source: "managed",
  expectedSource: "managed",
  path: "D:/runtime/managed-tool.exe",
  error: null,
};

const missingManagedEntry = (
  error = "Missing managed runtime",
): RuntimeDependencyStatusEntry => ({
  state: "missing",
  source: null,
  expectedSource: "managed",
  path: null,
  error,
});

const missingBundledEntry = (
  error = "Missing bundled runtime",
): RuntimeDependencyStatusEntry => ({
  state: "missing",
  source: null,
  expectedSource: "bundled",
  path: null,
  error,
});

const createStatus = (
  overrides: Partial<RuntimeDependencyStatusSnapshot> = {},
): RuntimeDependencyStatusSnapshot => ({
  python: readyBundledEntry,
  ytDlp: readyBundledEntry,
  galleryDl: readyBundledEntry,
  ffmpeg: readyManagedEntry,
  deno: readyManagedEntry,
  ...overrides,
});

const createGateOverride = (
  overrides: Partial<RuntimeDependencyGateStatePayload> = {},
): RuntimeDependencyGateStatePayload => ({
  phase: "downloading",
  missingComponents: ["ffmpeg"],
  lastError: null,
  updatedAtMs: 500,
  currentComponent: "ffmpeg",
  currentStage: "downloading",
  progressPercent: 25,
  downloadedBytes: 25,
  totalBytes: 100,
  nextComponent: null,
  ...overrides,
});

const createControllerHarness = (
  initialStatuses: RuntimeDependencyStatusSnapshot[],
) => {
  const statuses = [...initialStatuses];
  const fallbackStatus = initialStatuses.at(-1) ?? createStatus();
  const events: Array<{ event: string; payload: RuntimeDependencyGateStatePayload }> = [];
  const bootstrapCalls: RuntimeDependencyManagedComponent[] = [];
  const pendingBootstrapResolvers: Array<() => void> = [];

  const nextStatus = (): RuntimeDependencyStatusSnapshot => statuses.shift() ?? fallbackStatus;
  const getRuntimeDependencyStatus = vi.fn(async () => nextStatus());
  const buildManagedRuntimeBootstrapOptions = vi.fn((_missingComponents, onActivity) => ({
    configDir: "/tmp/ameow",
    platform: "win32" as NodeJS.Platform,
    arch: "x64" as NodeJS.Architecture,
    fetch: vi.fn<typeof fetch>(),
    onActivity,
  }));
  const createBootstrap = (component: RuntimeDependencyManagedComponent) => vi.fn(async () => {
    bootstrapCalls.push(component);
  });
  const ensureManagedYtDlpRuntimeReady = createBootstrap("ytDlp");
  const ensureManagedGalleryDlRuntimeReady = createBootstrap("galleryDl");
  const ensureManagedFfmpegRuntimeReady = createBootstrap("ffmpeg");
  const ensureManagedDenoRuntimeReady = createBootstrap("deno");

  const controller = createRuntimeDependencyGateController({
    emitAppEvent(event, payload) {
      events.push({ event, payload });
    },
    getRuntimeDependencyStatus,
    buildManagedRuntimeBootstrapOptions,
    ensureManagedYtDlpRuntimeReady,
    ensureManagedGalleryDlRuntimeReady,
    ensureManagedFfmpegRuntimeReady,
    ensureManagedDenoRuntimeReady,
    now: () => 1000 + events.length,
  });

  return {
    controller,
    events,
    bootstrapCalls,
    pendingBootstrapResolvers,
    getRuntimeDependencyStatus,
    buildManagedRuntimeBootstrapOptions,
    ensureManagedYtDlpRuntimeReady,
    ensureManagedGalleryDlRuntimeReady,
    ensureManagedFfmpegRuntimeReady,
    ensureManagedDenoRuntimeReady,
  };
};

describe("runtime dependency gate controller", () => {
  it("syncs a ready snapshot to a ready gate payload", async () => {
    const { controller, events } = createControllerHarness([createStatus()]);

    await expect(controller.getState()).resolves.toMatchObject({
      phase: "ready",
      missingComponents: [],
      lastError: null,
      currentComponent: null,
      nextComponent: null,
    });
    expect(events.at(-1)).toMatchObject({
      event: "runtime-dependency-gate-state",
      payload: { phase: "ready" },
    });
  });

  it("keeps missing managed components idle and ordered by bootstrap sequence", async () => {
    const { controller } = createControllerHarness([
      createStatus({
        galleryDl: missingManagedEntry("Missing managed gallery-dl runtime"),
        ffmpeg: missingManagedEntry("Missing managed ffmpeg runtime"),
        deno: missingManagedEntry("Missing managed deno runtime"),
      }),
    ]);

    await expect(controller.getState()).resolves.toMatchObject({
      phase: "idle",
      missingComponents: ["galleryDl", "ffmpeg", "deno"],
      lastError: null,
      nextComponent: "galleryDl",
    });
  });

  it("maps missing bundled python snapshots to failed state before managed bootstrap", async () => {
    const { controller } = createControllerHarness([
      createStatus({
        python: missingBundledEntry("Missing bundled Python runtime"),
        ffmpeg: missingManagedEntry(),
      }),
    ]);

    await expect(controller.getState()).resolves.toMatchObject({
      phase: "failed",
      missingComponents: ["ffmpeg"],
      lastError: "Missing bundled Python runtime",
      nextComponent: "ffmpeg",
    });
  });

  it("computes activity progress consistently", () => {
    const { controller, events } = createControllerHarness([createStatus()]);

    expect(controller.updateDownloadActivity(["ffmpeg", "deno"], "ffmpeg", "downloading", 150, 100))
      .toMatchObject({
        progressPercent: 100,
        downloadedBytes: 150,
        totalBytes: 100,
        nextComponent: "deno",
      });
    expect(controller.updateDownloadActivity(["ffmpeg"], "ffmpeg", "installing"))
      .toMatchObject({
        progressPercent: 100,
        downloadedBytes: null,
        totalBytes: null,
      });
    expect(controller.updateDownloadActivity(["ffmpeg"], "ffmpeg", "checking"))
      .toMatchObject({
        progressPercent: null,
        downloadedBytes: null,
        totalBytes: null,
      });
    expect(events).toHaveLength(3);
  });

  it("starts bootstrap with initial checking payload and runs missing components in order", async () => {
    const { controller, bootstrapCalls } = createControllerHarness([
      createStatus({
        ytDlp: missingManagedEntry("Missing managed yt-dlp runtime"),
        galleryDl: missingManagedEntry("Missing managed gallery-dl runtime"),
        ffmpeg: missingManagedEntry("Missing managed ffmpeg runtime"),
        deno: missingManagedEntry("Missing managed deno runtime"),
      }),
      createStatus({
        ytDlp: missingManagedEntry(),
        galleryDl: missingManagedEntry(),
        ffmpeg: missingManagedEntry(),
        deno: missingManagedEntry(),
      }),
      createStatus({
        galleryDl: missingManagedEntry(),
        ffmpeg: missingManagedEntry(),
        deno: missingManagedEntry(),
      }),
      createStatus({
        ffmpeg: missingManagedEntry(),
        deno: missingManagedEntry(),
      }),
      createStatus({
        ffmpeg: missingManagedEntry(),
        deno: missingManagedEntry(),
      }),
      createStatus({
        deno: missingManagedEntry(),
      }),
      createStatus(),
    ]);

    await expect(controller.startBootstrap("test")).resolves.toMatchObject({
      phase: "downloading",
      currentComponent: "ytDlp",
      currentStage: "checking",
      missingComponents: ["ytDlp", "galleryDl", "ffmpeg", "deno"],
    });
    await vi.waitFor(() => {
      expect(bootstrapCalls).toEqual(["ytDlp", "galleryDl", "ffmpeg", "deno"]);
    });
  });

  it("deduplicates concurrent bootstrap calls while preserving the in-progress payload", async () => {
    let releaseBootstrap = () => {};
    const firstStatus = createStatus({ ffmpeg: missingManagedEntry() });
    const { controller, ensureManagedFfmpegRuntimeReady } = createControllerHarness([
      firstStatus,
      firstStatus,
      firstStatus,
      firstStatus,
      firstStatus,
      createStatus(),
    ]);
    ensureManagedFfmpegRuntimeReady.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseBootstrap = resolve;
      });
    });

    const firstPayload = await controller.startBootstrap("test");
    const secondPayload = await controller.startBootstrap("test");
    releaseBootstrap();
    await vi.waitFor(() => {
      expect(ensureManagedFfmpegRuntimeReady).toHaveBeenCalledTimes(1);
    });

    expect(firstPayload).toMatchObject({
      phase: "downloading",
      currentComponent: "ffmpeg",
      currentStage: "checking",
    });
    expect(secondPayload).toEqual(firstPayload);
  });

  it("maps bootstrap failures to failed state and clears the in-flight promise", async () => {
    const firstStatus = createStatus({ ffmpeg: missingManagedEntry() });
    const { controller, events, ensureManagedFfmpegRuntimeReady } = createControllerHarness([
      firstStatus,
      firstStatus,
      firstStatus,
      firstStatus,
      firstStatus,
      firstStatus,
      firstStatus,
      firstStatus,
    ]);
    ensureManagedFfmpegRuntimeReady.mockRejectedValueOnce(new Error("download failed"));

    await controller.startBootstrap("test");
    await vi.waitFor(() => {
      expect(events.at(-1)?.payload).toMatchObject({
        phase: "failed",
        missingComponents: ["ffmpeg"],
        lastError: "download failed",
      });
    });
    await controller.startBootstrap("retry");

    await vi.waitFor(() => {
      expect(ensureManagedFfmpegRuntimeReady).toHaveBeenCalledTimes(2);
    });
  });

  it("does not expose UI Lab gate override methods after retirement", () => {
    const { controller } = createControllerHarness([]);
    expect(controller.setUiLabRuntimeGateOverride).toBeUndefined();
    expect(controller.clearUiLabRuntimeGateOverride).toBeUndefined();
  });
});
