import { mkdir } from "node:fs/promises";

type ShellLike = {
  openPath(path: string): Promise<string>;
};

type MkdirLike = (
  path: string,
  options: { recursive: true },
) => Promise<unknown>;

type OpenPathOptions = {
  ensureDirectory?: boolean;
  mkdirLike?: MkdirLike;
  shellLike: ShellLike;
};

export async function openPathOrThrow(
  path: string,
  { ensureDirectory = false, mkdirLike = mkdir, shellLike }: OpenPathOptions,
): Promise<void> {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    throw new Error("Path is required");
  }

  if (ensureDirectory) {
    await mkdirLike(normalizedPath, { recursive: true });
  }

  const openResult = await shellLike.openPath(normalizedPath);
  if (openResult) {
    throw new Error(`Failed to open path: ${openResult}`);
  }
}
