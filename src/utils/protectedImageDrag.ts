export type ProtectedImageDragPayload = {
  token: string;
  pageUrl: string | null;
  imageUrl: string | null;
};

const PROTECTED_IMAGE_DRAG_PAYLOAD_RE =
  /FLOWSELECT_PROTECTED_IMAGE_DRAG:([A-Za-z0-9+/=_-]+)/i;

function decodeUtf8Base64(value: string): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const binary = atob(value);
    const escaped = Array.from(binary)
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join("");
    return decodeURIComponent(escaped);
  } catch {
    return null;
  }
}

function normalizeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

export function extractEmbeddedProtectedImageDragPayload(
  value: string,
): ProtectedImageDragPayload | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const match = value.match(PROTECTED_IMAGE_DRAG_PAYLOAD_RE);
  if (!match) {
    return null;
  }

  const decoded = decodeUtf8Base64(match[1]);
  if (!decoded) {
    return null;
  }

  try {
    const parsed = JSON.parse(decoded) as {
      token?: unknown;
      pageUrl?: unknown;
      imageUrl?: unknown;
    };

    const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
    if (!token) {
      return null;
    }

    return {
      token,
      pageUrl: normalizeHttpUrl(parsed.pageUrl),
      imageUrl: normalizeHttpUrl(parsed.imageUrl),
    };
  } catch {
    return null;
  }
}
