import { promises as fs } from "node:fs";
import path from "node:path";

export const writeCookiesFile = async (
  traceId: string,
  cookies: string | undefined,
): Promise<string | null> => {
  if (!cookies?.trim()) {
    return null;
  }
  const target = path.join(process.env.TEMP ?? process.cwd(), `${traceId}-cookies.txt`);
  await fs.writeFile(target, cookies, "utf8");
  return target;
};

export const cleanupCookiesFile = async (
  entryPath: string | null | undefined,
): Promise<void> => {
  if (!entryPath) {
    return;
  }
  await fs.unlink(entryPath).catch(() => undefined);
};
