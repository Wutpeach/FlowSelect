export type SafeDiagnosticUrl = {
  origin: string;
  hasQuery: boolean;
  hasFragment: boolean;
};

const REDACTED = "[REDACTED]";
const REDACTED_PATH = "[REDACTED_PATH]";

/**
 * Scheme-bearing URLs (http/https/socks) collapse to origin only, dropping
 * userinfo, path, query, and fragment.
 */
const URL_PATTERN = /\b(?:https?|socks4|socks5):\/\/[^\s"'<>]+/gi;

/**
 * Scheme-less host-like URLs that carry a path, query, or fragment (for
 * example `www.example.com/video?token=SECRET`). Collapsed to the bare host.
 * A trailing digit-only label (version strings such as `0.6.14` or `v1.2.3`)
 * does not match the letter TLD requirement.
 */
const SCHEME_LESS_URL_PATTERN =
  /\b((?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}(?::\d{1,5})?)(?:\/[^\s"'<>]*|\?[^\s"'<>]*|#[^\s"'<>]*)?/g;

/**
 * Local paths: Windows drive (backslash or forward slash), Windows UNC
 * `\\server\share\...`, POSIX/macOS absolute user/location roots, and
 * home-relative `~/...`. Kept intentionally conservative to avoid collapsing
 * arbitrary prose.
 */
const FILE_PATH_PATTERN = new RegExp(
  [
    String.raw`\b[A-Za-z]:\\(?:[^\s"'<>|]+)`,
    String.raw`\b[A-Za-z]:/(?:[^\s"'<>|]+)`,
    String.raw`\\\\[A-Za-z0-9_.-]+\\[^\s"'<>|]*`,
    String.raw`/(?:Users|home|private|tmp|var|etc|opt|usr|srv|data|Applications|Volumes|Library)/[^\s"'<>|]+`,
    String.raw`~/[^\s"'<>|]+`,
  ].join("|"),
  "g",
);

const QUOTED_PATH_PREFIX = String.raw`(?:\b[A-Za-z]:[\\/]|\\\\|~/|/(?:Users|home|private|tmp|var|etc|opt|usr|srv|data|Applications|Volumes|Library)/)`;

/**
 * Quoted local paths (spaces are allowed inside quotes): Windows drive
 * (backslash or forward slash), UNC `\server\share\...`, POSIX/macOS roots,
 * and home-relative `~/...`. Runs before generic URL/path handling so a
 * quoted path such as `"C:\Users\Alice Smith\Videos\private.mp4"` cannot
 * leak its unquoted suffix. Quote matching is quote-specific: a double-quoted
 * path may contain apostrophes and stops at the closing double quote, and a
 * single-quoted path may contain double quotes and stops at the closing
 * apostrophe.
 */
const QUOTED_PATH_PATTERN = new RegExp(
  String.raw`"${QUOTED_PATH_PREFIX}[^"]*"|'${QUOTED_PATH_PREFIX}[^']*'`,
  "g",
);

/**
 * Sensitive downloader/runtime CLI arguments in both `--flag=value` and
 * `--flag value` forms: cookies/cookies-from-browser, authorization/header,
 * proxy, token/secret/password/session/api-key, credentials, auth/bearer/
 * oauth. Narrow flag-name based; not a command parser.
 */
const SENSITIVE_CLI_ARG_PATTERN = new RegExp(
  String.raw`(?<![A-Za-z0-9])(--?[A-Za-z0-9_-]*(?:cookie|authorization|proxy|token|secret|password|passwd|session|api[_-]?key|username|bearer|auth|header|credential|oauth|signature|access[_-]?token|refresh[_-]?token)[A-Za-z0-9_-]*)(?:\s*=\s*|\s+)(?:"[^"]*"|'[^']*'|[^\s"'=,;|&]+)`,
  "gi",
);

const safeUrlText = (value: string): string => {
  try {
    const parsed = new URL(value);
    return parsed.hostname ? `${parsed.protocol}//${parsed.host}` : REDACTED;
  } catch {
    return REDACTED;
  }
};

const safeHostlessUrlText = (_match: string, host: string): string => host;

export const toSafeDiagnosticUrl = (
  value: string | null | undefined,
): SafeDiagnosticUrl | undefined => {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = new URL(value);
    if (!parsed.hostname || !["http:", "https:"].includes(parsed.protocol)) {
      return undefined;
    }
    return {
      origin: `${parsed.protocol}//${parsed.host}`,
      hasQuery: Boolean(parsed.search),
      hasFragment: Boolean(parsed.hash),
    };
  } catch {
    return undefined;
  }
};

