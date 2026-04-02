import { parseLocalPathFromDropText } from "./folderDrop.mjs";

type DroppedFolderPathFailureReason =
  | "EMPTY_PATH"
  | "UNRESOLVED_DROP"
  | "PRELOAD_ERROR"
  | "NOT_DIRECTORY"
  | "NOT_FOUND"
  | "STAT_FAILED";

export type DroppedFolderPathResult =
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

type FileLike = unknown;

type DataTransferItemLike = {
  kind?: string;
  getAsFile?: () => FileLike | null;
};

type DataTransferLike = {
  files?: Iterable<FileLike> | ArrayLike<FileLike> | null;
  items?: Iterable<DataTransferItemLike> | ArrayLike<DataTransferItemLike> | null;
  getData(type: string): string;
} | null | undefined;

type ResolvePathFromFile = (file: FileLike) => string | null;
type ValidateDroppedFolderPath = (path: string) => Promise<DroppedFolderPathResult>;

const getItems = <T,>(value: Iterable<T> | ArrayLike<T> | null | undefined): T[] => (
  Array.from(value ?? [])
);

export const hasLocalFileItems = (dataTransfer: DataTransferLike): boolean => (
  Boolean(dataTransfer)
  && (
    getItems(dataTransfer?.files).length > 0
    || getItems(dataTransfer?.items).some((item) => item.kind === "file")
  )
);

export const resolveLocalPathFromDataTransfer = (
  dataTransfer: DataTransferLike,
  resolvePathFromFile: ResolvePathFromFile,
): string | null => {
  if (!dataTransfer) {
    return null;
  }

  for (const item of getItems(dataTransfer.items)) {
    if (item.kind !== "file") {
      continue;
    }

    const file = item.getAsFile?.();
    if (!file) {
      continue;
    }

    const resolvedFromItem = resolvePathFromFile(file);
    if (resolvedFromItem) {
      return resolvedFromItem;
    }
  }

  for (const file of getItems(dataTransfer.files)) {
    const resolvedFromFile = resolvePathFromFile(file);
    if (resolvedFromFile) {
      return resolvedFromFile;
    }
  }

  const fallbackFromUriList = parseLocalPathFromDropText(dataTransfer.getData("text/uri-list"));
  if (fallbackFromUriList) {
    return fallbackFromUriList;
  }

  return parseLocalPathFromDropText(dataTransfer.getData("text/plain"));
};

export const resolvePendingFolderDrop = async (
  dataTransfer: DataTransferLike,
  dependencies: {
    resolvePathFromFile: ResolvePathFromFile;
    validateDroppedFolderPath: ValidateDroppedFolderPath;
  },
): Promise<DroppedFolderPathResult | null> => {
  if (!hasLocalFileItems(dataTransfer)) {
    return null;
  }

  const path = resolveLocalPathFromDataTransfer(dataTransfer, dependencies.resolvePathFromFile);
  if (!path) {
    return null;
  }

  try {
    return await dependencies.validateDroppedFolderPath(path);
  } catch {
    return {
      success: false,
      path,
      error: "Failed to validate the dropped folder.",
      reason: "PRELOAD_ERROR",
    };
  }
};
