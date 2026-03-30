import type {
  RuntimeDependencyGateStatePayload,
  RuntimeDependencyManagedComponent,
  RuntimeDependencyStatusSnapshot,
} from "../types/runtimeDependencies.js";
import type { RuntimeDependencyResolver } from "./contracts.js";

const managedComponents: RuntimeDependencyManagedComponent[] = [
  "ffmpeg",
  "deno",
];

const now = (): number => Date.now();

const createGatePayload = (
  phase: RuntimeDependencyGateStatePayload["phase"],
  missingComponents: RuntimeDependencyManagedComponent[],
  lastError: string | null,
): RuntimeDependencyGateStatePayload => ({
  phase,
  missingComponents,
  lastError,
  updatedAtMs: now(),
  currentComponent: null,
  currentStage: null,
  progressPercent: null,
  downloadedBytes: null,
  totalBytes: null,
  nextComponent: missingComponents[0] ?? null,
});

const missingComponentsFrom = (
  snapshot: RuntimeDependencyStatusSnapshot,
): RuntimeDependencyManagedComponent[] => {
  const missing: RuntimeDependencyManagedComponent[] = [];
  if (snapshot.ffmpeg.state !== "ready") {
    missing.push("ffmpeg");
  }
  if (snapshot.deno.state !== "ready") {
    missing.push("deno");
  }
  return missing;
};

const hasBundledFailure = (snapshot: RuntimeDependencyStatusSnapshot): boolean =>
  snapshot.ytDlp.state !== "ready";

export const createRuntimeDependencyResolver = (
  initialSnapshot: RuntimeDependencyStatusSnapshot,
  refresh: () => RuntimeDependencyStatusSnapshot,
  bootstrap?: (reason: string) => Promise<RuntimeDependencyGateStatePayload>,
): RuntimeDependencyResolver => {
  let currentSnapshot = initialSnapshot;
  let gateState = createGatePayload("idle", missingComponentsFrom(initialSnapshot), null);

  const syncGateState = (snapshot: RuntimeDependencyStatusSnapshot): RuntimeDependencyGateStatePayload => {
    const missingManaged = missingComponentsFrom(snapshot);
    if (hasBundledFailure(snapshot)) {
      gateState = createGatePayload(
        "failed",
        missingManaged,
        snapshot.ytDlp.error ?? "Missing bundled yt-dlp runtime",
      );
      return gateState;
    }
    if (missingManaged.length === 0) {
      gateState = createGatePayload("ready", [], null);
      return gateState;
    }
    gateState = createGatePayload("idle", missingManaged, null);
    return gateState;
  };

  gateState = syncGateState(initialSnapshot);

  return {
    resolveStatus() {
      currentSnapshot = refresh();
      return currentSnapshot;
    },
    getGateState() {
      return gateState;
    },
    refreshGateState() {
      currentSnapshot = refresh();
      return syncGateState(currentSnapshot);
    },
    async startBootstrap(reason: string) {
      currentSnapshot = refresh();
      const nextGateState = syncGateState(currentSnapshot);
      if (nextGateState.phase === "ready" || nextGateState.phase === "failed") {
        return nextGateState;
      }
      if (!bootstrap) {
        gateState = createGatePayload(
          "failed",
          nextGateState.missingComponents as RuntimeDependencyManagedComponent[],
          `Managed runtime bootstrap is not configured for reason: ${reason}`,
        );
        return gateState;
      }
      gateState = createGatePayload(
        "downloading",
        nextGateState.missingComponents as RuntimeDependencyManagedComponent[],
        null,
      );
      return bootstrap(reason);
    },
    setManagedComponentStatus(
      component: RuntimeDependencyManagedComponent,
      status: RuntimeDependencyStatusSnapshot["ffmpeg"],
    ) {
      if (!managedComponents.includes(component)) {
        return;
      }
      if (component === "ffmpeg") {
        currentSnapshot = { ...currentSnapshot, ffmpeg: status };
      } else if (component === "deno") {
        currentSnapshot = { ...currentSnapshot, deno: status };
      }
      syncGateState(currentSnapshot);
    },
  };
};
