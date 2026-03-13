export type RuntimeDependencyState = "ready" | "missing";

export type RuntimeDependencySource = "bundled" | "managed" | "system_path";

export type RuntimeDependencyStatusEntry = {
  state: RuntimeDependencyState;
  source: RuntimeDependencySource | null;
  path: string | null;
  error: string | null;
};

export type RuntimeDependencyStatusSnapshot = {
  ytDlp: RuntimeDependencyStatusEntry;
  ffmpeg: RuntimeDependencyStatusEntry;
  deno: RuntimeDependencyStatusEntry;
  pinterestDownloader: RuntimeDependencyStatusEntry;
};

export type RuntimeDependencyGatePhase =
  | "idle"
  | "checking"
  | "awaiting_confirmation"
  | "downloading"
  | "ready"
  | "blocked_by_user"
  | "failed";

export type RuntimeDependencyGateStatePayload = {
  phase: RuntimeDependencyGatePhase;
  missingComponents: string[];
  lastError: string | null;
  updatedAtMs: number;
};