/**
 * Shared persistence/copy/log scrub boundary. It is deliberately small: URL
 * diagnostics collapse to origin (or bare host for scheme-less URLs), secret
 * value positions are removed, local/UNC/POSIX paths are hidden, and output
 * is bounded. Correctness code must never consume this text; it is a
 * diagnostic representation only.
 */
export const sanitizeDiagnosticText = (
  value: string,
  maxLength = 480,
): string => {
  const scrubbed = value
    .replace(QUOTED_PATH_PATTERN, REDACTED_PATH)
    .replace(
      SENSITIVE_CLI_ARG_PATTERN,
      (_match, flag: string) => `${flag} ${REDACTED}`,
    )
    .replace(URL_PATTERN, safeUrlText)
    .replace(SCHEME_LESS_URL_PATTERN, safeHostlessUrlText)
    .replace(/\b(Cookie|Set-Cookie)\s*:\s*[^\r\n]+/gi, `$1: ${REDACTED}`)
    .replace(/\b(Authorization|Proxy-Authorization)\s*:\s*[^\r\n]+/gi, `$1: ${REDACTED}`)
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`)
    .replace(
      /\b([A-Za-z0-9_-]*(?:cookie|authorization|token|secret|password|passwd|session|api[_-]?key|proxy)[A-Za-z0-9_-]*)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;}&]+)/gi,
      (_match, key: string, separator: string) => `${key}${separator}${REDACTED}`,
    )
    .replace(FILE_PATH_PATTERN, REDACTED_PATH);
  if (scrubbed.length <= maxLength) {
    return scrubbed;
  }
  return `${scrubbed.slice(0, Math.max(0, maxLength - 1))}…`;
};

export type DiagnosticValueLimits = {
  /** Per-string-leaf cap passed to `sanitizeDiagnosticText`. */
  maxStringLength?: number;
  /** Maximum array items retained. */
  maxArrayItems?: number;
  /** Maximum object/array nesting depth. */
  maxDepth?: number;
};

const DEFAULT_VALUE_LIMITS: Required<DiagnosticValueLimits> = {
  maxStringLength: 480,
  maxArrayItems: 100,
  maxDepth: 6,
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && !(value instanceof Date)
  && !(value instanceof RegExp)
  && !(value instanceof URL)
);

/**
 * Recursive final safety net applied to already-projected report values.
 * Strings are scrubbed and bounded, arrays/objects are depth- and
 * item-bounded, and non-serializable leaves are omitted. This is NOT a
 * substitute for allowlist-first projection: unknown open config/context keys
 * must be omitted by the caller before this runs.
 */
export const sanitizeDiagnosticValue = (
  value: unknown,
  limits: DiagnosticValueLimits = {},
  depth = 0,
): unknown => {
  const merged: Required<DiagnosticValueLimits> = {
    ...DEFAULT_VALUE_LIMITS,
    ...limits,
  };

  if (typeof value === "string") {
    return sanitizeDiagnosticText(value, merged.maxStringLength);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (depth >= merged.maxDepth) {
    return REDACTED;
  }
  if (Array.isArray(value)) {
    const retained: unknown[] = [];
    for (const item of value.slice(0, merged.maxArrayItems)) {
      const sanitized = sanitizeDiagnosticValue(item, merged, depth + 1);
      if (sanitized !== undefined) {
        retained.push(sanitized);
      }
    }
    return retained;
  }
  if (isPlainRecord(value)) {
    const projected: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const sanitized = sanitizeDiagnosticValue(child, merged, depth + 1);
      if (sanitized !== undefined) {
        projected[key] = sanitized;
      }
    }
    return projected;
  }
  // Date/RegExp/URL/function/symbol/bigint and other exotic values are omitted.
  return undefined;
};
