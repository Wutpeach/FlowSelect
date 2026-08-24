import { describe, expect, it } from "vitest";
import {
  sanitizeDiagnosticText,
  sanitizeDiagnosticValue,
  toSafeDiagnosticUrl,
} from "./safe-diagnostic.js";

describe("safe diagnostic representation", () => {
  it("reduces signed URLs to safe origin metadata", () => {
    expect(toSafeDiagnosticUrl(
      "https://user:pass@example.com/video/secret?id=1&token=SECRET#fragment",
    )).toEqual({
      origin: "https://example.com",
      hasQuery: true,
      hasFragment: true,
    });
    expect(sanitizeDiagnosticText(
      "failed https://example.com/video?id=1&token=SECRET&signature=sig#fragment",
    )).toBe("failed https://example.com");
  });

  it("drops userinfo and returns origin for http/https urls", () => {
    expect(sanitizeDiagnosticText(
      "proxy http://user:password@proxy.example.com:8080/path?token=x",
    )).toBe("proxy http://proxy.example.com:8080");
  });

  it("collapses scheme-less host-like urls with path/query to the bare host", () => {
    expect(sanitizeDiagnosticText(
      "check www.example.com/video?id=1&token=SECRET#frag",
    )).toBe("check www.example.com");
    // A scheme-less origin keeps its port (consistent with toSafeDiagnosticUrl).
    expect(sanitizeDiagnosticText(
      "downloads from cdn.example.com:8443/media?a=b now",
    )).toBe("downloads from cdn.example.com:8443 now");
    expect(sanitizeDiagnosticText(
      "token at example.com?token=SECRET",
    )).toBe("token at example.com");
  });

  it("does not treat version-like dotted tokens as scheme-less urls", () => {
    expect(sanitizeDiagnosticText("app version 0.6.14 and v1.2.3 installed"))
      .toBe("app version 0.6.14 and v1.2.3 installed");
  });

  it.each([
    ["Cookie: sid=secret", "Cookie: [REDACTED]"],
    ["Set-Cookie: session=abc; Path=/", "Set-Cookie: [REDACTED]"],
    ["Authorization: Bearer secret", "Authorization: [REDACTED]"],
    ["Proxy-Authorization: Basic dXNlcjpwYXNz", "Proxy-Authorization: [REDACTED]"],
    ["http://user:password@proxy.example.com:8080/path", "http://proxy.example.com:8080"],
    ["SESSION_TOKEN=secret-value", "SESSION_TOKEN=[REDACTED]"],
    ["HTTPS_PROXY=http://user:password@proxy.example.com", "HTTPS_PROXY=[REDACTED]"],
    ["api_key=abc123 apiKey=xyz token=jwt", "api_key=[REDACTED] apiKey=[REDACTED] token=[REDACTED]"],
    ["cookie_file=C:\\Users\\Alice\\cookies.txt", "cookie_file=[REDACTED]"],
    ["--cookies C:\\Users\\Alice\\AppData\\cookies.txt", "--cookies [REDACTED]"],
    ["output=/home/alice/private/video.mp4", "output=[REDACTED_PATH]"],
    ["path /Users/alice/Movies/a.mp4", "path [REDACTED_PATH]"],
    ["home ~/Downloads/private/file.bin", "home [REDACTED_PATH]"],
    ["mac /Applications/Ameow.app/Contents/MacOS/Ameow", "mac [REDACTED_PATH]"],
    ["vol /Volumes/Backup/videos", "vol [REDACTED_PATH]"],
    ["opt /opt/ameow/bin", "opt [REDACTED_PATH]"],
    ["drive C:/Users/alice/AppData/Roaming", "drive [REDACTED_PATH]"],
    ["unc \\\\server\\share\\dir\\file.txt", "unc [REDACTED_PATH]"],
    ["Bearer abc.def.ghi", "Bearer [REDACTED]"],
    ["Basic dXNlcjpwYXNz", "Basic [REDACTED]"],
  ])("scrubs %s", (input, expected) => {
    expect(sanitizeDiagnosticText(input)).toBe(expected);
  });

  it.each([
    // Quoted local paths with spaces must be fully redacted (no suffix leak).
    ["failed at \"C:\\Users\\Alice Smith\\Videos\\private.mp4\"", "failed at [REDACTED_PATH]"],
    ["path 'C:\\Users\\Alice Smith\\Videos\\private.mp4' now", "path [REDACTED_PATH] now"],
    ["copy \"\\\\server\\share\\My Videos\\file.mp4\" here", "copy [REDACTED_PATH] here"],
    ["run \"/Users/Alice Smith/Movies/a b.mp4\"", "run [REDACTED_PATH]"],
    ["load \"~/Downloads/My Files/a.mp4\"", "load [REDACTED_PATH]"],
    ["drive \"C:/Users/Alice Smith/Videos/private.mp4\"", "drive [REDACTED_PATH]"],
    // Opposite quote inside the quoted path must not stop the match early.
    ["apostrophe \"C:\\Users\\O'Connor\\Videos\\private.mp4\"", "apostrophe [REDACTED_PATH]"],
    ["double-quote 'C:\\Users\\O\"Brien\\Videos\\private.mp4'", "double-quote [REDACTED_PATH]"],
    ["posix \"/Users/Alice O'Neil/Movies/a b.mp4\"", "posix [REDACTED_PATH]"],
    ["posix-single '/Users/Alice O\"Neil/Movies/a b.mp4'", "posix-single [REDACTED_PATH]"],
    ["unc \"\\\\server\\share\\My O'Neil Videos\\a b.mp4\"", "unc [REDACTED_PATH]"],
    // Sensitive CLI arguments: equals and whitespace forms, with/without scheme.
    ["cmd --proxy user:pass@proxy.example.com:8080", "cmd --proxy [REDACTED]"],
    ["cmd --proxy http://user:pass@proxy.example.com:8080", "cmd --proxy [REDACTED]"],
    ["cmd --proxy=user:pass@proxy.example.com:8080", "cmd --proxy [REDACTED]"],
    ["cmd --cookies \"C:\\Users\\Alice Smith\\cookies.txt\"", "cmd --cookies [REDACTED]"],
    ["cmd --cookies-from-browser chrome", "cmd --cookies-from-browser [REDACTED]"],
    ["cmd --add-header \"Authorization: Bearer xyz\"", "cmd --add-header [REDACTED]"],
    ["cmd --token abc123 --password hunter2", "cmd --token [REDACTED] --password [REDACTED]"],
    ["cmd --api-key=xyz123", "cmd --api-key [REDACTED]"],
    ["cmd --secret 's3cr3t value' --session-id s1", "cmd --secret [REDACTED] --session-id [REDACTED]"],
  ])("fully scrubs %s", (input, expected) => {
    expect(sanitizeDiagnosticText(input)).toBe(expected);
  });

  it("bounds diagnostic text", () => {
    expect(sanitizeDiagnosticText("x".repeat(20), 8)).toBe("xxxxxxx…");
  });
});

