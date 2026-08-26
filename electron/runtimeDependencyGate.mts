import type {
  RuntimeDependencyGateActivityStage,
  RuntimeDependencyGateStatePayload,
  RuntimeDependencyManagedComponent,
  RuntimeDependencyStatusSnapshot,
} from "../src/types/runtimeDependencies.js";
import type { ManagedRuntimeBootstrapOptions } from "./managedRuntimeBootstrap.mjs";

type RuntimeDependencyGateEventName = "runtime-dependency-gate-state";

type RuntimeDependencyGateControllerOptions = {
  emitAppEvent(
    event: RuntimeDependencyGateEventName,
    payload: RuntimeDependencyGateStatePayload,
  ): void;
  getRuntimeDependencyStatus(): Promise<RuntimeDependencyStatusSnapshot>;
  buildManagedRuntimeBootstrapOptions(
    missingComponents: RuntimeDependencyManagedComponent[],
    onActivity: NonNullable<ManagedRuntimeBootstrapOptions["onActivity"]>,
  ): ManagedRuntimeBootstrapOptions;
  ensureBundledYtDlpBaselineReady(
    trigger: string,
    options: ManagedRuntimeBootstrapOptions,
  ): Promise<unknown>;
  ensureManagedGalleryDlRuntimeReady(
    trigger: string,
    options: ManagedRuntimeBootstrapOptions,
  ): Promise<unknown>;
  ensureManagedFfmpegRuntimeReady(
    trigger: string,
    options: ManagedRuntimeBootstrapOptions,
  ): Promise<unknown>;
  ensureManagedDenoRuntimeReady(
    trigger: string,
    options: ManagedRuntimeBootstrapOptions,
  ): Promise<unknown>;
  now?(): number;
};

export type RuntimeDependencyGateController = {
  emitState(): RuntimeDependencyGateStatePayload;
  /** Returns the last owned state without refreshing, emitting, or bootstrapping. */
  peekState(): RuntimeDependencyGateStatePayload;
  getState(): Promise<RuntimeDependencyGateStatePayload>;
  refreshState(): Promise<RuntimeDependencyGateStatePayload>;
  ensureMissingManagedRuntimesReady(trigger: string): Promise<RuntimeDependencyStatusSnapshot>;
  startBootstrap(reason?: string): Promise<RuntimeDependencyGateStatePayload>;
  updateDownloadActivity(
    missingComponents: RuntimeDependencyManagedComponent[],
    currentComponent: RuntimeDependencyManagedComponent | null,
    currentStage: RuntimeDependencyGateActivityStage,
    downloadedBytes?: number | null,
    totalBytes?: number | null,
  ): RuntimeDependencyGateStatePayload;
};

const MANAGED_RUNTIME_BOOTSTRAP_ORDER: RuntimeDependencyManagedComponent[] = [
  "ytDlp",
  "galleryDl",
  "ffmpeg",
  "deno",
];

const summarizeBootstrapError = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error ?? "unknown error");
};

const defaultNow = (): number => Date.now();

export const cloneRuntimeDependencyGateState = (
  state: RuntimeDependencyGateStatePayload,
  now: () => number = defaultNow,
): RuntimeDependencyGateStatePayload => ({
  phase: state.phase,
  missingComponents: [...(state.missingComponents ?? [])],
  lastError: state.lastError ?? null,
  updatedAtMs: state.updatedAtMs ?? now(),
  currentComponent: state.currentComponent ?? null,
  currentStage: state.currentStage ?? null,
  progressPercent: state.progressPercent ?? null,
  downloadedBytes: state.downloadedBytes ?? null,
  totalBytes: state.totalBytes ?? null,
  nextComponent: state.nextComponent ?? null,
});

export const collectMissingManagedRuntimeComponents = (
  snapshot: RuntimeDependencyStatusSnapshot,
): RuntimeDependencyManagedComponent[] => {
  const missingComponents: RuntimeDependencyManagedComponent[] = [];
  if (snapshot.ytDlp.state !== "ready") {
    missingComponents.push("ytDlp");
  }
  if (snapshot.galleryDl.state !== "ready" && snapshot.galleryDl.expectedSource === "managed") {
    missingComponents.push("galleryDl");
  }
  if (snapshot.ffmpeg.state !== "ready") {
    missingComponents.push("ffmpeg");
  }
  if (snapshot.deno.state !== "ready") {
    missingComponents.push("deno");
  }
  return missingComponents;
};

