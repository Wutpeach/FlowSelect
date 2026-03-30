import type {
  RuntimeDependencyGateActivityStage,
  RuntimeDependencyGatePhase,
  RuntimeDependencyGateStatePayload,
  RuntimeDependencyManagedComponent,
  RuntimeDependencyStatusSnapshot,
} from "../types/runtimeDependencies";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export const runtimeGateNeedsManualAction = (
  phase: RuntimeDependencyGatePhase,
): boolean => (
  phase === "awaiting_confirmation"
  || phase === "blocked_by_user"
  || phase === "failed"
);

export const runtimeGateIsActive = (
  phase: RuntimeDependencyGatePhase,
): boolean => phase === "checking" || phase === "downloading";

export const hasMissingManagedRuntimeComponents = (
  status: RuntimeDependencyStatusSnapshot | null | undefined,
): boolean => (
  !!status
  && (
    status.ffmpeg.state !== "ready"
    || status.deno.state !== "ready"
  )
);

export const shouldAutoStartManagedRuntimeBootstrapOnStartup = ({
  isInitialMount,
  hasTriggeredStartupBootstrap,
  runtimeDependencyStatus,
  gatePhase,
  isWindowReadyForStartupBootstrap,
}: {
  isInitialMount: boolean;
  hasTriggeredStartupBootstrap: boolean;
  runtimeDependencyStatus: RuntimeDependencyStatusSnapshot | null;
  gatePhase: RuntimeDependencyGatePhase | null | undefined;
  isWindowReadyForStartupBootstrap: boolean;
}): boolean => {
  if (isInitialMount || hasTriggeredStartupBootstrap) {
    return false;
  }
  if (!isWindowReadyForStartupBootstrap) {
    return false;
  }
  if (!hasMissingManagedRuntimeComponents(runtimeDependencyStatus)) {
    return false;
  }
  return gatePhase !== "checking" && gatePhase !== "downloading";
};

export const getRuntimeManagedComponentLabel = (
  t: TranslateFn,
  component: RuntimeDependencyManagedComponent | null | undefined,
): string | null => (
  component ? t(`app.runtime.component.${component}`) : null
);

export const getRuntimeGateStageLabel = (
  t: TranslateFn,
  stage: RuntimeDependencyGateActivityStage | null | undefined,
): string | null => (
  stage ? t(`app.runtime.stage.${stage}`) : null
);

export const clampRuntimeGateProgressPercent = (
  value: number | null | undefined,
): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(100, value));
};

export const summarizeRuntimeGateError = (
  error: string | null | undefined,
): string | null => {
  if (!error) {
    return null;
  }

  const summary = error
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!summary) {
    return null;
  }

  return summary.length > 108 ? `${summary.slice(0, 105)}...` : summary;
};

export const getRuntimeGateHeadline = (
  t: TranslateFn,
  gate: RuntimeDependencyGateStatePayload | null,
): string => {
  const componentLabel = getRuntimeManagedComponentLabel(t, gate?.currentComponent);
  if (componentLabel) {
    return componentLabel;
  }
  const phaseKey = gate?.phase && gate.phase !== "idle"
    ? gate.phase
    : "missing";
  return t(`app.runtime.phaseTitle.${phaseKey}`);
};

export const getRuntimeGateProgressLabel = (
  t: TranslateFn,
  gate: RuntimeDependencyGateStatePayload | null,
): string | null => {
  if (!gate) {
    return null;
  }

  const stageLabel = getRuntimeGateStageLabel(t, gate.currentStage);
  const progressPercent = clampRuntimeGateProgressPercent(gate.progressPercent);
  if (progressPercent !== null && stageLabel) {
    return t("app.runtime.progressSummary", {
      percent: Math.round(progressPercent),
      stage: stageLabel,
    });
  }
  if (progressPercent !== null) {
    return `${Math.round(progressPercent)}%`;
  }
  return stageLabel;
};

export const getRuntimeGateNextLabel = (
  t: TranslateFn,
  gate: RuntimeDependencyGateStatePayload | null,
): string | null => {
  const nextComponentLabel = getRuntimeManagedComponentLabel(t, gate?.nextComponent);
  if (!nextComponentLabel) {
    return null;
  }
  return t("app.runtime.nextSummary", { item: nextComponentLabel });
};
