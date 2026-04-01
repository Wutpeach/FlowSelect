import { promises as fs } from "node:fs";
import path from "node:path";

export type RenameRulePreset = "desc_number" | "asc_number" | "prefix_number";

const DEFAULT_RENAME_RULE_PRESET: RenameRulePreset = "desc_number";
const DIR_STATE = new Map<string, { lastSequence: number | null; reservedStems: Set<string> }>();
let allocationLock: Promise<void> = Promise.resolve();

const nextAscSequence = (lastSequence: number | null): number => (
  lastSequence == null || lastSequence < 1 ? 1 : lastSequence + 1
);

const nextDescSequence = (lastSequence: number | null): number => {
  if (lastSequence == null) {
    return 99;
  }
  if (lastSequence > 1 && lastSequence <= 99) {
    return lastSequence - 1;
  }
  return Math.max(lastSequence + 1, 100);
};

const nextSequenceCandidate = (
  preset: RenameRulePreset,
  lastSequence: number | null,
): number => (
  preset === "asc_number"
    ? nextAscSequence(lastSequence)
    : nextDescSequence(lastSequence)
);

const advanceSequenceCandidate = (
  preset: RenameRulePreset,
  candidate: number,
): number => (
  preset === "asc_number"
    ? candidate + 1
    : (candidate > 1 && candidate <= 99 ? candidate - 1 : candidate + 1)
);

const withAllocationLock = async <T>(run: () => Promise<T>): Promise<T> => {
  const previousLock = allocationLock;
  let releaseLock = (): void => undefined;
  allocationLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  await previousLock;
  try {
    return await run();
  } finally {
    releaseLock();
  }
};

export const normalizeRenameRulePreset = (value: unknown): RenameRulePreset => (
  value === "desc_number" || value === "asc_number" || value === "prefix_number"
    ? value
    : DEFAULT_RENAME_RULE_PRESET
);

export const sanitizeRenameAffix = (value: unknown): string => (
  String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[_\s.]+|[_\s.]+$/g, "")
    .slice(0, 96)
);

export const resolveRenameEnabled = (config: Record<string, unknown>): boolean => {
  if (typeof config.renameMediaOnDownload === "boolean") {
    return config.renameMediaOnDownload;
  }
  if (typeof config.videoKeepOriginalName === "boolean") {
    return !config.videoKeepOriginalName;
  }
  return false;
};

export const buildRenameStem = (
  sequence: number,
  config: Record<string, unknown>,
): string => {
  const preset = normalizeRenameRulePreset(config.renameRulePreset);
  const parts: string[] = [];

  if (preset === "prefix_number") {
    const prefix = sanitizeRenameAffix(config.renamePrefix);
    if (prefix) {
      parts.push(prefix);
    }
  }

  parts.push(String(sequence));

  const suffix = sanitizeRenameAffix(config.renameSuffix);
  if (suffix) {
    parts.push(suffix);
  }

  return parts.join("_");
};

const readOccupiedStems = async (targetDir: string): Promise<Set<string>> => {
  const entries = await fs.readdir(targetDir).catch(() => []);
  return new Set(entries.map((entry) => path.parse(entry).name));
};

export const allocateRenameStem = async (
  targetDir: string,
  config: Record<string, unknown>,
): Promise<string> => withAllocationLock(async () => {
  const preset = normalizeRenameRulePreset(config.renameRulePreset);
  const state = DIR_STATE.get(targetDir) ?? { lastSequence: null, reservedStems: new Set<string>() };
  const occupiedStems = await readOccupiedStems(targetDir);
  let candidate = nextSequenceCandidate(preset, state.lastSequence);

  while (candidate <= Number.MAX_SAFE_INTEGER) {
    const stem = buildRenameStem(candidate, config);
    if (!occupiedStems.has(stem) && !state.reservedStems.has(stem)) {
      state.lastSequence = candidate;
      state.reservedStems.add(stem);
      DIR_STATE.set(targetDir, state);
      return stem;
    }
    candidate = advanceSequenceCandidate(preset, candidate);
  }

  throw new Error("Rename counter overflow");
});

export const releaseRenameStem = (targetDir: string, stem: string): void => {
  const state = DIR_STATE.get(targetDir);
  if (!state) {
    return;
  }

  state.reservedStems.delete(stem);
  if (state.reservedStems.size === 0 && state.lastSequence == null) {
    DIR_STATE.delete(targetDir);
  }
};

export const resetRenameSequenceState = (): void => {
  DIR_STATE.clear();
};