export const nextManagedRuntimeComponent = (
  missingComponents: RuntimeDependencyManagedComponent[],
  currentComponent: RuntimeDependencyManagedComponent | null = null,
): RuntimeDependencyManagedComponent | null => {
  const ordered = MANAGED_RUNTIME_BOOTSTRAP_ORDER.filter((componentId) =>
    missingComponents.includes(componentId));
  if (ordered.length === 0) {
    return null;
  }
  if (!currentComponent) {
    return ordered[0] ?? null;
  }
  const index = ordered.indexOf(currentComponent);
  return ordered[index + 1] ?? null;
};

export const createRuntimeDependencyGateController = (
  options: RuntimeDependencyGateControllerOptions,
): RuntimeDependencyGateController => {
  const now = options.now ?? defaultNow;
  const runtimeDependencyGateState: RuntimeDependencyGateStatePayload = {
    phase: "idle",
    missingComponents: [],
    lastError: null,
    updatedAtMs: now(),
    currentComponent: null,
    currentStage: null,
    progressPercent: null,
    downloadedBytes: null,
    totalBytes: null,
    nextComponent: null,
  };
  let runtimeDependencyBootstrapPromise: Promise<void> | null = null;

  const emitRuntimeDependencyGateState = (): RuntimeDependencyGateStatePayload => {
    const payload = { ...runtimeDependencyGateState };
    options.emitAppEvent("runtime-dependency-gate-state", payload);
    return payload;
  };

  const applyRuntimeDependencyGateState = (
    nextState: Omit<RuntimeDependencyGateStatePayload, "updatedAtMs">,
  ): RuntimeDependencyGateStatePayload => {
    runtimeDependencyGateState.phase = nextState.phase;
    runtimeDependencyGateState.missingComponents = [...(nextState.missingComponents ?? [])];
    runtimeDependencyGateState.lastError = nextState.lastError ?? null;
    runtimeDependencyGateState.updatedAtMs = now();
    runtimeDependencyGateState.currentComponent = nextState.currentComponent ?? null;
    runtimeDependencyGateState.currentStage = nextState.currentStage ?? null;
    runtimeDependencyGateState.progressPercent = nextState.progressPercent ?? null;
    runtimeDependencyGateState.downloadedBytes = nextState.downloadedBytes ?? null;
    runtimeDependencyGateState.totalBytes = nextState.totalBytes ?? null;
    runtimeDependencyGateState.nextComponent = nextState.nextComponent ?? null;
    return emitRuntimeDependencyGateState();
  };

  const syncRuntimeDependencyGateStateFromSnapshot = (
    snapshot: RuntimeDependencyStatusSnapshot,
  ): RuntimeDependencyGateStatePayload => {
    const missingComponents = collectMissingManagedRuntimeComponents(snapshot);
    if (snapshot.python.state !== "ready") {
      return applyRuntimeDependencyGateState({
        phase: "failed",
        missingComponents,
        lastError: snapshot.python.error ?? "Missing bundled Python runtime",
        currentComponent: null,
        currentStage: null,
        progressPercent: null,
        downloadedBytes: null,
        totalBytes: null,
        nextComponent: nextManagedRuntimeComponent(missingComponents),
      });
    }

    return applyRuntimeDependencyGateState({
      phase: missingComponents.length === 0 ? "ready" : "idle",
      missingComponents,
      lastError: null,
      currentComponent: null,
      currentStage: null,
      progressPercent: null,
      downloadedBytes: null,
      totalBytes: null,
      nextComponent: nextManagedRuntimeComponent(missingComponents),
    });
  };

  const updateRuntimeDependencyGateDownloadActivity = (
    missingComponents: RuntimeDependencyManagedComponent[],
    currentComponent: RuntimeDependencyManagedComponent | null,
    currentStage: RuntimeDependencyGateActivityStage,
    downloadedBytes: number | null = null,
    totalBytes: number | null = null,
  ): RuntimeDependencyGateStatePayload => {
    const expectedTotal = totalBytes && totalBytes > 0 ? totalBytes : null;
    const expectedDownloaded = downloadedBytes && downloadedBytes >= 0 ? downloadedBytes : null;
    const progressPercent = expectedTotal && expectedDownloaded != null
      ? Math.max(0, Math.min(100, (expectedDownloaded / expectedTotal) * 100))
      : currentStage === "installing" || currentStage === "verifying"
        ? 100
        : null;

    return applyRuntimeDependencyGateState({
      phase: "downloading",
      missingComponents,
      lastError: null,
      currentComponent,
      currentStage,
      progressPercent,
      downloadedBytes: expectedDownloaded,
      totalBytes: expectedTotal,
      nextComponent: nextManagedRuntimeComponent(missingComponents, currentComponent),
    });
  };

  const buildBootstrapOptions = (
    missingComponents: RuntimeDependencyManagedComponent[],
  ): ManagedRuntimeBootstrapOptions => options.buildManagedRuntimeBootstrapOptions(
    missingComponents,
    (activity) => {
      updateRuntimeDependencyGateDownloadActivity(
        missingComponents,
        activity.component,
        activity.stage,
        activity.downloadedBytes ?? null,
        activity.totalBytes ?? null,
      );
    },
  );

  const ensureMissingManagedRuntimesReady = async (
    trigger: string,
  ): Promise<RuntimeDependencyStatusSnapshot> => {
    const initialSnapshot = await options.getRuntimeDependencyStatus();
    const missingComponents = collectMissingManagedRuntimeComponents(initialSnapshot);
    if (missingComponents.length === 0) {
      return initialSnapshot;
    }

    if (initialSnapshot.ytDlp.state !== "ready") {
      await options.ensureBundledYtDlpBaselineReady(trigger, buildBootstrapOptions(missingComponents));
    }

    const afterYtDlp = await options.getRuntimeDependencyStatus();
    if (afterYtDlp.galleryDl.state !== "ready" && afterYtDlp.galleryDl.expectedSource === "managed") {
      await options.ensureManagedGalleryDlRuntimeReady(trigger, buildBootstrapOptions(missingComponents));
    }

    const afterGalleryDl = await options.getRuntimeDependencyStatus();
    if (afterGalleryDl.ffmpeg.state !== "ready") {
      await options.ensureManagedFfmpegRuntimeReady(trigger, buildBootstrapOptions(missingComponents));
    }

    const afterFfmpeg = await options.getRuntimeDependencyStatus();
    if (afterFfmpeg.deno.state !== "ready") {
      await options.ensureManagedDenoRuntimeReady(trigger, buildBootstrapOptions(missingComponents));
    }

    return options.getRuntimeDependencyStatus();
  };

  const getRuntimeDependencyGateState = async (): Promise<RuntimeDependencyGateStatePayload> => {
    if (runtimeDependencyBootstrapPromise) {
      return { ...runtimeDependencyGateState };
    }
    const snapshot = await options.getRuntimeDependencyStatus();
    return syncRuntimeDependencyGateStateFromSnapshot(snapshot);
  };

  return {
    emitState() {
      return emitRuntimeDependencyGateState();
    },
    peekState() {
      return cloneRuntimeDependencyGateState(runtimeDependencyGateState, now);
    },
    getState() {
      return getRuntimeDependencyGateState();
    },
    async refreshState() {
      const snapshot = await options.getRuntimeDependencyStatus();
      return syncRuntimeDependencyGateStateFromSnapshot(snapshot);
    },
    ensureMissingManagedRuntimesReady,
    async startBootstrap(reason = "frontend_after_visible") {
      if (runtimeDependencyBootstrapPromise) {
        return { ...runtimeDependencyGateState };
      }

      const snapshot = await options.getRuntimeDependencyStatus();
      const missingComponents = collectMissingManagedRuntimeComponents(snapshot);
      if (snapshot.python.state !== "ready") {
        return syncRuntimeDependencyGateStateFromSnapshot(snapshot);
      }
      if (missingComponents.length === 0) {
        return syncRuntimeDependencyGateStateFromSnapshot(snapshot);
      }

      const initialPayload = updateRuntimeDependencyGateDownloadActivity(
        missingComponents,
        missingComponents[0] ?? null,
        "checking",
        null,
        null,
      );

      runtimeDependencyBootstrapPromise = (async () => {
        try {
          const finalSnapshot = await ensureMissingManagedRuntimesReady(reason);
          syncRuntimeDependencyGateStateFromSnapshot(finalSnapshot);
        } catch (error) {
          const latestSnapshot = await options.getRuntimeDependencyStatus().catch(() => snapshot);
          const latestMissingComponents = collectMissingManagedRuntimeComponents(latestSnapshot);
          applyRuntimeDependencyGateState({
            phase: "failed",
            missingComponents: latestMissingComponents,
            lastError: summarizeBootstrapError(error),
            currentComponent: null,
            currentStage: null,
            progressPercent: null,
            downloadedBytes: null,
            totalBytes: null,
            nextComponent: nextManagedRuntimeComponent(latestMissingComponents),
          });
        } finally {
          runtimeDependencyBootstrapPromise = null;
        }
      })();

      return initialPayload;
    },
    updateDownloadActivity: updateRuntimeDependencyGateDownloadActivity,
  };
};
