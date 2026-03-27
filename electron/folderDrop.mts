import { stat } from "node:fs/promises";
import { basename } from "node:path";

type DroppedFolderPathFailureReason =
  | "EMPTY_PATH"
  | "UNRESOLVED_DROP"
  | "PRELOAD_ERROR"
  | "NOT_DIRECTORY"
  | "NOT_FOUND"
  | "STAT_FAILED";

type DroppedFolderPathResult =
  | {
      success: true;
      path: string;
      name: string;
    }
  | {
      success: false;
      path: string;
      error: string;
      reason: DroppedFolderPathFailureReason;
    };

export const VALIDATE_DROPPED_FOLDER_PATH_CHANNEL = "flowselect:drop:validate-folder-path";

const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATH_PATTERN = /^\\\\[^\\/?*"<>|]+\\[^\\/?*"<>|]+/;

const buildDroppedFolderFailure = (
  reason: DroppedFolderPathFailureReason,
  error: string,
  path = "",
): Extract<DroppedFolderPathResult, { success: false }> => ({
  success: false,
  path,
  error,
  reason,
});

export function parseLocalPathFromDropText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const candidate = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));

  if (!candidate) {
    return null;
  }

  if (/^file:\/\//i.test(candidate)) {
    return decodeLocalFileUri(candidate);
  }

  if (WINDOWS_DRIVE_PATH_PATTERN.test(candidate) || WINDOWS_UNC_PATH_PATTERN.test(candidate)) {
    return candidate;
  }

  return null;
}

function decodeLocalFileUri(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "file:") {
      return null;
    }

    const pathname = decodeURIComponent(parsed.pathname || "");
    if (parsed.hostname && parsed.hostname !== "localhost") {
      const normalizedPath = pathname.replace(/\//g, "\\");
      return `\\\\${parsed.hostname}${normalizedPath}`;
    }

    if (/^\/[A-Za-z]:\//.test(pathname)) {
      return pathname.slice(1).replace(/\//g, "\\");
    }

    if (!pathname) {
      return null;
    }

    return pathname;
  } catch {
    return null;
  }
}

export async function validateDroppedFolderPath(
  input: { path?: string | null } | null | undefined,
): Promise<DroppedFolderPathResult> {
  const path = typeof input?.path === "string" ? input.path.trim() : "";
  if (!path) {
    return buildDroppedFolderFailure("EMPTY_PATH", "Dropped path is empty.");
  }

  try {
    const stats = await stat(path);
    if (!stats.isDirectory()) {
      return buildDroppedFolderFailure("NOT_DIRECTORY", "Dropped item is not a folder.", path);
    }

    return {
      success: true,
      path,
      name: basename(path),
    };
  } catch (error) {
    const errorCode = error && typeof error === "object"
      ? (error as NodeJS.ErrnoException).code
      : undefined;
    if (errorCode === "ENOENT") {
      return buildDroppedFolderFailure("NOT_FOUND", "Dropped folder was not found.", path);
    }

    return buildDroppedFolderFailure("STAT_FAILED", "Failed to inspect the dropped folder.", path);
  }
}