describe("sanitizeDiagnosticValue", () => {
  it("recursively scrubs string leaves and preserves primitives", () => {
    const value = sanitizeDiagnosticValue({
      label: "failed https://example.com/video?token=SECRET",
      count: 3,
      enabled: true,
      nested: {
        message: "cookies at C:\\Users\\Alice\\cookies.txt",
        list: ["Bearer abc.def", "ok"],
      },
    });

    expect(value).toEqual({
      label: "failed https://example.com",
      count: 3,
      enabled: true,
      nested: {
        message: "cookies at [REDACTED_PATH]",
        list: ["Bearer [REDACTED]", "ok"],
      },
    });
  });

  it("bounds array length and nesting depth", () => {
    expect(sanitizeDiagnosticValue(
      ["a", "b", "c", "d"],
      { maxArrayItems: 2 },
    )).toEqual(["a", "b"]);

    const deeplyNested = { a: { b: { c: { d: { e: "deep" } } } } };
    const bounded = sanitizeDiagnosticValue(deeplyNested, { maxDepth: 3 }) as Record<string, unknown>;
    expect(bounded.a).toBeDefined();
    expect((bounded.a as Record<string, unknown>).b).toBeDefined();
  });

  it("omits non-serializable leaves", () => {
    const value = sanitizeDiagnosticValue({
      keep: "value",
      fn: () => "ignored",
      symbol: Symbol("x"),
    } as unknown as Record<string, unknown>);

    expect(value).toEqual({ keep: "value" });
  });

  it("bounds per-leaf string length", () => {
    expect(sanitizeDiagnosticValue({ text: "x".repeat(50) }, { maxStringLength: 8 }))
      .toEqual({ text: "xxxxxxx…" });
  });
});
