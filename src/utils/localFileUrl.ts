const WINDOWS_DRIVE_PATH_PATTERN = /^\/[A-Za-z]:\//;

export function parseLocalFileUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !/^file:\/\//i.test(value)) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "file:") {
      return null;
    }

    const pathname = decodeURIComponent(parsed.pathname || "");
    if (!pathname) {
      return null;
    }

    if (!parsed.hostname && pathname === "/") {
      return null;
    }

    if (parsed.hostname && parsed.hostname !== "localhost") {
      return `\\\\${parsed.hostname}${pathname.replace(/\//g, "\\")}`;
    }

    if (WINDOWS_DRIVE_PATH_PATTERN.test(pathname)) {
      return pathname.slice(1).replace(/\//g, "\\");
    }

    return pathname;
  } catch {
    return null;
  }
}
